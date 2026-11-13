import { describe, it, expect } from 'vitest';
import { buildView } from '../src/view.js';
import { initialState, type Row, type State } from '../src/state.js';

const row = (path: string, modified: number, size = 100): Row => ({
  path,
  name: path.split('/').at(-1)!,
  types: ['node'],
  junk: [{ name: 'node_modules', size }],
  size,
  modified,
  entries: [],
  measuring: false,
  status: 'idle',
});

const st = (rows: Row[], anchors: string[] = [], expanded: string[] = []): State => ({
  ...initialState,
  scanning: false,
  rows: [...rows].sort((a, b) => b.modified - a.modified),
  anchors: new Set(anchors),
  expanded: new Set(expanded),
});

describe('buildView', () => {
  it('leaves unrelated projects as single rows', () => {
    const v = buildView(st([row('/r/a', 2), row('/r/b', 1)]));
    expect(v.map((i) => [i.path, i.depth, i.members])).toEqual([
      ['/r/a', 0, ['/r/a']],
      ['/r/b', 0, ['/r/b']],
    ]);
  });

  it('groups nested projects under their outermost project row, collapsed', () => {
    const v = buildView(st([row('/r/vefy', 5, 600), row('/r/vefy/apps/web', 9, 70), row('/r/vefy/packages/db', 1, 10), row('/r/x', 3)]));
    expect(v.map((i) => [i.path, i.depth])).toEqual([
      ['/r/vefy', 0],
      ['/r/x', 0],
    ]);
    const g = v[0];
    expect(g.childCount).toBe(2);
    expect(g.size).toBe(680);
    expect(g.modified).toBe(9);
    expect(g.members.sort()).toEqual(['/r/vefy', '/r/vefy/apps/web', '/r/vefy/packages/db']);
  });

  it('groups under an anchor project that has nothing to clean', () => {
    const v = buildView(st([row('/r/shop/core', 2), row('/r/shop/ui', 1)], ['/r/shop']));
    expect(v).toHaveLength(1);
    expect(v[0].path).toBe('/r/shop');
    expect(v[0].row).toBeUndefined();
    expect(v[0].childCount).toBe(2);
  });

  it('expands a group into its own row plus children', () => {
    const v = buildView(st([row('/r/vefy', 5), row('/r/vefy/apps/web', 9)], [], ['/r/vefy']));
    expect(v.map((i) => [i.path, i.depth, i.kind])).toEqual([
      ['/r/vefy', 0, 'group'],
      ['/r/vefy/apps/web', 1, 'row'],
      ['/r/vefy', 1, 'row'],
    ]);
  });

  it('does not group a single anchored child', () => {
    const v = buildView(st([row('/r/shop/core', 2)], ['/r/shop']));
    expect(v.map((i) => [i.path, i.kind])).toEqual([['/r/shop/core', 'row']]);
  });
});
