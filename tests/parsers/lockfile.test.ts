import { readLockfilePackages } from '../../src/parsers/lockfile.js';
import { join } from 'path';

const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

describe('readLockfilePackages', () => {
  it('extracts all package names from npm package-lock.json (top + nested)', () => {
    const names = readLockfilePackages(F('lockfile-npm-basic'), 'npm');
    expect(names.has('postcss')).toBe(true);
    expect(names.has('@esbuild-kit/core-utils')).toBe(true);
    expect(names.has('esbuild')).toBe(true);   // nested under tsx/node_modules/
  });

  it('extracts package names from pnpm-lock.yaml', () => {
    const names = readLockfilePackages(F('lockfile-pnpm-basic'), 'pnpm');
    expect(names.has('postcss')).toBe(true);
    expect(names.has('@esbuild-kit/core-utils')).toBe(true);
    expect(names.has('react')).toBe(true);
  });

  it('extracts package names from pnpm v9 lockfile (quoted scoped + unquoted bare, peer-disambiguated keys)', () => {
    const names = readLockfilePackages(F('lockfile-pnpm-v9'), 'pnpm');
    expect(names.has('@alloc/quick-lru')).toBe(true);
    expect(names.has('@biomejs/biome')).toBe(true);
    expect(names.has('@radix-ui/react-dialog')).toBe(true);
    expect(names.has('accepts')).toBe(true);
    expect(names.has('ajv')).toBe(true);
  });

  it('returns empty Set when lockfile missing (graceful)', () => {
    const names = readLockfilePackages(F('lockfile-missing'), 'npm');
    expect(names.size).toBe(0);
  });
});
