import { detect } from '../../src/detectors/installed-newer.js';
import type { Context, OverrideEntry } from '../../src/types.js';

function ctxOf(entries: OverrideEntry[], installed: [string, string][]): Context {
  return {
    projectPath: '/x', packageJson: {}, packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installed),
    skippedDetectors: [],
  };
}
const e = (name: string, pin: string): OverrideEntry => ({
  key: name, packageName: name, value: pin, path: ['overrides', name], container: 'overrides',
});

describe('OA004-INSTALLED-NEWER', () => {
  it('flags when installed is newer than concrete pin (same major → remove)', () => {
    const findings = detect(ctxOf([e('postcss', '8.4.31')], [['postcss', '8.5.15']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA004-INSTALLED-NEWER',
      severity: 'low',
      remediation: { action: 'remove' },
    });
  });

  it('downgrades to suggest when major bump (less safe)', () => {
    const findings = detect(ctxOf([e('react', '17.0.0')], [['react', '18.3.1']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.remediation.action).toBe('suggest');
    expect(findings[0]!.remediation.patch).toBeNull();
  });

  it('does NOT flag when installed equals pin', () => {
    expect(detect(ctxOf([e('postcss', '8.5.15')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag when installed is older than pin', () => {
    expect(detect(ctxOf([e('postcss', '8.5.15')], [['postcss', '8.4.31']]))).toEqual([]);
  });

  it('does NOT flag range pins (semver.validRange but not a concrete version)', () => {
    expect(detect(ctxOf([e('postcss', '^8.0.0')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag floating tags (OA002 handles those)', () => {
    expect(detect(ctxOf([e('postcss', 'latest')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag when installed version unknown', () => {
    expect(detect(ctxOf([e('postcss', '8.4.31')], []))).toEqual([]);
  });

  it('does NOT crash on nested-object overrides (skips them — OA005 territory)', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' },
      path: ['overrides', 'a'], container: 'overrides',
    };
    expect(detect(ctxOf([nested], []))).toEqual([]);
  });
});
