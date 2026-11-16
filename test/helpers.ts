import { chmod, mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

export async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'devclean-'));
}

export async function file(path: string, content: string | Buffer = 'x'): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

// A fake installer on PATH. The behaviour is a Node script so it runs the same on every
// OS; the launcher is a shell script, or a .cmd shim on Windows like the real npm.
export async function fakeBin(tools: Record<string, string>): Promise<string> {
  const bin = await tmp();
  for (const [name, js] of Object.entries(tools)) {
    await file(join(bin, `${name}.js`), js);
    if (process.platform === 'win32') {
      await file(join(bin, `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}.js" %*\r\n`);
    } else {
      await file(join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "$0.js" "$@"\n`);
      await chmod(join(bin, name), 0o755);
    }
  }
  return bin;
}

// process.env with `bin` first on PATH, whatever case the platform spells PATH in.
export function envWithBin(bin: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') env[k] = v;
  env.PATH = `${bin}${delimiter}${process.env.PATH ?? ''}`;
  return env;
}

// Folder links: junctions on Windows need no admin rights, unlike symlinks.
export const linkDir = (target: string, path: string) => symlink(target, path, 'junction');

// File symlinks need admin rights or Developer Mode on Windows; without them, skip the link.
export async function tryLinkFile(target: string, path: string): Promise<void> {
  try {
    await symlink(target, path);
  } catch (err) {
    if (process.platform !== 'win32' || (err as NodeJS.ErrnoException).code !== 'EPERM') throw err;
  }
}
