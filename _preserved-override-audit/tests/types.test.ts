import type {
  Finding, RuleId, Severity, RemediationAction, OverrideAuditOutput,
  RFC6902Patch, Context, PackageManager
} from '../src/types.js';

describe('types contract', () => {
  it('RuleId includes all five v1 rule codes', () => {
    const ids: RuleId[] = [
      'OA001-ORPHAN-TARGET',
      'OA002-FLOATING-TAG',
      'OA003-WRONG-SECTION',
      'OA004-INSTALLED-NEWER',
      'OA005-NESTED-OVERRIDE',
    ];
    expect(ids).toHaveLength(5);
  });

  it('Severity includes the five-level scale', () => {
    const levels: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    expect(levels).toHaveLength(5);
  });

  it('RemediationAction includes all four actions', () => {
    const actions: RemediationAction[] = ['remove', 'replace', 'move', 'suggest'];
    expect(actions).toHaveLength(4);
  });

  it('PackageManager v1 supports npm and pnpm only', () => {
    const pms: PackageManager[] = ['npm', 'pnpm'];
    expect(pms).toHaveLength(2);
  });

  it('Finding has the expected required fields', () => {
    const f: Finding = {
      ruleId: 'OA001-ORPHAN-TARGET',
      severity: 'low',
      title: 't', detail: 'd',
      package: 'p',
      overridePath: ['overrides', 'p'],
      pinValue: '1.0.0',
      packageManager: 'npm',
      remediation: {
        action: 'remove',
        patch: { op: 'remove', path: '/overrides/p' },
        explanation: 'safe',
      },
      references: [],
    };
    expect(f.ruleId).toBe('OA001-ORPHAN-TARGET');
  });

  it('OverrideAuditOutput has schemaVersion "1"', () => {
    const out: OverrideAuditOutput = {
      schemaVersion: '1',
      tool: 'override-audit-cli',
      toolVersion: '0.1.0',
      generatedAt: new Date().toISOString(),
      projectPath: '/x',
      packageManager: 'npm',
      attemptId: 'rem_test',
      summary: { findingCount: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, byRule: {} },
      findings: [],
    };
    expect(out.schemaVersion).toBe('1');
  });
});
