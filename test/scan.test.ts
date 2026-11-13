import { describe, it, expect } from 'vitest';
import { symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { scan, type Project } from '../src/scan.js';
import { file, tmp } from './helpers.js';

async function collect(root: string, signal?: AbortSignal) {
  const out: Project[] = [];
  for await (const p of scan(root, signal)) if (!p.measuring && p.size > 0) out.push(p);
  return out;
}

async function fixture() {
  const root = await tmp();
  await file(join(root, 'a/package.json'), '{}');
  await file(join(root, 'a/node_modules/dep/package.json'), '{}');
  await file(join(root, 'a/node_modules/dep/node_modules/x/index.js'));
  await file(join(root, 'b/pyproject.toml'));
  await file(join(root, 'b/.venv/lib/x.py'));
  await file(join(root, 'b/__pycache__/x.pyc'));
  await file(join(root, 'c/package.json'), '{}');
  await file(join(root, 'mono/package.json'), '{}');
  await file(join(root, 'mono/node_modules/y.js'));
  await file(join(root, 'mono/packages/x/package.json'), '{}');
  await file(join(root, 'mono/packages/x/node_modules/z.js'));
  await file(join(root, '.git/hooks/package.json'));
  await file(join(root, '.git/hooks/node_modules/q.js'));
  await file(join(root, 'Library/app/package.json'));
  await file(join(root, 'Library/app/node_modules/q.js'));
  return root;
}

describe('scan', () => {
  it('finds projects with junk, skips non-projects and excluded dirs', async () => {
    const root = await fixture();
    const found = await collect(root);
    expect(found.map((p) => relative(root, p.path)).sort()).toEqual(['a', 'b', 'mono', 'mono/packages/x']);
    const b = found.find((p) => p.name === 'b')!;
    expect(b.types).toEqual(['python']);
    expect(b.junk.map((j) => j.name).sort()).toEqual(['.venv', '__pycache__']);
    expect(b.size).toBe(b.junk.reduce((s, j) => s + j.size, 0));
    expect(b.size).toBeGreaterThan(0);
    expect(b.modified).toBeGreaterThan(0);
    expect(b.entries).toContain('pyproject.toml');
  });

  it('ignores junk names that are files or symlinks', async () => {
    const root = await tmp();
    await file(join(root, 'fileproj/package.json'), '{}');
    await file(join(root, 'fileproj/dist'), 'user data');
    await file(join(root, 'outside/big.bin'), Buffer.alloc(100_000, 1));
    await file(join(root, 'linkproj/package.json'), '{}');
    await symlink(join(root, 'outside'), join(root, 'linkproj/node_modules'));
    expect(await collect(root)).toEqual([]);
  });

  it('skips dot-directories below the root', async () => {
    const root = await tmp();
    await file(join(root, '.vscode/extensions/ext/package.json'), '{}');
    await file(join(root, '.vscode/extensions/ext/node_modules/a.js'));
    await file(join(root, 'proj/package.json'), '{}');
    await file(join(root, 'proj/node_modules/a.js'));
    expect((await collect(root)).map((p) => p.name)).toEqual(['proj']);
  });

  it('skips bin folders and hides projects with nothing to free', async () => {
    const root = await tmp();
    await file(join(root, 'mod/pom.xml'));
    await file(join(root, 'mod/target/a.class'), Buffer.alloc(10_000, 1));
    await file(join(root, 'mod/bin/pom.xml'));
    await file(join(root, 'mod/bin/target/b.class'), Buffer.alloc(10_000, 1));
    await file(join(root, 'empty/package.json'), '{}');
    await file(join(root, 'empty/node_modules/.keep'), '');
    expect((await collect(root)).map((p) => relative(root, p.path))).toEqual(['mod']);
  });

  it('keeps dist/build only when git ignores them', async () => {
    const root = await tmp();
    const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, stdio: 'ignore' });
    await file(join(root, 'tracked/package.json'), '{}');
    await file(join(root, 'tracked/dist/index.js'), Buffer.alloc(10_000, 1));
    await file(join(root, 'tracked/node_modules/a.js'), Buffer.alloc(10_000, 1));
    git(join(root, 'tracked'), 'init', '-q');
    await file(join(root, 'tracked/.gitignore'), 'node_modules\n');
    await file(join(root, 'ignored/package.json'), '{}');
    await file(join(root, 'ignored/dist/index.js'), Buffer.alloc(10_000, 1));
    git(join(root, 'ignored'), 'init', '-q');
    await file(join(root, 'ignored/.gitignore'), 'dist\n');
    await file(join(root, 'nogit/build.gradle'));
    await file(join(root, 'nogit/build/out.bin'), Buffer.alloc(10_000, 1));
    const byName = Object.fromEntries((await collect(root)).map((p) => [p.name, p.junk.map((j) => j.name).sort()]));
    expect(byName).toEqual({ tracked: ['node_modules'], ignored: ['dist'], nogit: ['build'] });
  });

  it('announces each project before its size is measured', async () => {
    const root = await fixture();
    const events: { name: string; measuring: boolean }[] = [];
    for await (const p of scan(root)) events.push({ name: p.name, measuring: p.measuring });
    const forA = events.filter((e) => e.name === 'a');
    expect(forA).toEqual([{ name: 'a', measuring: true }, { name: 'a', measuring: false }]);
  });

  it('reports projects with nothing to clean as anchors', async () => {
    const root = await fixture();
    const anchors: string[] = [];
    for await (const p of scan(root)) if (p.anchor) anchors.push(relative(root, p.path));
    expect(anchors).toEqual(['c']);
  });

  it('reports progress', async () => {
    const root = await fixture();
    const seen: [number, number][] = [];
    for await (const _ of scan(root, undefined, (done, total) => seen.push([done, total])));
    const last = seen.at(-1)!;
    expect(last[0]).toBe(last[1]);
    expect(last[1]).toBeGreaterThan(3);
    expect(seen.every(([d, t]) => d <= t)).toBe(true);
  });

  it('does not follow symlink loops', async () => {
    const root = await fixture();
    await symlink(root, join(root, 'loop'));
    await symlink(join(root, 'a'), join(root, 'alias'));
    const found = await collect(root);
    expect(found).toHaveLength(4);
  });

  it('stops when aborted', async () => {
    const root = await fixture();
    const ac = new AbortController();
    ac.abort();
    expect(await collect(root, ac.signal)).toEqual([]);
  });
});
