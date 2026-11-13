import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'devclean-'));
}

export async function file(path: string, content: string | Buffer = 'x'): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}
