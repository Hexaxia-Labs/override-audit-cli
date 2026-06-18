import fs from "node:fs";
import path from "node:path";
import { parse as parseYarnLock } from "yarn-lockfile";
import type { PackageRef } from "../types.js";
import { uniquePathArrays } from "../utils/array.js";
import { looksLikeVersion, normalizeRawVersion } from "../utils/version.js";
import { upsertPackage, markDevPackages } from "./utils.js";

const MAX_PATHS_PER_PACKAGE = 5;
const MAX_PATH_DEPTH = 10;

export function buildYarnWorkspaceMap(filePath: string): Map<string, string[]> {
  const dir = path.dirname(filePath);
  const map = new Map<string, string[]>();

  let rootPkg: any;
  try {
    rootPkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return map;
  }

  const patterns: string[] = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : rootPkg.workspaces?.packages ?? [];

  if (!patterns.length) return map;

  for (const pattern of patterns) {
    const parts = pattern.split("/");
    const lastPart = parts[parts.length - 1];
    const baseParts = parts.slice(0, -1);

    let wsDirs: string[];
    if (lastPart === "*") {
      const baseDir = path.join(dir, ...baseParts);
      try {
        wsDirs = fs.readdirSync(baseDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => [...baseParts, d.name].join("/"));
      } catch {
        continue;
      }
    } else {
      wsDirs = [pattern];
    }

    for (const wsDir of wsDirs) {
      let wsPkg: any;
      try {
        wsPkg = JSON.parse(fs.readFileSync(path.join(dir, wsDir, "package.json"), "utf8"));
      } catch {
        continue;
      }
      const wsName: string = wsPkg.name;
      if (!wsName) continue;

      for (const depSection of ["dependencies", "optionalDependencies", "devDependencies"]) {
        const deps = wsPkg[depSection];
        if (!deps || typeof deps !== "object") continue;
        for (const depName of Object.keys(deps)) {
          const existing = map.get(depName) ?? [];
          if (!existing.includes(wsName)) map.set(depName, [...existing, wsName]);
        }
      }
    }
  }

  return map;
}

function isYarnBerry(content: string): boolean {
  return content.startsWith('__metadata:') || content.includes('\n__metadata:');
}

function pathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function parseYarnPackageKey(key: string): { key: string; name: string; version: string } | null {
  const idx = key.lastIndexOf("@");
  if (idx <= 0) return null;
  const name = key.slice(0, idx);
  const version = key.slice(idx + 1);
  if (!name || !version) return null;
  return { key, name, version };
}

function collectYarnPaths(
  rootDepKeys: string[],
  graph: Map<string, string[]>,
  map: Map<string, PackageRef>,
): void {
  const queue = rootDepKeys.map(key => ({ key, path: ["project"] as string[] }));
  const visitedStates = new Set<string>();

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++]!;
    const ref = parseYarnPackageKey(current.key);
    if (!ref) continue;

    const nextPath = [...current.path, ref.name];
    const stateKey = `${ref.key}>${nextPath.join(">")}`;
    if (visitedStates.has(stateKey)) continue;
    visitedStates.add(stateKey);

    const pkg = map.get(ref.key);
    if (pkg) {
      pkg.paths = uniquePathArrays([...(pkg.paths ?? []), nextPath]).slice(0, MAX_PATHS_PER_PACKAGE);
    }

    if (nextPath.length >= MAX_PATH_DEPTH) continue;
    if ((pkg?.paths?.length ?? 0) >= MAX_PATHS_PER_PACKAGE && !(pkg?.paths ?? []).some(path => pathsEqual(path, nextPath))) {
      continue;
    }

    for (const child of graph.get(ref.key) ?? []) {
      queue.push({ key: child, path: nextPath });
    }
  }
}

function loadRootDepKeys(
  filePath: string,
  selectorToKey: Map<string, string>,
  map: Map<string, PackageRef>,
): { keys: string[]; devDepNames: Set<string> } {
  const dir = path.dirname(filePath);
  let rootPkg: any;
  try {
    rootPkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return { keys: [], devDepNames: new Set() };
  }

  const devDepNames = new Set<string>(Object.keys(rootPkg.devDependencies ?? {}));
  const rootDepKeys: string[] = [];
  for (const depSection of ["dependencies", "optionalDependencies", "devDependencies"]) {
    const deps = rootPkg[depSection];
    if (!deps || typeof deps !== "object") continue;
    for (const [depName, depRange] of Object.entries<any>(deps)) {
      const resolved =
        selectorToKey.get(`${depName}@${depRange}`) ??
        selectorToKey.get(`${depName}@npm:${depRange}`);
      if (resolved) {
        rootDepKeys.push(resolved);
        continue;
      }

      const fallbackVersion = normalizeRawVersion(depRange);
      if (fallbackVersion) {
        upsertPackage(map, {
          name: String(depName),
          version: fallbackVersion,
          ecosystem: "npm",
          paths: [["project", String(depName)]],
        });
      }
    }
  }

  return { keys: rootDepKeys, devDepNames };
}

