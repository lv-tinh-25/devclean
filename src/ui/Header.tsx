import { homedir } from 'node:os';
import { Box, Text } from 'ink';
import { formatBytes, truncateMiddle } from '../format.js';
import { renderBar } from '../progress.js';
import { fitHints, HINTS, renderHints } from './hints.js';
import { labelOf } from '../rules.js';
import { releasable, selectedSize, type State } from '../state.js';

export const LOGO_BIG = [
  '     _                 _                  ',
  '  __| | _____   _____| | ___  __ _ _ __  ',
  ' / _` |/ _ \\ \\ / / __| |/ _ \\/ _` | \'_ \\ ',
  '| (_| |  __/\\ V / (__| |  __/ (_| | | | |',
  ' \\__,_|\\___| \\_/ \\___|_|\\___|\\__,_|_| |_|',
];

// When the ASCII logo doesn't fit, a one-line title goes above the stats: ASCII art
// can't be scaled down without looking like a different logo.
export const TITLE = 'find & clean dependency folders across projects';

const widthOf = (logo: string[]) => Math.max(...logo.map((l) => l.length));
const GAP = 4;
// Room the stats column needs (a finished "Scan: done · 12.34s · 123,456 folders" line).
// Fixed, so the layout doesn't flip when the scan line grows or shrinks.
const STATS_W = 46;

// The logo goes beside the stats only when neither has to be squeezed.
const fitsLogo = (width: number) => width >= widthOf(LOGO_BIG) + GAP + STATS_W;


function typeCounts(s: State): string {
  const counts = new Map<string, number>();
  for (const r of s.rows) {
    for (const label of new Set(r.types.map(labelOf))) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([l, n]) => `${l} ${n}`).join(' · ');
}

const BAR_W = 24;

export function Header({ state, width, shown, root }: { state: State; width: number; shown: number; root: string }) {
  const bar = renderBar(shown, BAR_W);
  const badge = ` ${state.selected.size} selected${state.selected.size ? ` · ${formatBytes(selectedSize(state))}` : ''} `;
  const mode = state.install ? 'installing' : state.scanning ? 'scanning' : state.rangeAnchor !== null ? 'range' : 'normal';
  const shortRoot = root.startsWith(homedir()) ? '~' + root.slice(homedir().length) : root;
  const big = fitsLogo(width);
  const statsWidth = Math.max(10, big ? width - widthOf(LOGO_BIG) - GAP : width);
  const status = state.scanning ? (
    <Text wrap="truncate-end">
      {'Scan:       '}
      <Text color="cyan">{bar.filled}</Text>
      <Text dimColor>{bar.track}</Text>
      <Text bold>{` ${String(Math.floor(shown)).padStart(2)}%`}</Text>
      <Text dimColor>{` · ${state.progress.done.toLocaleString('en-US')} folders`}</Text>
    </Text>
  ) : (
    <Text wrap="truncate-end">
      {'Scan:       '}
      <Text color="green">{'done'}</Text>
      <Text dimColor>{` · ${(state.scanMs / 1000).toFixed(2)}s · ${state.progress.done.toLocaleString('en-US')} folders`}</Text>
    </Text>
  );
  const stats = (
    <Box flexDirection="column" width={statsWidth}>
      <Text wrap="truncate-end">
        {'Folder:     '}
        <Text bold>{truncateMiddle(shortRoot, Math.max(10, statsWidth - 12))}</Text>
      </Text>
      <Text wrap="truncate-end">
        {'Releasable: '}
        <Text bold color="yellow">
          {formatBytes(releasable(state))}
        </Text>
      </Text>
      <Text wrap="truncate-end">
        {'Saved:      '}
        <Text color="green">{formatBytes(state.saved) + (state.saved > 0 ? ' ▲' : '')}</Text>
      </Text>
      {status}
      <Text dimColor wrap="truncate-end">
        {typeCounts(state) || ' '}
      </Text>
    </Box>
  );
  return (
    <Box flexDirection="column">
      {big ? (
        <Box gap={GAP}>
          <Box flexDirection="column" flexShrink={0}>
            {LOGO_BIG.map((l, i) => (
              <Text key={i} color="cyan">
                {l}
              </Text>
            ))}
          </Box>
          {stats}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold color="cyan">
              devclean
            </Text>
            <Text dimColor>{` · ${TITLE}`}</Text>
          </Text>
          {stats}
        </Box>
      )}
      <Text> </Text>
      <Box>
        <Box flexShrink={0}>
          <Text backgroundColor="yellow" color="black">
            {badge}
          </Text>
        </Box>
        <Text color={mode === 'range' ? 'magenta' : undefined} dimColor={mode !== 'range'} wrap="truncate-end">
          {' ' + renderHints(fitHints(HINTS[mode], Math.max(0, width - badge.length - 1)))}
        </Text>
      </Box>
    </Box>
  );
}

export const headerHeight = (width: number) => (fitsLogo(width) ? 7 : 8);
