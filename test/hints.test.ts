import { describe, it, expect } from 'vitest';
import { fitHints, HINTS, renderHints } from '../src/ui/hints.js';

describe('fitHints', () => {
  it('shows every hint when there is room, in display order', () => {
    expect(renderHints(fitHints(HINTS.normal, 200))).toBe(
      '␣ select · ←→ group · v range · a all · ⏎ delete · i reinstall · o open · ? help · q quit',
    );
  });

  it('drops low-priority hints first and always keeps help and quit', () => {
    const text = renderHints(fitHints(HINTS.normal, 60));
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text).toMatch(/\? help · q quit$/);
    expect(text).toContain('⏎ delete');
    expect(text).not.toContain('o open');
  });

  it('never shows a less important hint while a more important one is hidden', () => {
    expect(renderHints(fitHints(HINTS.normal, 35))).toBe('␣ select · ? help · q quit');
  });

  it('keeps only help and quit on a very narrow terminal', () => {
    expect(renderHints(fitHints(HINTS.normal, 20))).toBe('? help · q quit');
  });

  it('has compact variants for every mode', () => {
    for (const mode of Object.keys(HINTS) as (keyof typeof HINTS)[]) {
      expect(renderHints(fitHints(HINTS[mode], 20))).toContain('q quit');
    }
    expect(renderHints(fitHints(HINTS.range, 200))).toBe('RANGE · ↑↓ move · v select · Esc cancel · q quit');
  });
});
