import { sep } from 'node:path';
import type { ProjectType } from './rules.js';
import type { Row, State } from './state.js';

export interface Item {
  kind: 'group' | 'row';
  key: string;
  path: string;
  depth: 0 | 1;
  members: string[];
  row?: Row;
  childCount: number;
  types: ProjectType[];
  size: number;
  modified: number;
  measuring: boolean;
}

const isInside = (child: string, parent: string) => child.startsWith(parent + sep);

const rowItem = (r: Row, depth: 0 | 1): Item => ({
  kind: 'row',
  key: `${depth}:${r.path}`,
  path: r.path,
  depth,
  members: [r.path],
  row: r,
  childCount: 0,
  types: r.types,
  size: r.status === 'deleted' ? 0 : r.size,
  modified: r.modified,
  measuring: r.measuring,
});

// Nested projects (monorepo packages, Maven modules) collapse under their outermost
// enclosing project, which may itself have nothing to clean (an "anchor").
export function buildView(s: State): Item[] {
  const projects = [...new Set([...s.anchors, ...s.rows.map((r) => r.path)])];
  const groups = new Map<string, Row[]>();
  for (const r of s.rows) {
    const outer = projects.filter((p) => isInside(r.path, p)).sort((a, b) => a.length - b.length)[0];
    const key = outer ?? r.path;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const top: { item: Item; rows: Row[] }[] = [];
  for (const [key, rows] of groups) {
    const own = rows.find((r) => r.path === key);
    const children = rows.filter((r) => r !== own);
    if (children.length === 0 || (!own && children.length === 1)) {
      for (const r of rows) top.push({ item: rowItem(r, 0), rows: [r] });
      continue;
    }
    top.push({
      item: {
        kind: 'group',
        key: `g:${key}`,
        path: key,
        depth: 0,
        members: rows.map((r) => r.path),
        row: own,
        childCount: children.length,
        types: [...new Set(rows.flatMap((r) => r.types))],
        size: rows.reduce((sum, r) => sum + (r.status === 'deleted' ? 0 : r.size), 0),
        modified: Math.max(...rows.map((r) => r.modified)),
        measuring: rows.some((r) => r.measuring),
      },
      rows,
    });
  }

  top.sort((a, b) => b.item.modified - a.item.modified);
  const out: Item[] = [];
  for (const { item, rows } of top) {
    out.push(item);
    if (item.kind !== 'group' || !s.expanded.has(item.path)) continue;
    const children = rows.filter((r) => r.path !== item.path).sort((a, b) => b.modified - a.modified);
    for (const r of children) out.push(rowItem(r, 1));
    if (item.row) out.push(rowItem(item.row, 1));
  }
  return out;
}
