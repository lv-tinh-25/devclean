import { homedir } from 'node:os';
import { join } from 'node:path';

const WINDOWS = process.platform === 'win32';
// Windows accepts both separators, and tools hand back either one.
const SEPARATOR = WINDOWS ? /[\\/]/ : /\//;

export const isSeparator = (ch: string | undefined) => !!ch && SEPARATOR.test(ch);

export function isInside(child: string, parent: string): boolean {
  if (!child.startsWith(parent) || child.length === parent.length) return false;
  return isSeparator(parent.at(-1)) || isSeparator(child[parent.length]);
}

export function lastSeparator(path: string): number {
  for (let i = path.length - 1; i >= 0; i--) if (isSeparator(path[i])) return i;
  return -1;
}

export const configHome = () =>
  process.env.XDG_CONFIG_HOME || (WINDOWS && process.env.APPDATA) || join(homedir(), '.config');

export const cacheHome = () =>
  process.env.XDG_CACHE_HOME || (WINDOWS && process.env.LOCALAPPDATA) || join(homedir(), '.cache');
