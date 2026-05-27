// Shared types for override-audit-cli.
// Contract spec: docs/superpowers/specs/2026-05-27-override-audit-cli-design.md §4, §6.

export type PackageManager = 'npm' | 'pnpm';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0, low: 1, medium: 2, high: 3, critical: 4,
};

export type RuleId =
  | 'OA001-ORPHAN-TARGET'
  | 'OA002-FLOATING-TAG'
  | 'OA003-WRONG-SECTION'
  | 'OA004-INSTALLED-NEWER'
  | 'OA005-NESTED-OVERRIDE'
  | 'OA006-COUPLED-PLATFORM-BINARY'
  | 'OA007-FROZEN-LATEST'
  | 'OA008-VULNERABLE-TWIN';

export type SubRuleId =
  | 'OA005.a-NON-NPM'
  | 'OA005.b-ORPHANED-OUTER'
  | 'OA005.c-ORPHANED-INNER'
  | 'OA005.d-LEAKY'
  | 'OA005.e-SUSPECT';

export type RemediationAction = 'remove' | 'replace' | 'move' | 'suggest';

/** RFC 6902 JSON Patch operation (subset used by override-audit). */
export type RFC6902Patch =
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; from: string; path: string }
  | { op: 'add'; path: string; value: unknown };

export interface Remediation {
  action: RemediationAction;
  patch: RFC6902Patch | null;        // null when action='suggest'
  runnableFixCommand?: string;
  explanation: string;
}

export interface Finding {
  ruleId: RuleId;
  subRuleId?: SubRuleId;
  severity: Severity;
  title: string;
  detail: string;
  package: string;                   // override key (logical package name)
  overridePath: string[];            // path into package.json, e.g. ['overrides','postcss']
  pinValue: string | Record<string, unknown>;
  installedVersion?: string;
  packageManager: PackageManager;
  remediation: Remediation;
  references: string[];
}

export interface Summary {
  findingCount: number;
  bySeverity: Record<Severity, number>;
  byRule: Record<string, number>;
}

export interface OverrideAuditOutput {
  schemaVersion: '1';
  tool: 'override-audit-cli';
  toolVersion: string;
  generatedAt: string;
  projectPath: string;
  packageManager: PackageManager;
  attemptId: string;
  summary: Summary;
  findings: Finding[];
  skippedDetectors?: { ruleId: RuleId; reason: string }[];
  // fix?: FixReport — populated in Plan 2 only.
}

/** A package.json override entry as parsed (preserves nested shape). */
export type OverrideValue = string | { [key: string]: OverrideValue };

export interface OverrideEntry {
  /** Original key as written, e.g. "postcss" or "react@>=18". */
  key: string;
  /** Bare package name (key with any `@>=...` specifier stripped). */
  packageName: string;
  /** Value at the key — string pin or nested object. */
  value: OverrideValue;
  /** Path through package.json: e.g. ['overrides','postcss'] or ['pnpm','overrides','react']. */
  path: string[];
  /** Which container this entry lives in. */
  container: 'overrides' | 'pnpm.overrides' | 'resolutions';
}

/** One installed copy of a package somewhere under node_modules. */
export interface InstalledCopy {
  /** Package name (e.g. '@esbuild/linux-x64'). */
  name: string;
  /** Absolute path to the copy's directory under node_modules. */
  path: string;
  /** Version from that copy's package.json. */
  version: string;
}

/** A parent package that declares the target as a dependency. */
export interface ParentDeclaration {
  /** Parent's package name. */
  parentName: string;
  /** Parent's installed version. */
  parentVersion: string;
  /** Where in the parent's manifest the dep was declared. */
  declaredIn: 'dependencies' | 'optionalDependencies' | 'peerDependencies';
  /** The version range/value the parent wrote (e.g. '0.25.12' or '^0.25.0'). */
  declaredValue: string;
  /** True if declaredValue is a concrete pin like '0.25.12' (not a range). */
  exactVersion: boolean;
}

/** Registry dist-tags response (subset). */
export interface RegistryDistTags {
  latest?: string;
  next?: string;
  [tag: string]: string | undefined;
}

/** Built once per scan; consumed by all detectors. */
export interface Context {
  projectPath: string;
  packageJson: Record<string, unknown>;
  packageJsonRaw: string;           // for indent detection later
  packageManager: PackageManager;
  /** Override entries flattened across containers. */
  overrideEntries: OverrideEntry[];
  /** Bare package names present anywhere in the lockfile resolved tree. */
  lockfilePackageNames: Set<string>;
  /** name → installed version from node_modules/<name>/package.json (top-level only). */
  installedVersions: Map<string, string>;
  /** name → every installed copy in the tree (top-level + nested). Populated lazily by detectors that need it. */
  installedCopies: Map<string, InstalledCopy[]>;
  /** name → parents that declare it as a dep (for coupled-binary analysis). */
  parentDeclarations: Map<string, ParentDeclaration[]>;
  /** name → registry dist-tags (populated only when --with-registry). */
  registryDistTags: Map<string, RegistryDistTags>;
  /** Detectors that couldn't run; pass through to output.skippedDetectors. */
  skippedDetectors: { ruleId: RuleId; reason: string }[];
}

/** Scanner output, before output rendering. */
export interface ScanResult {
  context: Context;
  findings: Finding[];
}
