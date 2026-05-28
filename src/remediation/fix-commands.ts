import type { Finding, ScanInput, SeverityLabel } from "../types.js";
import { severityOrder } from "../constants.js";
import { compareVersions, looksLikeVersion } from "../utils/version.js";
import { getPrimaryParent } from "../utils/finding.js";
import { calculatePathCoverage, formatDependencyPath } from "../utils/path-coverage.js";
import { pluralize } from "../utils/string.js";
import { buildNpmWorkspaceMap } from "../parsers/package-lock.js";
import { buildPnpmWorkspaceMap } from "../parsers/pnpm-lock.js";
import { buildYarnWorkspaceMap } from "../parsers/yarn-lock.js";
import { buildBunWorkspaceMap } from "../parsers/bun-lock.js";

export type SuggestedFixPackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type SuggestedFixTarget = {
  package: string;
  currentVersion?: string;
  targetVersion: string;
  displayTargetVersion?: string;
  scannedVersions?: number | null;
  knownVulnerableVersions?: number | null;
  kind: "direct" | "parent-upgrade" | "parent-update";
  urgent: boolean;
  severity: SeverityLabel;
  adjusted: boolean;
  adjustmentNote?: string | null;
  reason: string;
  command?: string;
  workspaces?: string[];
  coverage?: "complete" | "partial";
  coveredPaths?: string[][];
  remainingPaths?: string[][];
  usage?: { imported: boolean; files: string[] } | null;
};

export type SuggestedFixSkip = {
  package: string;
  version: string;
  relationship: Finding["relationship"];
  reason: string;
};

export type SuggestedFixCommandPlan = {
  packageManager: SuggestedFixPackageManager;
  sourceLabel: string;
  command: string | null;
  sections: Array<{
    key: string;
    kind: "urgent" | "direct" | "direct-adjusted" | "parent-upgrade" | "parent-update";
    severity: SeverityLabel;
    title: string;
    command: string;
    targets: SuggestedFixTarget[];
  }>;
  targets: SuggestedFixTarget[];
  skipped: SuggestedFixSkip[];
  coveredFindingCount: number;
  totalFindingCount: number;
};

