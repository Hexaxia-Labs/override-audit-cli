export type SeverityLabel = "none" | "low" | "medium" | "high" | "critical" | "unknown";

export type PackageRef = {
  name: string;
  version: string;
  ecosystem: string;
  dev?: boolean;
  paths?: string[][];
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

export type CliCommand = "scan" | "advisories-sync" | "install-skill" | "config";

export type ParsedOptions = {
  version?: boolean;
  json?: boolean;
  verbose?: boolean;
  fix?: boolean;
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
};
