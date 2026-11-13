import { describe, it, expect } from 'vitest';
import { formatBytes, relativeTime, truncateMiddle } from '../src/format.js';

describe('formatBytes', () => {
  it('formats with 1024 base', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(812 * 1024 ** 2)).toBe('812 MB');
    expect(formatBytes(55.68 * 1024 ** 3)).toBe('55.68 GB');
  });
});

describe('relativeTime', () => {
  const now = 1_000_000_000_000;
  it('buckets durations', () => {
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60e3, now)).toBe('5m ago');
    expect(relativeTime(now - 2 * 3600e3, now)).toBe('2h ago');
    expect(relativeTime(now - 3 * 86400e3, now)).toBe('3d ago');
    expect(relativeTime(now - 150 * 86400e3, now)).toBe('5mo ago');
    expect(relativeTime(now - 400 * 86400e3, now)).toBe('1y ago');
  });
});

describe('truncateMiddle', () => {
  it('keeps both ends', () => {
    expect(truncateMiddle('abcdefghij', 7)).toBe('abc…hij');
    expect(truncateMiddle('short', 10)).toBe('short');
  });
});
