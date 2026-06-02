import { satisfiesRange, coerceVersion, compareVersions, looksLikeVersion, isValidRange } from "../../utils/version.js";
import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA008" as const;

/**
 * OA008 - the override declared a floor (range or exact-version pin) but an
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
export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  const findings: OverrideFinding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== "string") continue;
    const pinValue = entry.value.trim();
    if (!isCheckableFloor(pinValue)) continue;

    const copies = ctx.installedCopies.get(entry.packageName) ?? [];
    if (copies.length === 0) continue;

    const vulnerable = copies.filter(c => {
      const v = looksLikeVersion(c.version);
      if (!v) return false;
      // For range pins, check `satisfiesRange`. For exact pins, the floor is the pin itself.
      if (isValidRange(pinValue) && !isConcrete(pinValue)) {
        return !satisfiesRange(c.version, pinValue);
      }
      // Concrete pin: floor IS the pin; below it is vulnerable.
      const floor = coerceVersion(pinValue);
      return floor ? compareVersions(c.version, floor) < 0 : false;
    });

    if (vulnerable.length === 0) continue;

    const versions = vulnerable.map(c => c.version);
    const distinct = Array.from(new Set(versions)).sort();

    findings.push({
      ruleId: RULE_ID,
      severity: "critical",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Override floor not applied - vulnerable copy still on disk",
      details:
        `Override demands ${entry.packageName} ${pinValue}, but ${vulnerable.length} ` +
        `installed copy${vulnerable.length === 1 ? "" : "ies"} (${distinct.join(", ")}) ` +
        `${vulnerable.length === 1 ? "is" : "are"} below the floor. ` +
        `The override is not effective everywhere - likely a parent declares this dep ` +
        `as exact and wins resolution.`,
      references: ["https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA008.md"],
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
  if (value.startsWith("workspace:") || value.startsWith("file:") || value.startsWith("link:")) return false;
  if (!isValidRange(value)) return false;
  return true;
}

function isConcrete(value: string): boolean {
  return looksLikeVersion(value);
}
