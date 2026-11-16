import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Header, headerHeight, LOGO_BIG, TITLE } from '../src/ui/Header.js';
import { initialState, type State } from '../src/state.js';

const state: State = { ...initialState, scanning: false, scanMs: 18070, progress: { done: 36652, total: 36652 } };
const frame = (width: number, s: State = state, shown = 100) => {
  const { lastFrame, unmount } = render(<Header state={s} width={width} shown={shown} root="/Users/me/Documents" />);
  const f = lastFrame()!;
  unmount();
  return f.split('\n');
};
const hasBigLogo = (lines: string[]) => LOGO_BIG.every((l) => lines.some((x) => x.includes(l.trimEnd())));

describe('Header logo', () => {
  it('uses the big logo beside the stats when it fits', () => {
    const lines = frame(98);
    expect(hasBigLogo(lines)).toBe(true);
    expect(lines[0]).toContain('Folder:');
  });

  it('otherwise puts a one-line title above the stats instead of squeezing the logo', () => {
    for (const w of [83, 55]) {
      const lines = frame(w);
      expect(hasBigLogo(lines), `width ${w}`).toBe(false);
      expect(lines[0], `width ${w}`).toMatch(/^devclean · find & clean/);
      expect(lines[1], `width ${w}`).toMatch(/^Folder:/);
    }
    expect(TITLE).toBe('find & clean dependency folders across projects');
  });

  it('never wraps, and the height matches headerHeight', () => {
    for (const w of [120, 98, 90, 83, 70, 55, 40, 30]) {
      expect(frame(w).length, `width ${w}`).toBe(headerHeight(w));
    }
    expect(headerHeight(120)).toBe(7);
    expect(headerHeight(70)).toBe(8);
  });

  it('keeps the same layout while scanning and after the scan finishes', () => {
    const scanning = { ...state, scanning: true, progress: { done: 12345, total: 20000 } };
    for (const w of [120, 98, 90, 83, 70, 55]) {
      expect(hasBigLogo(frame(w, scanning, 42)), `width ${w}`).toBe(hasBigLogo(frame(w)));
      expect(frame(w, scanning, 42).length, `width ${w}`).toBe(frame(w).length);
    }
  });
});