export function buildSuggestedFixCommandPlan(
  findings: Finding[],
  scanInput: ScanInput,
  options?: { offline?: boolean },
): SuggestedFixCommandPlan | null {
  const packageManager = inferPackageManager(scanInput);
  if (!packageManager) return null;
  const offline = !!options?.offline;

  let workspaceMap: Map<string, string[]> = new Map();
  if (scanInput.filePath) {
    try {
      if (packageManager === "npm" && (scanInput.source === "package-lock" || scanInput.source === "npm-shrinkwrap")) {
        workspaceMap = buildNpmWorkspaceMap(scanInput.filePath);
      } else if (packageManager === "pnpm" && scanInput.source === "pnpm-lock") {
        workspaceMap = buildPnpmWorkspaceMap(scanInput.filePath);
      } else if (packageManager === "yarn" && scanInput.source === "yarn-lock") {
        workspaceMap = buildYarnWorkspaceMap(scanInput.filePath);
      } else if (packageManager === "bun" && scanInput.source === "bun-lock") {
        workspaceMap = buildBunWorkspaceMap(scanInput.filePath);
      }
    } catch {
      // workspace map is best-effort
    }
  }

  const prioritizedFindings = [...findings]
    .filter(f => f.severity === "critical" || f.severity === "high")
    .sort((a, b) => {
      const sevDelta = severityOrder[b.severity] - severityOrder[a.severity];
      if (sevDelta !== 0) return sevDelta;

      const usageScore = (finding: Finding) => finding.usage?.imported ? 1 : 0;
      const usageDelta = usageScore(b) - usageScore(a);
      if (usageDelta !== 0) return usageDelta;

      const relScore = (finding: Finding) => finding.relationship === "direct" ? 1 : 0;
      const relDelta = relScore(b) - relScore(a);
      if (relDelta !== 0) return relDelta;

      return a.pkg.name.localeCompare(b.pkg.name);
    });

  const targetsByPackage = new Map<string, SuggestedFixTarget>();
  const skippedByKey = new Map<string, SuggestedFixSkip>();

  const orderedFindings = [
    ...prioritizedFindings,
    ...findings
      .filter(f => f.severity !== "critical" && f.severity !== "high")
      .sort((a, b) => {
        const sevDelta = severityOrder[b.severity] - severityOrder[a.severity];
        if (sevDelta !== 0) return sevDelta;

        const usageScore = (finding: Finding) => finding.usage?.imported ? 1 : 0;
        const usageDelta = usageScore(b) - usageScore(a);
        if (usageDelta !== 0) return usageDelta;

        const relScore = (finding: Finding) => finding.relationship === "direct" ? 1 : 0;
        const relDelta = relScore(b) - relScore(a);
        if (relDelta !== 0) return relDelta;

        return a.pkg.name.localeCompare(b.pkg.name);
      }),
  ];

  for (const finding of orderedFindings) {
    const urgent = finding.severity === "critical" || finding.severity === "high";

    if (finding.relationship === "direct" || finding.relationship === "unknown") {
      const hasValidatedField = Object.prototype.hasOwnProperty.call(finding, "validatedFirstFixedVersion");
      const directTarget = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;
      // In offline mode validateDirectFixTargets never runs, so an unset
      // validatedFirstFixedVersion is "did not validate" rather than "validation
      // failed" — fall back to the advisory hint instead of dropping the target.
      const validatedFieldOk = offline || !hasValidatedField || finding.validatedFirstFixedVersion !== null;
      if (
        directTarget &&
        isUpgradeTarget(finding.pkg.version, directTarget) &&
        validatedFieldOk
      ) {
        const pkgWorkspaces = workspaceMap.get(finding.pkg.name)?.filter(w => w !== ".") ?? [];
        upsertTarget(targetsByPackage, {
          package: finding.pkg.name,
          currentVersion: finding.pkg.version,
          targetVersion: directTarget,
          scannedVersions: finding.validatedTargetScannedVersions ?? null,
          knownVulnerableVersions: finding.validatedTargetKnownVulnerableVersions ?? null,
          kind: "direct",
          urgent,
          severity: finding.severity,
          adjusted: Boolean(
            finding.fixVersionValidationNote &&
            finding.validatedFirstFixedVersion &&
            finding.validatedFirstFixedVersion !== finding.firstFixedVersion,
          ),
          adjustmentNote:
            finding.fixVersionValidationNote &&
            finding.validatedFirstFixedVersion &&
            finding.validatedFirstFixedVersion !== finding.firstFixedVersion
              ? finding.fixVersionValidationNote
              : null,
          reason: `Direct upgrade target for ${finding.pkg.name}@${finding.pkg.version}`,
          usage: finding.usage ?? null,
          workspaces: pkgWorkspaces.length > 0 ? pkgWorkspaces : undefined,
        });
      } else if (finding.fixVersionValidationNote) {
        skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
          package: finding.pkg.name,
          version: finding.pkg.version,
          relationship: finding.relationship,
          reason: finding.fixVersionValidationNote,
        });
      } else if (finding.firstFixedVersion) {
        skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
          package: finding.pkg.name,
          version: finding.pkg.version,
          relationship: finding.relationship,
          reason: `Fixed-version hint ${directTarget} is not an upgrade from installed ${finding.pkg.version}.`,
        });
      } else {
        skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
          package: finding.pkg.name,
          version: finding.pkg.version,
          relationship: finding.relationship,
          reason: urgent
            ? "No safe upgrade target is known for this urgent direct dependency."
            : "No safe upgrade target is known for this direct dependency.",
        });
      }
      continue;
    }

    if (
      packageManager === "npm" &&
      finding.relationship === "transitive" &&
      finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range"
    ) {
      upsertTarget(targetsByPackage, {
        package: finding.recommendedNpmTransitiveRemediation.package,
        currentVersion: finding.recommendedNpmTransitiveRemediation.currentVersion,
        targetVersion: finding.recommendedNpmTransitiveRemediation.targetChildVersion,
        displayTargetVersion: "lockfile refresh",
        scannedVersions: null,
        knownVulnerableVersions: null,
        kind: "parent-update",
        urgent,
        severity: finding.severity,
        adjusted: false,
        adjustmentNote: null,
        reason: `${finding.recommendedNpmTransitiveRemediation.package}@${finding.recommendedNpmTransitiveRemediation.currentVersion} already permits ${finding.pkg.name}@${finding.recommendedNpmTransitiveRemediation.targetChildVersion} — refreshing the lockfile is enough.`,
        command: buildNpmUpdateCommand(finding.recommendedNpmTransitiveRemediation.package, finding.recommendedNpmTransitiveRemediation.workspaces),
        usage: finding.usage ?? null,
      });
      continue;
    }

    if (
      packageManager === "npm" &&
      finding.relationship === "transitive" &&
      finding.recommendedNpmTransitiveRemediation?.kind === "upgrade-parent-to-version" &&
      finding.recommendedNpmTransitiveRemediation.targetVersion &&
      isUpgradeTarget(
        finding.recommendedNpmTransitiveRemediation.currentVersion,
        finding.recommendedNpmTransitiveRemediation.targetVersion,
      )
    ) {
      const coverage = calculatePathCoverage(
        finding.dependencyPaths,
        finding.recommendedNpmTransitiveRemediation.viaPath,
      );
      upsertTarget(targetsByPackage, {
        package: finding.recommendedNpmTransitiveRemediation.package,
        currentVersion: finding.recommendedNpmTransitiveRemediation.currentVersion,
        targetVersion: finding.recommendedNpmTransitiveRemediation.targetVersion,
        scannedVersions: null,
        knownVulnerableVersions: null,
        kind: "parent-upgrade",
        urgent,
        severity: finding.severity,
        adjusted: false,
        adjustmentNote: null,
        reason: buildParentUpgradeReason(finding, coverage),
        coverage: coverage.coverage,
        coveredPaths: coverage.coveredPaths,
        remainingPaths: coverage.remainingPaths,
        usage: finding.usage ?? null,
      });
      continue;
    }

    if (
      finding.relationship === "transitive" &&
      finding.recommendedParentUpgrade &&
      isUpgradeTarget(
        finding.recommendedParentUpgrade.currentVersion,
        finding.recommendedParentUpgrade.targetVersion,
      )
    ) {
      const coverage = calculatePathCoverage(
        finding.dependencyPaths,
        finding.recommendedParentUpgrade.viaPath,
      );
      upsertTarget(targetsByPackage, {
        package: finding.recommendedParentUpgrade.package,
        currentVersion: finding.recommendedParentUpgrade.currentVersion,
        targetVersion: finding.recommendedParentUpgrade.targetVersion,
        scannedVersions: null,
        knownVulnerableVersions: null,
        kind: "parent-upgrade",
        urgent,
        severity: finding.severity,
        adjusted: false,
        adjustmentNote: null,
        reason: buildParentUpgradeReason(finding, coverage),
        coverage: coverage.coverage,
        coveredPaths: coverage.coveredPaths,
        remainingPaths: coverage.remainingPaths,
        usage: finding.usage ?? null,
      });
      continue;
    }

    if (finding.relationship === "transitive" && finding.recommendedParentUpgrade) {
      skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
        package: finding.pkg.name,
        version: finding.pkg.version,
        relationship: finding.relationship,
        reason:
          `Suggested parent target ${finding.recommendedParentUpgrade.package}@${finding.recommendedParentUpgrade.targetVersion} is not an upgrade from installed ${finding.recommendedParentUpgrade.currentVersion}.`,
      });
      continue;
    }

    if (
      packageManager !== "npm" &&
      finding.relationship === "transitive" &&
      finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range"
    ) {
      const lockfileRefreshCommand = packageManager === "pnpm"
        ? buildPnpmLockfileRefreshCommand(finding.pkg.name, finding.recommendedNpmTransitiveRemediation.workspaces)
        : packageManager === "yarn"
          ? `yarn upgrade ${finding.pkg.name}`
          : `bun update ${finding.pkg.name}`;
      upsertTarget(targetsByPackage, {
        package: finding.pkg.name,
        currentVersion: finding.pkg.version,
        targetVersion: finding.recommendedNpmTransitiveRemediation.targetChildVersion,
        displayTargetVersion: "lockfile refresh",
        scannedVersions: null,
        knownVulnerableVersions: null,
        kind: "parent-update",
        urgent,
        severity: finding.severity,
        adjusted: false,
        adjustmentNote: null,
        reason: `${finding.pkg.name}@${finding.pkg.version} can be refreshed to ${finding.recommendedNpmTransitiveRemediation.targetChildVersion}+ — no parent upgrade needed.`,
        command: lockfileRefreshCommand,
        usage: finding.usage ?? null,
      });
      continue;
    }

    const primaryParent = getPrimaryParent(finding);
    if (finding.relationship === "transitive" && primaryParent) {
      const fixClause = finding.firstFixedVersion
        ? ` — check for a release that resolves ${finding.pkg.name} to ${finding.firstFixedVersion}+`
        : "";
      skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
        package: finding.pkg.name,
        version: finding.pkg.version,
        relationship: finding.relationship,
        reason: `${finding.pkg.name}@${finding.pkg.version} is pulled in by ${primaryParent}. No safe upgrade version for ${primaryParent} was identified automatically${fixClause}.`,
      });
      continue;
    }

    skippedByKey.set(`${finding.relationship}:${finding.pkg.name}@${finding.pkg.version}`, {
      package: finding.pkg.name,
      version: finding.pkg.version,
      relationship: finding.relationship,
      reason: finding.relationship === "transitive"
        ? `No dependency path available for ${finding.pkg.name}@${finding.pkg.version}. Inspect your lockfile to find which package pulls it in.`
        : "No confident automatic fix command could be generated for this issue.",
    });
  }

  const targets = [...targetsByPackage.values()].sort((a, b) => {
    const sevDelta = severityOrder[b.severity] - severityOrder[a.severity];
    if (sevDelta !== 0) return sevDelta;

    const urgentDelta = Number(b.urgent) - Number(a.urgent);
    if (urgentDelta !== 0) return urgentDelta;

    const kindScore = (target: SuggestedFixTarget) => target.kind === "direct" ? 1 : 0;
    const kindDelta = kindScore(b) - kindScore(a);
    if (kindDelta !== 0) return kindDelta;
    return a.package.localeCompare(b.package);
  });
  const skipped = [...skippedByKey.values()].sort((a, b) => a.package.localeCompare(b.package));
  const sections = buildSections(targets, packageManager);
  const command = targets.length > 0
    ? buildCommandForTargets(targets, packageManager)
    : null;

  const plan: SuggestedFixCommandPlan = {
    packageManager,
    sourceLabel: packageManagerSourceLabel(scanInput),
    command,
    sections,
    targets,
    skipped,
    coveredFindingCount: 0,
    totalFindingCount: findings.length,
  };

  plan.coveredFindingCount = findings.filter(f => findSuggestedCommandForFinding(plan, f) !== null).length;

  return plan;
}

