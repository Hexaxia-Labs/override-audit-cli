import type { Finding } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import { findSuggestedCommandForFinding } from "../remediation/fix-commands.js";
import { chalk } from "../utils/chalk.js";
import { severityOrder } from "../constants.js";
import { loadCache } from "../osv/cache.js";
import { inferSeverity } from "../osv/severity.js";
import { getPrimaryParent } from "../utils/finding.js";
import { calculatePathCoverage, formatDependencyPath } from "../utils/path-coverage.js";
import { pluralize } from "../utils/string.js";

export function formatSeverityLabel(severity: string): string {
  const lower = severity.toLowerCase();
  if (lower === "critical") return chalk.redBright(severity);
  if (lower === "high") return chalk.red(severity);
  if (lower === "medium") return chalk.yellow(severity);
  if (lower === "low") return chalk.blueBright(severity);
  if (lower === "unknown") return chalk.magenta(severity);
  return severity;
}

export function formatRelationshipLabel(value: string): string {
  if (value.startsWith("direct")) return chalk.green(value);
  if (value.startsWith("transitive")) return chalk.yellow(value);
  return chalk.gray(value);
}

export function formatAdvisorySourceLine(sourceLabel: string): string {
  const match = sourceLabel.match(/^(.*) \((.*)\)$/);
  if (!match) {
    return sourceLabel;
  }

  return `${match[1]} (${chalk.cyan(match[2])})`;
}

// MAL-* is the OSV prefix for malicious code advisories
function isMaliciousAdvisory(finding: Finding): boolean {
  return finding.vulnerabilities.some(v => v.id.startsWith("MAL-"));
}

export function getRecommendedAction(finding: Finding): string {
  if (isMaliciousAdvisory(finding)) {
    return finding.relationship === "direct"
      ? "This package has a malicious code advisory. Remove it from your dependencies."
      : "This package has a malicious code advisory. Upgrade or remove the parent package that pulls it in.";
  }

  // Prefer the registry-validated target over the raw advisory hint when
  // available — they can disagree (the hint may not be published on npm or
  // may itself be vulnerable), and the validated target is what the fix
  // command actually uses.
  const directTarget = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;

  if (finding.relationship === "direct" && directTarget) {
    return `Upgrade ${finding.pkg.name} to ${directTarget}+ in this project.`;
  }
  if (finding.relationship === "direct") {
    return `No known fix exists for ${finding.pkg.name}. Consider replacing it with an actively maintained alternative.`;
  }

  if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
    return `${finding.recommendedNpmTransitiveRemediation.package} already permits ${finding.pkg.name}@${finding.recommendedNpmTransitiveRemediation.targetChildVersion} — run the lockfile refresh command to pick it up.`;
  }

  if (
    finding.recommendedNpmTransitiveRemediation?.kind === "upgrade-parent-to-version" &&
    finding.recommendedNpmTransitiveRemediation.targetVersion
  ) {
    const coverage = calculatePathCoverage(
      finding.dependencyPaths,
      finding.recommendedNpmTransitiveRemediation.viaPath,
    );
    return formatParentUpgradeAction(
      finding.pkg.name,
      finding.pkg.version,
      finding.recommendedNpmTransitiveRemediation.package,
      finding.recommendedNpmTransitiveRemediation.currentVersion,
      finding.recommendedNpmTransitiveRemediation.targetVersion,
      coverage,
    );
  }

  if (finding.recommendedParentUpgrade) {
    const coverage = calculatePathCoverage(
      finding.dependencyPaths,
      finding.recommendedParentUpgrade.viaPath,
    );
    return formatParentUpgradeAction(
      finding.pkg.name,
      finding.pkg.version,
      finding.recommendedParentUpgrade.package,
      finding.recommendedParentUpgrade.currentVersion,
      finding.recommendedParentUpgrade.targetVersion,
      coverage,
    );
  }

  const parent = getPrimaryParent(finding);
  if (parent && directTarget) {
    return `Upgrade ${parent} — no safe version was identified automatically. Check for a release that resolves ${finding.pkg.name} to ${directTarget}+.`;
  }
  if (parent) {
    return `Review ${parent}; it currently pulls in vulnerable ${finding.pkg.name}.`;
  }
  // No parent identifiable: either dependencyPaths is empty, or the path is
  // a degenerate length-2 chain (project -> vulnerable, common when the
  // package is hoisted to top-level node_modules). The advice is the same
  // either way — inspect the lockfile or run `<pm> ls` to find the parent.
  if (directTarget) {
    return `No parent dependency was identified for ${finding.pkg.name} in the lockfile. Run \`npm ls ${finding.pkg.name}\` (or your package manager equivalent) to find which package pulls it in, then upgrade toward ${directTarget}+.`;
  }
  return `No parent dependency was identified for ${finding.pkg.name} in the lockfile. Run \`npm ls ${finding.pkg.name}\` (or your package manager equivalent) to find which package pulls it in.`;
}

