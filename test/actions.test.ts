import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deleteJunk, reinstall } from '../src/actions.js';
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

describe('reinstall', () => {
  it('reports a missing tool instead of throwing', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{}');
    await file(join(d, 'pnpm-lock.yaml'));
    const p = project(d, { entries: ['package.json', 'pnpm-lock.yaml'] });
    const res = await reinstall(p, ['node_modules'], { env: { PATH: '' }, stdio: 'ignore' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/pnpm not found/);
  });

  it('reports non-zero exit', async () => {
    const d = await tmp();
    await file(join(d, 'package.json'), '{ broken');
    const res = await reinstall(project(d, { entries: ['package.json'] }), [], { stdio: 'ignore' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/npm install exited with code/);
  });
});