function inferPackageManager(scanInput: ScanInput): SuggestedFixPackageManager | null {
  if (scanInput.source === "package-lock") return "npm";
  if (scanInput.source === "pnpm-lock") return "pnpm";
  if (scanInput.source === "yarn-lock") return "yarn";
  if (scanInput.source === "bun-lock") return "bun";
  return null;
}

function buildNpmUpdateCommand(pkg: string, workspaces?: string[]): string {
  const nonRoot = (workspaces ?? []).filter(w => w !== ".");
  if (nonRoot.length === 1) {
    return `npm update --workspace=${nonRoot[0]} ${pkg}`;
  }
  if (nonRoot.length > 1) {
    return `npm update --workspaces ${pkg}`;
  }
  return `npm update ${pkg}`;
}

function buildPnpmLockfileRefreshCommand(pkg: string, workspaces?: string[]): string {
  if (!workspaces || workspaces.length === 0 || workspaces.length > 1) {
    return `pnpm update --recursive --no-save ${pkg}`;
  }
  const workspace = workspaces[0];
  if (workspace === ".") {
    return `pnpm update --no-save ${pkg}`;
  }
  return `pnpm -C ${workspace} update --no-save ${pkg}`;
}

function commandPrefix(packageManager: SuggestedFixPackageManager): string {
  if (packageManager === "npm") return "npm install";
  if (packageManager === "pnpm") return "pnpm add";
  if (packageManager === "bun") return "bun add";
  return "yarn add";
}

