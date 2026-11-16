const CAP = 99;
const PARTIALS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

// The real total is unknown until the scan ends (it grows as folders are found), so the
// shown value eases toward the raw ratio, never moves back, and creeps toward 99%.
export function nextShown(shown: number, ratio: number): number {
  const target = Math.min(ratio * 100, CAP);
  const step = shown < target ? Math.min(0.8, (target - shown) * 0.15 + 0.05) : (CAP - shown) * 0.004;
  return Math.min(CAP, shown + Math.max(0, step));
}

export function renderBar(pct: number, width: number): { filled: string; track: string } {
  const cells = (Math.max(0, Math.min(100, pct)) / 100) * width;
  const full = Math.floor(cells);
  const partial = PARTIALS[Math.floor((cells - full) * 8)] ?? '';
  const filled = '█'.repeat(full) + partial;
  return { filled, track: '─'.repeat(width - full - (partial ? 1 : 0)) };
}

// An indeterminate bar: installers don't report how much is left, so show activity, not a guess.
export function marquee(frame: number, width: number, size: number): string {
  const range = width - size;
  const period = range * 2;
  const step = period ? frame % period : 0;
  const pos = step > range ? period - step : step;
  return '─'.repeat(pos) + '━'.repeat(size) + '─'.repeat(range - pos);
}

export function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
