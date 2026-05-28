import type { Finding, PackageRef } from "../types.js";
import { compareVersions, isPreReleaseVersion, looksLikeVersion } from "../utils/version.js";
import { fetchPackument } from "./npm-registry.js";
import { findSafeVersionWithinParentRange } from "./npm-transitive-graph.js";
import type { NpmTransitiveGraph } from "../types.js";

export type NpmTransitiveRemediation =
  | {
      kind: "update-parent-within-range";
      package: string;
      currentVersion: string;
      targetChildVersion: string;
      viaPath: string[];
      reason: string;
      workspaces?: string[];
    }
  | {
      kind: "upgrade-parent-to-version";
      package: string;
      currentVersion: string;
      targetVersion: string;
      targetChildVersion: string;
      viaPath: string[];
      reason: string;
    };

export async function resolveTransitiveRemediationViaRegistry(args: {
  finding: Finding;
  packages: PackageRef[];
  directDependencyNames?: ReadonlySet<string> | null;
  workspaceMap?: Map<string, string[]> | null;
}): Promise<NpmTransitiveRemediation | null> {
  if (args.finding.relationship !== "transitive") return null;

  const viaPath = getBestPath(args.finding);
  if (!viaPath || viaPath.length < 3) return null;

  const directParentContext = resolveDirectParentContext(
    viaPath,
    args.packages,
    args.directDependencyNames,
  );
  if (!directParentContext) return null;

  const { directParentName, immediateParentName, directParent } = directParentContext;
  if (directParentName !== immediateParentName) return null;

  if (!looksLikeVersion(directParent.version)) return null;

  const vulnerableName = args.finding.pkg.name;
  const fixHint = args.finding.validatedFirstFixedVersion ?? args.finding.firstFixedVersion;

  const safeCandidates = await findSafeChildCandidates(
    vulnerableName,
    args.finding.pkg.version,
    fixHint,
  );
  if (safeCandidates.length === 0) return null;

  const packument = await fetchPackument(directParentName);
  const parentManifest = packument?.versions?.[directParent.version];
  const depRange =
    parentManifest?.dependencies?.[vulnerableName] ??
    parentManifest?.optionalDependencies?.[vulnerableName];

  if (!depRange) return null;

  const inRangeTarget = [...safeCandidates]
    .sort(compareVersions)
    .filter(v => versionSatisfiesRange(v, depRange))
    .at(-1);

  if (!inRangeTarget) return null;

  const workspaces = collectWorkspacesFromAllPaths(
    args.finding.dependencyPaths ?? [],
    args.workspaceMap,
  );

  return {
    kind: "update-parent-within-range",
    package: directParentName,
    currentVersion: directParent.version,
    targetChildVersion: inRangeTarget,
    viaPath,
    reason: `${directParentName}@${directParent.version} already allows ${vulnerableName}@${inRangeTarget} within the current dependency range`,
    workspaces,
  };
}