function parseBerryDependencies(block: string): Record<string, string> {
  const dependencies: Record<string, string> = {};
  const lines = block.split("\n");
  let inDependencies = false;

  for (const line of lines) {
    if (/^\s*dependencies:\s*$/.test(line)) {
      inDependencies = true;
      continue;
    }

    if (!inDependencies) continue;

    const depMatch = line.match(/^\s{2,}([^:]+):\s*(.+)$/);
    if (!depMatch) {
      if (!/^\s/.test(line)) inDependencies = false;
      continue;
    }

    dependencies[depMatch[1].trim().replace(/^"|"$/g, "")] = depMatch[2].trim().replace(/^"|"$/g, "");
  }

  return dependencies;
}

function loadFromYarnBerryLock(content: string, filePath: string): PackageRef[] {
  const map = new Map<string, PackageRef>();
  const graph = new Map<string, string[]>();
  const selectorToKey = new Map<string, string>();
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines[0] || lines[0].startsWith('__metadata')) continue;

    const selectorLine = lines[0].trim().replace(/:$/, "").replace(/^"|"$/g, "");
    const resolutionLine = lines.find((l) => l.trim().startsWith('resolution:'));
    if (!resolutionLine) continue;

    const resMatch = resolutionLine.match(/resolution:\s+"(.+)"/);
    if (!resMatch) continue;

    const resolution = resMatch[1];
    const npmIdx = resolution.lastIndexOf('@npm:');
    if (npmIdx < 0) continue;

    const name = resolution.slice(0, npmIdx);
    const version = resolution.slice(npmIdx + 5);
    if (!name || !version) continue;

    const canonicalKey = `${name}@${version}`;
    for (const selector of selectorLine.split(",").map(part => part.trim()).filter(Boolean)) {
      selectorToKey.set(selector, canonicalKey);
    }
    upsertPackage(map, { name, version, ecosystem: 'npm', paths: [] });
  }

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines[0] || lines[0].startsWith('__metadata')) continue;

    const selectorLine = lines[0].trim().replace(/:$/, "").replace(/^"|"$/g, "");
    const canonicalKey = selectorToKey.get(
      selectorLine.split(",").map(part => part.trim()).find(part => selectorToKey.has(part)) ?? selectorLine,
    ) ?? selectorToKey.get(selectorLine);
    if (!canonicalKey) continue;

    const depKeys = new Set<string>();
    for (const [depName, depRef] of Object.entries(parseBerryDependencies(block))) {
      const childSelector = depRef.startsWith("npm:") ? `${depName}@${depRef}` : `${depName}@${depRef}`;
      const childKey = selectorToKey.get(childSelector);
      if (childKey) depKeys.add(childKey);
    }

    graph.set(canonicalKey, [...depKeys]);
  }

  const { keys: rootDepKeys, devDepNames } = loadRootDepKeys(filePath, selectorToKey, map);
  collectYarnPaths(rootDepKeys, graph, map);
  markDevPackages(map, devDepNames);

  return [...map.values()];
}

function loadFromYarnClassicLock(parsed: any, filePath: string): PackageRef[] {
  const map = new Map<string, PackageRef>();
  const graph = new Map<string, string[]>();
  const selectorToKey = new Map<string, string>();

  for (const [selectorKey, meta] of Object.entries<any>(parsed.object)) {
    const version = meta?.version;
    if (!version) continue;

    const selectors = String(selectorKey).split(",").map(selector => selector.trim()).filter(Boolean);
    const firstSelector = selectors[0];
    const atIndex = firstSelector.lastIndexOf("@");
    if (atIndex <= 0) continue;

    const name = firstSelector.slice(0, atIndex);
    const canonicalKey = `${name}@${version}`;

    for (const selector of selectors) {
      selectorToKey.set(selector, canonicalKey);
    }

    upsertPackage(map, { name, version, ecosystem: "npm", paths: [], resolvedUrl: meta?.resolved as string | undefined });
  }

  for (const [selectorKey, meta] of Object.entries<any>(parsed.object)) {
    const version = meta?.version;
    if (!version) continue;

    const selectors = String(selectorKey).split(",").map(selector => selector.trim()).filter(Boolean);
    const firstSelector = selectors[0];
    const atIndex = firstSelector.lastIndexOf("@");
    if (atIndex <= 0) continue;

    const name = firstSelector.slice(0, atIndex);
    const canonicalKey = `${name}@${version}`;
    const depKeys = new Set<string>();
    const deps = meta?.dependencies;

    if (deps && typeof deps === "object") {
      for (const [depName, depRange] of Object.entries<any>(deps)) {
        const childKey = selectorToKey.get(`${depName}@${depRange}`);
        if (childKey) depKeys.add(childKey);
      }
    }

    graph.set(canonicalKey, [...depKeys]);
  }

  const { keys: rootDepKeys, devDepNames } = loadRootDepKeys(filePath, selectorToKey, map);
  collectYarnPaths(rootDepKeys, graph, map);
  markDevPackages(map, devDepNames);

  return [...map.values()];
}

export function loadFromYarnLock(filePath: string): PackageRef[] {
  const content = fs.readFileSync(filePath, "utf8");

  if (isYarnBerry(content)) {
    return loadFromYarnBerryLock(content, filePath);
  }

  const parsed = parseYarnLock(content) as any;
  if (parsed.type !== "success" || !parsed.object) {
    throw new Error("Could not parse yarn.lock");
  }

  return loadFromYarnClassicLock(parsed, filePath);
}
