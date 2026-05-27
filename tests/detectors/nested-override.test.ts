import { detect } from '../../src/detectors/nested-override.js';
import type { Context, OverrideEntry, PackageManager } from '../../src/types.js';
import type { InstalledManifest } from '../../src/parsers/node-modules.js';

interface CtxOpts {
  pm?: PackageManager;
  lockfile?: string[];
  installed?: [string, string][];
  manifestLookup?: (name: string) => InstalledManifest | null;
}

function ctxOf(entries: OverrideEntry[], opts: CtxOpts = {}): Context {
  return {
    projectPath: '/x',
    packageJson: {}, packageJsonRaw: '{}',
    packageManager: opts.pm ?? 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(opts.lockfile ?? entries.map(e => e.packageName)),
    installedVersions: new Map(opts.installed ?? []),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
    // Detector reads its own manifest lookup via a hook injected on ctx (see helper below).
    // Pass it via a non-typed extension; the detector code below accepts an injected resolver.
    ...(opts.manifestLookup ? { _testManifestLookup: opts.manifestLookup } : {}),
  } as unknown as Context;
}

const nested = (key: string, value: Record<string, string>, container: 'overrides' | 'pnpm.overrides' = 'overrides'): OverrideEntry => ({
  key, packageName: key, value,
  path: container === 'overrides' ? ['overrides', key] : ['pnpm', 'overrides', key],
  container,
});

describe('OA005-NESTED-OVERRIDE', () => {
  // OA005.a — non-npm project (critical)
  it('flags .a-NON-NPM when nested override appears in pnpm project', () => {
    const findings = detect(ctxOf([nested('a', { b: '1.0.0' })], { pm: 'pnpm' }));
    expect(findings[0]!.subRuleId).toBe('OA005.a-NON-NPM');
    expect(findings[0]!.severity).toBe('critical');
  });

  // OA005.b — outer parent not in tree
  it('flags .b-ORPHANED-OUTER when outer parent missing from lockfile', () => {
    const findings = detect(ctxOf([nested('@gone/parent', { dep: '1.0.0' })], { lockfile: ['other-pkg'] }));
    expect(findings[0]!.subRuleId).toBe('OA005.b-ORPHANED-OUTER');
    expect(findings[0]!.severity).toBe('high');
  });

  // OA005.c — inner dep not in parent's manifest
  it('flags .c-ORPHANED-INNER when parent is in tree but inner is not its dep', () => {
    const lookup = (name: string) =>
      name === 'real-parent'
        ? ({ name: 'real-parent', version: '1.0.0', dependencies: { 'other-dep': '^1' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('real-parent', { missing: '1.0.0' })], {
      lockfile: ['real-parent'],
      manifestLookup: lookup,
    }));
    expect(findings[0]!.subRuleId).toBe('OA005.c-ORPHANED-INNER');
    expect(findings[0]!.severity).toBe('high');
  });

  // OA005.d — leaky (inner installed elsewhere at non-satisfying version)
  it('flags .d-LEAKY when inner is installed elsewhere at non-conforming version', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^2.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],  // installed 1.5.0 does NOT satisfy ^2.0.0
      manifestLookup: lookup,
    }));
    expect(findings[0]!.subRuleId).toBe('OA005.d-LEAKY');
    expect(findings[0]!.severity).toBe('medium');
  });

  // OA005.e — suspect (valid + effective, just stylistic)
  it('flags .e-SUSPECT when nested form is valid and effective (info-level)', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],   // satisfies ^1.0.0 — not leaky
      manifestLookup: lookup,
    }));
    expect(findings[0]!.subRuleId).toBe('OA005.e-SUSPECT');
    expect(findings[0]!.severity).toBe('info');
  });

  // Does not fire on flat overrides
  it('does not fire on flat string overrides', () => {
    const flat: OverrideEntry = {
      key: 'x', packageName: 'x', value: '1.0.0', path: ['overrides', 'x'], container: 'overrides',
    };
    expect(detect(ctxOf([flat]))).toEqual([]);
  });
});
