#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { render } from 'ink';
import { App } from './ui/App.js';

const HELP = `devclean — find and clean dependency & build folders

Usage: devclean [path]

Scans [path] (default: current directory) for projects and lists their
deletable folders (node_modules, .venv, target, build, Pods, vendor…).

Keys: ↑↓/jk move · SPACE toggle · v range · a all · ENTER delete
      i reinstall · o open in Finder · q quit

Deletion is permanent (not moved to Trash).`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
if (args.includes('-v') || args.includes('--version')) {
  console.log(createRequire(import.meta.url)('../package.json').version);
  process.exit(0);
}

const root = resolve(args.find((a) => !a.startsWith('-')) ?? '.');
if (!(await stat(root).catch(() => null))?.isDirectory()) {
  console.error(`devclean: not a directory: ${root}`);
  process.exit(1);
}

await render(<App root={root} />, { alternateScreen: true }).waitUntilExit();
// In-flight size measurements don't stop on abort; don't make the user wait for them.
process.exit(0);
