import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OverrideContext, PackageManager, SkippedDetector } from "./context.js";
import type { AuditLogHandle } from "../audit-log/index.js";
import { extractOverrideEntries } from "./parsing/package-json.js";
import { walkInstalledTree } from "./parsing/installed-tree.js";
import { loadFromPackageLock } from "../parsers/package-lock.js";
import { loadFromPnpmLock } from "../parsers/pnpm-lock.js";

export interface BuildOptions {
  auditLog: AuditLogHandle;
  logger: import("./context.js").Logger;
  /** True when --check-network is set (gates OA007). */
  checkNetwork: boolean;
}

export function buildOverrideContext(
  projectPath: string,
  opts: BuildOptions
): OverrideContext {
  const pkgJsonPath = join(projectPath, "package.json");
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`buildOverrideContext: no package.json at ${projectPath}`);
  }
  const raw = readFileSync(pkgJsonPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const overrideEntries = extractOverrideEntries(parsed);
  const packageManager = detectPackageManager(projectPath);

  const lockfilePackageNames = readLockfileNames(projectPath, packageManager);
  const nodeModulesExists = existsSync(join(projectPath, "node_modules"));

  const skipped: SkippedDetector[] = [];
  if (lockfilePackageNames.size === 0 && overrideEntries.length > 0) {
    skipped.push({ ruleId: "OA001", reason: "lockfile missing or empty" });
  }
  if (!nodeModulesExists && overrideEntries.length > 0) {
    skipped.push({ ruleId: "OA004", reason: "node_modules missing" });
    skipped.push({ ruleId: "OA006", reason: "node_modules missing" });
    skipped.push({ ruleId: "OA008", reason: "node_modules missing" });
  }

  // installedVersions: top-level node_modules/<name>/package.json reads.
  const installedVersions = new Map<string, string>();
  if (nodeModulesExists) {
    for (const e of overrideEntries) {
      const v = readInstalledVersionTopLevel(projectPath, e.packageName);
      if (v) installedVersions.set(e.packageName, v);
      if (typeof e.value === "object" && e.value) {
        for (const innerKey of Object.keys(e.value)) {
          const iv = readInstalledVersionTopLevel(projectPath, innerKey);
          if (iv) installedVersions.set(innerKey, iv);
        }
      }
    }
  }

  const tree = nodeModulesExists
    ? walkInstalledTree(projectPath)
    : { installedCopies: new Map(), parentDeclarations: new Map() };

  // OA007 registry: only when --check-network. Empty otherwise.
  const registryDistTags: OverrideContext["registryDistTags"] = new Map();

  return {
    projectPath,
    packageJson: parsed,
    packageJsonRaw: raw,
    packageManager,
    overrideEntries,
    lockfilePackageNames,
    installedVersions,
    installedCopies: tree.installedCopies,
    parentDeclarations: tree.parentDeclarations,
    registryDistTags,
    skippedDetectors: skipped,
    auditLog: opts.auditLog,
    logger: opts.logger,
  };
}

function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lock"))) return "bun";
  if (existsSync(join(projectPath, "package-lock.json"))) return "npm";
  return "unknown";
}

function readLockfileNames(projectPath: string, pm: PackageManager): Set<string> {
  try {
    if (pm === "npm") {
      const lockPath = join(projectPath, "package-lock.json");
      if (!existsSync(lockPath)) return new Set();
      const refs = loadFromPackageLock(lockPath, false);
      return new Set(refs.map((r) => r.name));
    }
    if (pm === "pnpm") {
      const lockPath = join(projectPath, "pnpm-lock.yaml");
      if (!existsSync(lockPath)) return new Set();
      const refs = loadFromPnpmLock(lockPath, false);
      return new Set(refs.map((r) => r.name));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

function readInstalledVersionTopLevel(projectPath: string, name: string): string | null {
  const p = join(projectPath, "node_modules", ...name.split("/"), "package.json");
  try {
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
    return typeof j.version === "string" ? j.version : null;
  } catch {
    return null;
  }
}
