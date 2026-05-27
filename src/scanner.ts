import { existsSync } from 'fs';
import { join } from 'path';
import type { Context, Finding, ScanResult, RuleId } from './types.js';
import { detectPackageManager } from './parsers/package-manager.js';
import { readPackageJson, extractOverrideEntries } from './parsers/package-json.js';
import { readLockfilePackages } from './parsers/lockfile.js';
import { readInstalledVersion } from './parsers/node-modules.js';
import { walkInstalledTree } from './parsers/installed-tree.js';
import { fetchDistTagsBatch, type RegistryClientOptions } from './parsers/registry.js';
import { detect as detectOrphan } from './detectors/orphan.js';
import { detect as detectFloatingTag } from './detectors/floating-tag.js';
import { detect as detectWrongSection } from './detectors/wrong-section.js';
import { detect as detectInstalledNewer } from './detectors/installed-newer.js';
import { detect as detectNestedOverride } from './detectors/nested-override.js';
import { detect as detectCoupledPlatformBinary } from './detectors/coupled-platform-binary.js';
import { detect as detectVulnerableTwin } from './detectors/vulnerable-twin.js';
import { detect as detectFrozenLatest } from './detectors/frozen-latest.js';

export interface ScanOptions {
  ruleFilters?: Map<string, boolean>;   // ruleId or sub-code → enabled
  /** Opt in to registry calls for OA007. Off by default — runs are local-only. */
  withRegistry?: boolean;
  /** Registry client options (baseUrl, timeoutMs, fetchImpl). Used only when withRegistry=true. */
  registry?: RegistryClientOptions;
}

export async function scan(projectPath: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const pm = detectPackageManager(projectPath);
  const { parsed, raw } = readPackageJson(projectPath);
  const overrideEntries = extractOverrideEntries(parsed);
  const lockfilePackageNames = readLockfilePackages(projectPath, pm);

  const skipped: { ruleId: RuleId; reason: string }[] = [];
  const nodeModulesExists = existsSync(join(projectPath, 'node_modules'));

  if (lockfilePackageNames.size === 0 && overrideEntries.length > 0) {
    skipped.push({ ruleId: 'OA001-ORPHAN-TARGET', reason: 'lockfile missing or empty — orphan check disabled' });
  }
  if (!nodeModulesExists && overrideEntries.length > 0) {
    skipped.push({ ruleId: 'OA004-INSTALLED-NEWER', reason: 'node_modules missing — installed-version check disabled' });
    skipped.push({ ruleId: 'OA006-COUPLED-PLATFORM-BINARY', reason: 'node_modules missing — parent-declaration check disabled' });
    skipped.push({ ruleId: 'OA008-VULNERABLE-TWIN', reason: 'node_modules missing — installed-copies check disabled' });
  }

  const installedVersions = new Map<string, string>();
  for (const entry of overrideEntries) {
    const v = readInstalledVersion(projectPath, entry.packageName);
    if (v) installedVersions.set(entry.packageName, v);
    // For nested entries, also try to populate inner names so OA005.d works.
    if (typeof entry.value === 'object' && entry.value) {
      for (const innerKey of Object.keys(entry.value)) {
        const iv = readInstalledVersion(projectPath, innerKey);
        if (iv) installedVersions.set(innerKey, iv);
      }
    }
  }

  // OA006/OA008 need the full installed tree (parents + every copy of each pkg).
  const tree = nodeModulesExists
    ? walkInstalledTree(projectPath)
    : { installedCopies: new Map(), parentDeclarations: new Map() };

  // OA007 needs registry data — opt-in only.
  let registryDistTags = new Map<string, never>() as Context['registryDistTags'];
  if (opts.withRegistry) {
    const overrideNames = overrideEntries
      .filter(e => typeof e.value === 'string')
      .map(e => e.packageName);
    if (overrideNames.length === 0) {
      // No-op: nothing to fetch.
    } else {
      registryDistTags = await fetchDistTagsBatch(overrideNames, opts.registry ?? {});
      if (registryDistTags.size === 0) {
        skipped.push({ ruleId: 'OA007-FROZEN-LATEST', reason: 'registry calls returned no data — network unreachable or all packages absent' });
      }
    }
  } else if (overrideEntries.some(e => typeof e.value === 'string' && /^(latest|next)$/i.test(e.value.trim()))) {
    skipped.push({ ruleId: 'OA007-FROZEN-LATEST', reason: '--with-registry not passed — frozen-latest check disabled (offline by default)' });
  }

  const context: Context = {
    projectPath,
    packageJson: parsed,
    packageJsonRaw: raw,
    packageManager: pm,
    overrideEntries,
    lockfilePackageNames,
    installedVersions,
    installedCopies: tree.installedCopies,
    parentDeclarations: tree.parentDeclarations,
    registryDistTags,
    skippedDetectors: skipped,
  };

  const rawFindings: Finding[] = [
    ...detectOrphan(context),
    ...detectFloatingTag(context),
    ...detectWrongSection(context),
    ...detectInstalledNewer(context),
    ...detectNestedOverride(context),
    ...detectCoupledPlatformBinary(context),
    ...detectVulnerableTwin(context),
    ...detectFrozenLatest(context),
  ];

  // Dedup: OA005 wins over OA001 when both fire on the same outer key (more specific framing).
  const oa005Outers = new Set(
    rawFindings.filter(f => f.ruleId === 'OA005-NESTED-OVERRIDE').map(f => f.package),
  );
  const dedupedFindings = rawFindings.filter(f =>
    !(f.ruleId === 'OA001-ORPHAN-TARGET' && oa005Outers.has(f.package))
  );

  // OA006/OA008 composite: if OA008 also fires for a target, the OA006 risk has
  // materialized — escalate OA006 to 'high' regardless of platform-binary heuristic.
  const oa008Targets = new Set(
    dedupedFindings.filter(f => f.ruleId === 'OA008-VULNERABLE-TWIN').map(f => f.package),
  );
  const findings = dedupedFindings.map((f) => {
    if (f.ruleId === 'OA006-COUPLED-PLATFORM-BINARY' && f.severity === 'medium' && oa008Targets.has(f.package)) {
      return {
        ...f,
        severity: 'high' as const,
        title: 'Override fights an exact-pinned parent (vulnerable copy on disk — OA008 confirms)',
      };
    }
    return f;
  });

  return { context, findings };
}
