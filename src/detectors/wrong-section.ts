import type { Context, Finding } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';

const RULE_ID = 'OA003-WRONG-SECTION' as const;

export function detect(ctx: Context): Finding[] {
  const findings: Finding[] = [];
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
      title: 'Override declared in wrong package-manager section',
      detail:
        `Project uses ${ctx.packageManager}, but override "${entry.key}" lives in ${entry.container}. ` +
        `${ctx.packageManager} silently ignores this section — the override has no effect.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: typeof entry.value === 'string' ? entry.value : { ...entry.value },
      packageManager: ctx.packageManager,
      remediation: {
        action: 'move',
        patch: { op: 'move', from: jsonPointer(entry.path), path: jsonPointer(destinationPath) },
        runnableFixCommand: `override-audit --fix --rule OA003`,
        explanation: `Move from ${entry.container} into the ${ctx.packageManager}-recognised location.`,
      },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA003.md'],
    });
  }
  return findings;
}
