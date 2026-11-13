import { homedir } from 'node:os';
import { Box, Text } from 'ink';
import { formatBytes } from '../format.js';
import { renderBar } from '../progress.js';
import { labelOf } from '../rules.js';
import { releasable, selectedSize, type State } from '../state.js';

const LOGO = [
  '     _                 _                  ',
  '  __| | _____   _____| | ___  __ _ _ __  ',
  ' / _` |/ _ \\ \\ / / __| |/ _ \\/ _` | \'_ \\ ',
  '| (_| |  __/\\ V / (__| |  __/ (_| | | | |',
  ' \\__,_|\\___| \\_/ \\___|_|\\___|\\__,_|_| |_|',
];

export const HINTS = 'SPACE toggle │ →← open/close │ v range │ a all │ ENTER delete │ i reinstall │ o open │ q quit';

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
  const status = state.scanning ? (
    <Text>
      {'Scan:       '}
      <Text color="cyan">{bar.filled}</Text>
      <Text dimColor>{bar.track}</Text>
      <Text bold>{` ${String(Math.floor(shown)).padStart(2)}%`}</Text>
      <Text dimColor>{` · ${state.progress.done.toLocaleString('en-US')} folders`}</Text>
    </Text>
  ) : (
    <Text>
      {'Scan:       '}
      <Text color="green">{'done'}</Text>
      <Text dimColor>{` · ${(state.scanMs / 1000).toFixed(2)}s · ${state.progress.done.toLocaleString('en-US')} folders`}</Text>
    </Text>
  );
  const stats = (
    <Box flexDirection="column">
      <Text>
        {'Folder:     '}
        <Text bold>{root.startsWith(homedir()) ? '~' + root.slice(homedir().length) : root}</Text>
      </Text>
      <Text>
        {'Releasable: '}
        <Text bold color="yellow">
          {formatBytes(releasable(state))}
        </Text>
      </Text>
      <Text>
        {'Saved:      '}
        <Text color="green">{formatBytes(state.saved) + (state.saved > 0 ? ' ▲' : '')}</Text>
      </Text>
      {status}
      <Text dimColor>{typeCounts(state) || ' '}</Text>
    </Box>
  );
  return (
    <Box flexDirection="column">
      {width >= 80 ? (
        <Box gap={4}>
          <Box flexDirection="column">
            {LOGO.map((l, i) => (
              <Text key={i} color="cyan">
                {l}
              </Text>
            ))}
          </Box>
          {stats}
        </Box>
      ) : (
        stats
      )}
      <Text> </Text>
      <Box>
        <Box flexShrink={0}>
          <Text backgroundColor="yellow" color="black">
            {` ${state.selected.size} selected${state.selected.size ? ` · ${formatBytes(selectedSize(state))}` : ''} `}
          </Text>
        </Box>
        {state.scanning ? (
          <Text dimColor wrap="truncate-end">
            {' ↑↓ move │ →← open/close │ q quit │ actions enable when the scan is done'}
          </Text>
        ) : state.rangeAnchor !== null ? (
          <Text color="magenta" wrap="truncate-end">
            {' RANGE: move ↑↓, then press v again to select every row in between · Esc cancel'}
          </Text>
        ) : (
          <Text dimColor wrap="truncate-end">
            {' ' + HINTS}
          </Text>
        )}
      </Box>
    </Box>
  );
}

export const headerHeight = (_width: number) => 7;
