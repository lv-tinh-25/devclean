import { RULES, type ProjectType } from './rules.js';

export function detect(entries: string[]): { types: ProjectType[]; junk: string[] } | null {
  const names = new Set(entries);
  const matched = RULES.filter((r) => r.markers.some((m) => names.has(m)));
  if (matched.length === 0) return null;
  const junk = new Set<string>();
  for (const r of matched) for (const j of r.junk) if (names.has(j)) junk.add(j);
  return { types: matched.map((r) => r.type), junk: [...junk] };
}

export interface InstallCmd {
  cmd: string;
  args: string[];
  label: string;
}

const c = (cmd: string, ...args: string[]): InstallCmd => ({ cmd, args, label: [cmd, ...args].join(' ') });

function forType(type: ProjectType, has: (n: string) => boolean, deletedJunk: string[]): InstallCmd[] {
  switch (type) {
    case 'node':
      if (has('pnpm-lock.yaml')) return [c('pnpm', 'install')];
      if (has('yarn.lock')) return [c('yarn', 'install')];
      if (has('bun.lock') || has('bun.lockb')) return [c('bun', 'install')];
      return [c('npm', 'install')];
    case 'python': {
      if (has('uv.lock')) return [c('uv', 'sync')];
      if (has('poetry.lock')) return [c('poetry', 'install')];
      if (has('Pipfile')) return [c('pipenv', 'install')];
      const venv = deletedJunk.includes('venv') && !deletedJunk.includes('.venv') ? 'venv' : '.venv';
      const pip = `${venv}/bin/pip`;
      return has('requirements.txt')
        ? [c('python3', '-m', 'venv', venv), c(pip, 'install', '-r', 'requirements.txt')]
        : [c('python3', '-m', 'venv', venv), c(pip, 'install', '-e', '.')];
    }
    case 'maven':
      return [c(has('mvnw') ? './mvnw' : 'mvn', '-q', 'dependency:resolve')];
    case 'gradle':
      return [c(has('gradlew') ? './gradlew' : 'gradle', 'dependencies')];
    case 'rust':
      return [c('cargo', 'fetch')];
    case 'ios':
      return [c('pod', 'install')];
    case 'php':
      return [c('composer', 'install')];
  }
}

export function installCommands(types: ProjectType[], entries: string[], deletedJunk: string[]): InstallCmd[] {
  const names = new Set(entries);
  return types.flatMap((t) => forType(t, (n) => names.has(n), deletedJunk));
}
