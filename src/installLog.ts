import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const KEEP_LOGS = 20;

export function logDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'devclean', 'logs');
}

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export interface InstallLog {
  path: string;
  write(text: string): void;
  close(): Promise<void>;
}

// Logging must never break an install: on any failure this returns a no-op log.
export async function openLog(project: string, dir = logDir()): Promise<InstallLog | null> {
  try {
    await mkdir(dir, { recursive: true });
    const safe = project.replace(/[^A-Za-z0-9._-]/g, '-') || 'project';
    const path = join(dir, `${safe}-${stamp(new Date())}.log`);
    const stream: WriteStream = createWriteStream(path);
    stream.on('error', () => {});
    return {
      path,
      write: (text) => stream.write(text),
      close: async () => {
        await new Promise<void>((done) => stream.end(done));
        await pruneLogs(dir, KEEP_LOGS);
      },
    };
  } catch {
    return null;
  }
}

export async function pruneLogs(dir: string, keep: number): Promise<void> {
  try {
    // Names end in a sortable timestamp, so name order is age order within a project;
    // sort on the timestamp part to compare across projects.
    const logs = (await readdir(dir)).filter((f) => f.endsWith('.log'));
    const ts = (f: string) => f.slice(-19, -4);
    logs.sort((a, b) => ts(b).localeCompare(ts(a)) || b.localeCompare(a));
    await Promise.all(logs.slice(keep).map((f) => rm(join(dir, f), { force: true })));
  } catch {
    // Best-effort.
  }
}
