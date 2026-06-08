import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA001" as const;

export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some((s) => s.ruleId === RULE_ID)) return [];
  if (ctx.lockfilePackageNames.size === 0) return [];

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (ctx.lockfilePackageNames.has(entry.packageName)) continue;
    findings.push({
      ruleId: RULE_ID,
      severity: "high",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Override target not in resolved tree",
      details:
        `${entry.packageName} is declared in ${entry.container} but no package depends on it. ` +
        `The override has no effect.`,
      fix: {
        type: "rfc6902",
        patch: [{ op: "remove", path: jsonPointer(entry.path) }],
        runnableCommand: `cve-lite overrides --fix --rule OA001`,
      },
      references: [
        "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA001.md",
      ],
    });
  }
  return findings;
}
