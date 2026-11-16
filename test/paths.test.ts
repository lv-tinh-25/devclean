import { describe, it, expect } from 'vitest';
import { delimiter, join } from 'node:path';
import { findWindowsCommand } from '../src/command.js';
import { isInside, lastSeparator } from '../src/paths.js';
import { file, tmp } from './helpers.js';

const WINDOWS = process.platform === 'win32';

describe('isInside', () => {
  it('needs a separator right after the parent', () => {
    expect(isInside('/r/mono/a', '/r/mono')).toBe(true);
    expect(isInside('/r/mono-2', '/r/mono')).toBe(false);
    expect(isInside('/r/mono', '/r/mono')).toBe(false);
    expect(isInside('/r/a', '/')).toBe(true);
  });
  it('accepts backslashes on Windows only', () => {
    expect(isInside('C:\\r\\mono\\a', 'C:\\r\\mono')).toBe(WINDOWS);
    expect(lastSeparator('a\\b')).toBe(WINDOWS ? 1 : -1);
  });
});

describe('findWindowsCommand', () => {
  it('searches PATH with PATHEXT, whatever case the env names use', async () => {
    const bin = await tmp();
    await file(join(bin, 'npm.cmd'), '');
    const env = { Path: `/nonexistent${delimiter}${bin}`, PathExt: '.EXE;.cmd' };
    expect(findWindowsCommand('npm', '/project', env)).toBe(join(bin, 'npm.cmd'));
    expect(findWindowsCommand('pnpm', '/project', env)).toBeNull();
  });
  it('resolves commands with a folder against the project, never bare names', async () => {
    const project = await tmp();
    await file(join(project, 'npm.cmd'), '');
    await file(join(project, '.venv/Scripts/pip.exe'), '');
    const env = { PATH: '', PATHEXT: '.exe;.cmd' };
    expect(findWindowsCommand('npm', project, env)).toBeNull();
    expect(findWindowsCommand('.venv/Scripts/pip', project, env)).toBe(join(project, '.venv/Scripts/pip.exe'));
  });
});
