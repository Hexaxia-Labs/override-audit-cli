import { detect } from '../../src/detectors/coupled-platform-binary.js';
import type { Context, OverrideEntry, ParentDeclaration } from '../../src/types.js';

function ctxOf(
  entries: OverrideEntry[],
  parentDecls: Record<string, ParentDeclaration[]> = {},
  installedVersions: [string, string][] = [],
): Context {
  return {
    projectPath: '/x', packageJson: {}, packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installedVersions),
    installedCopies: new Map(),
    parentDeclarations: new Map(Object.entries(parentDecls)),
    registryDistTags: new Map(),
    skippedDetectors: [],
  };
}

const e = (name: string, value: string): OverrideEntry => ({
  key: name, packageName: name, value, path: ['overrides', name], container: 'overrides',
});

const exactParent = (parentName: string, parentVersion: string, declaredValue: string): ParentDeclaration => ({
  parentName, parentVersion, declaredIn: 'optionalDependencies', declaredValue, exactVersion: true,
});

const rangeParent = (parentName: string, parentVersion: string, declaredValue: string): ParentDeclaration => ({
  parentName, parentVersion, declaredIn: 'dependencies', declaredValue, exactVersion: false,
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
      ruleId: 'OA006-COUPLED-PLATFORM-BINARY',
      severity: 'high',
      package: '@esbuild/linux-x64',
      remediation: { action: 'replace' },     // v0.2.1: now an automated fix
    });
    expect(findings[0]!.title).toContain('platform binary');
    expect(findings[0]!.remediation.explanation).toContain('"esbuild": ">=0.25.12"');
  });

  it('emits multi-op patches: remove binary override + add parent override (v0.2.1)', () => {
    const ctx = ctxOf(
      [e('@esbuild/linux-x64', 'latest')],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    const findings = detect(ctx);
    const patches = findings[0]!.remediation.patches;
    expect(patches).toHaveLength(2);
    expect(patches![0]).toEqual({ op: 'remove', path: '/overrides/@esbuild~1linux-x64' });
    expect(patches![1]).toEqual({ op: 'add', path: '/overrides/esbuild', value: '>=0.25.12' });
    expect(findings[0]!.remediation.patch).toBeNull();    // single-op field unused for multi-op
  });

  it('emits replace (not add) when an override on the parent already exists', () => {
    const ctx = ctxOf(
      [
        e('@esbuild/linux-x64', 'latest'),
        e('esbuild', '^0.18.0'),                   // existing parent override at older floor
      ],
      { '@esbuild/linux-x64': [exactParent('esbuild', '0.25.12', '0.25.12')] },
    );
    const finding = detect(ctx).find(f => f.package === '@esbuild/linux-x64');
    const patches = finding!.remediation.patches!;
    expect(patches[1]).toEqual({ op: 'replace', path: '/overrides/esbuild', value: '>=0.25.12' });
    expect(finding!.remediation.explanation).toContain('updating existing parent override');
  });

  it('mirrors the container (pnpm.overrides) for pnpm projects', () => {
    const ctx = {
      ...ctxOf([], {}),
      packageManager: 'pnpm' as const,
      overrideEntries: [{
        key: '@esbuild/linux-x64', packageName: '@esbuild/linux-x64', value: 'latest',
        path: ['pnpm', 'overrides', '@esbuild/linux-x64'], container: 'pnpm.overrides' as const,
      }],
      parentDeclarations: new Map([
        ['@esbuild/linux-x64', [exactParent('esbuild', '0.25.12', '0.25.12')]],
      ]),
    };
    const findings = detect(ctx);
    const patches = findings[0]!.remediation.patches!;
    expect(patches[1]).toEqual({ op: 'add', path: '/pnpm/overrides/esbuild', value: '>=0.25.12' });
  });

  it('flags non-platform-binary target at MEDIUM severity (currently effective, but fragile)', () => {
    const ctx = ctxOf(
      [e('postcss', '^8.5.15')],
      { postcss: [exactParent('next', '16.2.6', '8.4.31')] },
    );
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA006-COUPLED-PLATFORM-BINARY',
      severity: 'medium',
      package: 'postcss',
    });
    expect(findings[0]!.title).toContain('fragile');
    expect(findings[0]!.remediation.explanation).toContain('"next": ">=16.2.6"');
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
    // Suggests the newer parent floor — that's the safer recommendation.
    expect(findings[0]!.remediation.explanation).toContain('">=0.28.0"');
  });

  it('does not crash on nested-object overrides (skips them — OA005)', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' }, path: ['overrides', 'a'], container: 'overrides',
    };
    expect(detect(ctxOf([nested]))).toEqual([]);
  });
});