export async function resolveNpmTransitiveRemediation(args: {
  finding: Finding;
  graph: NpmTransitiveGraph;
  packages: PackageRef[];
  directDependencyNames?: ReadonlySet<string> | null;
  offline?: boolean;
  workspaceMap?: Map<string, string[]> | null;
}): Promise<NpmTransitiveRemediation | null> {
  if (args.finding.relationship !== "transitive") return null;

  const viaPath = getBestPath(args.finding);
  if (!viaPath || viaPath.length < 3) return null;

  const directParentContext = resolveDirectParentContext(
    viaPath,
    args.packages,
    args.directDependencyNames,
  );
  if (!directParentContext) return null;

  const { directParentName, immediateParentName, directParent } = directParentContext;
  const vulnerableName = args.finding.pkg.name;

  // Task 3 keeps the graph-aware resolution focused on exact direct-child npm paths.
  if (directParentName !== immediateParentName) {
    return null;
  }

  const parentNodeId = resolveParentNodeId({
    graph: args.graph,
    parentName: directParentName,
    parentVersion: directParent.version,
    childName: vulnerableName,
    childVersion: args.finding.pkg.version,
  });
  if (!parentNodeId) return null;

  const fixHint = args.finding.validatedFirstFixedVersion ?? args.finding.firstFixedVersion;
  const safeCandidates = args.offline
    ? buildOfflineSafeCandidates(args.finding.pkg.version, fixHint)
    : await findSafeChildCandidates(
        vulnerableName,
        args.finding.pkg.version,
        fixHint,
      );
  if (safeCandidates.length === 0) return null;

  const inRangeTarget = findSafeVersionWithinParentRange({
    graph: args.graph,
    parentNodeId,
    childName: vulnerableName,
    candidates: safeCandidates,
  });

  if (inRangeTarget) {
    const workspaces = collectWorkspacesFromAllPaths(
      args.finding.dependencyPaths ?? [],
      args.workspaceMap,
    );
    return {
      kind: "update-parent-within-range",
      package: directParentName,
      currentVersion: directParent.version,
      targetChildVersion: inRangeTarget,
      viaPath,
      reason: `${directParentName}@${directParent.version} already allows ${vulnerableName}@${inRangeTarget} within the current dependency range`,
      workspaces,
    };
  }

  // The upgrade-parent-to-version path needs the parent's published manifests
  // to find a newer parent version that no longer pulls in the vulnerable child.
  // That data only comes from the npm registry, so it can't run offline.
  if (args.offline) return null;

  const parentPackument = await fetchPackument(directParentName);
  const parentVersions = Object.keys(parentPackument?.versions ?? {})
    .filter(looksLikeVersion)
    .filter(version => !isPreReleaseVersion(version))
    .filter(version => compareVersions(version, directParent.version) > 0)
    .sort(compareVersions);

  for (const version of parentVersions) {
    const manifest = parentPackument?.versions?.[version];
    const depRange =
      manifest?.dependencies?.[vulnerableName] ??
      manifest?.optionalDependencies?.[vulnerableName];

    if (!depRange) continue;

    const targetChildVersion = highestVersionSatisfyingRange(safeCandidates, depRange);
    if (!targetChildVersion) continue;

    const stillAllowsInstalled = versionSatisfiesRange(args.finding.pkg.version, depRange);
    if (stillAllowsInstalled && compareVersions(targetChildVersion, args.finding.pkg.version) <= 0) {
      continue;
    }

    return {
      kind: "upgrade-parent-to-version",
      package: directParentName,
      currentVersion: directParent.version,
      targetVersion: version,
      targetChildVersion,
      viaPath,
      reason: `${directParentName}@${version} no longer allows ${vulnerableName}@${args.finding.pkg.version} and allows ${targetChildVersion}+`,
    };
  }

  return null;
}

function getBestPath(finding: Finding): string[] | null {
  const paths = finding.dependencyPaths ?? [];
  if (paths.length === 0) return null;
  return [...paths].sort((a, b) => a.length - b.length)[0] ?? null;
}

function findDirectDependency(
  packages: PackageRef[],
  name: string,
  directDependencyNames?: ReadonlySet<string> | null,
): PackageRef | null {
  for (const pkg of packages) {
    if (pkg.name !== name) continue;
    if (directDependencyNames?.has(name)) {
      return pkg;
    }
    const paths = pkg.paths ?? [];
    if (paths.some(path => path.at(-1) === name && path.length >= 2)) {
      return pkg;
    }
  }

  return null;
}

function resolveDirectParentContext(
  viaPath: string[],
  packages: PackageRef[],
  directDependencyNames?: ReadonlySet<string> | null,
): { directParentName: string; immediateParentName: string; directParent: PackageRef } | null {
  const immediateParentName = viaPath[viaPath.length - 2];
  const candidateSegments = viaPath.slice(1, -1);

  const directParentCandidates = directDependencyNames
    ? candidateSegments.filter(segment => directDependencyNames.has(segment))
    : [viaPath[1]].filter(Boolean);

  const directParentName = directParentCandidates[0];
  if (!directParentName) return null;

  const directParent = findDirectDependency(packages, directParentName, directDependencyNames);
  if (!directParent) return null;

  return { directParentName, immediateParentName, directParent };
}

function buildOfflineSafeCandidates(
  installedVersion: string,
  fixedVersionHint: string | null,
): string[] {
  if (!fixedVersionHint || !looksLikeVersion(fixedVersionHint)) return [];
  if (isPreReleaseVersion(fixedVersionHint)) return [];
  if (compareVersions(fixedVersionHint, installedVersion) <= 0) return [];
  return [fixedVersionHint];
}

