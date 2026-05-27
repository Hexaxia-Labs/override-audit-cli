import semver from 'semver';
import type { Context, Finding } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';

const RULE_ID = 'OA002-FLOATING-TAG' as const;
const FLOATING = new Set(['latest', 'next', '*', 'x', '']);

export function detect(ctx: Context): Finding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: Finding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;  // OA005 handles nested objects
    const v = entry.value.trim();
    if (v.startsWith('workspace:') || v.startsWith('file:') || v.startsWith('link:')) continue;

    const isFloating = FLOATING.has(v.toLowerCase());
    const isInvalidRange = !isFloating && semver.validRange(v) === null;
    if (!isFloating && !isInvalidRange) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    const floor = installed ? `>=${installed}` : null;

    findings.push({
      ruleId: RULE_ID,
      severity: 'medium',
      title: 'Override pinned to floating tag',
      detail: `${entry.packageName} is pinned to "${v}" — every install may re-resolve the version, defeating the override.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: entry.value,
      installedVersion: installed,
      packageManager: ctx.packageManager,
      remediation: floor
        ? {
            action: 'replace',
            patch: { op: 'replace', path: jsonPointer(entry.path), value: floor },
            runnableFixCommand: `override-audit --fix --rule OA002 --target ${entry.packageName}`,
            explanation: `Replace floating "${v}" with concrete floor ${floor} (installed version).`,
          }
        : {
            action: 'suggest',
            patch: null,
            explanation: `Cannot suggest a floor: ${entry.packageName} is not installed under node_modules. Install dependencies and re-run.`,
          },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA002.md'],
    });
  }
  return findings;
}
