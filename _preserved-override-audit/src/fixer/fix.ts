import type {
  ScanResult, FixReport, FixOptions, AppliedPatch, SkippedForFix, Finding, RFC6902Patch,
} from '../types.js';
import { SEVERITY_RANK } from '../types.js';
import { applyPatches } from './apply.js';
import { writePackageJson } from './write.js';
import { scan } from '../scanner.js';
import { NullLogger, type ChangeControlLogger } from '../logging/change-control.js';

/** Optional change-control logging context, threaded onto records. */
export interface FixLoggingContext {
  toolVersion: string;
  source?: string;
  advisory?: string;
  meta?: Record<string, string>;
}

/**
 * Build a deterministic finding key for cross-scan diffing.
 * package + ruleId + subRuleId + jsonPointer uniquely identifies a finding.
 */
function findingKey(f: Finding): string {
  return [
    f.ruleId,
    f.subRuleId ?? '',
    f.package,
    f.overridePath.join('/'),
  ].join('|');
}

/**
 * Apply the patches emitted by all currently-active findings, write
 * package.json back to disk, and (unless rescan=false) re-scan to confirm
 * the fixes landed without introducing regressions.
 *
 * Suggest-only findings (patch=null) are recorded under skippedFindings —
 * they need human attention. Findings below the severity floor or excluded
 * by ruleFilters are also skipped.
 *
 * In dry-run mode no file writes occur and the rescan is skipped (since
 * the disk state is unchanged, the rescan would return identical findings).
 */
