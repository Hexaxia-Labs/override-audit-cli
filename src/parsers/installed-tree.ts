import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { InstalledCopy, ParentDeclaration } from '../types.js';
import { type InstalledManifest } from './node-modules.js';

/**
 * Walk node_modules trees recursively to gather two indices:
 *   1. installedCopies      — name → all copies of that name anywhere in the tree
 *   2. parentDeclarations   — name → parents that declare it as a (opt|peer)Dependency
 *
 * Both are populated in one pass to amortise the directory walk. The walk is
 * shallow-ish: it follows `node_modules/<a>/node_modules/<b>/node_modules/...`
 * but does not chase symlinks (avoids workspace-protocol cycles).
 *
 * Returns empty maps when `node_modules` does not exist — callers should fall
 * back to lockfile-only signals (and surface a skippedDetectors note).
 */
export function walkInstalledTree(projectPath: string): {
  installedCopies: Map<string, InstalledCopy[]>;
  parentDeclarations: Map<string, ParentDeclaration[]>;
} {
  const installedCopies = new Map<string, InstalledCopy[]>();
  const parentDeclarations = new Map<string, ParentDeclaration[]>();

  const root = join(projectPath, 'node_modules');
  if (!existsSync(root)) return { installedCopies, parentDeclarations };

  walk(root, installedCopies, parentDeclarations);
  return { installedCopies, parentDeclarations };
}

function walk(
  nmDir: string,
  copies: Map<string, InstalledCopy[]>,
  parents: Map<string, ParentDeclaration[]>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(nmDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue; // skip .bin, .package-lock.json, .cache, etc.
    const entryPath = join(nmDir, entry);

    // Scoped packages: recurse into the scope directory which contains the actual packages.
    if (entry.startsWith('@')) {
      let scopeEntries: string[];
      try {
        scopeEntries = readdirSync(entryPath);
      } catch {
        continue;
      }
      for (const scopedEntry of scopeEntries) {
        const pkgPath = join(entryPath, scopedEntry);
        const fullName = `${entry}/${scopedEntry}`;
        processPackage(pkgPath, fullName, copies, parents);
      }
      continue;
    }

    processPackage(entryPath, entry, copies, parents);
  }
}

function processPackage(
  pkgPath: string,
  pkgName: string,
  copies: Map<string, InstalledCopy[]>,
  parents: Map<string, ParentDeclaration[]>,
): void {
  let stats;
  try {
    stats = statSync(pkgPath);
  } catch {
    return;
  }
  if (!stats.isDirectory()) return;

  const manifestPath = join(pkgPath, 'package.json');
  if (!existsSync(manifestPath)) return;

  let manifest: InstalledManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as InstalledManifest;
  } catch {
    return;
  }

  const version = manifest.version;
  if (version) {
    const list = copies.get(pkgName) ?? [];
    list.push({ name: pkgName, path: pkgPath, version });
    copies.set(pkgName, list);
  }

  // Record this package as a parent for each of its declared deps.
  recordDeclarations(manifest, pkgName, manifest.version ?? '', parents);

  // Recurse into this package's own node_modules (nested deps).
  const nested = join(pkgPath, 'node_modules');
  if (existsSync(nested)) walk(nested, copies, parents);
}

function recordDeclarations(
  manifest: InstalledManifest,
  parentName: string,
  parentVersion: string,
  parents: Map<string, ParentDeclaration[]>,
): void {
  const sections: Array<{
    deps: Record<string, string> | undefined;
    declaredIn: ParentDeclaration['declaredIn'];
  }> = [
    { deps: manifest.dependencies, declaredIn: 'dependencies' },
    { deps: manifest.optionalDependencies, declaredIn: 'optionalDependencies' },
    { deps: manifest.peerDependencies, declaredIn: 'peerDependencies' },
  ];

  for (const { deps, declaredIn } of sections) {
    if (!deps) continue;
    for (const [depName, declaredValue] of Object.entries(deps)) {
      const list = parents.get(depName) ?? [];
      list.push({
        parentName,
        parentVersion,
        declaredIn,
        declaredValue,
        exactVersion: isExactPin(declaredValue),
      });
      parents.set(depName, list);
    }
  }
}

/**
 * An "exact" pin is a bare semver version with no range operators or qualifiers
 * (e.g. "0.25.12" not "^0.25.0" or ">=0.25.0"). Matches what npm/pnpm treat as
 * a single-version pin for resolution purposes.
 */
function isExactPin(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(value.trim());
}
