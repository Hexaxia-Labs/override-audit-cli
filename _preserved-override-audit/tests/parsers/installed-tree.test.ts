import { walkInstalledTree } from '../../src/parsers/installed-tree.js';
import { join } from 'path';

const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

describe('walkInstalledTree', () => {
  it('finds all copies of a package across the tree (top + nested)', () => {
    const { installedCopies } = walkInstalledTree(F('tree-walker'));
    const esbuildBin = installedCopies.get('@esbuild/linux-x64');
    expect(esbuildBin).toBeDefined();
    expect(esbuildBin!.length).toBe(2);
    const versions = esbuildBin!.map(c => c.version).sort();
    expect(versions).toEqual(['0.25.12', '0.28.0']);
  });

  it('records parent declarations with exact-version flag', () => {
    const { parentDeclarations } = walkInstalledTree(F('tree-walker'));
    const parents = parentDeclarations.get('@esbuild/linux-x64');
    expect(parents).toBeDefined();
    // Two parents: esbuild@0.25.12 and esbuild@0.28.0 (nested under tsx)
    expect(parents!.length).toBe(2);
    const exactPins = parents!.filter(p => p.exactVersion);
    expect(exactPins.length).toBe(2);
    expect(exactPins.map(p => p.declaredValue).sort()).toEqual(['0.25.12', '0.28.0']);
    expect(exactPins.every(p => p.declaredIn === 'optionalDependencies')).toBe(true);
    expect(exactPins.every(p => p.parentName === 'esbuild')).toBe(true);
  });

  it('treats ranges (^, ~, >=) as non-exact', () => {
    const { parentDeclarations } = walkInstalledTree(F('tree-walker'));
    const esbuildParents = parentDeclarations.get('esbuild');
    expect(esbuildParents).toBeDefined();
    // tsx declares "esbuild": "^0.28.0" — should be non-exact
    const tsx = esbuildParents!.find(p => p.parentName === 'tsx');
    expect(tsx?.exactVersion).toBe(false);
    expect(tsx?.declaredValue).toBe('^0.28.0');
  });

  it('returns empty maps when node_modules is missing', () => {
    const { installedCopies, parentDeclarations } = walkInstalledTree(F('nm-missing'));
    expect(installedCopies.size).toBe(0);
    expect(parentDeclarations.size).toBe(0);
  });
});
