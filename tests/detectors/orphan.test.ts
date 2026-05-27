import { detect } from '../../src/detectors/orphan.js';
import type { Context, OverrideEntry } from '../../src/types.js';

function ctxOf(overrides: OverrideEntry[], lockfileNames: string[]): Context {
  return {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: overrides,
    lockfilePackageNames: new Set(lockfileNames),
    installedVersions: new Map(),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
  };
}

const flat = (name: string, value: string): OverrideEntry => ({
  key: name, packageName: name, value, path: ['overrides', name], container: 'overrides',
});

describe('OA001-ORPHAN-TARGET', () => {
  it('flags overrides whose target is absent from the lockfile', () => {
    const ctx = ctxOf([flat('gone-pkg', '1.0.0')], ['some-other-pkg']);
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA001-ORPHAN-TARGET',
      severity: 'low',
      package: 'gone-pkg',
      remediation: { action: 'remove' },
    });
  });

  it('does NOT flag overrides whose target IS in the lockfile', () => {
    const ctx = ctxOf([flat('postcss', '8.5.15')], ['postcss']);
    expect(detect(ctx)).toHaveLength(0);
  });

  it('handles scoped package names', () => {
    const ctx = ctxOf([flat('@scope/gone', '1.0.0')], ['other-pkg']);
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.package).toBe('@scope/gone');
  });

  it('skips when lockfile is empty (signal: skipped via Context — not this detectors job to add a finding)', () => {
    // Empty lockfile means we can't reliably tell. Detector returns no findings;
    // graceful-degradation note is added by the scanner via skippedDetectors.
    const ctx = ctxOf([flat('something', '1.0.0')], []);
    ctx.skippedDetectors = [{ ruleId: 'OA001-ORPHAN-TARGET', reason: 'lockfile missing' }];
    expect(detect(ctx)).toEqual([]);   // detector respects pre-marked skip
  });

  it('flags the outer key of a nested-object override when outer is orphaned', () => {
    const nested: OverrideEntry = {
      key: '@esbuild-kit/core-utils',
      packageName: '@esbuild-kit/core-utils',
      value: { esbuild: '^0.25.0' },
      path: ['overrides', '@esbuild-kit/core-utils'],
      container: 'overrides',
    };
    const ctx = ctxOf([nested], ['other-pkg']);
    const findings = detect(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.package).toBe('@esbuild-kit/core-utils');
  });
});