export function findSuggestedCommandForFinding(
  plan: SuggestedFixCommandPlan,
  finding: Finding,
): string | null {
  const target = plan.targets.find(item => {
    if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
      return (
        item.kind === "parent-update" &&
        item.targetVersion === finding.recommendedNpmTransitiveRemediation.targetChildVersion &&
        (item.package === finding.recommendedNpmTransitiveRemediation.package || item.package === finding.pkg.name)
      );
    }

    if (finding.recommendedParentUpgrade) {
      return (
        item.package === finding.recommendedParentUpgrade.package &&
        item.targetVersion === finding.recommendedParentUpgrade.targetVersion
      );
    }

    const directTarget = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;
    return item.package === finding.pkg.name && item.targetVersion === directTarget;
  });

  if (!target) return null;
  if (target.command) return target.command;
  if (target.workspaces?.length) {
    const commands = buildWorkspaceInstallCommands([target], plan.packageManager);
    if (commands.length > 0) return commands.join(" && ");
  }
  return `${commandPrefix(plan.packageManager)} ${target.package}@${target.targetVersion}`;
}

function packageManagerSourceLabel(scanInput: ScanInput): string {
  if (scanInput.filePath) {
    return scanInput.filePath.split(/[/\\]/).pop() ?? scanInput.source;
  }

  if (scanInput.source === "package-lock") return "package-lock.json";
  if (scanInput.source === "pnpm-lock") return "pnpm-lock.yaml";
  if (scanInput.source === "yarn-lock") return "yarn.lock";
  if (scanInput.source === "bun-lock") return "bun.lock";
  return scanInput.source;
}

