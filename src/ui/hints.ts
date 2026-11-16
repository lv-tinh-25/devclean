export interface Hint {
  text: string;
  // Lower shows first when space runs out; `always` hints are never dropped.
  priority: number;
  always?: boolean;
}

const h = (text: string, priority: number, always = false): Hint => ({ text, priority, always });
const help = h('? help', 0, true);
const quit = h('q quit', 0, true);

export const HINTS = {
  normal: [
    h('␣ select', 1),
    h('←→ group', 5),
    h('v range', 6),
    h('a all', 4),
    h('⏎ delete', 2),
    h('i reinstall', 3),
    h('o open', 7),
    help,
    quit,
  ],
  scanning: [h('↑↓ move', 1), h('←→ group', 2), help, quit, h('actions enable when the scan is done', 3)],
  installing: [
    h('↑↓ move', 2),
    h('←→ group', 4),
    h('L log', 3),
    h('Esc cancel queued', 1),
    help,
    quit,
    h('actions enable when installing is done', 5),
  ],
  range: [h('RANGE', 0, true), h('↑↓ move', 2), h('v select', 1), h('Esc cancel', 3), quit],
};

export const renderHints = (hints: Hint[]) => hints.map((x) => x.text).join(' · ');

export function fitHints(hints: Hint[], width: number): Hint[] {
  const chosen = new Set(hints.filter((x) => x.always));
  const optional = hints.filter((x) => !x.always).sort((a, b) => a.priority - b.priority);
  for (const x of optional) {
    const next = new Set(chosen).add(x);
    if (renderHints(hints.filter((y) => next.has(y))).length > width) break;
    chosen.add(x);
  }
  return hints.filter((x) => chosen.has(x));
}

export const KEY_HELP: [string, string][] = [
  ['↑ ↓  k j', 'Move'],
  ['PgUp PgDn', 'Move by 10'],
  ['→ ←  l h', 'Open / close a group'],
  ['Space', 'Select (a whole group on a group row)'],
  ['v', 'Range select: press, move, press again'],
  ['a', 'Select / deselect all'],
  ['Enter', 'Delete selected (or the current row), after confirming'],
  ['i', 'Reinstall selected (or current) projects in the background'],
  ['L', 'Open the last install log of the current project'],
  ['o', 'Open the project in your file manager'],
  ['Esc', 'Cancel the projects still waiting to reinstall · cancel a range · close a prompt'],
  ['?', 'Show / hide this help'],
  ['q', 'Quit (asks to confirm)'],
  ['Ctrl+C', 'Quit immediately'],
];
