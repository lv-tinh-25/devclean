import { describe, it, expect } from 'vitest';
import { detect, installCommands } from '../src/detect.js';

const cmds = (...a: Parameters<typeof installCommands>) =>
  installCommands(...a).map((c) => [c.cmd, ...c.args].join(' '));

describe('detect', () => {
  it('finds node project with junk', () => {
    expect(detect(['package.json', 'node_modules', 'src'])).toEqual({ types: ['node'], junk: ['node_modules'] });
  });
  it('ignores junk without a marker', () => {
    expect(detect(['dist', 'node_modules'])).toBeNull();
  });
  it('attributes junk only to matched types', () => {
    expect(detect(['Cargo.toml', 'target'])).toEqual({ types: ['rust'], junk: ['target'] });
    expect(detect(['package.json', 'target'])).toEqual({ types: ['node'], junk: [] });
  });
  it('merges multiple types', () => {
    expect(detect(['package.json', 'pom.xml', 'node_modules', 'target'])).toEqual({
      types: ['node', 'maven'],
      junk: ['node_modules', 'target'],
    });
  });
});

describe('installCommands', () => {
  it('picks node package manager by lockfile', () => {
    expect(cmds(['node'], ['package.json', 'pnpm-lock.yaml'], [])).toEqual(['pnpm install']);
    expect(cmds(['node'], ['package.json', 'yarn.lock'], [])).toEqual(['yarn install']);
    expect(cmds(['node'], ['package.json', 'bun.lock'], [])).toEqual(['bun install']);
    expect(cmds(['node'], ['package.json', 'bun.lockb'], [])).toEqual(['bun install']);
    expect(cmds(['node'], ['package.json'], [])).toEqual(['npm install']);
  });
  it('handles python variants', () => {
    expect(cmds(['python'], ['pyproject.toml', 'uv.lock'], [])).toEqual(['uv sync']);
    expect(cmds(['python'], ['pyproject.toml', 'poetry.lock'], [])).toEqual(['poetry install']);
    expect(cmds(['python'], ['Pipfile'], [])).toEqual(['pipenv install']);
    expect(cmds(['python'], ['requirements.txt'], ['venv'])).toEqual([
      'python3 -m venv venv',
      'venv/bin/pip install -r requirements.txt',
    ]);
    expect(cmds(['python'], ['pyproject.toml'], [])).toEqual(['python3 -m venv .venv', '.venv/bin/pip install -e .']);
  });
  it('handles java, rust, ios, php', () => {
    expect(cmds(['maven'], ['pom.xml', 'mvnw'], [])).toEqual(['./mvnw -q dependency:resolve']);
    expect(cmds(['maven'], ['pom.xml'], [])).toEqual(['mvn -q dependency:resolve']);
    expect(cmds(['gradle'], ['build.gradle', 'gradlew'], [])).toEqual(['./gradlew dependencies']);
    expect(cmds(['gradle'], ['build.gradle.kts'], [])).toEqual(['gradle dependencies']);
    expect(cmds(['rust'], ['Cargo.toml'], [])).toEqual(['cargo fetch']);
    expect(cmds(['ios'], ['Podfile'], [])).toEqual(['pod install']);
    expect(cmds(['php'], ['composer.json'], [])).toEqual(['composer install']);
  });
  it('concatenates multi-type commands in order', () => {
    expect(cmds(['node', 'maven'], ['package.json', 'pom.xml'], [])).toEqual(['npm install', 'mvn -q dependency:resolve']);
  });
});
