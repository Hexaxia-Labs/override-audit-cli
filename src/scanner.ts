import type { Finding, NpmTransitiveGraph, OsvVuln, PackageRef, ParsedOptions, ScanInput } from "./types.js";
import { chunk, unique, runWithConcurrency } from "./utils/array.js";
import { isPrivateRegistrySource, isGitSource, hasCommitShaPinning } from "./utils/advisory.js";
import { compareVersions, isPreReleaseVersion, looksLikeVersion } from "./utils/version.js";
import { loadCache, saveCache, isEntryStale } from "./osv/cache.js";
import { maxSeverity } from "./osv/severity.js";
import { createSpinner } from "./output/spinner.js";
import { OsvAdvisorySource } from "./advisory/osv-advisory-source.js";
import { AdvisorySource } from "./advisory/advisory-source.js";
import { LocalAdvisorySource } from "./advisory/local-advisory-source.js";
import { AdvisoryDbMetadata, LocalAdvisoryDatabase } from "./advisory/local-db.js";
import { ADVISORY_DB_STALE_AFTER_MS, getDefaultAdvisoryDbPath } from "./advisory/osv-sync.js";
import { resolveRecommendedParentUpgrade } from "./remediation/parent-upgrade.js";
import {
  configureNpmRegistryDebug,
  fetchPackument,
  resolveLowestKnownNonVulnerableVersion,
  resolvePublishedFixVersion,
} from "./remediation/npm-registry.js";
import { countBySeverity } from "./utils/severity.js";
import { resolveNpmTransitiveRemediation, resolveTransitiveRemediationViaRegistry } from "./remediation/npm-transitive-resolution.js";
import { loadNpmLockGraph } from "./parsers/npm-lock-graph.js";
import { buildPnpmWorkspaceMap } from "./parsers/pnpm-lock.js";
import { buildNpmWorkspaceMap } from "./parsers/package-lock.js";
import { buildBunWorkspaceMap } from "./parsers/bun-lock.js";
import { pluralize } from "./utils/string.js";
import { type DebugLogger } from "./output/debug.js";


type ScanClassificationContext = {
  directDependencyNames?: ReadonlySet<string> | null;
  scanSource?: ScanInput["source"];
  scanFilePath?: string | null;
};

type AdvisorySourceContext = {
  advisorySource: AdvisorySource;
  offline: boolean;
  sourceLabel: string;
  advisoryDbMetadata: AdvisoryDbMetadata | null;
  advisoryDbIsStale: boolean;
  cleanup: () => void;
};

export function createAdvisorySource(options?: {
  osvUrl?: string;
  offline?: boolean;
  offlineDb?: string;
  debugLog?: DebugLogger;
}): AdvisorySourceContext {
  const offline = !!options?.offline || !!options?.offlineDb;

  if (offline) {
    const dbPath = getDefaultAdvisoryDbPath(options?.offlineDb);
    const db = new LocalAdvisoryDatabase(dbPath, { readonly: true });
    return {
      advisorySource: new LocalAdvisorySource(db),
      offline: true,
      sourceLabel: `local advisory database (${dbPath})`,
      advisoryDbMetadata: db.getMetadata(),
      advisoryDbIsStale: isAdvisoryDbStale(db.getMetadata()),
      cleanup: () => db.close(),
    };
  }

  return {
    advisorySource: new OsvAdvisorySource(options?.osvUrl, options?.debugLog),
    offline: false,
    sourceLabel: options?.osvUrl
      ? `custom OSV endpoint (${options.osvUrl})`
      : "OSV (https://api.osv.dev)",
    advisoryDbMetadata: null,
    advisoryDbIsStale: false,
    cleanup: () => {},
  };
}

function getPackageCacheKey(pkg: PackageRef): string {
  return `${pkg.ecosystem}:${pkg.name}@${pkg.version}`;
}