function upsertTarget(
  targetsByPackage: Map<string, SuggestedFixTarget>,
  next: SuggestedFixTarget,
): void {
  const existing = targetsByPackage.get(next.package);
  if (!existing) {
    targetsByPackage.set(next.package, next);
    return;
  }

  const merged: SuggestedFixTarget = {
    ...existing,
    urgent: existing.urgent || next.urgent,
    severity: severityOrder[next.severity] > severityOrder[existing.severity] ? next.severity : existing.severity,
    adjusted: existing.adjusted || next.adjusted,
    adjustmentNote: existing.adjustmentNote ?? next.adjustmentNote ?? null,
    kind: existing.kind === "direct" || next.kind === "direct"
      ? "direct"
      : existing.kind === "parent-update" || next.kind === "parent-update"
        ? "parent-update"
        : "parent-upgrade",
    displayTargetVersion: existing.displayTargetVersion ?? next.displayTargetVersion,
    command: existing.command ?? next.command,
    workspaces: mergeStringArrays(existing.workspaces, next.workspaces),
    coverage: existing.coverage === "partial" || next.coverage === "partial"
      ? "partial"
      : existing.coverage ?? next.coverage,
    coveredPaths: mergePathArrays(existing.coveredPaths ?? [], next.coveredPaths ?? []),
    remainingPaths: mergePathArrays(existing.remainingPaths ?? [], next.remainingPaths ?? []),
    usage: existing.usage || next.usage,
  };

  if (looksLikeVersion(existing.targetVersion) && looksLikeVersion(next.targetVersion)) {
    if (compareVersions(next.targetVersion, existing.targetVersion) > 0) {
      merged.targetVersion = next.targetVersion;
      merged.currentVersion = next.currentVersion ?? merged.currentVersion;
      merged.reason = next.reason;
      merged.scannedVersions = next.scannedVersions ?? merged.scannedVersions ?? null;
      merged.knownVulnerableVersions = next.knownVulnerableVersions ?? merged.knownVulnerableVersions ?? null;
    }
    targetsByPackage.set(next.package, merged);
    return;
  }

  if (next.kind === "direct" && existing.kind !== "direct") {
    merged.currentVersion = next.currentVersion ?? merged.currentVersion;
    merged.targetVersion = next.targetVersion;
    merged.reason = next.reason;
    merged.adjustmentNote = next.adjustmentNote ?? merged.adjustmentNote;
    merged.scannedVersions = next.scannedVersions ?? merged.scannedVersions ?? null;
    merged.knownVulnerableVersions = next.knownVulnerableVersions ?? merged.knownVulnerableVersions ?? null;
  }

  targetsByPackage.set(next.package, merged);
}

