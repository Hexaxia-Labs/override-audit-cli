import { detect } from '../../../src/overrides/detectors/oa004-surpassed-pin.js';
import type { OverrideContext, OverrideEntry } from '../../../src/overrides/context.js';
import { NULL_AUDIT_LOG } from '../../../src/audit-log/index.js';

const noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;

function ctxOf(entries: OverrideEntry[], installed: [string, string][]): OverrideContext {
  return {
    projectPath: '/x',
    packageJson: {},
    packageJsonRaw: '{}',
    packageManager: 'npm',
    overrideEntries: entries,
    lockfilePackageNames: new Set(entries.map(e => e.packageName)),
    installedVersions: new Map(installed),
    installedCopies: new Map(),
    parentDeclarations: new Map(),
    registryDistTags: new Map(),
    skippedDetectors: [],
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
  };
}

const e = (name: string, pin: string): OverrideEntry => ({
  key: name, packageName: name, value: pin, path: ['overrides', name], container: 'overrides',
});

describe('OA004-SURPASSED-PIN', () => {
  it('flags when installed is newer than concrete pin (same major -> remove)', () => {
    const findings = detect(ctxOf([e('postcss', '8.4.31')], [['postcss', '8.5.15']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'OA004',
      severity: 'low',
      fix: { type: 'rfc6902' },
    });
  });

  it('downgrades to suggest when major bump (less safe)', () => {
    const findings = detect(ctxOf([e('react', '17.0.0')], [['react', '18.3.1']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.fix).toBeUndefined();
  });

  it('does NOT flag when installed equals pin', () => {
    expect(detect(ctxOf([e('postcss', '8.5.15')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag when installed is older than pin', () => {
    expect(detect(ctxOf([e('postcss', '8.5.15')], [['postcss', '8.4.31']]))).toEqual([]);
  });

  it('does NOT flag range pins (looks like version but not concrete)', () => {
    expect(detect(ctxOf([e('postcss', '^8.0.0')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag floating tags (OA002 handles those)', () => {
    expect(detect(ctxOf([e('postcss', 'latest')], [['postcss', '8.5.15']]))).toEqual([]);
  });

  it('does NOT flag when installed version unknown', () => {
    expect(detect(ctxOf([e('postcss', '8.4.31')], []))).toEqual([]);
  });

  it('does NOT crash on nested-object overrides (skips them - OA005 territory)', () => {
    const nested: OverrideEntry = {
      key: 'a', packageName: 'a', value: { b: '1.0.0' },
      path: ['overrides', 'a'], container: 'overrides',
    };
    expect(detect(ctxOf([nested], []))).toEqual([]);
  });

  it('respects skippedDetectors when OA004 is listed', () => {
    const ctx = ctxOf([e('postcss', '8.4.31')], [['postcss', '8.5.15']]);
    ctx.skippedDetectors = [{ ruleId: 'OA004', reason: 'skipped' }];
    expect(detect(ctx)).toEqual([]);
  });
});
