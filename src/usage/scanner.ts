import fs from "node:fs";
import path from "node:path";
// Shared with lockfile scanning in utils/file.ts; additions affect both code paths.
import { EXCLUDED_DIRS } from "../constants.js";

const ALLOWED_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

// Matches:
// import { foo } from 'pkg'
// import * as foo from "pkg"
// export { foo } from 'pkg'
// import 'pkg'
// require('pkg')
// await import('pkg')
const IMPORT_REQUIRE_REGEX = /(?:(?:import|export)\s+[\w\s{},*]+\s+from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;

function getBareModuleName(importPath: string): string {
  if (importPath.startsWith(".") || importPath.startsWith("/")) {
    return "";
  }
  if (importPath.startsWith("@")) {
    const parts = importPath.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : importPath;
  }
  return importPath.split("/")[0];
}

export function scanProjectForPackageUsage(
  projectPath: string,
  packagesToLookFor: Set<string>,
): Record<string, string[]> {
  const results: Record<string, string[]> = {};
  for (const pkg of packagesToLookFor) {
    results[pkg] = [];
  }

  if (packagesToLookFor.size === 0) {
    return results;
  }

  // Cap at 5000 files to prevent performance issues on massive projects
  const MAX_FILES_TO_SCAN = 5000;
  let scannedCount = 0;

  function walk(dir: string) {
    if (scannedCount >= MAX_FILES_TO_SCAN) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scannedCount >= MAX_FILES_TO_SCAN) return;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (ALLOWED_EXTS.has(ext)) {
          scanFile(fullPath);
          scannedCount++;
        }
      }
    }
  }

  function scanFile(filePath: string) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      return;
    }

    // Fast path: skip regex if the file doesn't contain any target package names
    let hasPotentialMatch = false;
    for (const pkg of packagesToLookFor) {
      if (content.includes(pkg)) {
        hasPotentialMatch = true;
        break;
      }
    }
    if (!hasPotentialMatch) return;

    const matches = content.matchAll(IMPORT_REQUIRE_REGEX);
    const foundPackages = new Set<string>();

    for (const match of matches) {
      const importPath = match[1] || match[2] || match[3] || match[4];
      if (importPath) {
        const bare = getBareModuleName(importPath);
        if (bare && packagesToLookFor.has(bare)) {
          foundPackages.add(bare);
        }
      }
    }

    for (const pkg of foundPackages) {
      // Store relative path for cleaner output
      const relPath = path.relative(projectPath, filePath);
      results[pkg].push(relPath);
    }
  }

  walk(projectPath);

  return results;
}
