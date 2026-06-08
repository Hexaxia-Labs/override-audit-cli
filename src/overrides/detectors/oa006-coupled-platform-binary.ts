import type { OverrideContext, ParentDeclaration, OverrideEntry } from '../context.js';
import type { OverrideFinding } from '../types.js';
import { jsonPointer } from '../parsing/json-pointer.js';
import { compareVersions, looksLikeVersion } from '../../utils/version.js';
import { looksLikePlatformBinary } from './platform-binary.js';

const RULE_ID = 'OA006' as const;

/**
 * OA006 - the override target is a package that one or more INSTALLED parents
 * declare as an exact-version dependency. The override is fighting the parent's
 * pin: even if the user pins the binary to a newer version, npm/pnpm will either
 * emit EOVERRIDE warnings, refuse to dedup, or install both copies (leaving the
 * vulnerable one on disk). The right shape is a parent-level override.
 *
 * Common targets where this bites:
 *   - esbuild -> @esbuild/<platform>
 *   - @next/swc-* -> next
 *   - @rollup/rollup-* -> rollup
 *   - @swc/core-* -> @swc/core
 *   - sharp prebuilts
 */
export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: OverrideFinding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;  // OA005 territory
    const pinValue = entry.value.trim();

    const parents = ctx.parentDeclarations.get(entry.packageName) ?? [];
    // Only flag when at least one INSTALLED parent declares this as exact.
    const exactParents = parents.filter(p => p.exactVersion);
    if (exactParents.length === 0) continue;

    // If the pin equals every parent's exact version, the override is a no-op
    // (coincides with the parent) - don't flag here. OA001/OA004 may catch the
    // staleness from another angle.
    const allParentsAgree = exactParents.every(p => p.declaredValue === pinValue);
    if (allParentsAgree) continue;

    // Pick the most-cited parent to suggest as the override target. Ties broken
    // by first declared version (deterministic across runs).
    const parentChoice = chooseParent(exactParents);
    const suggestedFloor = suggestParentFloor(pinValue, parentChoice);

    // Severity tiers (refined in v0.1.2 per issue #8):
    //   - Platform-binary target -> high (binary-coupling failure mode is severe)
    //   - Non-platform target -> medium (often works; scanner may escalate
    //                            to high in post-processing if OA008 also
    //                            fires for the same target)
    const isPlatform = looksLikePlatformBinary(entry.packageName);
    const severity = isPlatform ? 'high' : 'medium';

    // The override on the binary cannot win against the parent's exact pin, so the
    // durable fix carries the constraint up to the parent. Two shapes:
    //   - parent already has an override: repin that existing override to the floor.
    //   - parent has no override: relocate - retire the binary override and add a
    //     parent DEPENDENCY floor (upgrade the parent), never a new override entry.
    // Both write an inferred floor, so the fix is tier "proposed" (surfaced, not
    // applied by default). See docs/merge/2026-06-08-relocate-op-design.md.
    const existingParentEntry = findExistingOverride(ctx, parentChoice.parentName);

    let patches: import('../types.js').OverrideFixOp[];
    if (existingParentEntry) {
      patches = [
        { op: 'remove', path: jsonPointer(entry.path) },
        { op: 'replace', path: jsonPointer(existingParentEntry.path), value: suggestedFloor },
      ];
    } else {
      patches = [
        {
          op: 'relocate',
          fromChild: jsonPointer(entry.path),
          toParent: parentChoice.parentName,
          floor: suggestedFloor,
        },
      ];
    }

    const finding: OverrideFinding = {
      ruleId: RULE_ID,
      severity,
      package: { name: entry.packageName },
      location: { file: 'package.json', jsonPath: jsonPointer(entry.path) },
      message: isPlatform
        ? 'Override on platform binary fights an exact-pinned parent'
        : 'Override fights an exact-pinned parent (currently effective, but fragile)',
      details:
        `${entry.packageName} is overridden to "${pinValue}", but its installed parent ` +
        `${parentChoice.parentName}@${parentChoice.parentVersion} declares it as exact ` +
        `(${parentChoice.declaredIn}: "${parentChoice.declaredValue}"). ` +
        `The override cannot replace the parent's pin - npm/pnpm will keep the parent's ` +
        `exact version on disk. Override the parent instead.`,
      fix: {
        type: 'rfc6902',
        patch: patches,
        runnableCommand: `cve-lite overrides --fix --rule OA006`,
        tier: 'proposed',
      },
      references: ['https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA006.md'],
    };

    findings.push(finding);
  }

  return findings;
}

function chooseParent(parents: ParentDeclaration[]): ParentDeclaration {
  // Sort by parent name then by parentVersion (semver-desc when possible) for stability.
  const sorted = [...parents].sort((a, b) => {
    if (a.parentName !== b.parentName) return a.parentName.localeCompare(b.parentName);
    if (looksLikeVersion(a.parentVersion) && looksLikeVersion(b.parentVersion)) {
      return compareVersions(b.parentVersion, a.parentVersion);
    }
    return 0;
  });
  return sorted[0]!;
}

/**
 * Suggest a floor for the parent override. We don't know what the user's
 * "safe" version is; the best guess is the latest parent version present in
 * the installed tree (>=-floor form so the resolver can pick newer too).
 */
function suggestParentFloor(_pin: string, parent: ParentDeclaration): string {
  const cleaned = looksLikeVersion(parent.parentVersion) ? parent.parentVersion : null;
  return cleaned ? `>=${cleaned}` : `>=${parent.parentVersion}`;
}

/**
 * Build the path where the parent-level override should go, mirroring the
 * container the original binary override lived in.
 *   ['overrides', '@esbuild/linux-x64'] -> ['overrides', 'esbuild']
 *   ['pnpm', 'overrides', '@esbuild/linux-x64'] -> ['pnpm', 'overrides', 'esbuild']
 */

/** Find an existing override entry by package name across all containers. */
function findExistingOverride(ctx: OverrideContext, packageName: string): OverrideEntry | undefined {
  return ctx.overrideEntries.find(e => e.packageName === packageName);
}