function buildParentUpgradeReason(
  finding: Finding,
  coverage: { coverage: "complete" | "partial"; coveredPaths: string[][]; remainingPaths: string[][] },
): string {
  const coveredPath = coverage.coveredPaths[0];
  const pathText = coveredPath ? ` for ${formatDependencyPath(coveredPath)}` : "";
  const base = coverage.coverage === "complete"
    ? `Parent upgrade for vulnerable ${finding.pkg.name}@${finding.pkg.version}${pathText}`
    : coveredPath
      ? `Path-specific parent upgrade for ${formatDependencyPath(coveredPath)} (${finding.pkg.name}@${finding.pkg.version})`
      : `Path-specific parent upgrade for vulnerable ${finding.pkg.name}@${finding.pkg.version}`;

  if (coverage.coverage === "complete") return base;

  const remainingCount = coverage.remainingPaths.length;
  return `${base}; run this command, then rescan. ${remainingCount} other known ${pluralize(remainingCount, "path")} may still need separate parent upgrades.`;
}

function mergeStringArrays(a?: string[], b?: string[]): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const result = [...new Set([...(a ?? []), ...(b ?? [])])];
  return result.length > 0 ? result : undefined;
}

function mergePathArrays(left: string[][], right: string[][]): string[][] {
  const seen = new Set<string>();
  const output: string[][] = [];

  for (const path of [...left, ...right]) {
    const key = path.join(">");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(path);
  }

  return output;
}

function isUpgradeTarget(currentVersion: string, targetVersion: string): boolean {
  if (!currentVersion || !targetVersion || currentVersion === targetVersion) return false;

  if (looksLikeVersion(currentVersion) && looksLikeVersion(targetVersion)) {
    return compareVersions(targetVersion, currentVersion) > 0;
  }

  return true;
}

function buildSections(
  targets: SuggestedFixTarget[],
  packageManager: SuggestedFixPackageManager,
): SuggestedFixCommandPlan["sections"] {
  const groups: SuggestedFixCommandPlan["sections"] = [];
  const sectionOrder: Array<{ kind: "urgent" | "direct" | "direct-adjusted" | "parent-upgrade" | "parent-update"; severity: SeverityLabel }> = [
    { kind: "urgent", severity: "critical" },
    { kind: "parent-update", severity: "critical" },
    { kind: "urgent", severity: "high" },
    { kind: "parent-update", severity: "high" },
    { kind: "direct", severity: "medium" },
    { kind: "direct", severity: "low" },
    { kind: "direct", severity: "unknown" },
    { kind: "direct-adjusted", severity: "medium" },
    { kind: "direct-adjusted", severity: "low" },
    { kind: "direct-adjusted", severity: "unknown" },
    { kind: "parent-update", severity: "medium" },
    { kind: "parent-update", severity: "low" },
    { kind: "parent-update", severity: "unknown" },
    { kind: "parent-upgrade", severity: "medium" },
    { kind: "parent-upgrade", severity: "low" },
    { kind: "parent-upgrade", severity: "unknown" },
  ];

  for (const entry of sectionOrder) {
    const sectionTargets = targets.filter(target => {
      const targetKind = target.kind === "parent-update"
        ? "parent-update"
        : target.urgent ? "urgent" : target.adjusted ? "direct-adjusted" : target.kind;
      return targetKind === entry.kind && target.severity === entry.severity;
    });

    if (sectionTargets.length === 0) continue;

    groups.push({
      key: `${entry.kind}:${entry.severity}`,
      kind: entry.kind,
      severity: entry.severity,
      title: buildSectionTitle(entry.kind, entry.severity),
      command: buildCommandForTargets(sectionTargets, packageManager),
      targets: sectionTargets,
    });
  }

  return groups;
}

