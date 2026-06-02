import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";
import { compareVersions, looksLikeVersion, majorVersion } from "../../utils/version.js";

const RULE_ID = "OA004" as const;

export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some((s) => s.ruleId === RULE_ID)) return [];

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== "string") continue;        // OA005 handles nested
    const pin = entry.value.trim();
    // Concrete version only - not a range, not a floating tag.
    if (!looksLikeVersion(pin)) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    if (!installed) continue;
    if (!looksLikeVersion(installed)) continue;
    if (!(compareVersions(installed, pin) > 0)) continue;

    // Safety heuristic for v1: same major -> safe remove; otherwise suggest.
    // Fuller "parent depends on >=pin" check deferred (Spec 12.1).
    const installedMajor = majorVersion(installed);
    const pinMajor = majorVersion(pin);
    const safe = installedMajor !== null && pinMajor !== null && installedMajor === pinMajor;

    const finding: import("../types.js").OverrideFinding = {
      ruleId: RULE_ID,
      severity: "low",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Installed version surpasses concrete pin",
      details:
        `${entry.packageName} is pinned to ${pin}; node_modules has ${installed}. ` +
        `The override no longer raises the floor.`,
      references: [
        "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA004.md",
      ],
    };

    if (safe) {
      finding.fix = {
        type: "rfc6902",
        patch: [{ op: "remove", path: jsonPointer(entry.path) }],
        runnableCommand: `cve-lite overrides --fix --rule OA004 --target ${shellQuote(entry.packageName)}`,
      };
    }

    findings.push(finding);
  }
  return findings;
}

function shellQuote(s: string): string {
  return /[^A-Za-z0-9_@./:-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}
