import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { configHome, isInside } from './paths.js';
import type { ProjectType } from './rules.js';
import { findProject, type Project } from './scan.js';

// What devclean deleted, so a project can still be reinstalled after devclean exits.
// It is only a convenience: every read/write failure is ignored.

export interface HistoryEntry {
  path: string;
  junk: string[];
  types: ProjectType[];
  deletedAt: number;
}

export function historyFile(): string {
  return join(configHome(), 'devclean', 'history.json');
}

export async function loadHistory(file = historyFile()): Promise<HistoryEntry[]> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(data) ? data.filter((e) => typeof e?.path === 'string' && Array.isArray(e.junk)) : [];
  } catch {
    return [];
  }
}

async function save(entries: HistoryEntry[], file: string): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    // Write-then-rename so an interrupted write never leaves a half-written file.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(entries, null, 2));
    await rename(tmp, file);
  } catch {
    // History is best-effort.
  }
}

// Writes are read-modify-write, so run them one at a time: two deletions in a row must
// not both read the old file and overwrite each other.
let queue: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// Resolves once every write started so far is on disk; call before exiting.
export const flushHistory = (): Promise<void> => queue;

export function recordDeletion(entry: HistoryEntry, file = historyFile()): Promise<void> {
  return enqueue(async () => {
    const rest = (await loadHistory(file)).filter((e) => e.path !== entry.path);
    await save([...rest, entry], file);
  });
}

export function forget(paths: string[], file = historyFile()): Promise<void> {
  if (!paths.length) return Promise.resolve();
  return enqueue(async () => {
    const drop = new Set(paths);
    const entries = await loadHistory(file);
    const kept = entries.filter((e) => !drop.has(e.path));
    if (kept.length !== entries.length) await save(kept, file);
  });
}

const isUnder = (path: string, root: string) => path === root || isInside(path, root);

export interface RestoredProject extends Project {
  deletedAt: number;
}

// Projects under `root` that devclean deleted and that still have nothing to clean.
// Entries that were reinstalled or whose folder is gone are dropped from the history.
export async function restoreDeleted(root: string, file = historyFile()): Promise<RestoredProject[]> {
  const restored: RestoredProject[] = [];
  const stale: string[] = [];
  for (const e of await loadHistory(file)) {
    if (!isUnder(e.path, root)) continue;
    const entries = await readdir(e.path).catch(() => null);
    const project = entries && (await findProject(e.path, entries));
    if (!project || project.junk.length) {
      stale.push(e.path);
      continue;
    }
    restored.push({
      ...project,
      junk: e.junk.map((name) => ({ name, size: 0 })),
      measuring: false,
      deletedAt: e.deletedAt,
    });
  }
  await forget(stale, file);
  return restored;
}
