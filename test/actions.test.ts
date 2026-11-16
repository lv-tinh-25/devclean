import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deleteJunk, reinstall } from '../src/actions.js';
import { pruneLogs } from '../src/installLog.js';
import { chmod, readdir, readFile } from 'node:fs/promises';
import type { Project } from '../src/scan.js';
import { file, tmp } from './helpers.js';

const project = (path: string, over: Partial<Project> = {}): Project => ({
  path,
  name: 'p',
  types: ['node'],
  junk: [{ name: 'node_modules', size: 123 }],
  size: 123,
  modified: 0,
  entries: ['package.json', 'node_modules', 'src'],
  measuring: false,
  ...over,
});

describe('deleteJunk', () => {
  it('removes only junk folders', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'src/index.js'));
    await file(join(d, 'node_modules/a/b.js'));
    expect(await deleteJunk(project(d))).toBe(123);
    expect(existsSync(join(d, 'node_modules'))).toBe(false);
    expect(existsSync(join(d, 'src/index.js'))).toBe(true);
    expect(existsSync(join(d, 'package.json'))).toBe(true);
  });

  it('skips junk entries that are not real directories and reports actual freed size', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'dist'), 'user data');
    await file(join(d, 'node_modules/a.js'));
    const p = project(d, { junk: [{ name: 'dist', size: 50 }, { name: 'node_modules', size: 70 }], size: 120 });
    expect(await deleteJunk(p)).toBe(70);
    expect(existsSync(join(d, 'dist'))).toBe(true);
    expect(existsSync(join(d, 'node_modules'))).toBe(false);
  });

  it('refuses names that escape the project', async () => {
    const root = await tmp();
    await file(join(root, 'keep/x'));
    const d = join(root, 'p');
    await file(join(d, 'package.json'), '{}');
    await expect(deleteJunk(project(d, { junk: [{ name: '../keep', size: 1 }] }))).rejects.toThrow();
    expect(existsSync(join(root, 'keep/x'))).toBe(true);
  });
});

async function fakeTool(name: string, script: string) {
  const bin = await tmp();
  await file(join(bin, name), `#!/bin/sh\n${script}\n`);
  await chmod(join(bin, name), 0o755);
  return { PATH: `${bin}:${process.env.PATH}` };
}

describe('reinstall', () => {
  it('reports a missing tool instead of throwing', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'pnpm-lock.yaml'));
    const p = project(d, { entries: ['package.json', 'pnpm-lock.yaml'] });
    const res = await reinstall(p, ['node_modules'], { env: { PATH: '' } });
    expect(res.status).toBe('failed');
    expect(res.message).toMatch(/pnpm not found/);
  });

  it('streams output lines, writes a log and succeeds', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'pnpm-lock.yaml'));
    const env = await fakeTool('pnpm', 'echo "Progress: resolved 1"; printf "added 3\\r"; echo "done"; mkdir node_modules');
    const lines: string[] = [];
    const res = await reinstall(project(d, { name: 'shop' }), ['node_modules'], { env, onOutput: (l) => lines.push(l) });
    expect(res.status).toBe('ok');
    expect(lines).toEqual(['Progress: resolved 1', 'done']); // 'added 3' was redrawn by 'done' via \r
    expect(res.log).toMatch(/devclean[\\/]logs[\\/]shop-\d{8}-\d{6}\.log$/);
    const log = await readFile(res.log!, 'utf8');
    expect(log).toContain('$ pnpm install');
    expect(log).toContain(`cwd: ${d}`);
    expect(log).toContain('Progress: resolved 1');
    expect(log).toMatch(/exit code 0/);
  });

  it('treats pnpm ignored build scripts as a warning, not a failure', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'pnpm-lock.yaml'));
    const env = await fakeTool('pnpm', 'echo "Error: ERR_PNPM_IGNORED_BUILDS" >&2; echo "Ignored build scripts: sharp@0.34.5, @swc/core@1.15.43" >&2; exit 1');
    const res = await reinstall(project(d), ['node_modules'], { env });
    expect(res.status).toBe('warning');
    expect(res.message).toBe('build scripts skipped (sharp, @swc/core), run `pnpm approve-builds` in this project');
  });

  it('reports non-zero exit with the last output line', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    const env = await fakeTool('npm', 'echo "npm error code E404" >&2; exit 1');
    const res = await reinstall(project(d, { entries: ['package.json'] }), [], { env });
    expect(res.status).toBe('failed');
    expect(res.message).toBe('npm install exited with code 1: npm error code E404');
  });

  it('runs non-interactively', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    const env = await fakeTool('npm', 'echo "CI=$CI"; read x || echo "no stdin"');
    const lines: string[] = [];
    await reinstall(project(d), [], { env, onOutput: (l) => lines.push(l) });
    expect(lines).toEqual(['CI=1', 'no stdin']);
  });

  it('can be cancelled', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    const env = await fakeTool('npm', 'sleep 5');
    const ac = new AbortController();
    const started = Date.now();
    setTimeout(() => ac.abort(), 100);
    const res = await reinstall(project(d), [], { env, signal: ac.signal });
    expect(res.status).toBe('failed');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('install logs', () => {
  it('keeps only the 20 newest log files', async () => {
    const dir = await tmp();
    for (let i = 0; i < 25; i++) await file(join(dir, `p-2026010${i % 9}-0000${String(i).padStart(2, '0')}.log`), 'x');
    await pruneLogs(dir, 20);
    expect((await readdir(dir)).length).toBe(20);
  });
});
