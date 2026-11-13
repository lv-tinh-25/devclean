import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { detect } from './detect.js';
import { fsLimit } from './limit.js';
import { dirSize, latestMtime, type WorkCounter } from './measure.js';
import { ALL_JUNK, type ProjectType } from './rules.js';

export interface Project {
  path: string;
  name: string;
  types: ProjectType[];
  junk: { name: string; size: number }[];
  size: number;
  modified: number;
  entries: string[];
  measuring: boolean;
  // A project with nothing to clean; only used to group the projects nested inside it.
  anchor?: boolean;
}

// `bin` is Eclipse's output folder; it often holds a copied pom.xml and shows up as a fake project.
const NEVER_ENTER = new Set(['Library', 'bin']);

// Generic names that some repos commit (libraries, GitHub Actions); only treat as junk when git ignores them.
const NEEDS_GITIGNORE = new Set(['dist', 'build']);

function keptByGit(dir: string, name: string): Promise<boolean> {
  return new Promise((done) =>
    // exit 0 = ignored, 1 = not ignored (tracked or would be), 128 / ENOENT = not a repo or no git.
    execFile('git', ['check-ignore', '-q', '--', name], { cwd: dir }, (err) => {
      const code = err ? ((err as { code?: number | string }).code ?? 1) : 0;
      done(code !== 1);
    }),
  );
}

export const isRealDir = (p: string) =>
  lstat(p).then(
    (st) => st.isDirectory(),
    () => false,
  );

export async function findProject(path: string, entries: string[]): Promise<Project | null> {
  const found = detect(entries);
  if (!found) return null;
  const junk = [];
  for (const name of found.junk) {
    if (!(await isRealDir(join(path, name)))) continue;
    if (NEEDS_GITIGNORE.has(name) && !(await keptByGit(path, name))) continue;
    junk.push({ name, size: 0 });
  }
  return {
    path,
    name: basename(path),
    types: found.types,
    junk,
    size: 0,
    modified: await latestMtime(path, ALL_JUNK),
    entries,
    measuring: true,
  };
}

export async function measureSizes(p: Project, work?: WorkCounter): Promise<Project> {
  if (work) work.seen += p.junk.length;
  const junk = await Promise.all(p.junk.map(async (j) => ({ name: j.name, size: await dirSize(join(p.path, j.name), work) })));
  return { ...p, junk, size: junk.reduce((s, j) => s + j.size, 0), measuring: false };
}

export async function measureProject(path: string, entries: string[], work?: WorkCounter): Promise<Project | null> {
  const p = await findProject(path, entries);
  return p && measureSizes(p, work);
}

export type OnProgress = (done: number, total: number) => void;

export async function* scan(root: string, signal?: AbortSignal, onProgress?: OnProgress): AsyncGenerator<Project> {
  // Walking the tree is quick; sizing node_modules & co. is most of the time, so both count.
  const work: WorkCounter = { seen: 1, done: 0 };
  const report = () => onProgress?.(work.done, work.seen);
  const ready: Project[] = [];
  let pending = 0;
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };

  const track = (p: Promise<void>) => {
    pending++;
    p.catch(() => {}).finally(() => {
      pending--;
      notify();
    });
  };

  const visit = async (dir: string): Promise<void> => {
    if (signal?.aborted) return;
    let dirents: Dirent[];
    try {
      dirents = await fsLimit(() => readdir(dir, { withFileTypes: true }));
    } catch {
      dirents = [];
    }
    const entries = dirents.map((d) => d.name);
    if (detect(entries)) {
      track(
        // Announce the row first; sizing node_modules can take many seconds.
        findProject(dir, entries).then(async (p) => {
          if (!p || signal?.aborted) return;
          if (!p.junk.length) {
            ready.push({ ...p, measuring: false, anchor: true });
            notify();
            return;
          }
          ready.push(p);
          notify();
          const measured = await measureSizes(p, work);
          report();
          if (!signal?.aborted) ready.push(measured);
        }),
      );
    }
    for (const d of dirents) {
      // isDirectory() is false for symlinks, so links are never followed.
      // Dot-dirs hold editor extensions and tool caches (.vscode, .npm, .cargo…) whose
      // build output can't be regenerated, so they're never scanned.
      const skip = ALL_JUNK.has(d.name) || NEVER_ENTER.has(d.name) || d.name.startsWith('.');
      if (d.isDirectory() && !skip) {
        work.seen++;
        track(visit(join(dir, d.name)));
      }
    }
    work.done++;
    report();
  };

  // Sizing a big node_modules can take seconds without any visit finishing.
  const ticker = setInterval(report, 100);
  try {
    track(visit(root));
    while (!signal?.aborted) {
      if (ready.length) {
        yield ready.shift()!;
        continue;
      }
      if (pending === 0) break;
      await new Promise<void>((r) => (wake = r));
    }
  } finally {
    clearInterval(ticker);
    report();
  }
}
