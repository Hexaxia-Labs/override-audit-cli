import fs from "node:fs";
import path from "node:path";
import { parse as parseYarnLock } from "yarn-lockfile";
import type { PackageRef } from "../types.js";
import { upsertPackage } from "./utils.js";

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

function loadFromYarnBerryLock(content: string): PackageRef[] {
  const map = new Map<string, PackageRef>();
  const blocks = content.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (!lines[0] || lines[0].startsWith('__metadata')) continue;

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

    upsertPackage(map, { name, version, ecosystem: 'npm', paths: [['project', name]] });
  }

  return [...map.values()];
}

export function loadFromYarnLock(filePath: string): PackageRef[] {
  const content = fs.readFileSync(filePath, "utf8");

  if (isYarnBerry(content)) {
    return loadFromYarnBerryLock(content);
  }

  const parsed = parseYarnLock(content) as any;
  if (parsed.type !== "success" || !parsed.object) {
    throw new Error("Could not parse yarn.lock");
  }

  const map = new Map<string, PackageRef>();
  for (const [selector, meta] of Object.entries<any>(parsed.object)) {
    const version = meta?.version;
    if (!version) continue;

    const firstSelector = String(selector).split(",")[0].trim();
    const atIndex = firstSelector.lastIndexOf("@");
    if (atIndex <= 0) continue;
    const name = firstSelector.slice(0, atIndex);

    if (!name || !version) continue;
    upsertPackage(map, { name, version, ecosystem: "npm", paths: [["project", name]] });
  }

  return [...map.values()];
}
