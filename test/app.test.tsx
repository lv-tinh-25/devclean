import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../src/ui/App.js';
import { initialState, type State } from '../src/state.js';

const row = (name: string, modified: number, size: number) => ({
  path: `/r/${name}`,
  name,
  types: ['node' as const],
  junk: [{ name: 'node_modules', size }],
  size,
  modified,
  entries: ['package.json', 'node_modules'],
  status: 'idle' as const,
  measuring: false,
});

const state: State = {
  ...initialState,
  scanning: false,
  scanMs: 2370,
  rows: [row('alpha-app', Date.now() - 7200e3, 812 * 1024 ** 2), row('old-landing', Date.now() - 150 * 86400e3, 1024 ** 3)],
};

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('App', () => {
  it('renders header and rows, then asks to confirm delete', async () => {
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={state} />);
    const f = lastFrame()!;
    for (const s of ['PROJECT', 'TYPE', 'SIZE', 'MODIFIED', 'alpha-app', 'old-landing', 'Releasable:', 'SPACE toggle', 'Scan:       done', '2h ago', '5mo ago', '812 MB'])
      expect(f).toContain(s);
    await tick();
    stdin.write(' ');
    await tick();
    expect(lastFrame()).toContain('1 selected');
    stdin.write('\r');
    await tick();
    expect(lastFrame()).toContain('Permanently delete 1 folders from 1 projects, free 812 MB? (y/n)');
    unmount();
  });

  it('handles several keys arriving in one chunk', async () => {
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={state} />);
    await tick();
    stdin.write('j ');
    await tick();
    expect(lastFrame()).toContain('1 selected');
    expect(lastFrame()).toMatch(/→\[x\] old-landing/);
    unmount();
  });

  it('shows selected size, cursor breakdown, folder list in prompt, and fits the width', async () => {
    const st: State = {
      ...state,
      rows: [{ ...state.rows[0], junk: [{ name: 'node_modules', size: 800 * 1024 ** 2 }, { name: '.next', size: 12 * 1024 ** 2 }] }, state.rows[1]],
    };
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={st} />);
    expect(lastFrame()).toContain('node_modules 800 MB · .next 12 MB');
    await tick();
    stdin.write(' ');
    await tick();
    expect(lastFrame()).toContain('1 selected · 812 MB');
    stdin.write('\r');
    await tick();
    const f = lastFrame()!;
    expect(f).toContain('alpha-app/node_modules');
    expect(f).toContain('alpha-app/.next');
    for (const line of f.split('\n')) expect(line.length).toBeLessThanOrEqual(98);
    unmount();
  });

  it('shows scan progress percentage', async () => {
    const st: State = { ...state, scanning: true, progress: { done: 42, total: 100 } };
    const { lastFrame, unmount } = render(<App root="/r" initial={st} scanner={async function* () {}} />);
    expect(lastFrame()).toMatch(/Scan: +─+ +0%/);
    unmount();
  });

  it('asks to confirm quitting with a selection and explains range mode', async () => {
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={state} />);
    await tick();
    stdin.write('v');
    await tick();
    expect(lastFrame()).toContain('RANGE');
    stdin.write('v');
    await tick();
    stdin.write('q');
    await tick();
    expect(lastFrame()).toContain('Quit with 1 selected? (y/n)');
    stdin.write('n');
    await tick();
    expect(lastFrame()).not.toContain('Quit with');
    unmount();
  });

  it('understands keys rewritten by a Vietnamese Telex input method', async () => {
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={state} />);
    await tick();
    stdin.write('a');
    await tick();
    expect(lastFrame()).toContain('2 selected');
    stdin.write('\x7f');
    stdin.write('â');
    await tick();
    expect(lastFrame()).toContain('0 selected');
    stdin.write('\x7f');
    stdin.write('aa');
    await tick();
    expect(lastFrame()).toContain('2 selected');
    stdin.write('đ');
    await tick();
    expect(lastFrame()).toContain('2 selected');
    unmount();
  });

  it('only allows moving and quitting while scanning', async () => {
    const st: State = { ...state, scanning: true };
    const neverEnds = async function* () {
      await new Promise(() => {});
    };
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={st} scanner={neverEnds} />);
    await tick();
    for (const k of [' ', 'a', 'v', '\r', 'i']) {
      stdin.write(k);
      await tick();
    }
    expect(lastFrame()).toContain('0 selected');
    expect(lastFrame()).not.toContain('Permanently delete');
    expect(lastFrame()).not.toContain('RANGE');
    expect(lastFrame()).toContain('↑↓ move │ →← open/close │ q quit │ actions enable when the scan is done');
    expect(lastFrame()).toMatch(/→\[-\] alpha-app/);
    stdin.write('j');
    await tick();
    expect(lastFrame()).toMatch(/→\[-\] old-landing/);
    stdin.write('q');
    await tick();
    expect(lastFrame()).toContain('Quit devclean? (y/n)');
    unmount();
  });

  it('shows measuring rows', async () => {
    const st: State = { ...state, rows: [{ ...state.rows[0], measuring: true, size: 0 }] };
    const { lastFrame, unmount } = render(<App root="/r" initial={st} />);
    expect(lastFrame()).toMatch(/alpha-app .*measuring…/);
    unmount();
  });

  it('shows the scanned folder and groups nested projects with expand/collapse', async () => {
    const child = { ...state.rows[0], path: '/r/old-landing/apps/web', name: 'web', modified: Date.now() };
    const st: State = { ...state, rows: [child, ...state.rows] };
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={st} />);
    expect(lastFrame()).toContain('Folder:     /r');
    expect(lastFrame()).toMatch(/▶ old-landing \(2\)/);
    expect(lastFrame()).toContain('2 projects · node_modules');
    stdin.write('\u001B[C');
    await tick();
    expect(lastFrame()).toMatch(/▼ old-landing \(2\)/);
    expect(lastFrame()).toMatch(/├─ apps\/web/);
    expect(lastFrame()).toMatch(/└─ \.\/ \(root\) node_modules/);
    expect(lastFrame()).toContain('apps/web');
    expect(lastFrame()).toContain('./ (root) node_modules');
    stdin.write('v');
    await tick();
    stdin.write('j');
    await tick();
    expect(lastFrame()).toMatch(/\[-\] ▼ old-landing/);
    expect(lastFrame()).toMatch(/\[·\]   ├─ apps\/web/);
    stdin.write('\u001B');
    await tick();
    stdin.write('k');
    await tick();
    stdin.write('\u001B[D');
    await tick();
    expect(lastFrame()).not.toContain('./ (root)');
    unmount();
  });

  it('marks range preview rows differently from selected rows', async () => {
    const { lastFrame, stdin, unmount } = render(<App root="/r" initial={state} />);
    await tick();
    stdin.write('v');
    await tick();
    stdin.write('j');
    await tick();
    expect(lastFrame()).toContain('0 selected');
    expect(lastFrame()).toMatch(/\[·\] alpha-app/);
    expect(lastFrame()).toMatch(/→\[·\] old-landing/);
    stdin.write('v');
    await tick();
    expect(lastFrame()).toMatch(/→\[x\] old-landing/);
    unmount();
  });
});
