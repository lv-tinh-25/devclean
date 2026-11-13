import { spawn, type StdioOptions } from 'node:child_process';
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

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: StdioOptions;
}

function run(c: InstallCmd, cwd: string, opts: RunOptions): Promise<string | null> {
  return new Promise((done) => {
    const child = spawn(c.cmd, c.args, { cwd, env: opts.env ?? process.env, stdio: opts.stdio ?? 'inherit' });
    child.on('error', (err: NodeJS.ErrnoException) =>
      done(err.code === 'ENOENT' ? `${c.cmd} not found` : `${c.label}: ${err.message}`),
    );
    child.on('close', (code) => done(code === 0 ? null : `${c.label} exited with code ${code}`));
  });
}

export async function reinstall(
  p: Project,
  deletedJunk: string[],
  opts: RunOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  const entries = await readdir(p.path).catch(() => p.entries);
  for (const c of installCommands(p.types, entries, deletedJunk)) {
    const error = await run(c, p.path, opts);
    if (error) return { ok: false, error };
  }
  return { ok: true };
}
