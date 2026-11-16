import { spawn } from 'node:child_process';

// Ink keeps a 'readable' listener on stdin even while the terminal is suspended, which
// restarts our TTY handle and steals keystrokes meant for the child (e.g. `less`).
// Block reads at the handle for as long as the child owns the terminal.
type TtyHandle = { readStart(): number; readStop(): number };

function blockStdin(): () => void {
  const handle = (process.stdin as unknown as { _handle?: TtyHandle })._handle;
  if (!handle) return () => {};
  const original = handle.readStart.bind(handle);
  handle.readStart = () => 0;
  handle.readStop();
  return () => {
    handle.readStart = original;
    // net.Socket may have flagged the handle as reading during the block.
    handle.readStart();
    while (process.stdin.read() !== null);
  };
}

// Runs an interactive program with full control of the terminal. Resolves to false
// when the program can't be started (e.g. not installed).
export function runInTerminal(cmd: string, args: string[]): Promise<boolean> {
  const unblock = blockStdin();
  return new Promise((done) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', () => {
      unblock();
      done(false);
    });
    child.on('close', () => {
      unblock();
      done(true);
    });
  });
}

export function openInFileManager(path: string): void {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [path]] : process.platform === 'win32' ? ['explorer', [path]] : ['xdg-open', [path]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}
