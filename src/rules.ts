export type ProjectType = 'node' | 'python' | 'maven' | 'gradle' | 'rust' | 'ios' | 'php';

export interface Rule {
  type: ProjectType;
  label: string;
  markers: string[];
  junk: string[];
}

export const RULES: Rule[] = [
  {
    type: 'node',
    label: 'node',
    markers: ['package.json'],
    junk: ['node_modules', '.next', '.nuxt', '.turbo', '.angular', '.svelte-kit', 'dist', '.parcel-cache'],
  },
  {
    type: 'python',
    label: 'python',
    markers: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    junk: ['.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox'],
  },
  { type: 'maven', label: 'java', markers: ['pom.xml'], junk: ['target'] },
  { type: 'gradle', label: 'java', markers: ['build.gradle', 'build.gradle.kts'], junk: ['build', '.gradle'] },
  { type: 'rust', label: 'rust', markers: ['Cargo.toml'], junk: ['target'] },
  { type: 'ios', label: 'ios', markers: ['Podfile'], junk: ['Pods'] },
  { type: 'php', label: 'php', markers: ['composer.json'], junk: ['vendor'] },
];

export const ALL_JUNK = new Set(RULES.flatMap((r) => r.junk));

export const labelOf = (type: ProjectType) => RULES.find((r) => r.type === type)!.label;
