import type { Project } from './scan.js';
import { buildView } from './view.js';

export interface Row extends Project {
  status: 'idle' | 'deleting' | 'deleted' | 'error';
  error?: string;
}

export interface State {
  rows: Row[];
  cursor: number;
  selected: Set<string>;
  rangeAnchor: number | null;
  saved: number;
  scanning: boolean;
  scanMs: number;
  confirm: boolean;
  confirmPaths: string[];
  progress: { done: number; total: number };
  confirmQuit: boolean;
  // Set by `a`: rows found later join the selection until the user changes it.
  allSelected: boolean;
  anchors: Set<string>;
  expanded: Set<string>;
}

export type Action =
  | { type: 'projectFound'; project: Project }
  | { type: 'scanDone'; ms: number }
  | { type: 'move'; delta: number }
  | { type: 'toggle' }
  | { type: 'range' }
  | { type: 'all' }
  | { type: 'askDelete' }
  | { type: 'cancel' }
  | { type: 'deleting'; paths: string[] }
  | { type: 'deleted'; path: string; freed: number }
  | { type: 'error'; path: string; error: string }
  | { type: 'remeasured'; project: Project }
  | { type: 'clearSelection' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'askQuit' }
  | { type: 'expand' }
  | { type: 'collapse' };

export const initialState: State = {
  rows: [],
  cursor: 0,
  selected: new Set(),
  rangeAnchor: null,
  saved: 0,
  scanning: true,
  scanMs: 0,
  confirm: false,
  confirmPaths: [],
  progress: { done: 0, total: 0 },
  confirmQuit: false,
  allSelected: false,
  anchors: new Set(),
  expanded: new Set(),
};

const byModified = (a: Row, b: Row) => b.modified - a.modified;

// Rows re-sort and regroup as projects arrive; keep the cursor on the same item.
function keepCursor(prev: State, next: State): State {
  const view = buildView(next);
  if (prev.cursor === 0) return { ...next, cursor: 0 };
  const key = buildView(prev)[prev.cursor]?.key;
  const idx = view.findIndex((i) => i.key === key);
  return { ...next, cursor: idx >= 0 ? idx : Math.min(prev.cursor, Math.max(0, view.length - 1)) };
}

// Opening/closing a group shifts row indices; keep a pending range on the same item.
// If that item was a child that just got hidden, fall back to its group row.
function withAnchorKept(prev: State, next: State): State {
  if (prev.rangeAnchor === null) return next;
  const before = buildView(prev);
  const after = buildView(next);
  const key = before[prev.rangeAnchor]?.key;
  let idx = after.findIndex((i) => i.key === key);
  if (idx < 0) {
    const group = before.slice(0, prev.rangeAnchor + 1).findLast((i) => i.depth === 0);
    idx = after.findIndex((i) => i.key === group?.key);
  }
  return { ...next, rangeAnchor: idx >= 0 ? idx : null };
}

function upsert(s: State, project: Project, keepEmpty = false): State {
  if (project.anchor) return s.anchors.has(project.path) ? s : keepCursor(s, { ...s, anchors: new Set(s.anchors).add(project.path) });
  const existing = s.rows.find((r) => r.path === project.path);
  if (existing?.status === 'deleted') return s;
  const others = s.rows.filter((r) => r.path !== project.path);
  // Measured and nothing to free: not worth a row.
  const keep = keepEmpty || project.measuring || project.size > 0;
  const rows = (keep ? [...others, { ...project, status: 'idle' as const }] : others).sort(byModified);
  const anchors = keep ? s.anchors : new Set(s.anchors).add(project.path);
  return keepCursor(s, { ...s, rows, anchors });
}

