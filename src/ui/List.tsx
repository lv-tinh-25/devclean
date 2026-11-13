import { Box, Text } from 'ink';
import { relative } from 'node:path';
import { formatBytes, relativeTime, truncateMiddle } from '../format.js';
import { labelOf } from '../rules.js';
import type { State } from '../state.js';
import { buildView, type Item } from '../view.js';

const TYPE_W = 12;
const SIZE_W = 10;
const MOD_W = 12;
const PREFIX_W = 6;

const pad = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length));
const padStart = (s: string, w: number) => (s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s);

function sizeCell(item: Item) {
  const r = item.kind === 'row' ? item.row : undefined;
  if (r?.status === 'deleting') return 'deleting…';
  if (r?.status === 'deleted') return 'deleted';
  if (item.measuring) return 'measuring…';
  return formatBytes(item.size);
}

interface Seg {
  text: string;
  dim?: boolean;
  color?: string;
  bold?: boolean;
}

// Split "parent/dir/name" so the parent part can be dimmed and the name stand out.
function pathSegs(path: string, nameStyle: Omit<Seg, 'text'> = {}): Seg[] {
  const cut = path.lastIndexOf('/') + 1;
  return [{ text: path.slice(0, cut), dim: true }, { text: path.slice(cut), ...nameStyle }];
}

function nameSegs(item: Item, root: string, view: Item[], idx: number, expanded: boolean): Seg[] {
  if (item.depth === 0) {
    const rel = relative(root, item.path) || item.path.split('/').at(-1)!;
    if (item.kind === 'row') return pathSegs(rel);
    const count = item.childCount + (item.row ? 1 : 0);
    return [
      { text: expanded ? '▼ ' : '▶ ', color: 'cyan' },
      ...pathSegs(rel, { color: 'cyan', bold: true }),
      { text: ` (${count})`, dim: true },
    ];
  }
  const parent = view.slice(0, idx).findLast((i) => i.depth === 0)!;
  const last = view[idx + 1]?.depth !== 1;
  const branch: Seg = { text: last ? '  └─ ' : '  ├─ ', dim: true };
  if (item.path !== parent.path) return [branch, ...pathSegs(relative(parent.path, item.path))];
  // The parent project's own folders (e.g. its root node_modules), not the whole group.
  return [branch, { text: './ (root) ', dim: true }, { text: item.row!.junk.map((j) => j.name).join(', ') }];
}

function fitSegs(segs: Seg[], width: number): Seg[] {
  const full = segs.map((x) => x.text).join('');
  if (full.length <= width) return [...segs, { text: ' '.repeat(width - full.length) }];
  return [{ text: truncateMiddle(full, width) }];
}

function mark(state: State, item: Item, highlighted: boolean) {
  if (state.scanning) return '[-]';
  // An open group's header doesn't take part in a range; its children do.
  if (state.rangeAnchor !== null && item.kind === 'group' && state.expanded.has(item.path)) return '[-]';
  const n = item.members.filter((p) => state.selected.has(p)).length;
  if (n === item.members.length) return '[x]';
  if (highlighted) return '[·]';
  return n === 0 ? '[ ]' : '[~]';
}

export function List({ state, root, width, height }: { state: State; root: string; width: number; height: number }) {
  const view = buildView(state);
  const nameW = Math.max(10, width - PREFIX_W - TYPE_W - SIZE_W - MOD_W - 3);
  const visible = Math.max(1, height - 2);
  const start = Math.min(Math.max(0, state.cursor - Math.floor(visible / 2)), Math.max(0, view.length - visible));
  const items = view.slice(start, start + visible);
  const inRange = (i: number) =>
    state.rangeAnchor !== null &&
    i >= Math.min(state.rangeAnchor, state.cursor) &&
    i <= Math.max(state.rangeAnchor, state.cursor) &&
    !(view[i].kind === 'group' && state.expanded.has(view[i].path));

  return (
    <Box flexDirection="column">
      <Text dimColor>{'─'.repeat(width)}</Text>
      <Text bold>
        {' '.repeat(PREFIX_W)}
        {pad('PROJECT', nameW)} {pad('TYPE', TYPE_W)} {padStart('SIZE', SIZE_W)} {padStart('MODIFIED', MOD_W)}
      </Text>
      {view.length === 0 && <Text dimColor>{state.scanning ? '  Looking for projects…' : '  No cleanable projects found.'}</Text>}
      {items.map((item, i) => {
        const idx = start + i;
        const isCursor = idx === state.cursor;
        const r = item.kind === 'row' ? item.row : undefined;
        const segs = fitSegs(nameSegs(item, root, view, idx, state.expanded.has(item.path)), nameW);
        const rest = ` ${pad(
          item.types.map(labelOf).filter((l, j, a) => a.indexOf(l) === j).join('+'),
          TYPE_W,
        )} ${padStart(sizeCell(item), SIZE_W)} ${padStart(item.modified ? relativeTime(item.modified) : '-', MOD_W)}`;
        return (
          <Box key={item.key} flexDirection="column">
            <Text
              inverse={isCursor}
              dimColor={r?.status === 'deleted' && !isCursor}
              color={r?.status === 'error' ? 'red' : r?.status === 'deleting' ? 'yellow' : undefined}
            >
              {isCursor ? ' →' : '  '}
              <Text
                color={mark(state, item, inRange(idx)) === '[·]' ? 'magenta' : undefined}
                dimColor={mark(state, item, inRange(idx)) === '[-]' && !isCursor}
              >{mark(state, item, inRange(idx))}</Text>{' '}
              {segs.map((x, j) => (
                <Text key={j} dimColor={x.dim && !isCursor} color={isCursor ? undefined : x.color} bold={x.bold}>
                  {x.text}
                </Text>
              ))}
              {rest}
            </Text>
            {r?.status === 'error' && isCursor && <Text color="red">{`      ${r.error}`}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
