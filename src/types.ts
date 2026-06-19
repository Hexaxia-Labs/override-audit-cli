export type SeverityLabel = "none" | "low" | "medium" | "high" | "critical" | "unknown";

export type PackageRef = {
  name: string;
  version: string;
  ecosystem: string;
  dev?: boolean;
  paths?: string[][];
  resolvedUrl?: string;
};

export type NpmLockNode = {
  id: string;
  packageKey: string;
  name: string;
  version: string | null;
  packagePath: string;
  dev: boolean;
};

export type NpmLockGraph = {
  entryPackages: readonly string[];
  nodeIdsFor: (name: string, version: string | null) => readonly string[];
  getNode: (nodeId: string) => Readonly<NpmLockNode> | null;
  parentsFor: (nodeId: string) => readonly string[];
  childrenFor: (nodeId: string) => readonly string[];
  rangeFor: (parentNodeId: string, childName: string) => string | null;
  pathsFor: (nodeId: string) => string[][];
};

export type NpmTransitiveGraphNode = {
  id: string;
  name: string;
  version: string | null;
  packagePath?: string;
};

export type NpmTransitiveGraphEdge = {
  parentNodeId: string;
  childName: string;
  childNodeId: string;
  range: string;
};

export type NpmTransitiveGraph = {
  nodeIdsFor: (name: string, version: string | null) => readonly string[];
  getNode: (nodeId: string) => Readonly<NpmTransitiveGraphNode> | null;
  childrenFor: (nodeId: string) => readonly string[];
  rangeFor: (parentNodeId: string, childName: string) => string | null;
};

export type ScanMode = "resolved-lockfile" | "manifest-fallback";
export type ScanSource = "package-lock" | "npm-shrinkwrap" | "pnpm-lock" | "yarn-lock" | "bun-lock" | "package-json" | "unknown";

export type ScanInput = {
  mode: ScanMode;
  source: ScanSource;
  filePath: string | null;
  packages: PackageRef[];
  notes: string[];
  warnings: string[];
  skippedDependencies: string[];
};

export type OsvBatchResponse = {
  results?: Array<{
    vulns?: Array<{
      id: string;
      modified?: string;
    }>;
    next_page_token?: string;
  }>;
};

export type OsvVuln = {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  withdrawn?: string;
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: Record<string, unknown>;
  affected?: Array<{
    package?: {
      ecosystem?: string;
      name?: string;
      purl?: string;
    };
    ranges?: Array<{
      type?: string;
      events?: Array<{
        introduced?: string;
        fixed?: string;
        last_affected?: string;
      }>;
    }>;
  }>;
};

export type RecommendedParentUpgrade = {
  package: string;
  currentVersion: string;
  targetVersion: string;
  viaPath: string[];
  vulnerablePackage: string;
  confidence: "exact-direct-child" | "best-effort";
  reason: string;
};

export type NpmTransitiveRemediation = {
  kind: "update-parent-within-range" | "upgrade-parent-to-version";
  package: string;
  currentVersion: string;
  viaPath: string[];
  reason: string;
  targetChildVersion: string;
  targetVersion?: string;
  workspaces?: string[];
};

export type Finding = {
  pkg: PackageRef;
  vulnerabilities: OsvVuln[];
  severity: SeverityLabel;
  cveAliases: string[];
  dependencyPaths: string[][];
  relationship: "direct" | "transitive" | "unknown";
  firstFixedVersion: string | null;
  validatedFirstFixedVersion?: string | null;
  fixVersionValidationNote?: string | null;
  validatedTargetScannedVersions?: number | null;
  validatedTargetKnownVulnerableVersions?: number | null;
  recommendedParentUpgrade?: RecommendedParentUpgrade | null;
  recommendedNpmTransitiveRemediation?: NpmTransitiveRemediation | null;
  usage?: {
    imported: boolean;
    files: string[];
  };
  maliciousUnverifiable?: boolean;
  maliciousGitSource?: boolean;
  maliciousGitSourcePinned?: boolean;
};

export type QueryCacheEntry = { vulnIds: string[]; cachedAt: string };

export type CacheFile = {
  version: 3;
  createdAt: string;
  entries: Record<string, OsvVuln | null>;
  queryEntries: Record<string, QueryCacheEntry>;
};

export type Spinner = {
  update: (message: string) => void;
  succeed: (message: string) => void;
  fail: (message: string) => void;
  stop: () => void;
};

export type BaselineEntry = {
  name: string;
  version: string;
  advisoryIds: string[];
};

export type Baseline = {
  version: 1;
  createdAt: string;
  findings: BaselineEntry[];
};

export type CliCommand = "scan" | "advisories-sync" | "install-skill" | "config" | "overrides";

export type ParsedOptions = {
  version?: boolean;
  json?: boolean;
  debug?: boolean;
  verbose?: boolean;
  fix?: boolean;
  ratchet?: boolean;
  createPr?: boolean;
  prBase?: string;
  prodOnly?: boolean;
  failOn: string;
  batchSize: string;
  offline?: boolean;
  offlineDb?: string;
  cacheDir?: string;
  searchDepth?: string;
  all?: boolean;
  minSeverity?: string;
  help?: boolean;
  osvUrl?: string;
  output?: string;
  usage?: boolean;
  onlyUsed?: boolean;
  report?: string | true;
  noOpen?: boolean;
  noCache?: boolean;
  sarif?: boolean;
  cdx?: boolean;
  caCert?: string;
  /** --audit-log <path> - project-wide opt-in NDJSON change-control stream. */
  auditLog?: string;
  /** --check-overrides - run override hygiene checks as part of `scan` (off by default; spec keeps default scan CVE-only). */
  checkOverrides?: boolean;
  /** --check-network - gates OA007 registry calls inside `cve-lite overrides`. */
  checkNetwork?: boolean;
  /** --rule <id> - filter `overrides` to a single rule (OA001-OA008). */
  rule?: string;
};

/**
 * Exit codes used by the CLI.
 *
 * 0 - no findings above --fail-on threshold
 * 1 - findings present (CVE or override) above threshold
 * 2 - --fix applied but verify() detected the fix did not take
 *     (operationally distinct from 1: "fix ran but did not work")
 * 3 - tool error (unhandled exception, unreadable lockfile, etc.)
 */
export const EXIT_OK = 0 as const;
export const EXIT_FINDINGS = 1 as const;
export const EXIT_VERIFY_FAILED = 2 as const;
export const EXIT_ERROR = 3 as const;

export type ExitCode =
  | typeof EXIT_OK
  | typeof EXIT_FINDINGS
  | typeof EXIT_VERIFY_FAILED
  | typeof EXIT_ERROR;

// Re-export override and audit-log surface for consumers that import from src/types.
export type {
  OverrideFinding,
  OverrideRuleId,
  OverrideSubRuleId,
  OverrideFix,
  OverrideFixOp,
} from "./overrides/index.js";

export type { AuditEvent, AuditLogHandle } from "./audit-log/index.js";
