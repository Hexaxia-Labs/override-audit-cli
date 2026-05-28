import semver from 'semver';
import type { Context, Finding } from '../types.js';

const RULE_ID = 'OA008-VULNERABLE-TWIN' as const;

/**
 * OA008 — the override declared a floor (range or exact-version pin) but an
 * installed copy somewhere in the tree is BELOW that floor. Most common cause
 * is a parent declaring an exact-pinned dep that wins over the override
 * (OA006's territory), but it also surfaces stale-lockfile and dedup-failure
 * scenarios. This is the post-install verification rule: "did the floor I
 * asked for actually get applied everywhere?"
 *
 * Considers every installed copy under node_modules, including nested ones.
 * Skips overrides whose value isn't a clean range/version (floating tags are
 * OA002's territory).
 */
export function detect(ctx: Context): Finding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: Finding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;
    const pinValue = entry.value.trim();
    if (!isCheckableFloor(pinValue)) continue;

    const copies = ctx.installedCopies.get(entry.packageName) ?? [];
    if (copies.length === 0) continue;

    const vulnerable = copies.filter(c => {
      const v = semver.valid(c.version);
      if (!v) return false;
      // For range pins, check `satisfies`. For exact pins, the floor is the pin itself.
      if (semver.validRange(pinValue) !== null && !isConcrete(pinValue)) {
        return !semver.satisfies(v, pinValue);
      }
      // Concrete pin: floor IS the pin; below it is vulnerable.
      const floor = semver.coerce(pinValue);
      return floor ? semver.lt(v, floor.version) : false;
    });

    if (vulnerable.length === 0) continue;

    const versions = vulnerable.map(c => c.version);
    const distinct = Array.from(new Set(versions)).sort();

    findings.push({
      ruleId: RULE_ID,
      severity: 'critical',
      title: 'Override floor not applied — vulnerable copy still on disk',
      detail:
        `Override demands ${entry.packageName} ${pinValue}, but ${vulnerable.length} ` +
        `installed copy${vulnerable.length === 1 ? '' : 'ies'} (${distinct.join(', ')}) ` +
        `${vulnerable.length === 1 ? 'is' : 'are'} below the floor. ` +
        `The override is not effective everywhere — likely a parent declares this dep ` +
        `as exact and wins resolution.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: entry.value,
      installedVersion: ctx.installedVersions.get(entry.packageName),
      packageManager: ctx.packageManager,
      remediation: {
        action: 'suggest',
        patch: null,
        runnableFixCommand:
          `# Investigate which parent is pinning ${entry.packageName} below the floor:\n` +
          `#   npm ls ${entry.packageName}\n` +
          `# Then override that parent instead (see OA006), and reinstall:\n` +
          `#   rm -rf node_modules package-lock.json && npm install`,
        explanation:
          `${vulnerable.length} vulnerable cop${vulnerable.length === 1 ? 'y' : 'ies'} of ` +
          `${entry.packageName} (${distinct.join(', ')}) remain installed. Override the ` +
          `parent that pins them, then reinstall to flush the lockfile.`,
      },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA008.md'],
    });
  }

  return findings;
}

/**
 * True if the pin value is something we can compare against a concrete version:
 * a valid semver range OR a concrete version. Excludes floating tags and
 * workspace/file/link protocols (those are OA002 or out of scope).
 */
function isCheckableFloor(value: string): boolean {
  if (value.startsWith('workspace:') || value.startsWith('file:') || value.startsWith('link:')) return false;
  if (semver.validRange(value) === null) return false;
  return true;
}

function isConcrete(value: string): boolean {
  return semver.valid(value) !== null;
}
