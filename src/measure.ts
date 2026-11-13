import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fsLimit } from './limit.js';

async function list(dir: string) {
  try {
    return await fsLimit(() => readdir(dir, { withFileTypes: true }));
  } catch {
    return [];
  }
}

export interface WorkCounter {
  seen: number;
  done: number;
}

export async function dirSize(dir: string, work?: WorkCounter): Promise<number> {
  const entries = await list(dir);
  if (work) {
    work.seen += entries.filter((e) => e.isDirectory()).length;
    work.done++;
  }
  const sizes = await Promise.all(
    entries.map(async (e) => {
      const p = join(e.parentPath, e.name);
      if (e.isDirectory()) return dirSize(p, work);
      if (!e.isFile()) return 0;
      try {
        const st = await fsLimit(() => lstat(p));
        // nlink > 1: shared with another path (e.g. pnpm store), deleting frees nothing.
        return st.nlink === 1 ? st.blocks * 512 : 0;
      } catch {
        return 0;
      }
    }),
  );
  return sizes.reduce((a, b) => a + b, 0);
}

export async function latestMtime(dir: string, skip: Set<string>, maxDepth = 4): Promise<number> {
  const entries = await list(dir);
  const times = await Promise.all(
    entries.map(async (e) => {
      const p = join(e.parentPath, e.name);
      if (e.isDirectory()) {
        if (maxDepth <= 0 || skip.has(e.name) || e.name === '.git') return 0;
        return latestMtime(p, skip, maxDepth - 1);
      }
      if (!e.isFile()) return 0;
      try {
        return (await fsLimit(() => lstat(p))).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  return Math.max(0, ...times);
}
