import { renderJson } from '../../src/output/json.js';
import type { Context, Finding } from '../../src/types.js';

const baseCtx: Context = {
  projectPath: '/p', packageJson: {}, packageJsonRaw: '{}',
  packageManager: 'npm', overrideEntries: [],
  lockfilePackageNames: new Set(), installedVersions: new Map(),
  skippedDetectors: [],
};
const sampleFinding: Finding = {
  ruleId: 'OA001-ORPHAN-TARGET',
  severity: 'low',
  title: 't', detail: 'd',
  package: 'gone', overridePath: ['overrides', 'gone'], pinValue: '1.0.0',
  packageManager: 'npm',
  remediation: { action: 'remove', patch: { op: 'remove', path: '/overrides/gone' }, explanation: 'safe' },
  references: [],
};

describe('renderJson', () => {
  it('produces a valid OverrideAuditOutput with schemaVersion=1', () => {
    const out = renderJson({ context: baseCtx, findings: [] }, {
      attemptId: 'rem_test', toolVersion: '0.1.0',
    });
    expect(out.schemaVersion).toBe('1');
    expect(out.tool).toBe('override-audit-cli');
    expect(out.attemptId).toBe('rem_test');
    expect(out.summary.findingCount).toBe(0);
  });

  it('summarizes findings by severity and by rule', () => {
    const out = renderJson(
      { context: baseCtx, findings: [sampleFinding, { ...sampleFinding, severity: 'high', ruleId: 'OA003-WRONG-SECTION' }] },
      { attemptId: 'rem_x', toolVersion: '0.1.0' },
    );
    expect(out.summary.findingCount).toBe(2);
    expect(out.summary.bySeverity.low).toBe(1);
    expect(out.summary.bySeverity.high).toBe(1);
    expect(out.summary.byRule['OA001']).toBe(1);
    expect(out.summary.byRule['OA003']).toBe(1);
  });

  it('records sub-codes under byRule with the sub-id', () => {
    const oa005: Finding = { ...sampleFinding, ruleId: 'OA005-NESTED-OVERRIDE', subRuleId: 'OA005.b-ORPHANED-OUTER' };
    const out = renderJson({ context: baseCtx, findings: [oa005] }, { attemptId: 'r', toolVersion: '0.1.0' });
    expect(out.summary.byRule['OA005.b']).toBe(1);
  });

  it('includes skippedDetectors when context has them', () => {
    const ctxWithSkip: Context = { ...baseCtx, skippedDetectors: [{ ruleId: 'OA001-ORPHAN-TARGET', reason: 'no lockfile' }] };
    const out = renderJson({ context: ctxWithSkip, findings: [] }, { attemptId: 'r', toolVersion: '0.1.0' });
    expect(out.skippedDetectors).toEqual([{ ruleId: 'OA001-ORPHAN-TARGET', reason: 'no lockfile' }]);
  });

  it('serializes to deterministic JSON (key order via JSON.stringify)', () => {
    const out = renderJson({ context: baseCtx, findings: [] }, { attemptId: 'r', toolVersion: '0.1.0' });
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});
