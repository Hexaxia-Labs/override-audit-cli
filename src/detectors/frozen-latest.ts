import semver from 'semver';
import type { Context, Finding } from '../types.js';
import { jsonPointer } from '../fixer/json-pointer.js';

const RULE_ID = 'OA007-FROZEN-LATEST' as const;

const FLOATING_TAGS = new Set(['latest', 'next']);

/**
 * OA007 — the override pin is a floating tag (`latest` or `next`) AND the
 * installed version doesn't match what the registry currently advertises for
 * that tag. Indicates the override resolved to a version long ago and has
 * been frozen by the lockfile while the registry has moved on.
 *
 * Requires registry data: skipped (via Context.skippedDetectors note) when
 * `--with-registry` was not passed, when the network call failed, or when
 * the registry has no entry for the package.
 */
export function detect(ctx: Context): Finding[] {
  if (ctx.skippedDetectors.some(s => s.ruleId === RULE_ID)) return [];

  // No registry data → caller didn't ask for it or fetch failed. Nothing to
  // report here; absence is signalled via skippedDetectors elsewhere.
  if (ctx.registryDistTags.size === 0) return [];

  const findings: Finding[] = [];

  for (const entry of ctx.overrideEntries) {
    if (typeof entry.value !== 'string') continue;
    const tag = entry.value.trim().toLowerCase();
    if (!FLOATING_TAGS.has(tag)) continue;

    const installed = ctx.installedVersions.get(entry.packageName);
    if (!installed) continue;

    const tags = ctx.registryDistTags.get(entry.packageName);
    if (!tags) continue;

    const registryVersion = tags[tag];
    if (!registryVersion) continue;

    const installedValid = semver.valid(installed);
    const registryValid = semver.valid(registryVersion);
    if (!installedValid || !registryValid) continue;
    if (installedValid === registryValid) continue;
    // Only flag if registry is *newer* than what's installed — that's the
    // "you're stuck behind the registry" failure mode.
    if (!semver.gt(registryValid, installedValid)) continue;

    findings.push({
      ruleId: RULE_ID,
      severity: 'high',
      title: 'Floating-tag override is frozen behind the registry',
      detail:
        `${entry.packageName} is pinned to "${tag}", which resolved to ${installed} at install ` +
        `time and has been frozen there by the lockfile. The registry currently advertises ` +
        `${tag}=${registryVersion}. Your security-shaped pin is stale.`,
      package: entry.packageName,
      overridePath: entry.path,
      pinValue: entry.value,
      installedVersion: installed,
      packageManager: ctx.packageManager,
      remediation: {
        action: 'suggest',
        patch: null,
        runnableFixCommand:
          `# Replace the floating tag with a concrete floor at the current registry latest:\n` +
          `#   "${jsonPointer(entry.path).slice(1).replace(/\//g, '.')}": ">=${registryVersion}"\n` +
          `# Then: rm -rf node_modules package-lock.json && npm install`,
        explanation:
          `Replace "${tag}" with ">=${registryVersion}" — concrete floor encoding ` +
          `"never go below the current registry ${tag}". The resolver will pick the ` +
          `newest matching version going forward.`,
      },
      references: ['https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA007.md'],
    });
  }

  return findings;
}
