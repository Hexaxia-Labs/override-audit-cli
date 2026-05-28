import fs from "node:fs";
import type { PackageRef } from "../types.js";
import { upsertPackage, normalizeNodeModulesPath } from "./utils.js";
import { loadNpmLockGraph } from "./npm-lock-graph.js";

export function buildNpmWorkspaceMap(filePath: string): Map<string, string[]> {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as any;
  const map = new Map<string, string[]>();

  if (!raw.packages || typeof raw.packages !== "object") return map;

  for (const [pkgPath, meta] of Object.entries<any>(raw.packages)) {
    if (pkgPath.includes("node_modules/")) continue;

    const workspacePath = pkgPath === "" ? "." : pkgPath;

    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      const depSection = meta?.[depSectionName];
      if (!depSection || typeof depSection !== "object") continue;
      for (const depName of Object.keys(depSection)) {
        const existing = map.get(depName) ?? [];
        if (!existing.includes(workspacePath)) {
          map.set(depName, [...existing, workspacePath]);
        }
      }
    }
  }

  return map;
}

export function loadFromPackageLock(filePath: string, prodOnly: boolean): PackageRef[] {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const map = new Map<string, PackageRef>();

  if (raw.packages && typeof raw.packages === "object") {
    const graph = loadNpmLockGraph(filePath, { includePaths: true });

    for (const [pkgPath, meta] of Object.entries<any>(raw.packages)) {
      if (!pkgPath || pkgPath === "") continue;
      if (!pkgPath.includes("node_modules/")) continue;

      const name = pkgPath.slice(pkgPath.lastIndexOf("node_modules/") + "node_modules/".length);
      const version = meta?.version;
      const dev = !!meta?.dev;

      if (!name || !version) continue;
      if (prodOnly && dev) continue;

      const nodeIds = graph.nodeIdsFor(name, version);
      const graphPaths = nodeIds.flatMap(id => graph.pathsFor(id));
      const paths = graphPaths.length > 0 ? graphPaths : [normalizeNodeModulesPath(pkgPath)];
      upsertPackage(map, { name, version, ecosystem: "npm", dev, paths });
    }
  }

  if (map.size === 0 && raw.dependencies && typeof raw.dependencies === "object") {
    walkLegacyDeps(raw.dependencies, map, prodOnly, ["project"]);
  }

  return [...map.values()];
}

function walkLegacyDeps(
  deps: Record<string, any>,
  map: Map<string, PackageRef>,
  prodOnly: boolean,
  currentPath: string[]
) {
  for (const [name, meta] of Object.entries<any>(deps)) {
    const version = meta?.version;
    const dev = !!meta?.dev;
    const nextPath = [...currentPath, name];

    if (name && version && !(prodOnly && dev)) {
      upsertPackage(map, { name, version, ecosystem: "npm", dev, paths: [nextPath] });
    }

    if (meta?.dependencies) {
      walkLegacyDeps(meta.dependencies, map, prodOnly, nextPath);
    }
  }
}