async function findSafeChildCandidates(
  packageName: string,
  installedVersion: string,
  fixedVersionHint: string | null,
): Promise<string[]> {
  const packument = await fetchPackument(packageName);
  if (!packument) return [];

  return Object.keys(packument.versions ?? {})
    .filter(looksLikeVersion)
    .filter(version => !isPreReleaseVersion(version))
    .filter(version => compareVersions(version, installedVersion) > 0)
    .filter(version => !fixedVersionHint || compareVersions(version, fixedVersionHint) >= 0)
    .sort(compareVersions);
}

function resolveParentNodeId(args: {
  graph: NpmTransitiveGraph;
  parentName: string;
  parentVersion: string;
  childName: string;
  childVersion: string;
}): string | null {
  const candidateNodeIds = args.graph.nodeIdsFor(args.parentName, args.parentVersion);
  if (candidateNodeIds.length === 0) return null;

  for (const nodeId of candidateNodeIds) {
    const childNodeIds = args.graph.childrenFor(nodeId);
    const hasMatchingChild = childNodeIds.some((childNodeId) => {
      const childNode = args.graph.getNode(childNodeId);
      return childNode?.name === args.childName && childNode.version === args.childVersion;
    });

    if (!hasMatchingChild) continue;
    if (!args.graph.rangeFor(nodeId, args.childName)) continue;
    return nodeId;
  }

  for (const nodeId of candidateNodeIds) {
    if (args.graph.rangeFor(nodeId, args.childName)) {
      return nodeId;
    }
  }

  return candidateNodeIds[0] ?? null;
}

function highestVersionSatisfyingRange(candidates: string[], rawRange: string): string | null {
  const matches = candidates.filter(candidate => versionSatisfiesRange(candidate, rawRange)).sort(compareVersions);
  return matches.at(-1) ?? null;
}

function versionSatisfiesRange(version: string, rawRange: string): boolean {
  const range = rawRange.trim();
  if (!range) return false;
  if (range === "*" || range === "latest") return true;

  const orParts = range.split("||").map(part => part.trim()).filter(Boolean);
  return orParts.some(part => satisfiesAndRange(version, part));
}

function satisfiesAndRange(version: string, range: string): boolean {
  const normalized = normalizeRange(range);
  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every(token => satisfiesComparator(version, token));
}

function normalizeRange(range: string): string | null {
  const trimmed = range.trim();
  if (!trimmed) return null;

  if (looksLikeVersion(trimmed)) {
    return `=${trimmed}`;
  }

  if (trimmed.startsWith("^")) {
    const base = trimmed.slice(1);
    if (!looksLikeVersion(base)) return null;
    const [major, minor, patch] = parseCoreVersion(base);
    if (major > 0) return `>=${base} <${major + 1}.0.0`;
    if (minor > 0) return `>=${base} <0.${minor + 1}.0`;
    return `>=${base} <0.0.${patch + 1}`;
  }

  if (trimmed.startsWith("~")) {
    const base = trimmed.slice(1);
    if (!looksLikeVersion(base)) return null;
    const [major, minor] = parseCoreVersion(base);
    return `>=${base} <${major}.${minor + 1}.0`;
  }

  return trimmed;
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const token = comparator.trim();
  if (!token) return true;

  const match = token.match(/^(<=|>=|<|>|=)?\s*([0-9]+\.[0-9]+\.[0-9]+(?:[-+][^\s]+)?)$/);
  if (!match) return false;

  const operator = match[1] ?? "=";
  const target = match[2];
  const cmp = compareVersions(version, target);

  switch (operator) {
    case "<":
      return cmp < 0;
    case "<=":
      return cmp <= 0;
    case ">":
      return cmp > 0;
    case ">=":
      return cmp >= 0;
    case "=":
      return cmp === 0;
    default:
      return false;
  }
}

function parseCoreVersion(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version.split(/[+-]/)[0].split(".");
  return [Number(major), Number(minor), Number(patch)];
}

function collectWorkspacesFromAllPaths(
  dependencyPaths: string[][],
  workspaceMap: Map<string, string[]> | null | undefined,
): string[] | undefined {
  if (!workspaceMap) return undefined;

  const workspaceSet = new Set<string>();
  for (const path of dependencyPaths) {
    if (path.length !== 3) continue;
    const parentName = path[1];
    if (!parentName) continue;
    const wsForParent = workspaceMap.get(parentName);
    if (wsForParent) {
      for (const ws of wsForParent) {
        workspaceSet.add(ws);
      }
    }
  }

  return workspaceSet.size > 0 ? [...workspaceSet] : undefined;
}