export function summarizeRisk(finding: Finding): string {
  let risk = "";
  if (finding.severity === "critical" && finding.relationship === "direct") {
    risk = "Critical direct dependency. Prioritize this first because the project controls it directly.";
  } else if (finding.severity === "high" && finding.relationship === "direct") {
    risk = "High-severity direct dependency. A direct upgrade is likely the fastest path.";
  } else if (finding.relationship === "transitive" && finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
    risk = `Transitive issue. The current parent range can already absorb a safe ${finding.pkg.name} update via ${finding.recommendedNpmTransitiveRemediation.package}.`;
  } else if (finding.relationship === "transitive" && finding.recommendedNpmTransitiveRemediation?.kind === "upgrade-parent-to-version") {
    const coverage = calculatePathCoverage(
      finding.dependencyPaths,
      finding.recommendedNpmTransitiveRemediation.viaPath,
    );
    risk = coverage.coverage === "complete"
      ? `Transitive issue. A specific parent upgrade target was found for ${finding.recommendedNpmTransitiveRemediation.package}.`
      : `Transitive issue. A path-specific parent upgrade target was found for ${finding.recommendedNpmTransitiveRemediation.package}; run it, rescan, and review remaining paths separately.`;
  } else if (finding.relationship === "transitive" && finding.recommendedParentUpgrade) {
    const coverage = calculatePathCoverage(
      finding.dependencyPaths,
      finding.recommendedParentUpgrade.viaPath,
    );
    risk = coverage.coverage === "complete"
      ? `Transitive issue. A specific parent upgrade target was found for ${finding.recommendedParentUpgrade.package}.`
      : `Transitive issue. A path-specific parent upgrade target was found for ${finding.recommendedParentUpgrade.package}; run it, rescan, and review remaining paths separately.`;
  } else if (finding.relationship === "transitive" && (finding.validatedFirstFixedVersion ?? finding.firstFixedVersion)) {
    const target = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;
    risk = `Transitive issue. Look for a parent dependency upgrade that pulls in ${target}+`;
  } else if (finding.relationship === "transitive") {
    risk = "Transitive issue. Review the parent path and check whether an upstream package can be upgraded.";
  } else if (finding.validatedFirstFixedVersion ?? finding.firstFixedVersion) {
    const target = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;
    risk = `A fixed-version hint exists. Aim for at least ${target}.`;
  } else {
    risk = "Review this finding and inspect the dependency path for the safest upgrade path.";
  }

  if (finding.usage && !finding.usage.imported) {
    if (finding.relationship === "transitive") {
      risk = risk.replace("Transitive issue.", "Transitive issue. No direct imports found in source code, so practical reachability may be low.");
    } else if (finding.relationship === "direct") {
      risk = risk.replace("direct dependency.", "direct dependency. No direct imports found in source code, so practical reachability may be low.");
    }
  }
  return risk;
}

function formatParentUpgradeAction(
  vulnerableName: string,
  vulnerableVersion: string,
  parentName: string,
  currentVersion: string,
  targetVersion: string,
  coverage: { coverage: "complete" | "partial"; coveredPaths: string[][]; remainingPaths: string[][] },
): string {
  const pathText = coverage.coveredPaths[0]
    ? ` for ${formatDependencyPath(coverage.coveredPaths[0])}`
    : "";
  const upgrade = `Upgrade ${parentName} from ${currentVersion} to ${targetVersion}`;

  if (coverage.coverage === "complete") {
    return `${upgrade} to resolve vulnerable ${vulnerableName}@${vulnerableVersion}${pathText}.`;
  }

  const remainingCount = coverage.remainingPaths.length;
  return `${upgrade} to resolve the ${vulnerableName}@${vulnerableVersion} path${pathText}; run it, then rescan. ${remainingCount} other known ${pluralize(remainingCount, "path")} may still need separate parent upgrades.`;
}

