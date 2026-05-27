import { existsSync } from 'fs';
import { join } from 'path';
import type { Context, Finding, ScanResult, RuleId } from './types.js';
import { detectPackageManager } from './parsers/package-manager.js';
import { readPackageJson, extractOverrideEntries } from './parsers/package-json.js';
import { readLockfilePackages } from './parsers/lockfile.js';
import { readInstalledVersion } from './parsers/node-modules.js';
import { detect as detectOrphan } from './detectors/orphan.js';
import { detect as detectFloatingTag } from './detectors/floating-tag.js';
import { detect as detectWrongSection } from './detectors/wrong-section.js';
import { detect as detectInstalledNewer } from './detectors/installed-newer.js';
import { detect as detectNestedOverride } from './detectors/nested-override.js';

export interface ScanOptions {
  ruleFilters?: Map<string, boolean>;   // ruleId or sub-code → enabled
}

export async function scan(projectPath: string, _opts: ScanOptions = {}): Promise<ScanResult> {
  const pm = detectPackageManager(projectPath);
  const { parsed, raw } = readPackageJson(projectPath);
  const overrideEntries = extractOverrideEntries(parsed);
  const lockfilePackageNames = readLockfilePackages(projectPath, pm);

  const skipped: { ruleId: RuleId; reason: string }[] = [];
  if (lockfilePackageNames.size === 0 && overrideEntries.length > 0) {
    skipped.push({ ruleId: 'OA001-ORPHAN-TARGET', reason: 'lockfile missing or empty — orphan check disabled' });
  }
  if (!existsSync(join(projectPath, 'node_modules')) && overrideEntries.length > 0) {
    skipped.push({ ruleId: 'OA004-INSTALLED-NEWER', reason: 'node_modules missing — installed-version check disabled' });
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

  const context: Context = {
    projectPath,
    packageJson: parsed,
    packageJsonRaw: raw,
    packageManager: pm,
    overrideEntries,
    lockfilePackageNames,
    installedVersions,
    skippedDetectors: skipped,
  };

  const rawFindings: Finding[] = [
    ...detectOrphan(context),
    ...detectFloatingTag(context),
    ...detectWrongSection(context),
    ...detectInstalledNewer(context),
    ...detectNestedOverride(context),
  ];

  // Dedup: OA005 wins over OA001 when both fire on the same outer key (more specific framing).
  const oa005Outers = new Set(
    rawFindings.filter(f => f.ruleId === 'OA005-NESTED-OVERRIDE').map(f => f.package),
  );
  const findings = rawFindings.filter(f =>
    !(f.ruleId === 'OA001-ORPHAN-TARGET' && oa005Outers.has(f.package))
  );

  return { context, findings };
}
