import { detect } from '../../../src/overrides/detectors/oa005-nested-ineffective.js';
import type { OverrideContext, OverrideEntry } from '../../../src/overrides/context.js';
import type { InstalledManifest } from '../../../src/overrides/parsing/node-modules.js';
import { NULL_AUDIT_LOG } from '../../../src/audit-log/index.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

interface CtxOpts {
  pm?: 'npm' | 'pnpm' | 'yarn';
  lockfile?: string[];
  installed?: [string, string][];
  manifestLookup?: (name: string) => InstalledManifest | null;
}

function ctxOf(entries: OverrideEntry[], opts: CtxOpts = {}): OverrideContext & { _testManifestLookup?: (name: string) => InstalledManifest | null } {
  const ctx = {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: opts.pm ?? 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(opts.lockfile ?? entries.map(e => e.packageName)),
    installedVersions: new Map(opts.installed ?? []),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
    ...(opts.manifestLookup ? { _testManifestLookup: opts.manifestLookup } : {}),
  } as any;
  return ctx;
}

const nested = (key: string, value: Record<string, string>, container: 'overrides' | 'pnpm.overrides' = 'overrides'): OverrideEntry => ({
  key,
  packageName: key,
  value,
  path: container === 'overrides' ? ['overrides', key] : ['pnpm', 'overrides', key],
  container,
});

describe('OA005-NESTED-INEFFECTIVE', () => {
  // OA005.a - non-npm project (critical)
  it('flags .a when nested override appears in pnpm project', () => {
    const findings = detect(ctxOf([nested('a', { b: '1.0.0' })], { pm: 'pnpm' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA005',
      subRuleId: 'OA005.a',
      severity: 'critical',
    });
  });

  // OA005.b - outer parent not in tree
  it('flags .b when outer parent missing from lockfile', () => {
    const findings = detect(ctxOf([nested('@gone/parent', { dep: '1.0.0' })], { lockfile: ['other-pkg'] }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA005',
      subRuleId: 'OA005.b',
      severity: 'high',
    });
  });

  // OA005.c - inner dep not in parent's manifest
  it('flags .c when parent is in tree but inner is not its dep', () => {
    const lookup = (name: string) =>
      name === 'real-parent'
        ? ({ name: 'real-parent', version: '1.0.0', dependencies: { 'other-dep': '^1' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('real-parent', { missing: '1.0.0' })], {
      lockfile: ['real-parent'],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA005',
      subRuleId: 'OA005.c',
      severity: 'high',
    });
  });

  // OA005.d - leaky (inner installed elsewhere at non-satisfying version)
  it('flags .d when inner is installed elsewhere at non-conforming version', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^2.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA005',
      subRuleId: 'OA005.d',
      severity: 'medium',
    });
  });

  // OA005.e - suspect (valid + effective, just stylistic)
  it('flags .e when nested form is valid and effective (low-level)', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA005',
      subRuleId: 'OA005.e',
      severity: 'low',
    });
  });

  it('does not fire on flat string overrides', () => {
    const flat: OverrideEntry = {
      key: 'x',
      packageName: 'x',
      value: '1.0.0',
      path: ['overrides', 'x'],
      container: 'overrides',
    };
    expect(detect(ctxOf([flat]))).toEqual([]);
  });

  it('handles multiple nested entries', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'a': '^1.0.0', 'b': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { a: '^1.0.0', b: '^1.0.0' })], {
      lockfile: ['parent', 'a', 'b'],
      installed: [['a', '1.5.0'], ['b', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(2);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
    expect(findings[1]!.subRuleId).toBe('OA005.e');
  });

  it('prioritizes .b over .e when outer missing', () => {
    const findings = detect(ctxOf([nested('missing-parent', { inner: '^1.0.0' })], {
      lockfile: [],
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.b');
  });

  it('prioritizes .c over .e when parent lacks inner declaration', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'other': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.c');
  });

  it('checks for optional dependencies when parent lacks inner in normal deps', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', optionalDependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
  });

  it('checks for peer dependencies when parent lacks inner in normal deps', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', peerDependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
  });

  it('skips leaky check if range is invalid', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: 'not-a-range' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
  });

  it('does not flag when inner installed elsewhere satisfies the range', () => {
    const lookup = (name: string) =>
      name === 'parent'
        ? ({ name: 'parent', version: '1.0.0', dependencies: { 'inner': '^1.0.0' } } as InstalledManifest)
        : null;
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: lookup,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
  });

  it('handles missing manifest lookup gracefully (no crash), falls through to .e when no manifest', () => {
    const findings = detect(ctxOf([nested('parent', { inner: '^1.0.0' })], {
      lockfile: ['parent', 'inner'],
      installed: [['inner', '1.5.0']],
      manifestLookup: () => null,
    }));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.subRuleId).toBe('OA005.e');
  });
});
