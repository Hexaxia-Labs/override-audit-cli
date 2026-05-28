import fs from "node:fs";
import YAML from "yaml";
import type { PackageRef } from "../types.js";
import { looksLikeVersion, normalizeRawVersion } from "../utils/version.js";
import { upsertPackage } from "./utils.js";
import { uniquePathArrays } from "../utils/array.js";

const MAX_PATHS_PER_PACKAGE = 5;
const MAX_PATH_DEPTH = 10;

export function buildPnpmWorkspaceMap(filePath: string): Map<string, string[]> {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(content) as any;
  const importers = parsed?.importers ?? {};
  const map = new Map<string, string[]>();

  for (const [importerPath, importer] of Object.entries<any>(importers)) {
    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      const depSection = importer?.[depSectionName];
      if (!depSection || typeof depSection !== "object") continue;
      for (const depName of Object.keys(depSection)) {
        const existing = map.get(depName) ?? [];
        if (!existing.includes(importerPath)) {
          map.set(depName, [...existing, importerPath]);
        }
      }
    }
  }

  return map;
}

export function loadFromPnpmLock(filePath: string, prodOnly: boolean): PackageRef[] {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = YAML.parse(content) as any;
  const majorVersion = parseInt(String(parsed?.lockfileVersion ?? "0"), 10);
  return majorVersion >= 9 ? loadV9(parsed, prodOnly) : loadLegacy(parsed, prodOnly);
}

function loadLegacy(parsed: any, prodOnly: boolean): PackageRef[] {
  const packagesSection = parsed?.packages ?? {};
  const importers = parsed?.importers ?? {};
  const graph = new Map<string, string[]>();
  const map = new Map<string, PackageRef>();

  for (const [key, meta] of Object.entries<any>(packagesSection)) {
    const ref = parsePnpmPackageKey(String(key));
    if (!ref) continue;

    const depKeys = new Set<string>();
    for (const depMap of [meta?.dependencies, meta?.optionalDependencies]) {
      if (!depMap || typeof depMap !== "object") continue;
      for (const [depName, depRef] of Object.entries<any>(depMap)) {
        const resolved = normalizePnpmDepRef(String(depName), depRef);
        if (resolved) depKeys.add(resolved);
      }
    }

    graph.set(ref.key, [...depKeys]);
    const dev = !!meta?.dev;
    if (prodOnly && dev) continue;
    upsertPackage(map, { name: ref.name, version: ref.version, ecosystem: "npm", dev, paths: [] });
  }

  const rootDeps: string[] = [];
  for (const importer of Object.values<any>(importers)) {
    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      if (prodOnly && depSectionName == "devDependencies") continue;
      const depSection = importer?.[depSectionName];
      if (!depSection || typeof depSection !== "object") continue;
      for (const [depName, depRef] of Object.entries<any>(depSection)) {
        const resolved = normalizePnpmDepRef(String(depName), depRef);
        if (resolved) {
          rootDeps.push(resolved);
        } else {
          const fallbackVersion = normalizeRawVersion(depRef);
          if (fallbackVersion) {
            upsertPackage(map, {
              name: String(depName),
              version: fallbackVersion,
              ecosystem: "npm",
              paths: [["project", String(depName)]]
            });
          }
        }
      }
    }
  }

  collectPnpmPaths(rootDeps, graph, map, parsePnpmPackageKey);

  return [...map.values()];
}

function loadV9(parsed: any, prodOnly: boolean): PackageRef[] {
  const snapshotsSection = parsed?.snapshots ?? {};
  const importers = parsed?.importers ?? {};
  const graph = new Map<string, string[]>();
  const map = new Map<string, PackageRef>();

  for (const [key, meta] of Object.entries<any>(snapshotsSection)) {
    const ref = parsePnpmPackageKeyV9(String(key));
    if (!ref) continue;

    const depKeys = new Set<string>();
    for (const depMap of [meta?.dependencies, meta?.optionalDependencies]) {
      if (!depMap || typeof depMap !== "object") continue;
      for (const [depName, depRef] of Object.entries<any>(depMap)) {
        const resolved = normalizePnpmDepRefV9(String(depName), depRef);
        if (resolved) depKeys.add(resolved);
      }
    }

    graph.set(ref.key, [...depKeys]);
    const dev = !!meta?.dev;
    if (prodOnly && dev) continue;
    upsertPackage(map, { name: ref.name, version: ref.version, ecosystem: "npm", dev, paths: [] });
  }

  const rootDeps: string[] = [];
  for (const importer of Object.values<any>(importers)) {
    for (const depSectionName of ["dependencies", "optionalDependencies", "devDependencies"]) {
      if (prodOnly && depSectionName === "devDependencies") continue;
      const depSection = importer?.[depSectionName];
      if (!depSection || typeof depSection !== "object") continue;
      for (const [depName, depRef] of Object.entries<any>(depSection)) {
        const resolved = normalizePnpmDepRefV9(String(depName), depRef);
        if (resolved) {
          rootDeps.push(resolved);
        } else {
          const fallbackVersion = normalizeRawVersion(depRef);
          if (fallbackVersion) {
            upsertPackage(map, {
              name: String(depName),
              version: fallbackVersion,
              ecosystem: "npm",
              paths: [["project", String(depName)]]
            });
          }
        }
      }
    }
  }

  collectPnpmPaths(rootDeps, graph, map, parsePnpmPackageKeyV9);

  return [...map.values()];
}

