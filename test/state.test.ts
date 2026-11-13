import { describe, it, expect } from 'vitest';
import { initialState, reducer, releasable, targets, type Action, type State } from '../src/state.js';
import type { Project } from '../src/scan.js';

const proj = (name: string, modified: number, size = 100): Project => ({
  path: `/r/${name}`,
  name,
  types: ['node'],
  junk: [{ name: 'node_modules', size }],
  size,
  modified,
  entries: [],
  measuring: false,
});

const run = (actions: Action[], s: State = initialState) => actions.reduce(reducer, s);
const found = (...ps: Project[]): Action[] => ps.map((project) => ({ type: 'projectFound', project }));

describe('reducer', () => {
  it('keeps rows sorted by modified desc and cursor on same path', () => {
    let s = run(found(proj('b', 20), proj('c', 10)));
    s = run([{ type: 'move', delta: 1 }], s);
    expect(s.rows[s.cursor].name).toBe('c');
    s = run(found(proj('a', 30)), s);
    expect(s.rows.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    expect(s.rows[s.cursor].name).toBe('c');
  });

  it('keeps cursor on the top row while it is at the top', () => {
    const s = run(found(proj('b', 20), proj('a', 30)));
    expect(s.cursor).toBe(0);
    expect(s.rows[0].name).toBe('a');
  });

  it('updates a measuring row in place and drops it if nothing to free', () => {
    let s = run(found({ ...proj('a', 2, 0), measuring: true }, { ...proj('b', 1, 0), measuring: true }));
    expect(s.rows.map((r) => r.name)).toEqual(['a', 'b']);
    s = run(found(proj('a', 2, 500), proj('b', 1, 0)), s);
    expect(s.rows.map((r) => [r.name, r.size, r.measuring])).toEqual([['a', 500, false]]);
  });

  it('toggles a whole group, expands and collapses it', () => {
    let s = run(found(proj('mono', 3), { ...proj('mono/packages/x', 2), path: '/r/mono/packages/x' }, proj('z', 1)));
    expect(s.rows).toHaveLength(3);
    s = run([{ type: 'toggle' }], s);
    expect([...s.selected].sort()).toEqual(['/r/mono', '/r/mono/packages/x']);
    s = run([{ type: 'expand' }, { type: 'move', delta: 1 }], s);
    expect(s.cursor).toBe(1);
    s = run([{ type: 'collapse' }], s);
    expect(s.cursor).toBe(0);
    s = run([{ type: 'move', delta: 1 }], s);
    expect(targets({ ...s, selected: new Set() })).toEqual(['/r/z']);
  });

  it('keeps range mode when opening or closing a group', () => {
    let s = run(found(proj('a', 9), proj('mono', 3), { ...proj('x', 2), path: '/r/mono/packages/x' }, proj('z', 1)));
    s = run([{ type: 'range' }, { type: 'move', delta: 1 }, { type: 'expand' }], s);
    expect(s.rangeAnchor).toBe(0);
    s = run([{ type: 'move', delta: 1 }, { type: 'collapse' }], s);
    expect(s.rangeAnchor).toBe(0);
    s = run([{ type: 'move', delta: 1 }, { type: 'range' }], s);
    expect([...s.selected].sort()).toEqual(['/r/a', '/r/mono', '/r/mono/packages/x', '/r/z']);
  });

  it('range over an open group selects only the children it covers', () => {
    const kids = ['/r/mono/a', '/r/mono/b', '/r/mono/c'].map((p, i) => ({ ...proj('k' + i, 3 - i), path: p }));
    let s = run(found(proj('top', 9), proj('mono', 5), ...kids));
    s = run([{ type: 'move', delta: 1 }, { type: 'expand' }, { type: 'move', delta: -1 }, { type: 'range' }, { type: 'move', delta: 3 }, { type: 'range' }], s);
    expect([...s.selected].sort()).toEqual(['/r/mono/a', '/r/mono/b', '/r/top']);
  });

  it('range over a closed group selects the whole group', () => {
    const kids = ['/r/mono/a', '/r/mono/b'].map((p, i) => ({ ...proj('k' + i, 3 - i), path: p }));
    let s = run(found(proj('top', 9), proj('mono', 5), ...kids));
    s = run([{ type: 'range' }, { type: 'move', delta: 1 }, { type: 'range' }], s);
    expect([...s.selected].sort()).toEqual(['/r/mono', '/r/mono/a', '/r/mono/b', '/r/top']);
  });

  it('records anchor projects without adding rows', () => {
    const s = run(found({ ...proj('shop', 1, 0), junk: [], anchor: true }));
    expect(s.rows).toHaveLength(0);
    expect(s.anchors.has('/r/shop')).toBe(true);
  });

  it('toggles and selects all', () => {
    let s = run([...found(proj('a', 3), proj('b', 2), proj('c', 1)), { type: 'toggle' }]);
    expect([...s.selected]).toEqual(['/r/a']);
    s = run([{ type: 'toggle' }], s);
    expect(s.selected.size).toBe(0);
    s = run([{ type: 'all' }], s);
    expect(s.selected.size).toBe(3);
    s = run([{ type: 'all' }], s);
    expect(s.selected.size).toBe(0);
  });

  it('select-all includes rows found later and the next press clears', () => {
    let s = run([...found(proj('a', 3)), { type: 'all' }]);
    s = run(found(proj('b', 2)), s);
    expect([...s.selected].sort()).toEqual(['/r/a', '/r/b']);
    s = run([{ type: 'all' }], s);
    expect(s.selected.size).toBe(0);
    s = run(found(proj('c', 1)), s);
    expect(s.selected.size).toBe(0);
  });

  it('selects ranges in both directions', () => {
    const base = run(found(proj('a', 5), proj('b', 4), proj('c', 3), proj('d', 2)));
    let s = run([{ type: 'move', delta: 1 }, { type: 'range' }, { type: 'move', delta: 2 }, { type: 'range' }], base);
    expect([...s.selected].sort()).toEqual(['/r/b', '/r/c', '/r/d']);
    expect(s.rangeAnchor).toBeNull();
    s = run([{ type: 'move', delta: 3 }, { type: 'range' }, { type: 'move', delta: -2 }, { type: 'range' }], base);
    expect([...s.selected].sort()).toEqual(['/r/b', '/r/c', '/r/d']);
  });

  it('targets cursor row when nothing selected', () => {
    const s = run([...found(proj('a', 2), proj('b', 1)), { type: 'move', delta: 1 }]);
    expect(targets(s)).toEqual(['/r/b']);
  });

  it('marks deleted, adds to saved, drops selection', () => {
    let s = run([...found(proj('a', 2, 500), proj('b', 1, 300)), { type: 'all' }]);
    expect(releasable(s)).toBe(800);
    s = run([{ type: 'deleting', paths: ['/r/a'] }, { type: 'deleted', path: '/r/a', freed: 500 }], s);
    const a = s.rows.find((r) => r.name === 'a')!;
    expect(a.status).toBe('deleted');
    expect(a.size).toBe(0);
    expect(s.saved).toBe(500);
    expect(s.selected.has('/r/a')).toBe(false);
    expect(releasable(s)).toBe(300);
  });

  it('does not resurrect a deleted row on late projectFound', () => {
    let s = run([...found(proj('a', 2, 500)), { type: 'deleted', path: '/r/a', freed: 500 }]);
    s = run(found(proj('a', 2, 500)), s);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].status).toBe('deleted');
    expect(s.rows[0].size).toBe(0);
  });

  it('keeps a remeasured row even when it has nothing left to free', () => {
    let s = run(found(proj('a', 2, 500)));
    s = run([{ type: 'remeasured', project: proj('a', 2, 0) }, { type: 'error', path: '/r/a', error: 'npm not found' }], s);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].error).toBe('npm not found');
  });

  it('remeasured replaces the row and resets status', () => {
    let s = run([...found(proj('a', 2, 500)), { type: 'deleted', path: '/r/a', freed: 500 }]);
    s = run([{ type: 'remeasured', project: proj('a', 2, 400) }], s);
    expect(s.rows[0].status).toBe('idle');
    expect(s.rows[0].size).toBe(400);
  });

  it('records errors and clamps movement', () => {
    let s = run([...found(proj('a', 2), proj('b', 1)), { type: 'move', delta: -5 }]);
    expect(s.cursor).toBe(0);
    s = run([{ type: 'move', delta: 9 }, { type: 'error', path: '/r/a', error: 'boom' }], s);
    expect(s.cursor).toBe(1);
    expect(s.rows[0].status).toBe('error');
    expect(s.rows[0].error).toBe('boom');
  });

  it('freezes delete targets when the prompt opens', () => {
    let s = run([...found(proj('a', 2)), { type: 'askDelete' }]);
    expect(s.confirmPaths).toEqual(['/r/a']);
    s = run(found(proj('newer', 99)), s);
    expect(s.rows[0].name).toBe('newer');
    expect(s.confirmPaths).toEqual(['/r/a']);
  });

  it('always asks before quitting', () => {
    let s = run([...found(proj('a', 1)), { type: 'askQuit' }]);
    expect(s.confirmQuit).toBe(true);
    s = run([{ type: 'cancel' }], s);
    expect(s.confirmQuit).toBe(false);
  });

  it('confirm flow', () => {
    let s = run([...found(proj('a', 1)), { type: 'askDelete' }]);
    expect(s.confirm).toBe(true);
    s = run([{ type: 'cancel' }], s);
    expect(s.confirm).toBe(false);
  });
});