const patch = (s: State, path: string, fn: (r: Row) => Row): State => ({
  ...s,
  rows: s.rows.map((r) => (r.path === path ? fn(r) : r)),
});

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'projectFound': {
      const next = upsert(s, a.project);
      if (!s.allSelected || next === s) return next;
      return { ...next, selected: new Set(next.selected).add(a.project.path) };
    }
    case 'remeasured': {
      const without = { ...s, rows: s.rows.filter((r) => r.path !== a.project.path) };
      return keepCursor(s, upsert(without, a.project, true));
    }
    case 'scanDone':
      return { ...s, scanning: false, scanMs: a.ms };
    case 'move': {
      const cursor = Math.max(0, Math.min(buildView(s).length - 1, s.cursor + a.delta));
      return { ...s, cursor };
    }
    case 'toggle': {
      const item = buildView(s)[s.cursor];
      if (!item) return s;
      const selected = new Set(s.selected);
      const allOn = item.members.every((p) => selected.has(p));
      for (const p of item.members) allOn ? selected.delete(p) : selected.add(p);
      return { ...s, selected, allSelected: false };
    }
    case 'range': {
      if (s.rangeAnchor === null) return { ...s, rangeAnchor: s.cursor };
      const [from, to] = [s.rangeAnchor, s.cursor].sort((x, y) => x - y);
      const selected = new Set(s.selected);
      for (const item of buildView(s).slice(from, to + 1)) {
        // An open group's header is just a label; its visible children are counted individually.
        if (item.kind === 'group' && s.expanded.has(item.path)) continue;
        for (const p of item.members) selected.add(p);
      }
      return { ...s, selected, rangeAnchor: null, allSelected: false };
    }
    case 'expand': {
      const item = buildView(s)[s.cursor];
      if (item?.kind !== 'group' || s.expanded.has(item.path)) return s;
      return withAnchorKept(s, { ...s, expanded: new Set(s.expanded).add(item.path) });
    }
    case 'collapse': {
      const view = buildView(s);
      const item = view[s.cursor];
      if (!item) return s;
      const groupIdx = item.depth === 1 ? view.slice(0, s.cursor).findLastIndex((i) => i.depth === 0) : s.cursor;
      const group = view[groupIdx];
      if (group?.kind !== 'group' || !s.expanded.has(group.path)) return s;
      const expanded = new Set(s.expanded);
      expanded.delete(group.path);
      return withAnchorKept(s, { ...s, expanded, cursor: groupIdx });
    }
    case 'all': {
      if (s.allSelected) return { ...s, selected: new Set(), allSelected: false };
      const live = s.rows.filter((r) => r.status !== 'deleted').map((r) => r.path);
      return { ...s, selected: new Set(live), allSelected: true };
    }
    case 'askDelete': {
      const live = new Set(s.rows.filter((r) => r.status === 'idle' || r.status === 'error').map((r) => r.path));
      const paths = targets(s).filter((p) => live.has(p));
      return paths.length ? { ...s, confirm: true, confirmPaths: paths, rangeAnchor: null } : s;
    }
    case 'askQuit':
      return { ...s, confirmQuit: true };
    case 'cancel':
      return { ...s, confirm: false, confirmPaths: [], confirmQuit: false, rangeAnchor: null };
    case 'deleting': {
      const set = new Set(a.paths);
      return {
        ...s,
        confirm: false,
        confirmPaths: [],
        rows: s.rows.map((r) => (set.has(r.path) ? { ...r, status: 'deleting' } : r)),
      };
    }
    case 'deleted': {
      const selected = new Set(s.selected);
      selected.delete(a.path);
      const next = patch(s, a.path, (r) => ({
        ...r,
        status: 'deleted',
        size: 0,
        junk: r.junk.map((j) => ({ ...j, size: 0 })),
      }));
      return { ...next, selected, saved: s.saved + a.freed };
    }
    case 'progress':
      return { ...s, progress: { done: a.done, total: a.total } };
    case 'clearSelection':
      return { ...s, selected: new Set(), rangeAnchor: null, allSelected: false };
    case 'error':
      return patch(s, a.path, (r) => ({ ...r, status: 'error', error: a.error }));
  }
}

export function targets(s: State): string[] {
  if (s.selected.size) return s.rows.filter((r) => s.selected.has(r.path)).map((r) => r.path);
  return buildView(s)[s.cursor]?.members ?? [];
}

export const selectedSize = (s: State) =>
  s.rows.reduce((sum, r) => sum + (s.selected.has(r.path) && r.status !== 'deleted' ? r.size : 0), 0);

export const releasable = (s: State) => s.rows.reduce((sum, r) => sum + (r.status === 'deleted' ? 0 : r.size), 0);
