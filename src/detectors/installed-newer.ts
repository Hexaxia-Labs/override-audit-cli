import semver from 'semver';
import type { Context, Finding } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';

const RULE_ID = 'OA004-INSTALLED-NEWER' as const;

export function detect(ctx: Context): Finding[] {
  const findings: Finding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;        // OA005 handles nested
    const pin = entry.value.trim();
    // Concrete version only — not a range, not a floating tag.
    if (semver.valid(pin) === null) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    if (!installed) continue;
    if (semver.valid(installed) === null) continue;
    if (!semver.gt(installed, pin)) continue;

    // Safety heuristic for v1: same major → safe remove; otherwise suggest.
    // Fuller "parent depends on >=pin" check deferred (Spec §12.1).
    const safe = semver.major(installed) === semver.major(pin);

    findings.push({
      ruleId: RULE_ID,
      severity: 'low',
      title: 'Installed version surpasses concrete pin',
      detail:
        `${entry.packageName} is pinned to ${pin}; node_modules has ${installed}. ` +
        `The override no longer raises the floor.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: entry.value,
      installedVersion: installed,
      packageManager: ctx.packageManager,
      remediation: safe
        ? {
            action: 'remove',
            patch: { op: 'remove', path: jsonPointer(entry.path) },
            runnableFixCommand: `override-audit --fix --rule OA004 --target ${entry.packageName}`,
            explanation: `Installed ${installed} is in the same major as pin ${pin} — removing is safe.`,
          }
        : {
            action: 'suggest',
            patch: null,
            explanation:
              `Installed ${installed} crosses a major boundary above pin ${pin}. ` +
              `Manually verify nothing depends on the lower major before removing.`,
          },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA004.md'],
    });
  }
  return findings;
}
