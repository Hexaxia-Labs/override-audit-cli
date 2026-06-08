import { detect } from '../../../src/overrides/detectors/oa006-coupled-platform-binary.js';
import type { OverrideContext, OverrideEntry, ParentDeclaration } from '../../../src/overrides/context.js';
import { NULL_AUDIT_LOG } from '../../../src/audit-log/index.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

function ctxOf(
  entries: OverrideEntry[],
  parentDecls: Record<string, ParentDeclaration[]> = {},
  installedVersions: [string, string][] = [],
): OverrideContext {
  return {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installedVersions),
    installedCopies: new Map(),
    parentDeclarations: new Map(Object.entries(parentDecls)),
    registryDistTags: new Map(),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
  };
}

const e = (name: string, value: string): OverrideEntry => ({
  key: name,
  packageName: name,
  value,
  path: ['overrides', name],
  container: 'overrides',
});

const exactParent = (parentName: string, parentVersion: string, declaredValue: string): ParentDeclaration => ({
  parentName,
  parentVersion,
  declaredIn: 'optionalDependencies',
  declaredValue,
  exactVersion: true,
});

const rangeParent = (parentName: string, parentVersion: string, declaredValue: string): ParentDeclaration => ({
  parentName,
  parentVersion,
  declaredIn: 'dependencies',
  declaredValue,
  exactVersion: false,
});

describe('OA006-COUPLED-PLATFORM-BINARY', () => {
  it('flags override on a platform binary at HIGH severity (binary-coupling case)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA006',
      severity: 'high',
      package: { name: '@esbuild/linux-x64' },
      fix: { type: 'rfc6902' },
    });
    expect(findings[0]!.message).toContain('platform binary');
    expect(findings[0]!.details).toContain('esbuild');
  });

  it('emits a relocate op (retire binary override, add parent dependency floor) when the parent has no override', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    const findings = detect(ctx);
    const patches = findings[0]!.fix!.patch;
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({
      op: 'relocate',
      fromChild: '/overrides/@esbuild~1linux-x64',
      toParent: 'esbuild',
      floor: '>=0.25.12',
    });
    // relocate writes an inferred floor, so the fix is proposed-not-applied by default.
    expect(findings[0]!.fix!.tier).toBe('proposed');
  });

  it('emits replace (not add) when an override on the parent already exists', () => {
    const ctx = ctxOf(
      [
        e('@esbuild/linux-x64', 'latest'),
        e('esbuild', '^0.18.0'),
      ],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    const finding = detect(ctx).find(f => f.package.name === '@esbuild/linux-x64');
    const patches = finding!.fix!.patch;
    expect(patches[1]).toEqual({ op: 'replace', path: '/overrides/esbuild', value: '>=0.25.12' });
  });

  it('relocates from the correct container (pnpm.overrides) for pnpm projects', () => {
    const ctx: OverrideContext = {
      ...ctxOf([], {}),
      packageManager: 'pnpm',
      overrideEntries: [{
        key: '@esbuild/linux-x64',
        packageName: '@esbuild/linux-x64',
        value: 'latest',
        path: ['pnpm', 'overrides', '@esbuild/linux-x64'],
        container: 'pnpm.overrides',
      }],
      parentDeclarations: new Map([
        ['@esbuild/linux-x64', [exactParent('esbuild', '0.25.12', '0.25.12')]],
      ]),
    };
    const findings = detect(ctx);
    const patches = findings[0]!.fix!.patch;
    // fromChild points at the pnpm.overrides container; the floor lands on the
    // parent as a dependency (the applier writes /dependencies/esbuild), not a new override.
    expect(patches[0]).toEqual({
      op: 'relocate',
      fromChild: '/pnpm/overrides/@esbuild~1linux-x64',
      toParent: 'esbuild',
      floor: '>=0.25.12',
    });
  });

  it('flags non-platform-binary target at MEDIUM severity (currently effective, but fragile)', () => {
    const ctx = ctxOf(
      [e('postcss', '^8.5.15')],
      { postcss: [exactParent('next', '16.2.6', '8.4.31')] },
    );
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA006',
      severity: 'medium',
      package: { name: 'postcss' },
    });
    expect(findings[0]!.message).toContain('fragile');
    expect(findings[0]!.details).toContain('next');
  });

  it('does NOT flag when the only parents declare via ranges (not exact)', () => {
    const ctx = ctxOf(
      [e('postcss', '8.5.15')],
      { postcss: [rangeParent('some-pkg', '1.0.0', '^8.0.0')] },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('does NOT flag when the pin already matches every exact parent (already coordinated)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', '0.25.12')],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    expect(detect(ctx)).toEqual([]);
  });

  it('picks the newest parent when multiple exact parents exist (deterministic)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      {
        '@esbuild/linux-x64': [
          exactParent('esbuild', '0.25.12', '0.25.12'),
          exactParent('esbuild', '0.28.0', '0.28.0'),
        ],
      },
    );
    const findings = detect(ctx);
    const op = findings[0]!.fix!.patch[0]!;
    expect(op.op).toBe('relocate');
    expect(op.op === 'relocate' && op.floor).toBe('>=0.28.0');
  });

  it('does not crash on nested-object overrides (skips them - OA005)', () => {
    const nested: OverrideEntry = {
      key: 'a',
      packageName: 'a',
      value: { b: '1.0.0' },
      path: ['overrides', 'a'],
      container: 'overrides',
    };
    expect(detect(ctxOf([nested]))).toEqual([]);
  });
});
