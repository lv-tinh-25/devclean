import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../src/ui/App.js';
import { initialState, type State } from '../src/state.js';
import { loadHistory, recordDeletion } from '../src/history.js';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { file, tmp } from './helpers.js';

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

async function until(check: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

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

  it('shows the final folder count even when the scan ends within the progress throttle', async () => {
    const quick = async function* (_root: string, _signal?: AbortSignal, onProgress?: (d: number, t: number) => void) {
      onProgress?.(1, 5);
      onProgress?.(5, 5);
      onProgress?.(1234, 1234);
    };
    const { lastFrame, unmount } = render(<App root="/r" initial={{ ...initialState }} scanner={quick} />);
    await tick();
    await tick();
    expect(lastFrame()).toContain('1,234 folders');
    unmount();
  });

  it('remembers deletions in the history file', async () => {
    const { stdin, unmount } = render(<App root="/r" initial={state} />);
    await tick();
    stdin.write('\r');
    await tick();
    stdin.write('y');
    await new Promise((r) => setTimeout(r, 150));
    const h = await loadHistory();
    expect(h.find((e) => e.path === '/r/alpha-app')).toMatchObject({ junk: ['node_modules'], types: ['node'] });
    unmount();
  });

  it('shows projects deleted in an earlier run so they can be reinstalled', async () => {
    const root = await tmp();
    await file(join(root, 'old-app/package.json'), '{}');
    await file(join(root, 'old-app/src/index.js'));
    await recordDeletion({ path: join(root, 'old-app'), junk: ['node_modules'], types: ['node'], deletedAt: Date.now() - 2 * 86400e3 });
    const empty = async function* () {};
    const { lastFrame, unmount } = render(<App root={root} initial={{ ...initialState }} scanner={empty} />);
    await new Promise((r) => setTimeout(r, 200));
    expect(lastFrame()).toMatch(/old-app .*deleted/);
    expect(lastFrame()).toContain('deleted 2d ago · node_modules · press i to reinstall');
    unmount();
  });

  it('reinstalls inside the UI with live output and no Enter to return', async () => {
    const dir = await tmp();
    await file(join(dir, 'app/package.json'), '{}');
    await file(join(dir, 'app/pnpm-lock.yaml'));
    const bin = await tmp();
    await file(join(bin, 'pnpm'), '#!/bin/sh\necho "Progress: resolved 597"\nsleep 0.5\necho "Error: ERR_PNPM_IGNORED_BUILDS" >&2\necho "Ignored build scripts: sharp@0.34.5" >&2\nmkdir -p node_modules && head -c 9000 /dev/zero > node_modules/x\nexit 1\n');
    await chmod(join(bin, 'pnpm'), 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath}`;
    const st: State = {
      ...state,
      rows: [{ ...state.rows[0], path: join(dir, 'app'), name: 'app', status: 'deleted', size: 0, junk: [{ name: 'node_modules', size: 0 }], types: ['node'] }],
    };
    const { lastFrame, stdin, unmount } = render(<App root={dir} initial={st} />);
    await tick();
    stdin.write('i');
    await until(() => lastFrame()!.includes('Progress: resolved 597'));
    expect(lastFrame()).toMatch(/app .*installing/);
    expect(lastFrame()).toContain('Installing app (1/1)');
    expect(lastFrame()).toMatch(/Installing app \(1\/1\)….*[━─]{12} +0:0\d/);
    expect(lastFrame()).toContain('Progress: resolved 597');
    await until(() => lastFrame()!.includes('⚠'));
    const f = lastFrame()!;
    expect(f).not.toContain('Installing app');
    expect(f).toMatch(/app .*\d+ KB/);
    expect(f).toContain('⚠ build scripts skipped (sharp), run `pnpm approve-builds` in this project');
    expect(f).toContain('L log');
    process.env.PATH = oldPath;
    unmount();
  });

  it('shortens a long scanned folder path instead of wrapping the header', () => {
    const root = '/Users/someone/' + 'very-long-folder-name/'.repeat(6) + 'project';
    const { lastFrame, unmount } = render(<App root={root} initial={state} />);
    const folderLine = lastFrame()!.split('\n').find((l) => l.includes('Folder:'))!;
    expect(folderLine).toContain('…');
    expect(folderLine).toMatch(/project$/);
    expect(lastFrame()!.split('\n')[1]).toContain('Releasable:');
    unmount();
  });

  it('reinstalling a project from an earlier run clears it from the history', async () => {
    const root = await tmp();
    await file(join(root, 'old-app/package.json'), '{}');
    await file(join(root, 'old-app/src/index.js'));
    await recordDeletion({ path: join(root, 'old-app'), junk: ['node_modules'], types: ['node'], deletedAt: Date.now() - 86400e3 });
    const bin = await tmp();
    await file(join(bin, 'npm'), '#!/bin/sh\nmkdir -p node_modules && head -c 9000 /dev/zero > node_modules/x\n');
    await chmod(join(bin, 'npm'), 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath}`;
    const empty = async function* () {};
    const { lastFrame, stdin, unmount } = render(<App root={root} initial={{ ...initialState }} scanner={empty} />);
    await until(() => lastFrame()!.includes('press i to reinstall'));
    stdin.write('i');
    await until(() => /old-app .*\d+ KB/.test(lastFrame()!));
    await until(() => false, 200);
    expect(lastFrame()).toMatch(/old-app .*\d+ KB/);
    expect((await loadHistory()).find((e) => e.path === join(root, 'old-app'))).toBeUndefined();
    process.env.PATH = oldPath;
    unmount();
  });
});
