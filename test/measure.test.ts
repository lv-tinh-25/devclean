import { describe, it, expect } from 'vitest';
import { chmod, link, mkdir, symlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { dirSize, latestMtime } from '../src/measure.js';
import { file, tmp } from './helpers.js';

describe('dirSize', () => {
  it('counts on-disk blocks', async () => {
    const d = await tmp();
    await file(join(d, 'a.bin'), Buffer.alloc(100_000, 1));
    const size = await dirSize(d);
    expect(size).toBeGreaterThanOrEqual(100_000);
    expect(size).toBeLessThan(110_000);
  });

  it('excludes hard-linked files', async () => {
    const root = await tmp();
    const outside = join(root, 'store.bin');
    await file(outside, Buffer.alloc(200_000, 1));
    const d = join(root, 'nm');
    await file(join(d, 'own.bin'), Buffer.alloc(10_000, 1));
    await link(outside, join(d, 'linked.bin'));
    expect(await dirSize(d)).toBeLessThan(50_000);
  });

  it('does not follow symlinks', async () => {
    const root = await tmp();
    await file(join(root, 'big.bin'), Buffer.alloc(300_000, 1));
    const d = join(root, 'd');
    await mkdir(d);
    await symlink(join(root, 'big.bin'), join(d, 'link'));
    await symlink(root, join(d, 'loop'));
    expect(await dirSize(d)).toBeLessThan(50_000);
  });

  it('survives unreadable subdirs', async () => {
    const d = await tmp();
    await file(join(d, 'locked', 'x'), 'x');
    await chmod(join(d, 'locked'), 0o000);
    await expect(dirSize(d)).resolves.toBeTypeOf('number');
    await chmod(join(d, 'locked'), 0o755);
  });
});

describe('latestMtime', () => {
  it('skips junk and respects depth', async () => {
    const d = await tmp();
    const t1 = new Date('2024-01-01');
    const t2 = new Date('2025-01-01');
    await file(join(d, 'src', 'a.ts'));
    await utimes(join(d, 'src', 'a.ts'), t1, t1);
    await file(join(d, 'node_modules', 'x.js'));
    await utimes(join(d, 'node_modules', 'x.js'), t2, t2);
    const deep = join(d, 'a', 'b', 'c', 'd', 'e', 'f.ts');
    await file(deep);
    await utimes(deep, t2, t2);
    expect(await latestMtime(d, new Set(['node_modules']))).toBe(t1.getTime());
  });
});