export function summarizeNextAction(finding: Finding): string {
  // Prefer the registry-validated target over the raw advisory hint so this
  // line agrees with the fix-command table. See getRecommendedAction.
  const directTarget = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;

  if (isMaliciousAdvisory(finding)) {
    return finding.relationship === "direct"
      ? "This package has a malicious code advisory. Remove it from your dependencies."
      : "This package has a malicious code advisory. Upgrade or remove the parent package that pulls it in.";
  }

  if (finding.relationship === "direct" && directTarget) {
    return `Upgrade ${finding.pkg.name} toward ${directTarget}.`;
  }
  if (finding.relationship === "direct") {
    return `No known fix exists for ${finding.pkg.name}. Consider replacing it with an actively maintained alternative.`;
  }
  if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
    return `Lockfile refresh — ${finding.recommendedNpmTransitiveRemediation.package} already permits a safe version.`;
  }
  if (
    finding.recommendedNpmTransitiveRemediation?.kind === "upgrade-parent-to-version" &&
    finding.recommendedNpmTransitiveRemediation.targetVersion
  ) {
    return `Upgrade ${finding.recommendedNpmTransitiveRemediation.package} ${finding.recommendedNpmTransitiveRemediation.currentVersion} -> ${finding.recommendedNpmTransitiveRemediation.targetVersion}.`;
  }
  if (finding.recommendedParentUpgrade) {
    return `Upgrade ${finding.recommendedParentUpgrade.package} ${finding.recommendedParentUpgrade.currentVersion} -> ${finding.recommendedParentUpgrade.targetVersion}.`;
  }
  const parent = getPrimaryParent(finding);
  if (parent && directTarget) {
    return `Upgrade ${parent} — no safe version identified. Find a release resolving ${finding.pkg.name} to ${directTarget}+.`;
  }
  if (directTarget) {
    return `No parent identified in the lockfile. Run \`npm ls ${finding.pkg.name}\` to find the parent, then upgrade toward ${directTarget}+.`;
  }
  return `Inspect the parent dependency chain for ${finding.pkg.name} and choose the safest available upgrade.`;
}

export function serializeFinding(finding: Finding, plan?: SuggestedFixCommandPlan | null) {
  return {
    package: finding.pkg.name,
    version: finding.pkg.version,
    severity: finding.severity,
    relationship: finding.relationship,
    firstFixedVersion: finding.firstFixedVersion,
    validatedFirstFixedVersion: finding.validatedFirstFixedVersion ?? null,
    fixVersionValidationNote: finding.fixVersionValidationNote ?? null,
    validatedTargetScannedVersions: finding.validatedTargetScannedVersions ?? null,
    validatedTargetKnownVulnerableVersions: finding.validatedTargetKnownVulnerableVersions ?? null,
    recommendedAction: getRecommendedAction(finding),
    runnableFixCommand: plan ? findSuggestedCommandForFinding(plan, finding) : null,
    primaryParent: getPrimaryParent(finding),
    recommendedParentUpgrade: finding.recommendedParentUpgrade,
    recommendedNpmTransitiveRemediation: finding.recommendedNpmTransitiveRemediation ?? null,
    cves: finding.cveAliases,
    dependencyPaths: finding.dependencyPaths,
    usage: finding.usage ?? null,
    vulnerabilities: finding.vulnerabilities.map(v => ({
      id: v.id,
      aliases: v.aliases ?? [],
      summary: v.summary ?? "",
      severity: inferSeverity(v),
    })),
  };
}

export function printCacheSummary(cacheDirOverride?: string, options?: { json?: boolean }) {
  if (options?.json) return;

  const cache = loadCache(cacheDirOverride);
  const advisoryCount = Object.entries(cache.entries).filter(([, value]) => Boolean(value)).length;
  const emptyCount = Object.entries(cache.entries).filter(([, value]) => value === null).length;
  const packageQueryCount = Object.keys(cache.queryEntries).length;
  const totalCount = advisoryCount + emptyCount;

  if (totalCount === 0 && packageQueryCount === 0) return;

  console.log(
    chalk.gray(`Cache: ${packageQueryCount} package match ${pluralize(packageQueryCount, "record")}, ${advisoryCount} advisory detail ${pluralize(advisoryCount, "record")}`) +
      (emptyCount > 0
        ? chalk.gray(`, ${emptyCount} empty ${pluralize(emptyCount, "lookup")}`)
        : ""),
  );
}

export function logInfo(message: string, options?: { json?: boolean }) {
  if (options?.json) return;
  console.log(chalk.gray(message));
}

export function logWarn(message: string, options?: { json?: boolean }) {
  if (options?.json) return;
  console.log(chalk.yellow(message));
}

export function sortFindingsForOutput(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sevDelta = severityOrder[b.severity] - severityOrder[a.severity];
    if (sevDelta !== 0) return sevDelta;

    const usageScore = (f: Finding) => f.usage?.imported ? 1 : 0;
    const usageDelta = usageScore(b) - usageScore(a);
    if (usageDelta !== 0) return usageDelta;

    const relScore = (f: Finding) => f.relationship === "direct" ? 1 : 0;
    const relDelta = relScore(b) - relScore(a);
    if (relDelta !== 0) return relDelta;

    return a.pkg.name.localeCompare(b.pkg.name);
  });
}

export function countUniqueAdvisories(findings: Finding[]): number {
  return new Set(findings.flatMap(f => f.vulnerabilities.map(v => v.id))).size;
}
