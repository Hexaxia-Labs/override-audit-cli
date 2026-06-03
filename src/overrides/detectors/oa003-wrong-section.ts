import type { OverrideContext, OverrideEntry } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA003" as const;

const EXPECTED_CONTAINER: Record<string, OverrideEntry["container"]> = {
  npm: "overrides",
  pnpm: "pnpm.overrides",
  yarn: "resolutions",
  bun: "overrides",
};

const EXPECTED_PATH_PREFIX: Record<string, string[]> = {
  npm: ["overrides"],
  pnpm: ["pnpm", "overrides"],
  yarn: ["resolutions"],
  bun: ["overrides"],
};

export function detect(ctx: OverrideContext): OverrideFinding[] {
  const expected = EXPECTED_CONTAINER[ctx.packageManager];
  const expectedPath = EXPECTED_PATH_PREFIX[ctx.packageManager];
  if (!expected || !expectedPath) return [];

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (entry.container === expected) continue;

    const destination = [...expectedPath, entry.key];

    findings.push({
      ruleId: RULE_ID,
      severity: "high",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Override declared in wrong package-manager section",
      details:
        `Project uses ${ctx.packageManager}, but override "${entry.key}" lives in ${entry.container}. ` +
        `${ctx.packageManager} silently ignores this section - the override has no effect.`,
      fix: {
        type: "rfc6902",
        patch: [{
          op: "move",
          from: jsonPointer(entry.path),
          path: jsonPointer(destination),
        }],
        runnableCommand: `cve-lite overrides --fix --rule OA003`,
      },
      references: [
        "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA003.md",
      ],
    });
  }
  return findings;
}
