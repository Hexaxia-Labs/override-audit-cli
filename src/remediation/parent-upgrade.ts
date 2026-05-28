import type { Finding, PackageRef, RecommendedParentUpgrade } from "../types.js";
import { compareVersions, isPreReleaseVersion, looksLikeVersion } from "../utils/version.js";
import { fetchPackument } from "./npm-registry.js";

export async function resolveRecommendedParentUpgrade(
  finding: Finding,
  packages: PackageRef[],
  directDependencyNames?: ReadonlySet<string> | null,
  options?: { offline?: boolean },
): Promise<RecommendedParentUpgrade | null> {
  if (finding.relationship !== "transitive") return null;
  // Both branches below need the parent's published manifests, which only the
  // npm registry can supply; there's no offline-safe path for this resolver.
  if (options?.offline) return null;

  const viaPath = getBestPath(finding);
  if (!viaPath || viaPath.length < 3) return null;

  const directParentContext = resolveDirectParentContext(
    viaPath,
    packages,
    directDependencyNames,
  );
  if (!directParentContext) return null;

  const { directParentName, immediateParentName, directParent } = directParentContext;
  const vulnerableName = finding.pkg.name;

  // Common reliable case:
  // project -> sanitize-html -> lodash
  if (directParentName === immediateParentName) {
    return findUpgradeForExactDirectChild({
      directParentName,
      directParentVersion: directParent.version,
      vulnerableName,
      vulnerableInstalledVersion: finding.pkg.version,
      vulnerableFixedVersion: finding.validatedFirstFixedVersion ?? finding.firstFixedVersion,
      viaPath,
    });
  }

  // Best-effort fallback for deeper chains.
  return findUpgradeForImmediateIntermediate({
    directParentName,
    directParentVersion: directParent.version,
    immediateParentName,
    immediateParentInstalledVersion: findPackageVersion(
      packages,
      immediateParentName,
      viaPath.slice(0, -1),
    ) ?? "",
    vulnerableName,
    viaPath,
  });
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

function findPackageVersion(
  packages: PackageRef[],
  name: string,
  pathPrefix: string[],
): string | null {
  for (const pkg of packages) {
    if (pkg.name !== name) continue;
    const paths = pkg.paths ?? [];
    if (paths.some(path => startsWithPath(path, pathPrefix))) {
      return pkg.version;
    }
  }
  return null;
}

function startsWithPath(path: string[], prefix: string[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

type ExactDirectChildArgs = {
  directParentName: string;
  directParentVersion: string;
  vulnerableName: string;
  vulnerableInstalledVersion: string;
  vulnerableFixedVersion: string | null;
  viaPath: string[];
};

async function findUpgradeForExactDirectChild(
  args: ExactDirectChildArgs,
): Promise<RecommendedParentUpgrade | null> {
  const packument = await fetchPackument(args.directParentName);
  const versions = Object.keys(packument?.versions ?? {})
    .filter(looksLikeVersion)
    .filter(v => !isPreReleaseVersion(v))
    .filter(version => compareVersions(version, args.directParentVersion) > 0)
    .sort(compareVersions);

  for (const version of versions) {
    const manifest = packument?.versions?.[version];
    const depRange =
      manifest?.dependencies?.[args.vulnerableName] ??
      manifest?.optionalDependencies?.[args.vulnerableName];

    if (!depRange) continue;

    const stillAllowsInstalled = versionSatisfiesRange(
      args.vulnerableInstalledVersion,
      depRange,
    );
    const allowsFixed = args.vulnerableFixedVersion
      ? versionSatisfiesRange(args.vulnerableFixedVersion, depRange)
      : true;

    if (!stillAllowsInstalled && allowsFixed) {
      return {
        package: args.directParentName,
        currentVersion: args.directParentVersion,
        targetVersion: version,
        viaPath: args.viaPath,
        vulnerablePackage: args.vulnerableName,
        confidence: "exact-direct-child",
        reason: `${args.directParentName}@${version} no longer allows ${args.vulnerableName}@${args.vulnerableInstalledVersion}${args.vulnerableFixedVersion ? ` and allows ${args.vulnerableFixedVersion}+` : ""}`,
      };
    }
  }

  return null;
}
type ImmediateIntermediateArgs = {
  directParentName: string;
  directParentVersion: string;
  immediateParentName: string;
  immediateParentInstalledVersion: string;
  vulnerableName: string;
  viaPath: string[];
};

async function findUpgradeForImmediateIntermediate(
  args: ImmediateIntermediateArgs,
): Promise<RecommendedParentUpgrade | null> {
  if (!args.immediateParentInstalledVersion || !looksLikeVersion(args.immediateParentInstalledVersion)) {
    return null;
  }

  const packument = await fetchPackument(args.directParentName);
  const versions = Object.keys(packument?.versions ?? {})
    .filter(looksLikeVersion)
    .filter(v => !isPreReleaseVersion(v))
    .filter(version => compareVersions(version, args.directParentVersion) > 0)
    .sort(compareVersions);

  for (const version of versions) {
    const manifest = packument?.versions?.[version];
    const depRange =
      manifest?.dependencies?.[args.immediateParentName] ??
      manifest?.optionalDependencies?.[args.immediateParentName];

    if (!depRange) continue;

    const stillAllowsImmediateParentInstalled = versionSatisfiesRange(
      args.immediateParentInstalledVersion,
      depRange,
    );

    if (!stillAllowsImmediateParentInstalled) {
      return {
        package: args.directParentName,
        currentVersion: args.directParentVersion,
        targetVersion: version,
        viaPath: args.viaPath,
        vulnerablePackage: args.vulnerableName,
        confidence: "best-effort",
        reason: `${args.directParentName}@${version} no longer allows ${args.immediateParentName}@${args.immediateParentInstalledVersion} in the current path`,
      };
    }
  }

  return null;
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
  const [major, minor, patch] = version
    .split(".")
    .map(part => Number(part.replace(/[^0-9].*$/, "")));
  return [major || 0, minor || 0, patch || 0];
}
