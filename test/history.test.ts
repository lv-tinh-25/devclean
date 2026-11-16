import { describe, it, expect } from 'vitest';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { forget, historyFile, loadHistory, recordDeletion, restoreDeleted, type HistoryEntry } from '../src/history.js';
import { file, tmp } from './helpers.js';

const entry = (path: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  path,
  junk: ['node_modules'],
  types: ['node'],
  deletedAt: 1_700_000_000_000,
  ...over,
});

describe('history file', () => {
  it('lives under XDG_CONFIG_HOME', () => {
    expect(historyFile()).toBe(join(process.env.XDG_CONFIG_HOME!, 'devclean', 'history.json'));
  });

  it('records, replaces and forgets entries', async () => {
    const f = join(await tmp(), 'h.json');
    await recordDeletion(entry('/p/a'), f);
    await recordDeletion(entry('/p/b'), f);
    await recordDeletion(entry('/p/a', { junk: ['.venv'] }), f);
    expect((await loadHistory(f)).map((e) => [e.path, e.junk])).toEqual([
      ['/p/b', ['node_modules']],
      ['/p/a', ['.venv']],
    ]);
    await forget(['/p/b'], f);
    expect((await loadHistory(f)).map((e) => e.path)).toEqual(['/p/a']);
  });

  it('treats a missing or corrupt file as empty', async () => {
    const d = await tmp();
    expect(await loadHistory(join(d, 'none.json'))).toEqual([]);
    await writeFile(join(d, 'bad.json'), '{not json');
    expect(await loadHistory(join(d, 'bad.json'))).toEqual([]);
  });

  it('never throws when the file cannot be written', async () => {
    const d = await tmp();
    await chmod(d, 0o500);
    await expect(recordDeletion(entry('/p/a'), join(d, 'sub', 'h.json'))).resolves.toBeUndefined();
    await chmod(d, 0o755);
  });
});

describe('restoreDeleted', () => {
  it('returns still-cleaned projects under the root and prunes stale entries', async () => {
    const root = await tmp();
    const other = await tmp();
    const f = join(await tmp(), 'h.json');
    await file(join(root, 'clean/package.json'), '{}');
    await file(join(root, 'clean/src/a.js'));
    await file(join(root, 'reinstalled/package.json'), '{}');
    await file(join(root, 'reinstalled/node_modules/x.js'), Buffer.alloc(5000, 1));
    await file(join(other, 'elsewhere/package.json'), '{}');
    for (const e of [
      entry(join(root, 'clean'), { junk: ['node_modules', 'dist'] }),
      entry(join(root, 'reinstalled')),
      entry(join(root, 'gone')),
      entry(join(other, 'elsewhere')),
    ])
      await recordDeletion(e, f);

    const restored = await restoreDeleted(root, f);
    expect(restored.map((p) => [p.path, p.junk.map((j) => j.name), p.size, p.deletedAt])).toEqual([
      [join(root, 'clean'), ['node_modules', 'dist'], 0, 1_700_000_000_000],
    ]);
    expect(restored[0].modified).toBeGreaterThan(0);
    expect((await loadHistory(f)).map((e) => e.path).sort()).toEqual([join(other, 'elsewhere'), join(root, 'clean')].sort());
  });

  it('ignores a history entry whose folder is no longer a project', async () => {
    const root = await tmp();
    const f = join(await tmp(), 'h.json');
    await mkdir(join(root, 'plain'));
    await recordDeletion(entry(join(root, 'plain')), f);
    expect(await restoreDeleted(root, f)).toEqual([]);
    expect(await loadHistory(f)).toEqual([]);
  });
});