export async function fix(
  result: ScanResult,
  opts: FixOptions,
  attemptId: string,
  logger: ChangeControlLogger = new NullLogger(),
  logCtx: FixLoggingContext = { toolVersion: '0.0.0-unknown' },
): Promise<FixReport> {
  const applied: AppliedPatch[] = [];
  const skipped: SkippedForFix[] = [];
  const baseRecord = {
    attemptId,
    tool: 'override-audit-cli' as const,
    toolVersion: logCtx.toolVersion,
  };

  // remediation_attempt — emitted once at start, before any patch.
  logger.log({
    ...baseRecord,
    type: 'remediation_attempt',
    timestamp: new Date().toISOString(),
    level: 'info',
    projectPath: result.context.projectPath,
    source: logCtx.source,
    advisory: logCtx.advisory,
    meta: logCtx.meta,
    dryRun: opts.dryRun,
  });

  const baseDoc = JSON.parse(result.context.packageJsonRaw) as unknown;
  let currentDoc: unknown = baseDoc;

  for (const f of result.findings) {
    // Severity floor.
    if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[opts.severityFloor]) {
      const skipRecord = {
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        reason: `below severity floor (${f.severity} < ${opts.severityFloor})`,
      };
      skipped.push(skipRecord);
      logger.log({
        ...baseRecord, type: 'remediation_skipped', timestamp: new Date().toISOString(),
        level: 'debug', ...skipRecord,
      });
      continue;
    }

    // Rule filter (base ID or sub-ID).
    const baseCode = f.ruleId.split('-')[0]!;
    const subCode = f.subRuleId?.split('-')[0];
    if (opts.ruleFilters.get(baseCode) === false || (subCode && opts.ruleFilters.get(subCode) === false)) {
      const skipRecord = {
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        reason: 'filtered by --rule',
      };
      skipped.push(skipRecord);
      logger.log({
        ...baseRecord, type: 'remediation_skipped', timestamp: new Date().toISOString(),
        level: 'debug', ...skipRecord,
      });
      continue;
    }

    // OA005.e is info-level — only fix it when includeSubSuspect is set.
    if (f.subRuleId === 'OA005.e-SUSPECT' && !opts.includeSubSuspect) {
      const skipRecord = {
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        reason: 'OA005.e-SUSPECT excluded by default; pass --include-sub-suspect to fix',
      };
      skipped.push(skipRecord);
      logger.log({
        ...baseRecord, type: 'remediation_skipped', timestamp: new Date().toISOString(),
        level: 'debug', ...skipRecord,
      });
      continue;
    }

    // Resolve patches: prefer multi-op `patches`, fall back to single-op `patch`.
    const patches: RFC6902Patch[] =
      f.remediation.patches && f.remediation.patches.length > 0
        ? f.remediation.patches
        : f.remediation.patch
          ? [f.remediation.patch]
          : [];

    if (patches.length === 0) {
      const skipRecord = {
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        reason: `${f.remediation.action}-only (no automated patch)`,
      };
      skipped.push(skipRecord);
      logger.log({
        ...baseRecord, type: 'remediation_skipped', timestamp: new Date().toISOString(),
        level: 'info', ...skipRecord,
      });
      continue;
    }

    // Apply.
    try {
      currentDoc = applyPatches(currentDoc, patches);
      const appliedRecord = {
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        patch: patches[0]!,
        patches,
      };
      applied.push(appliedRecord);
      logger.log({
        ...baseRecord, type: 'remediation_applied', timestamp: new Date().toISOString(),
        level: 'info',
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package, patches,
      });
    } catch (err) {
      const failureReason = `patch failed to apply: ${(err as Error).message}`;
      skipped.push({
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        reason: failureReason,
      });
      logger.log({
        ...baseRecord, type: 'remediation_failed', timestamp: new Date().toISOString(),
        level: 'error',
        ruleId: f.ruleId, subRuleId: f.subRuleId, package: f.package,
        error: (err as Error).message,
      });
    }
  }

  // Write to disk unless dry-run.
  if (!opts.dryRun && applied.length > 0) {
    writePackageJson(result.context.projectPath, currentDoc, result.context.packageJsonRaw);
  }

  // Post-fix rescan (skipped on dry-run or when explicitly disabled). The rescan
  // applies the same severity/rule/sub-suspect filtering as the pre-fix CLI
  // session so the diff is apples-to-apples: a previously-filtered finding
  // shouldn't appear in `newFindings` just because the post-scan saw it.
  let remainingFindings: Finding[] | null = null;
  let newFindings: Finding[] = [];
  if (opts.rescan && !opts.dryRun && applied.length > 0) {
    const preKeys = new Set(result.findings.map(findingKey));
    const post = await scan(result.context.projectPath);
    const postFiltered = post.findings.filter((f) => {
      if (SEVERITY_RANK[f.severity] < SEVERITY_RANK[opts.severityFloor]) return false;
      const baseCode = f.ruleId.split('-')[0]!;
      const subCode = f.subRuleId?.split('-')[0];
      if (opts.ruleFilters.get(baseCode) === false) return false;
      if (subCode && opts.ruleFilters.get(subCode) === false) return false;
      if (f.subRuleId === 'OA005.e-SUSPECT' && !opts.includeSubSuspect) return false;
      return true;
    });
    remainingFindings = postFiltered;
    newFindings = postFiltered.filter(f => !preKeys.has(findingKey(f)));
  }

  // remediation_complete — final summary record. Exit code is computed by the
  // CLI; we pass the apparent code based on outcomes so consumers can read it
  // from the log without needing to know the CLI's exact mapping.
  const apparentExit: 0 | 1 | 2 =
    (remainingFindings && remainingFindings.length > 0) || newFindings.length > 0 ? 1 : 0;
  logger.log({
    ...baseRecord,
    type: 'remediation_complete',
    timestamp: new Date().toISOString(),
    level: 'info',
    summary: {
      applied: applied.length,
      skipped: skipped.length,
      failed: skipped.filter(s => s.reason.startsWith('patch failed to apply')).length,
      remainingFindings: remainingFindings ? remainingFindings.length : null,
      newFindings: newFindings.length,
    },
    exitCode: apparentExit,
  });

  return {
    attemptId,
    appliedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    appliedPatches: applied,
    skippedFindings: skipped,
    remainingFindings,
    newFindings,
  };
}
