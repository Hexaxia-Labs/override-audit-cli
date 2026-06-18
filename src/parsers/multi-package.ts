import fs from "node:fs";
import path from "node:path";
import type { ScanInput } from "../types.js";
import { EXCLUDED_DIRS } from "../constants.js";
import { loadPackages } from "./index.js";

const LOCKFILE_NAMES = ["bun.lock", "npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

export function hasRootLockfile(projectRoot: string): boolean {
  return LOCKFILE_NAMES.some(name => fs.existsSync(path.join(projectRoot, name)));
}

export function findNestedLockfiles(projectRoot: string, maxDepth: number): string[] {
  const results: string[] = [];

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const lockfile = entries.find(e => e.isFile() && LOCKFILE_NAMES.includes(e.name));
    if (lockfile) {
      results.push(path.join(dir, lockfile.name));
      return; // stop recursing — this lockfile covers its subtree
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  let rootEntries: fs.Dirent[] = [];
  try {
    rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    walk(path.join(projectRoot, entry.name), 1);
  }

  return results;
}

export function loadMultiplePackages(
  projectRoot: string,
  prodOnly: boolean,
  maxDepth: number,
): Array<{ scanInput: ScanInput; subfolder: string }> {
  const lockfiles = findNestedLockfiles(projectRoot, maxDepth);
  return lockfiles.map(lockfilePath => {
    const subfolderAbs = path.dirname(lockfilePath);
    const subfolder = path.relative(projectRoot, subfolderAbs);
    const scanInput = loadPackages(subfolderAbs, prodOnly, maxDepth);
    return { scanInput, subfolder };
  });
}
