import { compareVersions, isPreReleaseVersion, looksLikeVersion } from "../utils/version.js";
import type { OsvVuln } from "../types.js";

export type Packument = {
  versions?: Record<string, {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  }>;
};

export type PublishedFixVersionResolution = {
  resolvedVersion: string | null;
  note: string | null;
  verified: boolean;
  candidatesChecked: number;
  candidatesKnownVulnerable: number;
  candidatesUnknownCoverage: number;
};

const packumentCache = new Map<string, Packument | null>();
const DEFAULT_NPM_REGISTRY_URL = "https://registry.npmjs.org";

export function clearPackumentCache(): void {
  packumentCache.clear();
}

export async function fetchPackument(packageName: string): Promise<Packument | null> {
  if (packumentCache.has(packageName)) {
    return packumentCache.get(packageName) ?? null;
  }

  const url = `${DEFAULT_NPM_REGISTRY_URL}/${encodeURIComponent(packageName)
    .replace(/%40/g, "@")
    .replace(/%2F/g, "/")}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      packumentCache.set(packageName, null);
      return null;
    }

    const json = (await response.json()) as Packument;
    packumentCache.set(packageName, json);
    return json;
  } catch {
    packumentCache.set(packageName, null);
    return null;
  }
}

export async function packageVersionExists(packageName: string, version: string): Promise<boolean | null> {
  const packument = await fetchPackument(packageName);
  if (!packument) return null;
  return Boolean(packument.versions && version in packument.versions);
}

export async function resolvePublishedFixVersion(
  packageName: string,
  fixedVersionHint: string,
): Promise<PublishedFixVersionResolution> {
  const packument = await fetchPackument(packageName);
  if (!packument) {
    return {
      resolvedVersion: null,
      note: `Fixed-version hint ${fixedVersionHint} could not be verified against the npm registry for ${packageName}.`,
      verified: false,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  const publishedVersions = Object.keys(packument.versions ?? {})
    .filter(looksLikeVersion)
    .sort(compareVersions);

  if (publishedVersions.includes(fixedVersionHint)) {
    return {
      resolvedVersion: fixedVersionHint,
      note: null,
      verified: true,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  const nearestPublishedVersion = publishedVersions.find(version => compareVersions(version, fixedVersionHint) >= 0) ?? null;
  if (nearestPublishedVersion) {
    return {
      resolvedVersion: nearestPublishedVersion,
      note: `Advisory fixed-version hint ${fixedVersionHint} is not published on npm for ${packageName}; using nearest published version ${nearestPublishedVersion}.`,
      verified: true,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  return {
    resolvedVersion: null,
    note: `Advisory fixed-version hint ${fixedVersionHint} is not published on npm for ${packageName}, and no published version >= ${fixedVersionHint} was found.`,
    verified: true,
    candidatesChecked: 0,
    candidatesKnownVulnerable: 0,
    candidatesUnknownCoverage: 0,
  };
}

export async function resolveLowestKnownNonVulnerableVersion(
  packageName: string,
  installedVersion: string,
  vulnerabilities: OsvVuln[],
): Promise<PublishedFixVersionResolution> {
  if (!looksLikeVersion(installedVersion)) {
    return {
      resolvedVersion: null,
      note: `Installed version ${installedVersion} for ${packageName} could not be evaluated as an exact semver version.`,
      verified: false,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  if (vulnerabilities.length === 0) {
    return {
      resolvedVersion: null,
      note: `No advisory details were available to validate a lowest known non-vulnerable version for ${packageName}.`,
      verified: false,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  const packument = await fetchPackument(packageName);
  if (!packument) {
    return {
      resolvedVersion: null,
      note: `Published versions for ${packageName} could not be verified against the npm registry.`,
      verified: false,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  const candidates = Object.keys(packument.versions ?? {})
    .filter(looksLikeVersion)
    .filter(v => !isPreReleaseVersion(v))
    .filter(version => compareVersions(version, installedVersion) > 0)
    .sort(compareVersions);

  if (candidates.length === 0) {
    return {
      resolvedVersion: null,
      note: `No published versions above ${installedVersion} were found for ${packageName}.`,
      verified: true,
      candidatesChecked: 0,
      candidatesKnownVulnerable: 0,
      candidatesUnknownCoverage: 0,
    };
  }

  let candidatesChecked = 0;
  let candidatesKnownVulnerable = 0;
  let candidatesUnknownCoverage = 0;
  let sawUnknownCoverage = false;
  for (const candidate of candidates) {
    candidatesChecked += 1;
    let affected = false;
    let unknown = false;

    for (const vuln of vulnerabilities) {
      const impacted = isVersionAffectedByVulnerability(packageName, candidate, vuln);
      if (impacted === true) {
        affected = true;
        break;
      }
      if (impacted === null) {
        unknown = true;
      }
    }

    if (affected) {
      candidatesKnownVulnerable += 1;
      continue;
    }
    if (unknown) {
      sawUnknownCoverage = true;
      candidatesUnknownCoverage += 1;
      continue;
    }

    return {
      resolvedVersion: candidate,
      note: null,
      verified: true,
      candidatesChecked,
      candidatesKnownVulnerable,
      candidatesUnknownCoverage,
    };
  }

  if (sawUnknownCoverage) {
    return {
      resolvedVersion: null,
      note: `Advisory range data for ${packageName} is incomplete, so a lowest known non-vulnerable version could not be confirmed.`,
      verified: false,
      candidatesChecked,
      candidatesKnownVulnerable,
      candidatesUnknownCoverage,
    };
  }

  return {
    resolvedVersion: null,
    note: `No known non-vulnerable published version was found above ${installedVersion} for ${packageName}.`,
    verified: true,
    candidatesChecked,
    candidatesKnownVulnerable,
    candidatesUnknownCoverage,
  };
}

function isVersionAffectedByVulnerability(
  packageName: string,
  version: string,
  vuln: OsvVuln,
): boolean | null {
  const affectedEntries = vuln.affected ?? [];
  if (affectedEntries.length === 0) return null;

  const matchingEntries = affectedEntries.filter(entry => {
    const affectedName = entry.package?.name;
    const affectedEcosystem = entry.package?.ecosystem?.toLowerCase();
    if (affectedName && affectedName !== packageName) return false;
    if (affectedEcosystem && affectedEcosystem !== "npm") return false;
    return true;
  });

  if (matchingEntries.length === 0) return null;

  let sawUnknown = false;
  for (const entry of matchingEntries) {
    const ranges = entry.ranges ?? [];
    if (ranges.length === 0) {
      sawUnknown = true;
      continue;
    }

    for (const range of ranges) {
      if (range.type && range.type !== "SEMVER") {
        sawUnknown = true;
        continue;
      }

      const impacted = isVersionAffectedByEvents(version, range.events ?? []);
      if (impacted === true) return true;
      if (impacted === null) sawUnknown = true;
    }
  }

  return sawUnknown ? null : false;
}

function isVersionAffectedByEvents(
  version: string,
  events: Array<{ introduced?: string; fixed?: string; last_affected?: string }>,
): boolean | null {
  if (events.length === 0) return null;

  let introduced: string | null = null;
  let sawComparableWindow = false;

  for (const event of events) {
    if (event.introduced !== undefined) {
      if (event.introduced !== "0" && !looksLikeVersion(event.introduced)) {
        return null;
      }
      introduced = event.introduced;
    }

    if (event.fixed !== undefined || event.last_affected !== undefined) {
      if (event.fixed && !looksLikeVersion(event.fixed)) return null;
      if (event.last_affected && !looksLikeVersion(event.last_affected)) return null;

      sawComparableWindow = true;
      const lowerBoundOk =
        introduced === null || introduced === "0" || compareVersions(version, introduced) >= 0;
      const upperBoundOk = event.fixed
        ? compareVersions(version, event.fixed) < 0
        : event.last_affected
          ? compareVersions(version, event.last_affected) <= 0
          : true;

      if (lowerBoundOk && upperBoundOk) {
        return true;
      }

      introduced = null;
    }
  }

  if (introduced !== null) {
    if (introduced !== "0" && !looksLikeVersion(introduced)) return null;
    sawComparableWindow = true;
    const lowerBoundOk = introduced === "0" || compareVersions(version, introduced) >= 0;
    if (lowerBoundOk) return true;
  }

  if (!sawComparableWindow) return null;
  return false;
}