export async function scanPackages(
  packages: PackageRef[],
  batchSize: number,
  options: ParsedOptions,
  context?: ScanClassificationContext,
  debugLog?: DebugLogger,
): Promise<Finding[]> {
  const log: DebugLogger = debugLog ?? (() => {});
  const sourceContext = createAdvisorySource({
    osvUrl: options.osvUrl,
    offline: options.offline,
    offlineDb: options.offlineDb,
    debugLog: log,
  });
  const offline = sourceContext.offline;
  const cacheDirOverride = options.cacheDir;

  const spinner = createSpinner(
    offline
      ? "Scanning dependencies against the local advisory database..."
      : "Scanning dependencies against OSV...",
    options,
  );
  const advisorySource = sourceContext.advisorySource;
  if (!offline && options.debug) {
    configureNpmRegistryDebug(log);
  }
  const cache = loadCache(cacheDirOverride, options.debug ? log : undefined);

  try {
    const results: Array<{ pkg: PackageRef; vulnIds: string[] }> = [];
    const uncachedPackages: PackageRef[] = [];

    if (!offline) {
      const nowMs = Date.now();
      let hits = 0;
      let misses = 0;
      for (const pkg of packages) {
        const cacheKey = getPackageCacheKey(pkg);
        if (!options.noCache) {
          const cached = cache.queryEntries[cacheKey];
          if (cached && !isEntryStale(cached, nowMs)) {
            hits += 1;
            if (cached.vulnIds.length > 0) {
              results.push({ pkg, vulnIds: cached.vulnIds });
            }
            continue;
          }
        }

        misses += 1;
        uncachedPackages.push(pkg);
      }

      const chunks = chunk(uncachedPackages, batchSize);
      const reason = options.noCache ? "no-cache mode" : "stale or missing entry";
      log("Cache check", { hits, misses, reason, uncachedBatches: chunks.length });
      spinner.update(`Scanning OSV in ${chunks.length} parallel ${pluralize(chunks.length, "batch", "batches")}...`);

      const osvScanStartedAt = Date.now();
      let batchCounter = 0;
      const allAdvisoryResults = await runWithConcurrency(
        chunks,
        5,
        c => {
          batchCounter += 1;
          const batchId = `b-${String(batchCounter).padStart(2, "0")}`;
          return advisorySource.queryBatch(c, { batchId });
        },
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunkItems = chunks[i]!;
        const rows = allAdvisoryResults[i] ?? [];

        for (let j = 0; j < chunkItems.length; j++) {
          const pkg = chunkItems[j]!;
          const row = rows[j];
          const vulnIds = (row?.vulnerabilities ?? []).map(v => v.id).filter(Boolean);
          cache.queryEntries[getPackageCacheKey(pkg)] = { vulnIds, cachedAt: new Date().toISOString() };
          if (vulnIds.length > 0) {
            results.push({ pkg, vulnIds });
          }
        }
      }

      if (chunks.length > 0) {
        log("OSV scan complete", {
          totalBatches: chunks.length,
          totalDurationMs: Date.now() - osvScanStartedAt,
          packagesWithVulns: results.length,
        });
      }

      if (chunks.length === 0) {
        spinner.succeed("Loaded package matches from cache");
      } else {
        spinner.succeed(`Queried OSV in ${chunks.length} ${pluralize(chunks.length, "batch", "batches")}`);
      }
    } else {
      const advisoryResult = await advisorySource.queryBatch(packages, { batchId: "offline" });
      const rows = advisoryResult ?? [];
      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        const row = rows[i];
        const vulnIds = (row?.vulnerabilities ?? []).map(v => v.id).filter(Boolean);
        if (vulnIds.length > 0) {
          results.push({ pkg, vulnIds });
        }
      }
      spinner.succeed("Loaded package matches from the local advisory database");
    }

    const idSet = new Set(results.flatMap(r => r.vulnIds));
    const vulnMap = new Map<string, OsvVuln>();

    if (idSet.size > 0 && !offline) {
      const ids = [...idSet];
      const detailSpinner = createSpinner("Fetching vulnerability details...", options);
      try {
        // cache.entries holds OsvVuln detail records. Unlike cache.queryEntries (which has a
        // 30-minute staleness check applied earlier in this function), detail records have no
        // expiry — they are considered valid for the lifetime of the cache file. The check below
        // is therefore a simple presence check, not a staleness check. This is intentional and
        // matches the original behaviour. Fetches run concurrently because there is no ordering
        // dependency between CVE ID detail requests.
        const uncachedIds: string[] = [];
        for (const id of ids) {
          if (id in cache.entries) {
            const cached = cache.entries[id];
            if (cached) vulnMap.set(id, cached);
          } else {
            uncachedIds.push(id);
          }
        }

        // Fetch all uncached IDs concurrently
        if (uncachedIds.length > 0) {
          detailSpinner.update(`Fetching ${uncachedIds.length} vulnerability details...`);
          await runWithConcurrency(uncachedIds, 10, async (id) => {
            try {
              const detail = await advisorySource.getVuln(id);
              vulnMap.set(id, detail);
              cache.entries[id] = detail;
            } catch {
              cache.entries[id] = null;
            }
          });
        }
        detailSpinner.succeed(`Loaded ${ids.length} vulnerability detail ${pluralize(ids.length, "record")}`);
      } catch (error) {
        detailSpinner.fail("Failed while fetching vulnerability details");
        throw error;
      }
    } else if (idSet.size > 0 && offline) {
      const ids = [...idSet];
      const detailSpinner = createSpinner("Loading local advisory details...", options);
      try {
        await runWithConcurrency(ids, 10, async (id) => {
          try {
            const detail = await advisorySource.getVuln(id);
            vulnMap.set(id, detail);
          } catch {
            // ignore missing local records so scans remain resilient to partial DB state
          }
        });
        detailSpinner.succeed(`Loaded ${ids.length} local advisory detail ${pluralize(ids.length, "record")}`);
      } catch (error) {
        detailSpinner.fail("Failed while loading local advisory details");
        throw error;
      }
    }

    if (!offline && idSet.size > 0) {
      saveCache(cache, cacheDirOverride, options.debug ? log : undefined);
    }

    const findings: Finding[] = results.map(result => {
      const vulnerabilities = result.vulnIds
        .map(id => vulnMap.get(id))
        .filter((v): v is OsvVuln => Boolean(v));

      const severity = maxSeverity(vulnerabilities);
      const cveAliases = unique(
        vulnerabilities.flatMap(v => (v.aliases ?? []).filter(a => a.startsWith("CVE-"))),
      );
      const dependencyPaths = result.pkg.paths ?? [];
      const relationship = classifyRelationship(
        dependencyPaths,
        result.pkg.name,
        context?.directDependencyNames,
      );
      const firstFixedVersion = findFirstFixedVersion(vulnerabilities);

      return {
        pkg: result.pkg,
        vulnerabilities,
        severity,
        cveAliases,
        dependencyPaths,
        relationship,
        firstFixedVersion,
        validatedFirstFixedVersion: null,
        fixVersionValidationNote: null,
        validatedTargetScannedVersions: null,
        validatedTargetKnownVulnerableVersions: null,
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: undefined,
      };
    });

    for (const finding of findings) {
      if (finding.vulnerabilities.some(v => v.id.startsWith("MAL-"))) {
        if (isGitSource(finding.pkg)) {
          finding.maliciousGitSource = true;
          finding.maliciousGitSourcePinned = hasCommitShaPinning(finding.pkg);
        } else if (isPrivateRegistrySource(finding.pkg)) {
          finding.maliciousUnverifiable = true;
        }
      }
    }

    const npmTransitiveGraph = context?.scanSource === "package-lock" && context.scanFilePath
      ? createNpmTransitiveGraphFromLockfile(context.scanFilePath, log, packages.length)
      : null;
    const npmWorkspaceMap = (() => {
      try {
        return context?.scanSource === "package-lock" && context.scanFilePath
          ? buildNpmWorkspaceMap(context.scanFilePath) : null;
      } catch (error) {
        log("Workspace map", {
          type: "npm",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();
    if (npmWorkspaceMap) {
      log("Workspace map", { type: "npm", workspaces: npmWorkspaceMap.size });
    }
    const pnpmWorkspaceMap = (() => {
      try {
        return context?.scanSource === "pnpm-lock" && context.scanFilePath
          ? buildPnpmWorkspaceMap(context.scanFilePath) : null;
      } catch (error) {
        log("Workspace map", {
          type: "pnpm",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();
    if (pnpmWorkspaceMap) {
      log("Workspace map", { type: "pnpm", workspaces: pnpmWorkspaceMap.size });
    }
    const bunWorkspaceMap = (() => {
      try {
        return context?.scanSource === "bun-lock" && context.scanFilePath
          ? buildBunWorkspaceMap(context.scanFilePath) : null;
      } catch (error) {
        log("Workspace map", {
          type: "bun",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    })();
    if (bunWorkspaceMap) {
      log("Workspace map", { type: "bun", workspaces: bunWorkspaceMap.size });
    }
    const lockfileWorkspaceMap = pnpmWorkspaceMap ?? bunWorkspaceMap ?? null;
    const npmRemediationCache = new Map<string, Finding["recommendedNpmTransitiveRemediation"]>();
    const parentUpgradeCache = new Map<string, Finding["recommendedParentUpgrade"]>();
    const directValidationCount = offline ? 0 : findings.length;
    const transitiveRemediationCount = findings.filter(finding => finding.relationship === "transitive").length;
    const analysisStepCount = directValidationCount + transitiveRemediationCount;

    if (analysisStepCount > 0) {
      const analysisSpinner = createSpinner("Analyzing vulnerability findings...", options);
      let completedSteps = 0;

      const updateAnalysisProgress = (phase: string, subject: string) => {
        completedSteps += 1;
        analysisSpinner.update(
          `Analyzing vulnerability findings ${completedSteps}/${analysisStepCount}: ${phase} ${subject}...`,
        );
      };

      try {
        if (!offline) {
          await validateDirectFixTargets(findings, (finding) => {
            updateAnalysisProgress("validating fix target for", `${finding.pkg.name}@${finding.pkg.version}`);
          }, log);
        }

        // Pre-warm packument cache for all packages needed in the remediation loop.
        // This converts N sequential registry round-trips into one concurrent burst,
        // after which the loop runs entirely from the in-memory packument cache.
        if (!offline) {
          const packumentsToPrewarm = new Set<string>();
          for (const finding of findings) {
            if (finding.relationship !== "transitive") continue;
            packumentsToPrewarm.add(finding.pkg.name);
            const paths = finding.dependencyPaths;
            if (paths.length > 0 && paths[0].length >= 2) {
              packumentsToPrewarm.add(paths[0][paths[0].length - 2]);
            }
          }
          if (packumentsToPrewarm.size > 0) {
            await runWithConcurrency([...packumentsToPrewarm], 8, async (name) => {
              try { await fetchPackument(name); } catch { /* loop will handle missing packuments */ }
            });
          }
        }

        for (const finding of findings) {
          if (finding.relationship !== "transitive") continue;

          updateAnalysisProgress("resolving remediation for", `${finding.pkg.name}@${finding.pkg.version}`);

          const remediationCacheKey = JSON.stringify({
            package: finding.pkg.name,
            version: finding.pkg.version,
            dependencyPaths: finding.dependencyPaths,
            firstFixedVersion: finding.firstFixedVersion,
            validatedFirstFixedVersion: finding.validatedFirstFixedVersion ?? null,
          });

          try {
            if (npmTransitiveGraph) {
              if (npmRemediationCache.has(remediationCacheKey)) {
                finding.recommendedNpmTransitiveRemediation =
                  npmRemediationCache.get(remediationCacheKey) ?? undefined;
              } else {
                finding.recommendedNpmTransitiveRemediation = await resolveNpmTransitiveRemediation({
                  finding,
                  graph: npmTransitiveGraph,
                  packages,
                  directDependencyNames: context?.directDependencyNames,
                  offline,
                  workspaceMap: npmWorkspaceMap,
                });
                npmRemediationCache.set(
                  remediationCacheKey,
                  finding.recommendedNpmTransitiveRemediation ?? null,
                );
              }

              if (finding.recommendedNpmTransitiveRemediation?.kind === "upgrade-parent-to-version") {
                finding.recommendedParentUpgrade = {
                  package: finding.recommendedNpmTransitiveRemediation.package,
                  currentVersion: finding.recommendedNpmTransitiveRemediation.currentVersion,
                  targetVersion: finding.recommendedNpmTransitiveRemediation.targetVersion ?? "",
                  viaPath: finding.recommendedNpmTransitiveRemediation.viaPath,
                  vulnerablePackage: finding.pkg.name,
                  confidence: "exact-direct-child",
                  reason: finding.recommendedNpmTransitiveRemediation.reason,
                };
                continue;
              }

              if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
                finding.recommendedParentUpgrade = undefined;
                continue;
              }
            }

            if (!offline && !npmTransitiveGraph) {
              if (npmRemediationCache.has(remediationCacheKey)) {
                finding.recommendedNpmTransitiveRemediation =
                  npmRemediationCache.get(remediationCacheKey) ?? undefined;
              } else {
                finding.recommendedNpmTransitiveRemediation = await resolveTransitiveRemediationViaRegistry({
                  finding,
                  packages,
                  directDependencyNames: context?.directDependencyNames,
                  workspaceMap: lockfileWorkspaceMap,
                });
                npmRemediationCache.set(
                  remediationCacheKey,
                  finding.recommendedNpmTransitiveRemediation ?? null,
                );
              }

              if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
                finding.recommendedParentUpgrade = undefined;
                continue;
              }
            }

            if (parentUpgradeCache.has(remediationCacheKey)) {
              finding.recommendedParentUpgrade = parentUpgradeCache.get(remediationCacheKey) ?? undefined;
            } else {
              finding.recommendedParentUpgrade = await resolveRecommendedParentUpgrade(
                finding,
                packages,
                context?.directDependencyNames,
                { offline },
              );
              parentUpgradeCache.set(remediationCacheKey, finding.recommendedParentUpgrade ?? null);
            }
          } catch {
            finding.recommendedNpmTransitiveRemediation = undefined;
            finding.recommendedParentUpgrade = undefined;
          }
        }

        analysisSpinner.succeed("Analyzed vulnerability findings");
      } catch (error) {
        analysisSpinner.fail("Failed while analyzing vulnerability findings");
        throw error;
      }
    } else if (!offline) {
      await validateDirectFixTargets(findings, undefined, log);
    }

    const severityCounts = countBySeverity(findings);
    log("Findings classified", {
      total: findings.length,
      direct: findings.filter(finding => finding.relationship === "direct").length,
      transitive: findings.filter(finding => finding.relationship === "transitive").length,
      critical: severityCounts.critical,
      high: severityCounts.high,
      medium: severityCounts.medium,
      low: severityCounts.low,
      unknown: severityCounts.unknown,
    });

    return findings;
  } catch (error) {
    spinner.fail("Scan failed");
    throw error;
  } finally {
    sourceContext.cleanup();
  }
}

function createNpmTransitiveGraphFromLockfile(
  filePath: string,
  log: DebugLogger,
  packageCount: number,
): NpmTransitiveGraph | null {
  try {
    const lockGraph = loadNpmLockGraph(filePath, { includePaths: false });
    log("npm transitive graph", { status: "built", nodes: packageCount });
    return {
      nodeIdsFor(name: string, version: string | null) {
        return lockGraph.nodeIdsFor(name, version);
      },
      getNode(nodeId: string) {
        const node = lockGraph.getNode(nodeId);
        return node
          ? { id: node.id, name: node.name, version: node.version, packagePath: node.packagePath }
          : null;
      },
      childrenFor(nodeId: string) {
        return lockGraph.childrenFor(nodeId);
      },
      rangeFor(parentNodeId: string, childName: string) {
        return lockGraph.rangeFor(parentNodeId, childName);
      },
    };
  } catch (error) {
    log("npm transitive graph", {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function validateDirectFixTargets(
  findings: Finding[],
  onFinding?: (finding: Finding) => void,
  debugLog?: DebugLogger,
): Promise<void> {
  const directCandidates = findings.filter(finding => finding.vulnerabilities.length > 0);

  for (const finding of directCandidates) {
    onFinding?.(finding);
    const logFixValidation = () => {
      debugLog?.("Fix validation", {
        package: finding.pkg.name,
        installed: finding.pkg.version,
        resolvedFixVersion: finding.validatedFirstFixedVersion,
        verified: Boolean(finding.validatedFirstFixedVersion),
      });
    };
    const lowestKnownResolution = await resolveLowestKnownNonVulnerableVersion(
      finding.pkg.name,
      finding.pkg.version,
      finding.vulnerabilities,
    );
    const fixedVersionHint = finding.firstFixedVersion;

    if (lowestKnownResolution.resolvedVersion) {
      finding.validatedFirstFixedVersion = lowestKnownResolution.resolvedVersion;
      finding.validatedTargetScannedVersions = lowestKnownResolution.candidatesChecked;
      finding.validatedTargetKnownVulnerableVersions = lowestKnownResolution.candidatesKnownVulnerable;

      if (!fixedVersionHint || fixedVersionHint === lowestKnownResolution.resolvedVersion) {
        finding.fixVersionValidationNote = null;
        logFixValidation();
        continue;
      }

      const hintResolution = await resolvePublishedFixVersion(finding.pkg.name, fixedVersionHint);
      if (
        hintResolution.resolvedVersion === lowestKnownResolution.resolvedVersion &&
        hintResolution.note
      ) {
        finding.fixVersionValidationNote = hintResolution.note;
        logFixValidation();
        continue;
      }

      finding.fixVersionValidationNote =
        `Advisory fixed-version hint ${fixedVersionHint} is still known vulnerable for ${finding.pkg.name}; scanned ${lowestKnownResolution.candidatesChecked} package ${pluralize(lowestKnownResolution.candidatesChecked, "version")} above current version (${lowestKnownResolution.candidatesKnownVulnerable} still known vulnerable); using lowest known non-vulnerable version ${lowestKnownResolution.resolvedVersion}.`;
      logFixValidation();
      continue;
    }

    if (!fixedVersionHint) {
      finding.validatedFirstFixedVersion = null;
      finding.fixVersionValidationNote = lowestKnownResolution.note;
      finding.validatedTargetScannedVersions = null;
      finding.validatedTargetKnownVulnerableVersions = null;
      logFixValidation();
      continue;
    }

    const resolution = await resolvePublishedFixVersion(finding.pkg.name, fixedVersionHint);
    finding.validatedFirstFixedVersion = resolution.resolvedVersion;
    finding.fixVersionValidationNote = resolution.note ?? lowestKnownResolution.note;
    finding.validatedTargetScannedVersions = null;
    finding.validatedTargetKnownVulnerableVersions = null;
    logFixValidation();
  }
}

function isAdvisoryDbStale(metadata: AdvisoryDbMetadata): boolean {
  if (!metadata.lastSyncAt) {
    return true;
  }

  const timestamp = Date.parse(metadata.lastSyncAt);
  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp > ADVISORY_DB_STALE_AFTER_MS;
}

function classifyRelationship(
  paths: string[][],
  packageName?: string,
  directDependencyNames?: ReadonlySet<string> | null,
): "direct" | "transitive" | "unknown" {
  if (packageName && directDependencyNames?.has(packageName)) {
    // The package name is declared as a direct dependency. But when multiple versions
    // of the same package are installed (one direct, one transitive), the name alone
    // is not enough — we need to verify this specific installed version is the direct
    // one. A direct install always has at least one path of length 2 (["project", name]).
    // If all paths are longer, this is a different (transitive) version of the package.
    if (paths.length === 0) return "direct"; // no path data — trust the name
    const hasDirectPath = paths.some(p => p.length <= 2);
    return hasDirectPath ? "direct" : "transitive";
  }
  if (paths.length === 0) return "unknown";
  if (directDependencyNames) return "transitive";
  const shortest = Math.min(...paths.map(p => p.length));
  if (shortest <= 2) return "direct";
  return "transitive";
}

function findFirstFixedVersion(vulns: OsvVuln[]): string | null {
  const fixedVersions: string[] = [];
  for (const vuln of vulns) {
    for (const affected of vuln.affected ?? []) {
      for (const range of affected.ranges ?? []) {
        for (const event of range.events ?? []) {
          const fixed = event.fixed;
          if (fixed && looksLikeVersion(fixed) && !isPreReleaseVersion(fixed)) {
            fixedVersions.push(fixed);
          }
        }
      }
    }
  }
  if (fixedVersions.length === 0) return null;
  return fixedVersions.sort(compareVersions)[0];
}

export function buildCoverageNotes(scanInput: ScanInput, offline: boolean): string[] {
  const notes = [
    "CVE Lite CLI checks package versions against OSV advisories. It does not prove exploitability or runtime reachability.",
    "Installed node_modules contents are not verified in this scan.",
    "Container images, binaries, secrets, and IaC files are not scanned.",
    "Monorepo workspace boundaries are only partially modeled in this version.",
  ];

  if (scanInput.mode === "manifest-fallback") {
    notes.push("Manifest fallback is limited to direct dependencies pinned to exact versions. It does not resolve transitive dependencies from package.json alone.");
  }

  if (offline) {
    notes.push("Offline mode uses the local advisory database and does not make outbound advisory API calls.");
  }

  return notes;
}
