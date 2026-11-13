const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(n: number): string {
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = i === 0 || n >= 100 ? 0 : 2;
  return `${Number(n.toFixed(digits))} ${UNITS[i]}`;
}

export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return '…'.slice(0, max);
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  return s.slice(0, head) + '…' + s.slice(s.length - (keep - head));
}
