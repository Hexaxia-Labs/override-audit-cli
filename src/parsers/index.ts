import fs from "node:fs";
import path from "node:path";
import type { ScanInput } from "../types.js";
import { findFiles, findNearestPackageJson, chooseBestLockfile, safeReadText, relativeOrName } from "../utils/file.js";
import { loadFromBunLock } from "./bun-lock.js";
import { loadFromPackageJson } from "./package-json.js";
import { loadFromPackageLock } from "./package-lock.js";
import { loadFromPnpmLock } from "./pnpm-lock.js";
import { loadFromYarnLock } from "./yarn-lock.js";

export function loadPackages(projectRoot: string, prodOnly: boolean, maxDepth: number): ScanInput {
  const rootBunLock = path.join(projectRoot, "bun.lock");
  const rootShrinkwrap = path.join(projectRoot, "npm-shrinkwrap.json");
  const rootPackageLock = path.join(projectRoot, "package-lock.json");
  const rootPnpmLock = path.join(projectRoot, "pnpm-lock.yaml");
  const rootYarnLock = path.join(projectRoot, "yarn.lock");

  if (fs.existsSync(rootBunLock)) {
    return {
      mode: "resolved-lockfile",
      source: "bun-lock",
      filePath: rootBunLock,
      packages: loadFromBunLock(rootBunLock, prodOnly),
      notes: [
        "Scanned resolved dependency versions from bun.lock.",
        "Dependency paths are approximated from the workspace dependency manifest."
      ],
      warnings: [],
      skippedDependencies: []
    };
  }

  if (fs.existsSync(rootShrinkwrap)) {
    return {
      mode: "resolved-lockfile",
      source: "npm-shrinkwrap",
      filePath: rootShrinkwrap,
      packages: loadFromPackageLock(rootShrinkwrap, prodOnly),
      notes: [
        "Scanned resolved dependency versions from npm-shrinkwrap.json.",
        "Dependency paths are derived from lockfile package locations."
      ],
      warnings: [],
      skippedDependencies: []
    };
  }

  if (fs.existsSync(rootPackageLock)) {
    return {
      mode: "resolved-lockfile",
      source: "package-lock",
      filePath: rootPackageLock,
      packages: loadFromPackageLock(rootPackageLock, prodOnly),
      notes: [
        "Scanned resolved dependency versions from package-lock.json.",
        "Dependency paths are derived from lockfile package locations."
      ],
      warnings: [],
      skippedDependencies: []
    };
  }

  if (fs.existsSync(rootPnpmLock)) {
    return {
      mode: "resolved-lockfile",
      source: "pnpm-lock",
      filePath: rootPnpmLock,
      packages: loadFromPnpmLock(rootPnpmLock, prodOnly),
      notes: [
        "Scanned resolved dependency versions from pnpm-lock.yaml.",
        "Dependency paths are approximated from importer relationships and package snapshots."
      ],
      warnings: [],
      skippedDependencies: []
    };
  }

  if (fs.existsSync(rootYarnLock)) {
    return {
      mode: "resolved-lockfile",
      source: "yarn-lock",
      filePath: rootYarnLock,
      packages: loadFromYarnLock(rootYarnLock),
      notes: [
        "Scanned resolved dependency versions from yarn.lock.",
        "Dependency path reconstruction is limited for Yarn Classic lockfiles in this MVP."
      ],
      warnings: [],
      skippedDependencies: []
    };
  }

  const discoveredLockfiles = findFiles(projectRoot, ["bun.lock", "npm-shrinkwrap.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"], maxDepth);
  if (discoveredLockfiles.length > 0) {
    const selected = chooseBestLockfile(discoveredLockfiles);
    const selectedName = path.basename(selected);
    if (selectedName === "bun.lock") {
      return {
        mode: "resolved-lockfile",
        source: "bun-lock",
        filePath: selected,
        packages: loadFromBunLock(selected, prodOnly),
        notes: [
          `Scanned resolved dependency versions from ${relativeOrName(projectRoot, selected)}.`,
          "Dependency paths are approximated from the workspace dependency manifest."
        ],
        warnings: ["No supported lockfile was found at the repo root, so a nested lockfile was used instead."],
        skippedDependencies: []
      };
    }
    if (selectedName === "npm-shrinkwrap.json") {
      return {
        mode: "resolved-lockfile",
        source: "npm-shrinkwrap",
        filePath: selected,
        packages: loadFromPackageLock(selected, prodOnly),
        notes: [
          `Scanned resolved dependency versions from ${relativeOrName(projectRoot, selected)}.`,
          "Dependency paths are derived from lockfile package locations."
        ],
        warnings: ["No supported lockfile was found at the repo root, so a nested lockfile was used instead."],
        skippedDependencies: []
      };
    }
    if (selectedName === "package-lock.json") {
      return {
        mode: "resolved-lockfile",
        source: "package-lock",
        filePath: selected,
        packages: loadFromPackageLock(selected, prodOnly),
        notes: [
          `Scanned resolved dependency versions from ${relativeOrName(projectRoot, selected)}.`,
          "Dependency paths are derived from lockfile package locations."
        ],
        warnings: ["No supported lockfile was found at the repo root, so a nested lockfile was used instead."],
        skippedDependencies: []
      };
    }
    if (selectedName === "pnpm-lock.yaml") {
      return {
        mode: "resolved-lockfile",
        source: "pnpm-lock",
        filePath: selected,
        packages: loadFromPnpmLock(selected, prodOnly),
        notes: [
          `Scanned resolved dependency versions from ${relativeOrName(projectRoot, selected)}.`,
          "Dependency paths are approximated from importer relationships and package snapshots."
        ],
        warnings: ["No supported lockfile was found at the repo root, so a nested lockfile was used instead."],
        skippedDependencies: []
      };
    }
    return {
      mode: "resolved-lockfile",
      source: "yarn-lock",
      filePath: selected,
      packages: loadFromYarnLock(selected),
      notes: [
        `Scanned resolved dependency versions from ${relativeOrName(projectRoot, selected)}.`,
        "Dependency path reconstruction is limited for Yarn Classic lockfiles in this MVP."
      ],
      warnings: ["No supported lockfile was found at the repo root, so a nested lockfile was used instead."],
      skippedDependencies: []
    };
  }

  const packageJsonPath = findNearestPackageJson(projectRoot, maxDepth);
  if (packageJsonPath) {
    const manifestResult = loadFromPackageJson(packageJsonPath, prodOnly);
    const warnings = [
      "No supported lockfile was found, so the scanner fell back to package.json.",
      "Manifest fallback can only check direct dependencies pinned to exact versions."
    ];

    const npmrcPath = path.join(path.dirname(packageJsonPath), ".npmrc");
    if (fs.existsSync(npmrcPath)) {
      const npmrc = safeReadText(npmrcPath);
      if (/^\s*package-lock\s*=\s*false\s*$/m.test(npmrc)) {
        warnings.push(
          "This repo disables package-lock generation in .npmrc. For npm projects, try: npm install --package-lock-only --ignore-scripts --package-lock=true"
        );
      }
    }

    return {
      mode: "manifest-fallback",
      source: "package-json",
      filePath: packageJsonPath,
      packages: manifestResult.packages,
      notes: [
        `Scanned direct dependencies from ${relativeOrName(projectRoot, packageJsonPath)}.`,
        "Manifest fallback does not resolve transitive dependencies unless they are pinned and present in a lockfile."
      ],
      warnings,
      skippedDependencies: manifestResult.skippedDependencies
    };
  }

  return {
    mode: "manifest-fallback",
    source: "unknown",
    filePath: null,
    packages: [],
    notes: [],
    warnings: [],
    skippedDependencies: []
  };
}

export function buildNoPackagesMessage(projectRoot: string): string {
  return [
    "No scannable packages were found.",
    "Supported inputs: bun.lock, npm-shrinkwrap.json, package-lock.json, pnpm-lock.yaml, yarn.lock, or package.json with exact pinned versions.",
    `Searched under: ${projectRoot}`
  ].join(" ");
}
