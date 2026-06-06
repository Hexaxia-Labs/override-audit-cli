import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";
import { isValidRange } from "../../utils/version.js";
import { shellQuote } from "../../utils/string.js";

const RULE_ID = "OA002" as const;
const FLOATING = new Set(['latest', 'next', '*', 'x', '']);

export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;  // OA005 handles nested objects
    const v = entry.value.trim();
    if (v.startsWith('workspace:') || v.startsWith('file:') || v.startsWith('link:') || v.startsWith('npm:')) continue;

    const isFloating = FLOATING.has(v.toLowerCase());
    const isInvalidRange = !isFloating && !isValidRange(v);
    if (!isFloating && !isInvalidRange) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    const floor = installed ? `>=${installed}` : null;

    const finding: OverrideFinding = {
      ruleId: RULE_ID,
      severity: 'medium',
      package: { name: entry.packageName },
      location: { file: 'package.json', jsonPath: jsonPointer(entry.path) },
      message: 'Override pinned to floating tag',
      details: `${entry.packageName} is pinned to "${v}" - every install may re-resolve the version, defeating the override.`,
      references: ['https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA002.md'],
    };

    if (floor) {
      finding.fix = {
        type: 'rfc6902',
        patch: [{ op: 'replace', path: jsonPointer(entry.path), value: floor }],
        runnableCommand: `cve-lite overrides --fix --rule OA002 --target ${shellQuote(entry.packageName)}`,
      };
    }

    findings.push(finding);
  }
  return findings;
}
