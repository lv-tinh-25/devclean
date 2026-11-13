import { describe, it, expect } from 'vitest';
import { nextShown, renderBar } from '../src/progress.js';

describe('nextShown', () => {
  it('starts from 0 and climbs gradually even when the raw ratio jumps', () => {
    let shown = 0;
    shown = nextShown(shown, 0.88);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThanOrEqual(1.5);
  });

  it('never goes backwards and stays below 99 while scanning', () => {
    let shown = 0;
    const seen: number[] = [];
    for (let i = 0; i < 2000; i++) {
      shown = nextShown(shown, i < 50 ? 0.9 : 0.6);
      seen.push(shown);
    }
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true);
    expect(shown).toBeLessThan(99);
    expect(shown).toBeGreaterThan(90);
  });
});

describe('renderBar', () => {
  it('uses partial blocks and a fixed width', () => {
    expect(renderBar(0, 10)).toEqual({ filled: '', track: '──────────' });
    expect(renderBar(100, 10)).toEqual({ filled: '██████████', track: '' });
    const half = renderBar(55, 10);
    expect(half.filled).toBe('█████▌');
    expect(half.filled.length + half.track.length).toBe(10);
  });
});
