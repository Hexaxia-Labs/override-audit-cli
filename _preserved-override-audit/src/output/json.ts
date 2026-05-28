import type { OverrideAuditOutput, Severity, ScanResult } from '../types.js';

export interface RenderJsonOptions {
  attemptId: string;
  toolVersion: string;
  generatedAt?: string;   // override for tests
}

export function renderJson(result: ScanResult, opts: RenderJsonOptions): OverrideAuditOutput {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const byRule: Record<string, number> = {};

  for (const f of result.findings) {
    bySeverity[f.severity]++;
    // Use sub-code for OA005 entries, base rule prefix otherwise.
    const key = f.subRuleId
      ? f.subRuleId.split('-')[0]!         // "OA005.b-ORPHANED-OUTER" → "OA005.b"
      : f.ruleId.split('-')[0]!;            // "OA001-ORPHAN-TARGET" → "OA001"
    byRule[key] = (byRule[key] ?? 0) + 1;
  }

  const out: OverrideAuditOutput = {
    schemaVersion: '1',
    tool: 'override-audit-cli',
    toolVersion: opts.toolVersion,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    projectPath: result.context.projectPath,
    packageManager: result.context.packageManager,
    attemptId: opts.attemptId,
    summary: {
      findingCount: result.findings.length,
      bySeverity,
      byRule,
    },
    findings: result.findings,
  };

  if (result.context.skippedDetectors.length > 0) {
    out.skippedDetectors = result.context.skippedDetectors;
  }

  return out;
}
