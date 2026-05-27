import { readInstalledVersion, readInstalledManifest } from '../../src/parsers/node-modules.js';
import { join } from 'path';

const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

describe('readInstalledVersion', () => {
  it('returns the version string for an installed package', () => {
    expect(readInstalledVersion(F('nm-basic'), 'postcss')).toBe('8.5.15');
  });
  it('returns the version for a scoped package', () => {
    expect(readInstalledVersion(F('nm-basic'), '@scope/pkg')).toBe('1.2.3');
  });
  it('returns null when the package is not installed', () => {
    expect(readInstalledVersion(F('nm-basic'), 'not-installed')).toBeNull();
  });
  it('returns null when node_modules is missing entirely', () => {
    expect(readInstalledVersion(F('nm-missing'), 'postcss')).toBeNull();
  });
});

describe('readInstalledManifest', () => {
  it('returns the parsed package.json for an installed scoped package', () => {
    const m = readInstalledManifest(F('nm-basic'), '@scope/pkg');
    expect(m?.dependencies).toEqual({ 'left-pad': '^1.0.0' });
  });
  it('returns null when missing', () => {
    expect(readInstalledManifest(F('nm-basic'), 'not-installed')).toBeNull();
  });
});
