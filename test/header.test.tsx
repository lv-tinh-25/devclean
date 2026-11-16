import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Header, LOGO_BIG, WORDMARK } from '../src/ui/Header.js';
import { initialState, type State } from '../src/state.js';

const state: State = { ...initialState, scanning: false, scanMs: 18070, progress: { done: 36652, total: 36652 } };
const frame = (width: number) => {
  const { lastFrame, unmount } = render(<Header state={state} width={width} shown={100} root="/Users/me/Documents" />);
  const f = lastFrame()!;
  unmount();
  return f.split('\n');
};
const hasLogo = (lines: string[], logo: string[]) => logo.every((l) => lines.some((x) => x.includes(l.trimEnd())));

describe('Header logo', () => {
  it('uses the big logo when everything fits', () => {
    const lines = frame(98);
    expect(hasLogo(lines, LOGO_BIG)).toBe(true);
  });

  it('switches to the wordmark instead of squeezing the big logo', () => {
    const lines = frame(83);
    expect(hasLogo(lines, LOGO_BIG)).toBe(false);
    expect(hasLogo(lines, WORDMARK)).toBe(true);
    expect(lines[0]).toContain('Folder:');
  });

  it('drops the logo on narrow terminals', () => {
    const lines = frame(55);
    expect(hasLogo(lines, WORDMARK)).toBe(false);
    expect(lines[0]).toMatch(/^Folder:/);
  });

  it('never wraps: the header is always the same height', () => {
    for (const w of [120, 98, 90, 83, 70, 55, 40]) {
      expect(frame(w).length, `width ${w}`).toBe(7);
    }
  });

  it('keeps the same logo while scanning and after the scan finishes', () => {
    for (const w of [120, 98, 90, 83, 70, 55]) {
      const { lastFrame, unmount } = render(
        <Header state={{ ...state, scanning: true, progress: { done: 12345, total: 20000 } }} width={w} shown={42} root="/Users/me/Documents" />,
      );
      const scanning = lastFrame()!.split('\n');
      unmount();
      const done = frame(w);
      expect(hasLogo(scanning, LOGO_BIG), `width ${w}`).toBe(hasLogo(done, LOGO_BIG));
      expect(hasLogo(scanning, WORDMARK), `width ${w}`).toBe(hasLogo(done, WORDMARK));
      expect(scanning.length, `width ${w}`).toBe(7);
    }
  });

  it('wordmark is the name, an underline and a two-line tagline', () => {
    expect(WORDMARK).toEqual(['devclean', '────────', 'find & clean dependency', 'folders across projects']);
  });
});
