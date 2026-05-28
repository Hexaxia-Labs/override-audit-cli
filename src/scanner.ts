import type { Finding, NpmTransitiveGraph, OsvVuln, PackageRef, ParsedOptions, ScanInput } from "./types.js";
import { chunk, unique, runWithConcurrency } from "./utils/array.js";
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
import { resolveLowestKnownNonVulnerableVersion, resolvePublishedFixVersion } from "./remediation/npm-registry.js";
import { resolveNpmTransitiveRemediation, resolveTransitiveRemediationViaRegistry } from "./remediation/npm-transitive-resolution.js";
import { loadNpmLockGraph } from "./parsers/npm-lock-graph.js";
import { buildPnpmWorkspaceMap } from "./parsers/pnpm-lock.js";
import { buildNpmWorkspaceMap } from "./parsers/package-lock.js";
import { buildBunWorkspaceMap } from "./parsers/bun-lock.js";
import { pluralize } from "./utils/string.js";

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
    advisorySource: new OsvAdvisorySource(options?.osvUrl),
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
): Promise<Finding[]> {
  const sourceContext = createAdvisorySource({
    osvUrl: options.osvUrl,
    offline: options.offline,
    offlineDb: options.offlineDb,
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
  const cache = loadCache(cacheDirOverride);

  try {
    const results: Array<{ pkg: PackageRef; vulnIds: string[] }> = [];
    const uncachedPackages: PackageRef[] = [];

    if (!offline) {
      const nowMs = Date.now();
      for (const pkg of packages) {
        const cacheKey = getPackageCacheKey(pkg);
        if (!options.noCache) {
          const cached = cache.queryEntries[cacheKey];
          if (cached && !isEntryStale(cached, nowMs)) {
            if (cached.vulnIds.length > 0) {
              results.push({ pkg, vulnIds: cached.vulnIds });
            }
            continue;
          }
        }

        uncachedPackages.push(pkg);
      }

      const chunks = chunk(uncachedPackages, batchSize);
      spinner.update(`Scanning OSV in ${chunks.length} parallel ${pluralize(chunks.length, "batch", "batches")}...`);
      const allAdvisoryResults = await runWithConcurrency(
        chunks,
        5,
        c => advisorySource.queryBatch(c),
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

      if (chunks.length === 0) {
        spinner.succeed("Loaded package matches from cache");
      } else {
        spinner.succeed(`Queried OSV in ${chunks.length} ${pluralize(chunks.length, "batch", "batches")}`);
      }
    } else {
      const advisoryResult = await advisorySource.queryBatch(packages);
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
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          detailSpinner.update(`Fetching vulnerability details ${i + 1}/${ids.length}...`);
          if (id in cache.entries) {
            const cached = cache.entries[id];
            if (cached) {
              vulnMap.set(id, cached);
            }
            continue;
          }

          try {
            const detail = await advisorySource.getVuln(id);
            vulnMap.set(id, detail);
            cache.entries[id] = detail;
          } catch (_error) {
            cache.entries[id] = null;
          }
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
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          detailSpinner.update(`Loading local advisory details ${i + 1}/${ids.length}...`);
          try {
            const detail = await advisorySource.getVuln(id);
            vulnMap.set(id, detail);
          } catch {
            // ignore missing local records so scans remain resilient to partial DB state
          }
        }
        detailSpinner.succeed(`Loaded ${ids.length} local advisory detail ${pluralize(ids.length, "record")}`);
      } catch (error) {
        detailSpinner.fail("Failed while loading local advisory details");
        throw error;
      }
    }

    if (!offline && idSet.size > 0) {
      saveCache(cache, cacheDirOverride);
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

    const npmTransitiveGraph = context?.scanSource === "package-lock" && context.scanFilePath
      ? createNpmTransitiveGraphFromLockfile(context.scanFilePath)
      : null;
    const npmWorkspaceMap = (() => {
      try {
        return context?.scanSource === "package-lock" && context.scanFilePath
          ? buildNpmWorkspaceMap(context.scanFilePath) : null;
      } catch { return null; }
    })();
    const pnpmWorkspaceMap = (() => {
      try {
        return context?.scanSource === "pnpm-lock" && context.scanFilePath
          ? buildPnpmWorkspaceMap(context.scanFilePath) : null;
      } catch { return null; }
    })();
    const bunWorkspaceMap = (() => {
      try {
        return context?.scanSource === "bun-lock" && context.scanFilePath
          ? buildBunWorkspaceMap(context.scanFilePath) : null;
      } catch { return null; }
    })();
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
          });
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
      await validateDirectFixTargets(findings);
    }

    return findings;
  } catch (error) {
    spinner.fail("Scan failed");
    throw error;
  } finally {
    sourceContext.cleanup();
  }
}

function createNpmTransitiveGraphFromLockfile(filePath: string): NpmTransitiveGraph | null {
  try {
    const lockGraph = loadNpmLockGraph(filePath, { includePaths: false });
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
  } catch {
    return null;
  }
}

async function validateDirectFixTargets(
  findings: Finding[],
  onFinding?: (finding: Finding) => void,
): Promise<void> {
  const directCandidates = findings.filter(finding => finding.vulnerabilities.length > 0);

  for (const finding of directCandidates) {
    onFinding?.(finding);
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
        continue;
      }

      const hintResolution = await resolvePublishedFixVersion(finding.pkg.name, fixedVersionHint);
      if (
        hintResolution.resolvedVersion === lowestKnownResolution.resolvedVersion &&
        hintResolution.note
      ) {
        finding.fixVersionValidationNote = hintResolution.note;
        continue;
      }

      finding.fixVersionValidationNote =
        `Advisory fixed-version hint ${fixedVersionHint} is still known vulnerable for ${finding.pkg.name}; scanned ${lowestKnownResolution.candidatesChecked} package ${pluralize(lowestKnownResolution.candidatesChecked, "version")} above current version (${lowestKnownResolution.candidatesKnownVulnerable} still known vulnerable); using lowest known non-vulnerable version ${lowestKnownResolution.resolvedVersion}.`;
      continue;
    }

    if (!fixedVersionHint) {
      finding.validatedFirstFixedVersion = null;
      finding.fixVersionValidationNote = lowestKnownResolution.note;
      finding.validatedTargetScannedVersions = null;
      finding.validatedTargetKnownVulnerableVersions = null;
      continue;
    }

    const resolution = await resolvePublishedFixVersion(finding.pkg.name, fixedVersionHint);
    finding.validatedFirstFixedVersion = resolution.resolvedVersion;
    finding.fixVersionValidationNote = resolution.note ?? lowestKnownResolution.note;
    finding.validatedTargetScannedVersions = null;
    finding.validatedTargetKnownVulnerableVersions = null;
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
  if (packageName && directDependencyNames?.has(packageName)) return "direct";
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
    "This MVP checks package versions against OSV advisories. It does not prove exploitability or runtime reachability.",
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
