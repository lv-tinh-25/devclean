import { spawn } from 'node:child_process';
import { openLog, type InstallLog } from './installLog.js';
import { readdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { installCommands, type InstallCmd } from './detect.js';
import { isRealDir, type Project } from './scan.js';

export async function deleteJunk(p: Project): Promise<number> {
  const targets = p.junk.map((j) => resolve(p.path, j.name));
  for (const t of targets) {
    if (dirname(t) !== resolve(p.path)) throw new Error(`refusing to delete outside project: ${t}`);
  }
  let freed = 0;
  for (const [i, t] of targets.entries()) {
    if (!(await isRealDir(t))) continue;
    await rm(t, { recursive: true, force: true });
    freed += p.junk[i].size;
  }
  return freed;
}

export type InstallStatus = 'ok' | 'warning' | 'failed';

export interface InstallResult {
  status: InstallStatus;
  message?: string;
  log?: string;
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  onOutput?: (line: string) => void;
  signal?: AbortSignal;
  logDir?: string;
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

// Splits a stream into display lines; progress bars redraw with \r, keep the last redraw.
function lineSplitter(onLine: (line: string) => void) {
  let buf = '';
  const flush = (part: string) => {
    const line = part.split('\r').filter((x) => x.trim()).at(-1)?.replace(ANSI, '').trimEnd();
    if (line) onLine(line);
  };
  return {
    push(chunk: string) {
      buf += chunk;
      const parts = buf.split('\n');
      buf = parts.pop()!;
      for (const p of parts) flush(p);
    },
    end() {
      if (buf) flush(buf);
      buf = '';
    },
  };
}

// pnpm 10+ refuses to run dependency build scripts until the user approves them. The
// packages are installed; approving is a security decision we must not make for them.
export function classify(label: string, code: number | null, output: string): InstallResult {
  if (/ERR_PNPM_IGNORED_BUILDS/.test(output)) {
    const names = output.match(/Ignored build scripts?:\s*([^\n]+)/)?.[1] ?? '';
    const pkgs = names.split(',').map((n) => n.trim().replace(/@[^@/]+$/, '')).filter(Boolean);
    const list = pkgs.length ? ` (${pkgs.join(', ')})` : '';
    return { status: 'warning', message: `build scripts skipped${list}, run \`pnpm approve-builds\` in this project` };
  }
  if (code === 0) return { status: 'ok' };
  const last = output.replace(ANSI, '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).at(-1);
  return { status: 'failed', message: `${label} exited with code ${code}${last ? `: ${last}` : ''}` };
}

function run(c: InstallCmd, cwd: string, opts: RunOptions, log: InstallLog | null): Promise<InstallResult> {
  return new Promise((done) => {
    log?.write(`$ ${c.label}\ncwd: ${cwd}\n\n`);
    let output = '';
    const lines = lineSplitter((l) => opts.onOutput?.(l));
    const child = spawn(c.cmd, c.args, {
      cwd,
      // No terminal to answer prompts: installers must not wait for input.
      env: { ...(opts.env ?? process.env), CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
      // Windows installers are .cmd shims that only run through a shell.
      shell: process.platform === 'win32',
    });
    const onData = (d: Buffer) => {
      const text = d.toString();
      output += text;
      log?.write(text);
      lines.push(text);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    let settled = false;
    const finish = (r: InstallResult) => {
      if (settled) return;
      settled = true;
      lines.end();
      log?.write(`\n[exit code ${r.status === 'failed' && !output ? 'n/a' : (child.exitCode ?? 'n/a')}] ${r.status}${r.message ? `: ${r.message}` : ''}\n\n`);
      done(r);
    };
    child.on('error', (err: NodeJS.ErrnoException) =>
      finish({
        status: 'failed',
        message:
          err.code === 'ENOENT' ? `${c.cmd} not found` : err.name === 'AbortError' ? 'cancelled' : `${c.label}: ${err.message}`,
      }),
    );
    child.on('close', (code) => finish(classify(c.label, code, output)));
  });
}

export async function reinstall(p: Project, deletedJunk: string[], opts: RunOptions = {}): Promise<InstallResult> {
  const entries = await readdir(p.path).catch(() => p.entries);
  const log = await openLog(p.name, opts.logDir);
  const started = Date.now();
  let result: InstallResult = { status: 'ok' };
  const warnings: string[] = [];
  for (const c of installCommands(p.types, entries, deletedJunk)) {
    const r = await run(c, p.path, opts, log);
    if (r.status === 'failed') {
      result = r;
      break;
    }
    if (r.status === 'warning') warnings.push(r.message!);
  }
  if (result.status === 'ok' && warnings.length) result = { status: 'warning', message: warnings.join('; ') };
  log?.write(`finished in ${((Date.now() - started) / 1000).toFixed(1)}s: ${result.status}\n`);
  await log?.close();
  return { ...result, log: log?.path };
}
