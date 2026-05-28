import fs from "node:fs";
import path from "node:path";
import { EXCLUDED_DIRS } from "../constants.js";

export function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

export function relativeOrName(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  return relative || path.basename(filePath);
}

export function findFiles(rootDir: string, names: string[], maxDepth: number): string[] {
  const results: string[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isFile() && names.includes(entry.name)) {
        results.push(fullPath);
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(currentDir, entry.name), depth + 1);
    }
  }

  walk(rootDir, 0);

  return results.sort((a, b) => {
    const aDepth = a.split(path.sep).length;
    const bDepth = b.split(path.sep).length;
    return aDepth - bDepth || a.localeCompare(b);
  });
}

export function findNearestPackageJson(projectRoot: string, maxDepth: number): string | null {
  const rootCandidate = path.join(projectRoot, "package.json");
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  const found = findFiles(projectRoot, ["package.json"], maxDepth);
  return found[0] ?? null;
}

export function chooseBestLockfile(candidates: string[]): string {
  return [...candidates].sort((a, b) => {
    const aDepth = a.split(path.sep).length;
    const bDepth = b.split(path.sep).length;
    if (aDepth !== bDepth) return aDepth - bDepth;

    const score = (file: string) => {
      const name = path.basename(file);
      if (name === "package-lock.json") return 0;
      if (name === "pnpm-lock.yaml") return 1;
      if (name === "yarn.lock") return 2;
      if (name === "bun.lock") return 3;
      return 4;
    };

    return score(a) - score(b);
  })[0];
}
