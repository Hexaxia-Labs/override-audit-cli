import { resolve } from "node:path";
import type { ParsedOptions } from "../types.js";
import { buildOverrideContext, audit, applyFix } from "../overrides/index.js";
import type { OverrideFinding } from "../overrides/index.js";
import { createAuditLog } from "../audit-log/index.js";
import { EXIT_OK, EXIT_FINDINGS, EXIT_ERROR } from "../types.js";
import { renderOverrideFindings } from "../output/formatters.js";
import type { Logger } from "../overrides/context.js";

interface RunArgs {
  projectArg: string | undefined;
  options: ParsedOptions;
  logger: Logger;
}

export async function runOverrides({ projectArg, options, logger }: RunArgs): Promise<number> {
  const projectPath = resolve(projectArg ?? ".");
  const auditLog = createAuditLog(options.auditLog ?? process.env.CVE_LITE_AUDIT_LOG);

  try {
    const ctx = buildOverrideContext(projectPath, {
      auditLog,
      logger,
      checkNetwork: options.checkNetwork === true,
    });

    const result = await audit(ctx, { checkNetwork: options.checkNetwork === true });
    let findings = result.findings;

    if (options.rule) {
      findings = findings.filter((f) => f.ruleId === options.rule);
    }

    if (options.fix) {
      // Tier 1 only by default: "proposed" fixes write an inferred value (OA006
      // relocate floor) and are surfaced as recommendations, not auto-applied.
      const fixable = findings.filter(
        (f) => f.fix?.type === "rfc6902" && f.fix.tier !== "proposed"
      );
      if (fixable.length > 0) {
        const report = applyFix({
          projectPath,
          findings: fixable,
          auditLog,
          dryRun: false,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify({ findings, fixReport: report }, null, 2) + "\n");
        } else {
          logger.info(
            `Applied ${report.appliedPatches.length} fix${report.appliedPatches.length === 1 ? "" : "es"}; skipped ${report.skipped.length}.`
          );
          process.stdout.write(renderOverrideFindings(findings) + "\n");
        }
        return findings.length > 0 && reachedFailOn(findings, options.failOn)
          ? EXIT_FINDINGS
          : EXIT_OK;
      }
    }

    if (options.json) {
      process.stdout.write(JSON.stringify({ findings }, null, 2) + "\n");
    } else {
      process.stdout.write(renderOverrideFindings(findings) + "\n");
    }

    return findings.length > 0 && reachedFailOn(findings, options.failOn)
      ? EXIT_FINDINGS
      : EXIT_OK;
  } catch (err) {
    logger.error(`overrides: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_ERROR;
  } finally {
    auditLog.close();
  }
}

function reachedFailOn(findings: ReadonlyArray<OverrideFinding>, failOn: string): boolean {
  const rank: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const threshold = rank[failOn] ?? rank.critical;
  return findings.some((f) => (rank[f.severity] ?? 0) >= threshold);
}
