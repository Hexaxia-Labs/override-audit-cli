import fs from "node:fs";
import type { PackageRef } from "../types.js";
import { upsertPackage } from "./utils.js";

function parseJsonc(text: string): unknown {
  // bun.lock uses JSONC (trailing commas). Strip them before parsing.
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
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

  // Collect direct dependency names from all workspaces to detect dev-only packages
  const prodNames = new Set<string>();
  const devNames = new Set<string>();

  for (const workspace of Object.values<any>(workspaces)) {
    for (const name of Object.keys(workspace?.dependencies ?? {})) {
      prodNames.add(name);
    }
    for (const name of Object.keys(workspace?.devDependencies ?? {})) {
      devNames.add(name);
    }
  }

  for (const [pkgName, entry] of Object.entries<any>(packages)) {
    if (!Array.isArray(entry) || entry.length < 1) continue;

    const nameAtVersion = String(entry[0] ?? "");
    // Split on last @ to handle scoped packages (e.g. @babel/core@7.0.0)
    const atIndex = nameAtVersion.lastIndexOf("@");
    if (atIndex <= 0) continue;

    const name = nameAtVersion.slice(0, atIndex);
    const version = nameAtVersion.slice(atIndex + 1);

    if (!name || !version) continue;

    // A package is dev-only if it appears in devDependencies but not in dependencies
    // (transitive packages not listed directly are treated as prod)
    const dev = devNames.has(pkgName) && !prodNames.has(pkgName);
    if (prodOnly && dev) continue;

    upsertPackage(map, {
      name,
      version,
      ecosystem: "npm",
      dev,
      paths: [["project", name]],
    });
  }

  return [...map.values()];
}
