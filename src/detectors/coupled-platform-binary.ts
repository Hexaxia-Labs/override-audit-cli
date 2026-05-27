import semver from 'semver';
import type { Context, Finding, ParentDeclaration, Severity } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';
import { looksLikePlatformBinary } from './platform-binary.js';

const RULE_ID = 'OA006-COUPLED-PLATFORM-BINARY' as const;

/**
 * OA006 — the override target is a package that one or more INSTALLED parents
 * declare as an exact-version dependency. The override is fighting the parent's
 * pin: even if the user pins the binary to a newer version, npm/pnpm will either
 * emit EOVERRIDE warnings, refuse to dedup, or install both copies (leaving the
 * vulnerable one on disk). The right shape is a parent-level override.
 *
 * Common targets where this bites:
 *   - esbuild       → @esbuild/<platform>
 *   - @next/swc-*   → next
 *   - @rollup/rollup-*  → rollup
 *   - @swc/core-*   → @swc/core
 *   - sharp prebuilts
 */
export function detect(ctx: Context): Finding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: Finding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;  // OA005 territory
    const pinValue = entry.value.trim();

    const parents = ctx.parentDeclarations.get(entry.packageName) ?? [];
    // Only flag when at least one INSTALLED parent declares this as exact.
    const exactParents = parents.filter(p => p.exactVersion);
    if (exactParents.length === 0) continue;

    // If the pin equals every parent's exact version, the override is a no-op
    // (coincides with the parent) — don't flag here. OA001/OA004 may catch the
    // staleness from another angle.
    const allParentsAgree = exactParents.every(p => p.declaredValue === pinValue);
    if (allParentsAgree) continue;

    // Pick the most-cited parent to suggest as the override target. Ties broken
    // by first declared version (deterministic across runs).
    const parentChoice = chooseParent(exactParents);
    const suggestedFloor = suggestParentFloor(pinValue, parentChoice);

    // Severity tiers (refined in v0.1.2 per issue #8):
    //   - Platform-binary target  → high (binary-coupling failure mode is severe)
    //   - Non-platform target     → medium (often works; scanner may escalate
    //                              to high in post-processing if OA008 also
    //                              fires for the same target)
    const isPlatform = looksLikePlatformBinary(entry.packageName);
    const severity: Severity = isPlatform ? 'high' : 'medium';

    findings.push({
      ruleId: RULE_ID,
      severity,
      title: isPlatform
        ? 'Override on platform binary fights an exact-pinned parent'
        : 'Override fights an exact-pinned parent (currently effective, but fragile)',
      detail:
        `${entry.packageName} is overridden to "${pinValue}", but its installed parent ` +
        `${parentChoice.parentName}@${parentChoice.parentVersion} declares it as exact ` +
        `(${parentChoice.declaredIn}: "${parentChoice.declaredValue}"). ` +
        `The override cannot replace the parent's pin — npm/pnpm will keep the parent's ` +
        `exact version on disk. Override the parent instead.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: entry.value,
      installedVersion: ctx.installedVersions.get(entry.packageName),
      packageManager: ctx.packageManager,
      remediation: {
        action: 'suggest',
        patch: null,
        runnableFixCommand:
          `# Replace the platform-binary override with a parent override:\n` +
          `#   "overrides": { "${parentChoice.parentName}": "${suggestedFloor}" }\n` +
          `# Then: rm -rf node_modules package-lock.json && npm install`,
        explanation:
          `Override the parent at a safe floor: "${parentChoice.parentName}": "${suggestedFloor}". ` +
          `That bumps both the parent and its exact-pinned ${entry.packageName} together. ` +
          `Remove the current "${jsonPointer(entry.path).slice(1)}" entry.`,
      },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA006.md'],
    });
  }

  return findings;
}

function chooseParent(parents: ParentDeclaration[]): ParentDeclaration {
  // Sort by parent name then by parentVersion (semver-desc when possible) for stability.
  const sorted = [...parents].sort((a, b) => {
    if (a.parentName !== b.parentName) return a.parentName.localeCompare(b.parentName);
    const av = semver.valid(a.parentVersion);
    const bv = semver.valid(b.parentVersion);
    if (av && bv) return semver.rcompare(av, bv);
    return 0;
  });
  return sorted[0]!;
}

/**
 * Suggest a floor for the parent override. We don't know what the user's
 * "safe" version is; the best guess is the latest parent version present in
 * the installed tree (≥-floor form so the resolver can pick newer too).
 */
function suggestParentFloor(_pin: string, parent: ParentDeclaration): string {
  const cleaned = semver.valid(parent.parentVersion);
  return cleaned ? `>=${cleaned}` : `>=${parent.parentVersion}`;
}
