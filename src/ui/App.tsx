import { Box, Text, useApp, useInput, useStdout, type Key } from 'ink';
import { useEffect, useReducer, useRef, useState } from 'react';
import { formatElapsed, marquee, nextShown } from '../progress.js';
import { deleteJunk, reinstall } from '../actions.js';
import { forget, recordDeletion, restoreDeleted } from '../history.js';
import { formatBytes, relativeTime } from '../format.js';
import { readdir } from 'node:fs/promises';
import { measureProject } from '../scan.js';
import { openInFileManager, runInTerminal } from '../terminal.js';
import { relative } from 'node:path';
import { scan } from '../scan.js';
import { buildView } from '../view.js';
import { initialState, reducer, targets, type Action, type State } from '../state.js';
import { Header, headerHeight } from './Header.js';
import { List } from './List.js';

export interface AppProps {
  root: string;
  initial?: State;
  scanner?: typeof scan;
}

const MAX_CONFIRM_LINES = 8;

export function App({ root, initial, scanner = scan }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initial ?? initialState);
  const ref = useRef(state);
  const { exit, suspendTerminal } = useApp();
  const busy = useRef(false);
  const stdout = useStdout().stdout as NodeJS.WriteStream;
  // Leave a margin: some terminals wrap or clip a line that fills the last column.
  const width = (stdout.columns || 100) - 2;
  const height = stdout.rows || 30;

  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!state.scanning) return;
    const timer = setInterval(() => {
      const { done, total } = ref.current.progress;
      setShown((v) => nextShown(v, total ? done / total : 0));
    }, 100);
    return () => clearInterval(timer);
  }, [state.scanning]);

  useEffect(() => {
    if (!state.scanning) return;
    const ac = new AbortController();
    const started = performance.now();
    let lastProgress = 0;
    let latest = { done: 0, total: 0 };
    const onProgress = (done: number, total: number) => {
      latest = { done, total };
      const now = performance.now();
      if (now - lastProgress < 100) return;
      lastProgress = now;
      send({ type: 'progress', done, total });
    };
    (async () => {
      for await (const project of scanner(root, ac.signal, onProgress)) send({ type: 'projectFound', project });
      if (ac.signal.aborted) return;
      // The throttle may have dropped the last report; the final count must be exact.
      send({ type: 'progress', ...latest });
      send({ type: 'scanDone', ms: performance.now() - started });
      const restored = await restoreDeleted(root);
      if (restored.length && !ac.signal.aborted) send({ type: 'restored', projects: restored });
    })();
    return () => ac.abort();
  }, []);

  const runDelete = async () => {
    // Delete exactly what the prompt showed; rows may have been re-sorted since.
    const paths = ref.current.confirmPaths;
    send({ type: 'deleting', paths });
    for (const path of paths) {
      const row = ref.current.rows.find((r) => r.path === path)!;
      try {
        send({ type: 'deleted', path, freed: await deleteJunk(row) });
        void recordDeletion({ path, junk: row.junk.map((j) => j.name), types: row.types, deletedAt: Date.now() });
      } catch (e) {
        send({ type: 'error', path, error: (e as Error).message });
      }
    }
  };

  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!state.install) return;
    const timer = setInterval(() => setFrame((f) => f + 1), 120);
    return () => clearInterval(timer);
  }, [!!state.install]);

  const installAbort = useRef<AbortController | null>(null);
  useEffect(() => () => installAbort.current?.abort(), []);

  // Installs run in the background, one project at a time, while the list stays usable.
  const runReinstall = async () => {
    if (busy.current) return;
    const set = new Set(targets(ref.current));
    const rows = ref.current.rows.filter((r) => set.has(r.path) && r.status !== 'deleting');
    if (!rows.length) return;
    busy.current = true;
    const ac = new AbortController();
    installAbort.current = ac;
    send({ type: 'installQueued', paths: rows.map((r) => r.path) });
    let pending: string[] = [];
    const flush = setInterval(() => {
      for (const line of pending) send({ type: 'installOutput', line });
      pending = [];
    }, 100);
    try {
      for (const row of rows) {
        if (ac.signal.aborted) break;
        // Esc may have taken it out of the queue while an earlier one was installing.
        if (ref.current.rows.find((r) => r.path === row.path)?.status !== 'queued') continue;
        send({ type: 'installStarted', path: row.path });
        const result = await reinstall(
          row,
          row.junk.map((j) => j.name),
          { signal: ac.signal, onOutput: (line) => pending.push(line) },
        );
        pending = [];
        const entries = await readdir(row.path).catch(() => row.entries);
        const project = (await measureProject(row.path, entries)) ?? undefined;
        send({ type: 'installFinished', path: row.path, result, project });
        if (project?.junk.length) void forget([row.path]);
      }
    } finally {
      clearInterval(flush);
      send({ type: 'installDone' });
      busy.current = false;
      installAbort.current = null;
    }
  };

  const openLog = async (path: string) => {
    let opened = false;
    await suspendTerminal(async () => {
      opened = await runInTerminal(process.platform === 'win32' ? 'notepad' : 'less', [path]);
    });
    if (!opened) openInFileManager(path);
  };

  const send = (action: Action) => {
    ref.current = reducer(ref.current, action);
    dispatch(action);
  };

  const handle = (input: string, key: Key) => {
    const s = ref.current;
    if (s.confirmQuit) {
      if (input === 'y') {
        installAbort.current?.abort();
        exit();
      }
      else if (input === 'n' || key.escape) send({ type: 'cancel' });
      return;
    }
    if (s.confirm) {
      if (input === 'y') void runDelete();
      else if (input === 'n' || key.escape) send({ type: 'cancel' });
      return;
    }
    if (key.upArrow || input === 'k') send({ type: 'move', delta: -1 });
    else if (key.downArrow || input === 'j') send({ type: 'move', delta: 1 });
    else if (key.pageUp) send({ type: 'move', delta: -10 });
    else if (key.pageDown) send({ type: 'move', delta: 10 });
    else if (key.rightArrow || input === 'l') send({ type: 'expand' });
    else if (key.leftArrow || input === 'h') send({ type: 'collapse' });
    else if (input === 'L') {
      const item = buildView(s)[s.cursor];
      const log = item?.row?.log;
      if (item?.kind === 'row' && log) void openLog(log);
    } else if (busy.current && key.escape) send({ type: 'installCancelQueued' });
    else if (s.scanning || busy.current) {
      // Rows move around mid-scan and mid-install, so only browsing and quitting are allowed.
      if (input === 'q') send({ type: 'askQuit' });
    }
    else if (input === ' ') send({ type: 'toggle' });
    else if (input === 'v') send({ type: 'range' });
    else if (input === 'a') send({ type: 'all' });
    else if (key.escape) send({ type: 'cancel' });
    else if (key.return) send({ type: 'askDelete' });
    else if (input === 'o') {
      const path = buildView(s)[s.cursor]?.path;
      if (path) openInFileManager(path);
    } else if (input === 'i') void runReinstall();
    else if (input === 'q') send({ type: 'askQuit' });
  };

  // Vietnamese input methods (Telex/VNI) rewrite the previous keystroke: a second `a`
  // arrives as backspace + `â`, a third as backspace + `aa`. Treat whatever follows a
  // backspace as one replacement keystroke and fold accents back to plain letters.
  const imeRewrite = useRef(false);
  useInput((input, key) => {
    if (key.backspace || key.delete) {
      imeRewrite.current = true;
      return;
    }
    const plain = input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    if (imeRewrite.current && plain) {
      imeRewrite.current = false;
      handle(plain.slice(-1), key);
      return;
    }
    // Fast typing can deliver several plain keys in one chunk.
    if (plain.length > 1 && !key.ctrl && !key.meta) for (const ch of plain) handle(ch, key);
    else handle(plain, key);
  });

  const pending = state.confirmPaths.map((p) => state.rows.find((r) => r.path === p)!).filter(Boolean);
  const freeing = pending.reduce((sum, r) => sum + r.size, 0);
  const folders = pending.flatMap((r) =>
    r.junk.map((j) => ({ path: `${relative(root, r.path) || r.name}/${j.name}`, size: j.size })),
  );
  const confirmLines = (state.confirmQuit ? 1 : 0) + (state.confirm ? Math.min(folders.length, MAX_CONFIRM_LINES) + (folders.length > MAX_CONFIRM_LINES ? 1 : 0) + 1 : 0);
  const current = buildView(state)[state.cursor];
  const members = current ? state.rows.filter((r) => current.members.includes(r.path)) : [];
  const byFolder = new Map<string, number>();
  for (const r of members) for (const j of r.junk) byFolder.set(j.name, (byFolder.get(j.name) ?? 0) + j.size);
  const folders_ = current?.measuring
    ? [...byFolder.keys()].join(' · ') + ' — measuring…'
    : [...byFolder].map(([name, size]) => `${name} ${formatBytes(size)}`).join(' · ');
  const single = members.length === 1 ? members[0] : undefined;
  const breakdown =
    single?.status === 'deleted'
      ? `deleted ${single.deletedAt ? relativeTime(single.deletedAt) : 'just now'} · ${single.junk.map((j) => j.name).join(', ')} · press i to reinstall`
      : !byFolder.size
        ? ''
        : members.length > 1
          ? `${members.length} projects · ${folders_}`
          : folders_;
  const one = current?.kind === 'row' ? current.row : undefined;
  const install = state.install;
  const installing = install?.current ? state.rows.find((r) => r.path === install.current) : undefined;
  const installLines = install ? 1 + install.tail.length : 0;

  return (
    // Full terminal height: Ink then repaints from the top-left instead of from
    // wherever the cursor was when the alternate screen opened.
    <Box flexDirection="column" height={height} width={width}>
      <Header state={state} width={width} shown={shown} root={root} />
      <List
        state={state}
        root={root}
        width={width}
        height={height - headerHeight(width) - 2 - confirmLines - installLines - (one?.warning ? 1 : 0)}
      />
      <Text dimColor wrap="truncate-end">
        {breakdown ? `  ${breakdown}${one?.log ? '  ·  L log' : ''}` : ' '}
      </Text>
      {one?.warning && (
        <Text color="yellow" wrap="truncate-end">
          {`  ⚠ ${one.warning}`}
        </Text>
      )}
      {install && (
        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan" wrap="truncate-end">
              {installing ? `  Installing ${installing.name} (${install.done + 1}/${install.total})…` : '  Installing…'}
            </Text>
            <Box flexShrink={0}>
              <Text color="cyan">{marquee(frame, 12, 4)}</Text>
              <Text dimColor>{`  ${formatElapsed(install.startedAt ? Date.now() - install.startedAt : 0)}`}</Text>
            </Box>
          </Box>
          {install.tail.map((line, i) => (
            <Text key={i} dimColor wrap="truncate-end">
              {`    ${line}`}
            </Text>
          ))}
        </Box>
      )}
      {state.confirmQuit && (
        <Text bold color="yellow">
          {state.selected.size ? `Quit with ${state.selected.size} selected? (y/n)` : 'Quit devclean? (y/n)'}
        </Text>
      )}
      {state.confirm && (
        <Box flexDirection="column">
          {folders.slice(0, MAX_CONFIRM_LINES).map((f) => (
            <Text key={f.path} color="red" wrap="truncate-middle">
              {`  ✖ ${f.path}  ${formatBytes(f.size)}`}
            </Text>
          ))}
          {folders.length > MAX_CONFIRM_LINES && <Text color="red">{`  …and ${folders.length - MAX_CONFIRM_LINES} more folders`}</Text>}
          <Text bold color="red">
            {`Permanently delete ${folders.length} folders from ${pending.length} projects, free ${formatBytes(freeing)}? (y/n)`}
          </Text>
        </Box>
      )}
    </Box>
  );
}
