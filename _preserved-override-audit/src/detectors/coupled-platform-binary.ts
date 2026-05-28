import semver from 'semver';
import type { Context, Finding, ParentDeclaration, Severity, RFC6902Patch, OverrideEntry } from '../types.js';
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

    // Build the multi-op patch: remove the binary override, add a parent override.
    // The parent-override path lives in the same container as the binary one
    // (top-level overrides for npm, pnpm.overrides for pnpm).
    const parentPath = buildParentOverridePath(entry, parentChoice.parentName);
    const existingParentEntry = findExistingOverride(ctx, parentChoice.parentName);

    let patches: RFC6902Patch[];
    if (existingParentEntry) {
      // Parent already has an override — replace its value with the suggested floor.
      // Single-op (no removal needed if the binary override doesn't exist… but it does).
      // Actually still multi-op: remove binary + replace existing parent.
      patches = [
        { op: 'remove', path: jsonPointer(entry.path) },
        { op: 'replace', path: jsonPointer(existingParentEntry.path), value: suggestedFloor },
      ];
    } else {
      // No existing parent override — remove binary + add new parent entry.
      patches = [
        { op: 'remove', path: jsonPointer(entry.path) },
        { op: 'add', path: jsonPointer(parentPath), value: suggestedFloor },
      ];
    }

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
        action: 'replace',
        patch: null,
        patches,
        runnableFixCommand: `override-audit --fix --rule OA006 --target ${entry.packageName}`,
        explanation:
          `Override the parent at a safe floor: "${parentChoice.parentName}": "${suggestedFloor}" ` +
          `(${existingParentEntry ? 'updating existing parent override' : 'adding new parent override'}); ` +
          `remove the current "${jsonPointer(entry.path).slice(1)}" entry. ` +
          `That bumps both the parent and its exact-pinned ${entry.packageName} together.`,
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

/**
 * Build the path where the parent-level override should go, mirroring the
 * container the original binary override lived in.
 *   ['overrides', '@esbuild/linux-x64']        → ['overrides', 'esbuild']
 *   ['pnpm', 'overrides', '@esbuild/linux-x64'] → ['pnpm', 'overrides', 'esbuild']
 */
function buildParentOverridePath(entry: OverrideEntry, parentName: string): string[] {
  const prefix = entry.path.slice(0, -1);
  return [...prefix, parentName];
}

/** Find an existing override entry by package name across all containers. */
function findExistingOverride(ctx: Context, packageName: string): OverrideEntry | undefined {
  return ctx.overrideEntries.find(e => e.packageName === packageName);
}
