import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA003" as const;

export function detect(ctx: OverrideContext): OverrideFinding[] {
  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    const misplaced =
      (ctx.packageManager === 'npm' && entry.container === 'pnpm.overrides') ||
      (ctx.packageManager === 'pnpm' && entry.container === 'overrides');
    if (!misplaced) continue;

    const destinationPath =
      ctx.packageManager === 'npm'
        ? ['overrides', entry.key]
        : ['pnpm', 'overrides', entry.key];

    findings.push({
      ruleId: RULE_ID,
      severity: 'high',
      package: { name: entry.packageName },
      location: { file: 'package.json', jsonPath: jsonPointer(entry.path) },
      message: 'Override declared in wrong package-manager section',
      details:
        `Project uses ${ctx.packageManager}, but override "${entry.key}" lives in ${entry.container}. ` +
        `${ctx.packageManager} silently ignores this section - the override has no effect.`,
      fix: {
        type: 'rfc6902',
        patch: [{ op: 'move', from: jsonPointer(entry.path), path: jsonPointer(destinationPath) }],
        runnableCommand: `cve-lite overrides --fix --rule OA003`,
      },
      references: ['https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA003.md'],
    });
  }
  return findings;
}
