import { audit, verify, applyFix, buildOverrideContext } from "../overrides/index.js";
import type { OverrideFinding } from "../overrides/types.js";
import type { AuditLogHandle } from "../audit-log/index.js";
import type { Logger } from "../overrides/context.js";

export interface VerifyTarget {
  name: string;
  version?: string;
}

export interface FixHookArgs {
  projectPath: string;
  auditLog: AuditLogHandle;
  logger: Logger;
  /**
   * Packages that cve-lite's CVE-fix pipeline already touched (via `npm install`,
   * `pnpm add`, or `yarn add`). Verify runs OA001/OA008 against these alongside any
   * OA-fix targets to catch "package manager reported success but a vulnerable copy
   * is still nested under a parent dep."
   */
  cveFixTargets?: ReadonlyArray<VerifyTarget>;
  /** Optional filter applied before applying OA patches. Useful for tests and --rule. */
  filterFindings?: (findings: OverrideFinding[]) => OverrideFinding[];
}

export interface FixHookResult {
  applied: number;
  skipped: number;
  verifyOk: boolean;
  verifyFailures: ReadonlyArray<{ ruleId: string; package: string; reason: string }>;
}

export async function runOverridesFixHook(args: FixHookArgs): Promise<FixHookResult> {
  const ctx = buildOverrideContext(args.projectPath, {
    auditLog: args.auditLog,
    logger: args.logger,
    checkNetwork: false,
  });

  const auditResult = await audit(ctx, { checkNetwork: false });
  let fixable = auditResult.findings.filter((f) => f.fix?.type === "rfc6902");
  if (args.filterFindings) fixable = args.filterFindings(fixable);

  let appliedTargets: VerifyTarget[] = [];
  let applied = 0;
  let skipped = 0;

  if (fixable.length > 0) {
    const report = applyFix({
      projectPath: args.projectPath,
      findings: fixable,
      auditLog: args.auditLog,
      dryRun: false,
    });
    applied = report.appliedPatches.length;
    skipped = report.skipped.length;
    appliedTargets = report.appliedPatches.map((p) => ({ name: p.package }));
  }

  // Verify the union of CVE-touched and OA-touched targets.
  const verifyTargets = dedupeTargets([
    ...(args.cveFixTargets ?? []),
    ...appliedTargets,
  ]);

  if (verifyTargets.length === 0) {
    return { applied, skipped, verifyOk: true, verifyFailures: [] };
  }

  // Rebuild context after the on-disk package.json changed.
  const ctxAfter = buildOverrideContext(args.projectPath, {
    auditLog: args.auditLog,
    logger: args.logger,
    checkNetwork: false,
  });

  const verifyResult = await verify(verifyTargets, ctxAfter);

  return {
    applied,
    skipped,
    verifyOk: verifyResult.ok,
    verifyFailures: verifyResult.findings.map((f) => ({
      ruleId: f.ruleId,
      package: f.package.name,
      reason: f.message,
    })),
  };
}

function dedupeTargets(targets: ReadonlyArray<VerifyTarget>): VerifyTarget[] {
  const seen = new Set<string>();
  const out: VerifyTarget[] = [];
  for (const t of targets) {
    if (seen.has(t.name)) continue;
    seen.add(t.name);
    out.push(t);
  }
  return out;
}
