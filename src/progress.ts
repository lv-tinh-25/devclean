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
