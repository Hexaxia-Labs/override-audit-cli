// Single context object built once per scan/audit and consumed by every
// detector. Filled by buildOverrideContext() from cve-lite's parser outputs.

import type { AuditLogHandle } from "../audit-log/index.js";

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

/** A package.json override entry (preserves nested shape). */
export type OverrideValue = string | { [key: string]: OverrideValue };

export interface OverrideEntry {
  /** Original key as written: "postcss" or "react@>=18". */
  key: string;
  /**
   * Bare package name (key with any `@>=...` specifier stripped). For a pnpm
   * selective `parent>child` key this is the CHILD target (the real package
   * being overridden), and `parentScope` carries the parent.
   */
  packageName: string;
  /**
   * For pnpm selective `parent>child` keys: the parent scope (bare name).
   * Undefined for plain keys. When set, OA001 skips the entry and OA005 owns
   * the "is this nested override sensible" question.
   */
  parentScope?: string;
  value: OverrideValue;
  /** Path through package.json: ["overrides","postcss"] or ["pnpm","overrides","react"]. */
  path: string[];
  container: "overrides" | "pnpm.overrides" | "resolutions";
}

/** A package installed under node_modules somewhere. */
export interface InstalledCopy {
  name: string;
  path: string;            // absolute path to the copy's directory
  version: string;
}

/** Parent declaration of a target - for OA006 platform-binary coupling. */
export interface ParentDeclaration {
  parentName: string;
  parentVersion: string;
  declaredIn: "dependencies" | "optionalDependencies" | "peerDependencies";
  declaredValue: string;
  exactVersion: boolean;
}

/** Registry dist-tags response subset - for OA007. */
export interface RegistryDistTags {
  latest?: string;
  next?: string;
  [tag: string]: string | undefined;
}

/** Reason a detector was pre-emptively skipped (e.g., missing node_modules). */
export interface SkippedDetector {
  ruleId: string;
  reason: string;
}

export interface OverrideContext {
  projectPath: string;
  packageJson: Record<string, unknown>;
  packageJsonRaw: string;
  packageManager: PackageManager;
  /** Flattened overrides across npm/pnpm/yarn-resolutions containers. */
  overrideEntries: OverrideEntry[];
  /** Bare package names present anywhere in the resolved lockfile tree. */
  lockfilePackageNames: Set<string>;
  /** name -> installed version (top-level node_modules only). */
  installedVersions: Map<string, string>;
  /** name -> every installed copy in the tree, populated eagerly by
   *  walkInstalledTree when node_modules exists; consumed by OA006 and OA008. */
  installedCopies: Map<string, InstalledCopy[]>;
  /** name -> parents that declare it. */
  parentDeclarations: Map<string, ParentDeclaration[]>;
  /** name -> registry dist-tags (only populated when --check-network). */
  registryDistTags: Map<string, RegistryDistTags>;
  /** Detectors the runner pre-skipped (lockfile missing, etc.). */
  skippedDetectors: SkippedDetector[];
  auditLog: AuditLogHandle;
  logger: Logger;
}