function buildSectionTitle(
  kind: "urgent" | "direct" | "direct-adjusted" | "parent-upgrade" | "parent-update",
  severity: SeverityLabel,
): string {
  const severityTitle = severity === "unknown"
    ? "Unknown severity"
    : `${capitalize(severity)} severity`;

  if (kind === "urgent") {
    return severity === "critical"
      ? "Critical severity fix commands"
      : "High severity fix commands";
  }

  if (kind === "direct") {
    return `${severityTitle} direct fixes`;
  }

  if (kind === "direct-adjusted") {
    return `${severityTitle} direct fixes (registry-adjusted)`;
  }

  if (kind === "parent-update") {
    return `${severityTitle} parent updates within range`;
  }

  return `${severityTitle} parent upgrades`;
}

function groupByWorkspaceKey(targets: SuggestedFixTarget[]): Map<string, SuggestedFixTarget[]> {
  const groups = new Map<string, SuggestedFixTarget[]>();
  for (const target of targets) {
    const key = (target.workspaces ?? []).slice().sort().join("\0");
    const group = groups.get(key) ?? [];
    group.push(target);
    groups.set(key, group);
  }
  return groups;
}

function buildWorkspaceInstallCommands(
  targets: SuggestedFixTarget[],
  packageManager: SuggestedFixPackageManager,
): string[] {
  const groups = groupByWorkspaceKey(targets);
  const commands: string[] = [];

  for (const [wsKey, groupTargets] of groups) {
    const pkgArgs = groupTargets.map(t => `${t.package}@${t.targetVersion}`).join(" ");
    const workspaces = wsKey ? wsKey.split("\0") : [];

    if (packageManager === "npm") {
      const wsFlags = workspaces.map(ws => `-w ${ws}`).join(" ");
      commands.push(`npm install${wsFlags ? " " + wsFlags : ""} ${pkgArgs}`);
    } else if (packageManager === "pnpm") {
      const wsFlags = workspaces.map(ws => `--filter ./${ws}`).join(" ");
      commands.push(`pnpm add${wsFlags ? " " + wsFlags : ""} ${pkgArgs}`);
    } else if (packageManager === "yarn") {
      if (workspaces.length === 0) {
        commands.push(`yarn add ${pkgArgs}`);
      } else {
        for (const ws of workspaces) {
          commands.push(`yarn workspace ${ws} add ${pkgArgs}`);
        }
      }
    } else if (packageManager === "bun") {
      const wsFlags = workspaces.map(ws => `--filter ${ws}`).join(" ");
      commands.push(`bun add${wsFlags ? " " + wsFlags : ""} ${pkgArgs}`);
    } else {
      commands.push(`${commandPrefix(packageManager)} ${pkgArgs}`);
    }
  }

  return commands;
}

function buildCommandForTargets(
  targets: SuggestedFixTarget[],
  packageManager: SuggestedFixPackageManager,
): string {
  const explicitCommands = targets
    .map(target => target.command)
    .filter((value): value is string => Boolean(value));

  const commandParts: string[] = [];
  const parentUpdateTargets = targets.filter(target => target.kind === "parent-update");
  const installTargets = targets.filter(target => target.kind !== "parent-update");

  if (parentUpdateTargets.length > 0) {
    const updateCommands = explicitCommands.length > 0
      ? [...new Set(explicitCommands)]
      : packageManager === "npm"
        ? [`npm update ${parentUpdateTargets.map(target => target.package).join(" ")}`]
        : [];
    commandParts.push(...updateCommands);
  }

  if (installTargets.length > 0) {
    const hasWorkspaces = installTargets.some(t => t.workspaces?.length);
    if (hasWorkspaces) {
      commandParts.push(...buildWorkspaceInstallCommands(installTargets, packageManager));
    } else {
      commandParts.push(
        `${commandPrefix(packageManager)} ${installTargets.map(target => `${target.package}@${target.targetVersion}`).join(" ")}`,
      );
    }
  }

  return commandParts.join(" && ");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