function collectPnpmPaths(
  rootDeps: string[],
  graph: Map<string, string[]>,
  map: Map<string, PackageRef>,
  parsePackageKey: (key: string) => { key: string; name: string; version: string } | null,
): void {
  const queue = rootDeps.map(dep => ({ key: dep, path: ["project"] as string[] }));
  const visitedStates = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const ref = parsePackageKey(current.key);
    if (!ref) continue;

    const nextPath = [...current.path, ref.name];
    const stateKey = `${ref.key}>${nextPath.join(">")}`;
    if (visitedStates.has(stateKey)) continue;
    visitedStates.add(stateKey);

    const pkgKey = `${ref.name}@${ref.version}`;
    const pkg = map.get(pkgKey);
    if (pkg) {
      pkg.paths = uniquePathArrays([...(pkg.paths ?? []), nextPath]).slice(0, MAX_PATHS_PER_PACKAGE);
    }

    if (nextPath.length >= MAX_PATH_DEPTH) continue;
    if ((pkg?.paths?.length ?? 0) >= MAX_PATHS_PER_PACKAGE && !(pkg?.paths ?? []).some(path => pathsEqual(path, nextPath))) {
      continue;
    }

    const children = graph.get(ref.key) ?? [];
    for (const child of children) {
      queue.push({ key: child, path: nextPath });
    }
  }
}

function pathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function parsePnpmPackageKey(key: string): { key: string; name: string; version: string } | null {
  const cleaned = key.replace(/^\//, "").split("(")[0];
  const match = cleaned.match(/^(@?[^/]+(?:\/[^/]+)?)\/([^/]+)$/);
  if (!match) return null;
  const [, name, version] = match;
  return { key, name, version };
}

function parsePnpmPackageKeyV9(key: string): { key: string; name: string; version: string } | null {
  const cleaned = key.split("(")[0]; // strip peer-dep suffix e.g. handlebars@4.7.8(foo@1.0.0)
  const idx = cleaned.lastIndexOf("@");
  if (idx <= 0) return null; // no @ or @ is the first char
  const name = cleaned.slice(0, idx);
  const version = cleaned.slice(idx + 1);
  if (!name || !version) return null;
  return { key: cleaned, name, version };
}

function normalizePnpmDepRef(depName: string, depRef: unknown): string | null {
  if (typeof depRef === "string") {
    const cleaned = depRef.replace(/^link:/, "").replace(/^workspace:/, "").split("(")[0];
    if (!cleaned || cleaned.startsWith(".") || cleaned.startsWith("..")) return null;
    if (cleaned.startsWith("/")) return cleaned;
    if (cleaned.includes("/")) return "/" + cleaned.replace(/^\//, "");
    if (looksLikeVersion(cleaned)) return `/${depName}/${cleaned}`;
  }

  if (depRef && typeof depRef === "object") {
    const version = (depRef as any).version ?? (depRef as any).specifier;
    return normalizePnpmDepRef(depName, version);
  }

  return null;
}

function normalizePnpmDepRefV9(depName: string, depRef: unknown): string | null {
  if (typeof depRef === "string") {
    const cleaned = depRef.replace(/^link:/, "").replace(/^workspace:/, "").split("(")[0];
    if (!cleaned || cleaned.startsWith(".") || cleaned.startsWith("..")) return null;
    if (looksLikeVersion(cleaned)) return `${depName}@${cleaned}`;
  }

  if (depRef && typeof depRef === "object") {
    const version = (depRef as any).version ?? (depRef as any).specifier;
    return normalizePnpmDepRefV9(depName, version);
  }

  return null;
}
