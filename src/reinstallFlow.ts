import { readdir } from 'node:fs/promises';
import { reinstall } from './actions.js';
import { measureProject } from './scan.js';
import type { Action, Row } from './state.js';

const out = (s: string) => process.stdout.write(s + '\n');

export async function reinstallRows(rows: Row[]): Promise<Action[]> {
  const actions: Action[] = [];
  setStdinReading(false);
  for (const row of rows) {
    out(`\n\x1b[36m→ Reinstalling ${row.name}\x1b[0m  (${row.path})`);
    const res = await reinstall(row, row.junk.map((j) => j.name));
    out(res.ok ? '\x1b[32m✔ done\x1b[0m' : `\x1b[31m✖ ${res.error}\x1b[0m`);
    const entries = await readdir(row.path).catch(() => row.entries);
    const project = await measureProject(row.path, entries);
    if (project) actions.push({ type: 'remeasured', project });
    if (!res.ok) actions.push({ type: 'error', path: row.path, error: res.error! });
  }
  out('\nPress Enter to return to devclean…');
  setStdinReading(true);
  drainStdin();
  await waitForEnter();
  return actions;
}

// While suspended, Ink still has a 'readable' listener that keeps restarting our TTY
// handle, so we'd steal keystrokes meant for the child. Block reads at the handle.
type TtyHandle = { readStart(): number; readStop(): number };
let restoreReadStart: (() => void) | null = null;
function setStdinReading(on: boolean) {
  const handle = (process.stdin as unknown as { _handle?: TtyHandle })._handle;
  if (!handle) return;
  if (on) {
    restoreReadStart?.();
    restoreReadStart = null;
    return;
  }
  const original = handle.readStart.bind(handle);
  handle.readStart = () => 0;
  restoreReadStart = () => {
    handle.readStart = original;
    // net.Socket may have flagged the handle as reading during the block.
    handle.readStart();
  };
  handle.readStop();
}

function drainStdin() {
  while (process.stdin.read() !== null);
}

// readline.close() pauses stdin, which stops the TTY handle and lets the process exit
// once Ink resumes; listen on the raw stream instead.
function waitForEnter(): Promise<void> {
  const { stdin } = process;
  stdin.ref();
  return new Promise((done) => {
    const onData = (chunk: Buffer | string) => {
      if (!/[\r\n]/.test(String(chunk))) return;
      stdin.off('data', onData);
      stdin.pause();
      done();
    };
    while (stdin.read() !== null);
    stdin.on('data', onData);
    stdin.resume();
  });
}
