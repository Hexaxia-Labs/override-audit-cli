import type { PackageRef } from "../types.js";
import { uniquePathArrays } from "../utils/array.js";

export function markDevPackages(map: Map<string, PackageRef>, devDepNames: Set<string>): void {
  if (devDepNames.size === 0) return;

  for (const pkg of map.values()) {
    const paths = pkg.paths ?? [];
    if (paths.length === 0) continue;
    // A package is dev only if every known path starts from a devDependency root.
    // path[1] is the root dep name (path[0] is always "project").
    const allPathsFromDev = paths.every(p => p.length >= 2 && devDepNames.has(p[1]));
    if (allPathsFromDev) {
      pkg.dev = true;
    }
  }
}

export function upsertPackage(map: Map<string, PackageRef>, candidate: PackageRef) {
  const key = `${candidate.name}@${candidate.version}`;
  const existing = map.get(key);

  if (!existing) {
    map.set(key, { ...candidate, paths: uniquePathArrays(candidate.paths ?? []).slice(0, 5) });
    return;
  }

  existing.dev = existing.dev && candidate.dev;
  existing.paths = uniquePathArrays([...(existing.paths ?? []), ...(candidate.paths ?? [])]).slice(0, 5);
}

export function normalizeNodeModulesPath(pkgPath: string): string[] {
  const parts = pkgPath.split("/").filter(Boolean);
  const names: string[] = ["project"];
  const firstNodeModulesIndex = parts.indexOf("node_modules");

  if (firstNodeModulesIndex > 0) {
    names.push(...parts.slice(0, firstNodeModulesIndex));
  }

  for (let i = Math.max(firstNodeModulesIndex, 0); i < parts.length; i++) {
    if (parts[i] !== "node_modules") continue;
    const next = parts[i + 1];
    const scopedNext = parts[i + 2];
    if (!next) continue;

    if (next.startsWith("@") && scopedNext) {
      names.push(`${next}/${scopedNext}`);
      i += 2;
    } else {
      names.push(next);
      i += 1;
    }
  }

  return names;
}
