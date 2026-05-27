import type { Context, Finding } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';

const RULE_ID = 'OA001-ORPHAN-TARGET' as const;

export function detect(ctx: Context): Finding[] {
  // Respect scanner's pre-marked skip (lockfile missing, etc.).
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  // Lockfile is the authoritative tree. If it's empty, we can't tell — bail.
  if (ctx.lockfilePackageNames.size === 0) return [];

  const findings: Finding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (ctx.lockfilePackageNames.has(entry.packageName)) continue;
    findings.push({
      ruleId: RULE_ID,
      severity: 'low',
      title: 'Override target not in resolved tree',
      detail: `${entry.packageName} is declared in ${entry.container} but no package depends on it. The override has no effect.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: typeof entry.value === 'string' ? entry.value : { ...entry.value },
      packageManager: ctx.packageManager,
      remediation: {
        action: 'remove',
        patch: { op: 'remove', path: jsonPointer(entry.path) },
        runnableFixCommand: `override-audit --fix --rule OA001 --target ${shellQuote(entry.packageName)}`,
        explanation: `Removing this override is safe: no package depends on ${entry.packageName}.`,
      },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA001.md'],
    });
  }
  return findings;
}

function shellQuote(s: string): string {
  return /[^A-Za-z0-9_@./:-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}
