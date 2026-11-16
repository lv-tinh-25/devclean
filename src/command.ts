import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, extname, resolve } from 'node:path';

type Env = NodeJS.ProcessEnv;

// Windows env names are case-insensitive (`Path`, `PATH`), a plain object lookup isn't.
const envValue = (env: Env, name: string) => env[Object.keys(env).find((k) => k.toUpperCase() === name) ?? name];

const isFile = (p: string) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

// Like cmd.exe's lookup (PATH x PATHEXT), but never the current folder for bare names:
// a project must not be able to shadow `npm` with an npm.cmd of its own.
export function findWindowsCommand(cmd: string, cwd: string, env: Env): string | null {
  const exts = extname(cmd) ? [''] : (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const dirs = /[\\/]/.test(cmd) ? [cwd] : (envValue(env, 'PATH') ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = resolve(dir, cmd + ext);
      if (isFile(p)) return p;
    }
  }
  return null;
}

const quote = (arg: string) => (/[\s&|<>^()%!"]/.test(arg) ? `"${arg}"` : arg);

type Options = SpawnOptions & { cwd: string; env: Env };

// Installers on Windows are mostly .cmd shims, which only run through cmd.exe. Using
// `shell: true` instead would hide a missing tool behind cmd's own error text, and
// aborting would only kill cmd.exe while the installer under it keeps running.
export function spawnTool(cmd: string, args: string[], { signal, ...opts }: Options): ChildProcess {
  if (process.platform !== 'win32') return spawn(cmd, args, { ...opts, signal });
  const found = findWindowsCommand(cmd, opts.cwd, opts.env);
  let child: ChildProcess;
  if (!found) {
    child = spawn(cmd, args, opts); // fails with ENOENT, which callers already report
  } else if (/\.(cmd|bat)$/i.test(found)) {
    const line = [found, ...args].map(quote).join(' ');
    const shell = envValue(process.env, 'COMSPEC') ?? 'cmd.exe';
    child = spawn(shell, ['/d', '/s', '/c', `"${line}"`], { ...opts, windowsVerbatimArguments: true });
  } else {
    child = spawn(found, args, opts);
  }
  if (signal) {
    const kill = () => {
      if (child.pid === undefined || child.exitCode !== null) return;
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => child.kill());
    };
    if (signal.aborted) kill();
    else signal.addEventListener('abort', kill, { once: true });
    child.once('close', () => signal.removeEventListener('abort', kill));
  }
  return child;
}
