import { detectPackageManager, UnsupportedPackageManagerError } from '../../src/parsers/package-manager.js';
import { join } from 'path';

const F = (name: string) => join(process.cwd(), 'tests', 'fixtures', name);

describe('detectPackageManager', () => {
  it('detects npm from package-lock.json', () => {
    expect(detectPackageManager(F('pm-npm'))).toBe('npm');
  });
  it('detects pnpm from pnpm-lock.yaml', () => {
    expect(detectPackageManager(F('pm-pnpm'))).toBe('pnpm');
  });
  it('prefers most-recently-modified lockfile when both exist', () => {
    expect(detectPackageManager(F('pm-both'))).toBe('pnpm');
  });
  it('throws UnsupportedPackageManagerError when no lockfile present', () => {
    expect(() => detectPackageManager(F('pm-none'))).toThrow(UnsupportedPackageManagerError);
  });
});
