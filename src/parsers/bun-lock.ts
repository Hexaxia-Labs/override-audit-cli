import fs from "node:fs";
import type { PackageRef } from "../types.js";
import { uniquePathArrays } from "../utils/array.js";
import { upsertPackage } from "./utils.js";

const MAX_PATHS_PER_PACKAGE = 5;
const MAX_PATH_DEPTH = 10;

function parseJsonc(text: string): unknown {
  // bun.lock uses JSONC (trailing commas). Strip them before parsing.
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
}

function extractChildDependencyNames(depMeta: unknown): string[] {
  if (!depMeta || typeof depMeta !== "object") return [];

  const names = new Set<string>();
  const meta = depMeta as Record<string, unknown>;

  for (const section of ["dependencies", "optionalDependencies", "devDependencies"]) {
    const sectionObj = meta[section];
    if (!sectionObj || typeof sectionObj !== "object") continue;
    for (const name of Object.keys(sectionObj)) {
      names.add(name);
    }
  }

  for (const [key, value] of Object.entries(meta)) {
    if (key === "dependencies" || key === "optionalDependencies" || key === "devDependencies") continue;
    if (typeof value === "string") {
      names.add(key);
    }
  }

  return [...names];
}

function collectBunPaths(
  rootDepNames: string[],
  childDepsByPackageName: Map<string, string[]>,
  map: Map<string, PackageRef>,
  packageNameToVersion: Map<string, string>,
): void {
  const queue = rootDepNames.map(name => ({ name, path: ["project"] as string[] }));
  const visitedStates = new Set<string>();

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const nextPath = [...current.path, current.name];
    const version = packageNameToVersion.get(current.name);
    const stateKey = `${current.name}@${version ?? ""}>${nextPath.join(">")}`;
    if (visitedStates.has(stateKey)) continue;
    visitedStates.add(stateKey);

    if (version) {
      const pkg = map.get(`${current.name}@${version}`);
      if (pkg) {
        pkg.paths = uniquePathArrays([...(pkg.paths ?? []), nextPath]).slice(0, MAX_PATHS_PER_PACKAGE);
      }
    }

    if (nextPath.length >= MAX_PATH_DEPTH) continue;

    for (const child of childDepsByPackageName.get(current.name) ?? []) {
      queue.push({ name: child, path: nextPath });
    }
  }
}

export function buildBunWorkspaceMap(filePath: string): Map<string, string[]> {
  const raw = parseJsonc(fs.readFileSync(filePath, "utf8")) as any;
  const workspaces = raw?.workspaces ?? {};
  const map = new Map<string, string[]>();

  for (const [workspacePath, workspace] of Object.entries<any>(workspaces)) {
    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      const depSection = (workspace as any)?.[depSectionName];
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

export function loadFromBunLock(filePath: string, prodOnly: boolean): PackageRef[] {
  const raw = parseJsonc(fs.readFileSync(filePath, "utf8")) as any;
  const packages = raw?.packages ?? {};
  const workspaces = raw?.workspaces ?? {};
  const map = new Map<string, PackageRef>();
  const childDepsByPackageName = new Map<string, string[]>();
  const packageNameToVersion = new Map<string, string>();

  const prodNames = new Set<string>();
  const devNames = new Set<string>();
  const rootDepNames: string[] = [];

  for (const workspace of Object.values<any>(workspaces)) {
    for (const name of Object.keys(workspace?.dependencies ?? {})) {
      prodNames.add(name);
    }
    for (const name of Object.keys(workspace?.devDependencies ?? {})) {
      devNames.add(name);
    }
  }

  for (const [workspacePath, workspace] of Object.entries<any>(workspaces)) {
    if (workspacePath !== "") continue;
    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      if (prodOnly && depSectionName === "devDependencies") continue;
      const depSection = workspace?.[depSectionName];
      if (!depSection || typeof depSection !== "object") continue;
      for (const depName of Object.keys(depSection)) {
        rootDepNames.push(depName);
      }
    }
  }

  for (const [pkgName, entry] of Object.entries<any>(packages)) {
    if (!Array.isArray(entry) || entry.length < 1) continue;

    const nameAtVersion = String(entry[0] ?? "");
    const atIndex = nameAtVersion.lastIndexOf("@");
    if (atIndex <= 0) continue;

    const name = nameAtVersion.slice(0, atIndex);
    const version = nameAtVersion.slice(atIndex + 1);

    if (!name || !version) continue;

    packageNameToVersion.set(pkgName, version);
    childDepsByPackageName.set(pkgName, extractChildDependencyNames(entry[2]));

    const dev = devNames.has(pkgName) && !prodNames.has(pkgName);
    if (prodOnly && dev) continue;

    const resolvedUrl = typeof entry[1] === "string" && entry[1] !== "" ? entry[1] : undefined;
    upsertPackage(map, {
      name,
      version,
      ecosystem: "npm",
      dev,
      paths: [],
      resolvedUrl,
    });
  }

  collectBunPaths(rootDepNames, childDepsByPackageName, map, packageNameToVersion);

  for (const [pkgKey, pkg] of map.entries()) {
    if ((pkg.paths?.length ?? 0) === 0) {
      pkg.paths = [["project", pkg.name]];
    }
  }

  return [...map.values()];
}
