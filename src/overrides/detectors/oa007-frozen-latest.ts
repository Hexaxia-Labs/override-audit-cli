import { looksLikeVersion, compareVersions } from "../../utils/version.js";
import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA007" as const;

const FLOATING_TAGS = new Set(["latest", "next"]);

/**
 * OA007 - the override pin is a floating tag (`latest` or `next`) AND the
 * installed version doesn't match what the registry currently advertises for
 * that tag. Indicates the override resolved to a version long ago and has
 * been frozen by the lockfile while the registry has moved on.
 *
 * Requires registry data: skipped when `--check-network` was not passed, when
 * the network call failed, or when the registry has no entry for the package.
 *
 * Note: This detector only consumes ctx.registryDistTags. It does NOT make
 * HTTP calls. The actual registry data is populated by the context builder
 * when checkNetwork: true.
 */
export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  // No registry data - caller didn't ask for it or fetch failed. Nothing to
  // report here; absence is signalled via skippedDetectors elsewhere.
  if (ctx.registryDistTags.size === 0) return [];

  const findings: OverrideFinding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== "string") continue;
    const tag = entry.value.trim().toLowerCase();
    if (!FLOATING_TAGS.has(tag)) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    if (!installed) continue;

    const tags = ctx.registryDistTags.get(entry.packageName);
    if (!tags) continue;

    const registryVersion = tags[tag];
    if (!registryVersion) continue;

    const installedValid = looksLikeVersion(installed);
    const registryValid = looksLikeVersion(registryVersion);
    if (!installedValid || !registryValid) continue;
    if (installed === registryVersion) continue;
    // Only flag if registry is *newer* than what's installed - that's the
    // "you're stuck behind the registry" failure mode.
    if (!(compareVersions(registryVersion, installed) > 0)) continue;

    findings.push({
      ruleId: RULE_ID,
      severity: "low",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Floating-tag override is frozen behind the registry",
      details:
        `${entry.packageName} is pinned to "${tag}", which resolved to ${installed} at install ` +
        `time and has been frozen there by the lockfile. The registry currently advertises ` +
        `${tag}=${registryVersion}. Your security-shaped pin is stale.`,
      fix: {
        type: "rfc6902",
        patch: [{ op: "replace", path: jsonPointer(entry.path), value: `>=${registryVersion}` }],
        runnableCommand: `cve-lite overrides --fix --rule OA007`,
      },
      references: ["https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA007.md"],
    });
  }

  return findings;
}
