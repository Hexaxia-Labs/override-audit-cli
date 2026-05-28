import type { Finding, ScanInput, SeverityLabel } from "../types.js";
import { chalk, stripAnsi } from "../utils/chalk.js";
import { buildSuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import { isMajorVersionBump } from "../utils/version.js";
import { getPrimaryParent } from "../utils/finding.js";
import {
  countUniqueAdvisories,
  formatSeverityLabel,
  formatRelationshipLabel,
  sortFindingsForOutput
} from "./formatters.js";
import { pluralize } from "../utils/string.js";
import { selectFindingsForCompact } from "./finding-display.js";

export function printSummary(findings: Finding[], packageCount: number, scanInput: ScanInput) {
  if (findings.length === 0) {
    if (scanInput.mode === "manifest-fallback") {
      console.log(chalk.greenBright(`✓ No known OSV matches found for manifest fallback packages (${packageCount} exact direct dependencies checked)`));
    } else {
      console.log(chalk.greenBright(`✓ No known OSV vulnerability matches found in parsed lockfile packages (${packageCount} checked)`));
    }
    return;
  }

  const totalCVEs = countUniqueAdvisories(findings);
  const pkgLabel = findings.length === 1 ? "package" : "packages";
  const cveLabel = totalCVEs === 1 ? "CVE" : "CVEs";

  const counts = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    unknown: findings.filter(f => f.severity === "unknown").length
  };

  console.log(chalk.redBright(`✗ Found ${findings.length} ${pkgLabel} (${totalCVEs} ${cveLabel}) with known OSV matches from ${scanInput.source}`));
  console.log(renderSeverityTable(counts));
}

export function printActionSummary(findings: Finding[]) {
  if (findings.length === 0) return;
  const direct = findings.filter(f => f.relationship === "direct").length;
  const transitive = findings.filter(f => f.relationship === "transitive").length;
  const unknown = findings.filter(f => f.relationship === "unknown").length;
  const uniqueAdvisories = countUniqueAdvisories(findings);
  const fixable = findings.filter(f => Boolean(f.firstFixedVersion)).length;

  console.log("");
  console.log(chalk.bold.cyan("Quick take"));
  console.log(`- ${chalk.green(String(direct))} vulnerable ${pluralize(direct, "package")} look directly fixable in this project.`);
  console.log(`- ${chalk.yellow(String(transitive))} ${pluralize(transitive, "issue")} come through other dependencies.`);
  if (unknown > 0) {
    console.log(`- ${chalk.magenta(String(unknown))} ${pluralize(unknown, "package")} could not be clearly classified as direct or transitive.`);
  }
  console.log(`- ${chalk.blueBright(String(uniqueAdvisories))} ${pluralize(uniqueAdvisories, "CVE")} matched overall.`);
  console.log(`- ${chalk.blue(String(fixable))} ${pluralize(fixable, "package")} include a fixed-version hint from OSV.`);
}

export function printSuggestedFixCommands(
  findings: Finding[],
  scanInput: ScanInput,
  options?: { offline?: boolean },
) {
  const plan = buildSuggestedFixCommandPlan(findings, scanInput, options);
  if (!plan) return;
  if (plan.sections.length === 0) return;
  const sharedDirectTableWidths = computeSharedDirectTableWidths(plan.sections);
  const sharedParentUpgradeTableWidths = computeSharedParentUpgradeTableWidths(plan.sections);

  console.log("");
  console.log(chalk.bold.yellow("🛠  Copy And Run These Fix Commands"));
  console.log(`${chalk.gray("Detected package manager:")} ${chalk.cyan(plan.packageManager)} ${chalk.gray(`(${plan.sourceLabel})`)}`);
  console.log(chalk.white(formatFixCommandSummary(plan)));

  for (const section of plan.sections) {
    console.log("");
    console.log(colorFixSectionTitle(section.severity, section.title));

    if (section.kind === "direct" || section.kind === "direct-adjusted") {
      const validationSummary = summarizeAdjustedValidation(section.targets);
      const remainingNotes: string[] = [];
      printDirectTargetsTable(section.targets, remainingNotes, validationSummary, sharedDirectTableWidths);
      for (const note of remainingNotes) {
        console.log(chalk.gray(`  Note: ${note}`));
      }
    } else if (section.kind === "urgent") {
      const directTargets = section.targets.filter(t => t.kind === "direct");
      const parentUpgradeTargets = section.targets.filter(t => t.kind === "parent-upgrade" || t.kind === "parent-update");
      if (directTargets.length > 0) {
        const validationSummary = summarizeAdjustedValidation(directTargets);
        const remainingNotes: string[] = [];
        // Urgent sections compute their own widths so the Breaking? column
        // is not truncated by widths derived from smaller non-urgent sections.
        printDirectTargetsTable(directTargets, remainingNotes, validationSummary, undefined);
        for (const note of remainingNotes) {
          console.log(chalk.gray(`  Note: ${note}`));
        }
      }
      if (parentUpgradeTargets.length > 0) {
        printParentUpgradeTargetsTable(parentUpgradeTargets, undefined);
      }
    } else if (shouldRenderParentUpgradeTable(section.targets)) {
      printParentUpgradeTargetsTable(section.targets, sharedParentUpgradeTableWidths);
    }

    console.log(renderCommandCallout(section.command));
  }

  if (plan.coveredFindingCount > 0) {
    console.log("");
    const coverage = plan.coveredFindingCount === plan.totalFindingCount
      ? chalk.gray(`Running all commands above should fix all ${plan.totalFindingCount} findings.`)
      : chalk.gray(`Running all commands above should fix ${chalk.white(String(plan.coveredFindingCount))} of ${chalk.white(String(plan.totalFindingCount))} findings.`);
    console.log(coverage);
  }
}

export function printSuggestedFixCommandSkips(
  findings: Finding[],
  scanInput: ScanInput,
  options?: { offline?: boolean },
) {
  const plan = buildSuggestedFixCommandPlan(findings, scanInput, options);
  if (!plan || plan.skipped.length === 0) return;

  const unpublishable = plan.skipped.filter(skipped => skipped.reason.includes("not published on npm"));
  // Only surface direct-dependency skips here. Transitive findings without an
  // auto-fix path are already covered by the fix plan step 2 ("Review these urgent
  // transitive issues"), so repeating them here creates confusing duplication.
  const remaining = plan.skipped.filter(skipped =>
    !skipped.reason.includes("not published on npm") && skipped.relationship === "direct"
  );

  if (unpublishable.length > 0) {
    console.log("");
    console.log(chalk.gray("Unpublishable fixed-version hints:"));
    for (const skipped of unpublishable.slice(0, 5)) {
      console.log(`- ${skipped.package}@${skipped.version}: ${skipped.reason}`);
    }
    if (unpublishable.length > 5) {
      console.log(`- ...and ${unpublishable.length - 5} more`);
    }
  }

  if (remaining.length > 0) {
    console.log("");
    console.log(chalk.gray("No auto-fix command available for these direct dependencies:"));
    for (const skipped of remaining.slice(0, 5)) {
      console.log(`- ${skipped.package}@${skipped.version}: ${skipped.reason}`);
    }
    if (remaining.length > 5) {
      console.log(`- ...and ${remaining.length - 5} more`);
    }
  }
}

export function printCoverage(notes: string[]) {
  if (notes.length === 0) return;
  console.log("");
  console.log(chalk.bold.blue("Coverage notes"));
  for (const note of notes) {
    console.log(`${chalk.blue("•")} ${note}`);
  }
}

export function printSkippedDependencies(skipped: string[]) {
  console.log("");
  console.log(chalk.bold.yellow("Skipped manifest dependencies"));
  for (const item of skipped.slice(0, 10)) {
    console.log(`${chalk.yellow("•")} ${item}`);
  }
  if (skipped.length > 10) {
    console.log(`${chalk.yellow("•")} ...and ${skipped.length - 10} more`);
  }
}

export function printTable(findings: Finding[], threshold: SeverityLabel | null) {
  const headers = ["Package", "Version", "Severity", "Type", "Usage", "Fixed", "IDs"];
  const rawRows = findings.map(f => {
    let usageText = "n/a";
    if (f.usage) {
      usageText = f.usage.imported ? `${f.usage.files.length} file(s)` : "unused";
    }
    return [
      f.pkg.name,
      f.pkg.version,
      f.severity,
      f.relationship,
      usageText,
      (f.validatedFirstFixedVersion ?? f.firstFixedVersion) ??
        (f.vulnerabilities.some(v => v.id.startsWith("MAL-")) ? chalk.yellow("⚠ Malicious") : chalk.yellow("⚠ no fix")),
      f.vulnerabilities.map(v => v.id).join(", ")
    ];
  });

  const widths = headers.map((header, index) =>
    Math.min(40, Math.max(header.length, ...rawRows.map(r => stripAnsi(String(r[index])).length)))
  );

  console.log("");
  if (threshold) {
    console.log(chalk.bold(`Showing ${threshold}+ findings in the main table. Use --all to show everything.`));
  }

  const line = (left: string, mid: string, right: string) =>
    left + widths.map(w => "─".repeat(w + 2)).join(mid) + right;

  console.log(line("┌", "┬", "┐"));
  console.log(renderRow(headers, widths));
  console.log(line("├", "┼", "┤"));

  for (const row of rawRows) {
    let usageDecorated = String(row[4]);
    if (usageDecorated.includes("file(s)")) usageDecorated = chalk.red(usageDecorated);
    else if (usageDecorated.includes("unused")) usageDecorated = chalk.green(usageDecorated);
    else usageDecorated = chalk.gray(usageDecorated);

    const decorated = [
      row[0],
      row[1],
      formatSeverityLabel(String(row[2])),
      formatRelationshipLabel(String(row[3])),
      usageDecorated,
      row[5],
      row[6]
    ];
    console.log(renderRow(decorated, widths));
  }

  console.log(line("└", "┴", "┘"));

  const maliciousFindings = findings.filter(f => f.vulnerabilities.some(v => v.id.startsWith("MAL-")));
  if (maliciousFindings.length > 0) {
    console.log("");
    console.log(chalk.bold.red("⚠ Malicious package advisory:"));
    for (const f of maliciousFindings) {
      const action = f.relationship === "direct"
        ? "Remove it from your dependencies immediately."
        : "Upgrade or remove the parent package that pulls it in.";
      console.log(chalk.red(`  · ${f.pkg.name}@${f.pkg.version} — ${action}`));
    }
  }

  if (threshold) {
    console.log(chalk.gray("Tip: use --all to include low findings, or --min-severity high to focus only on urgent issues."));
  }
}

export function printFinalStatus(findings: Finding[]) {
  console.log("");
  console.log(chalk.gray("────────────────────────────────"));

  if (findings.length === 0) {
    console.log(chalk.greenBright("✔ Scan complete. No known vulnerabilities found."));
    return;
  }

  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;

  if (criticalCount > 0 || highCount > 0) {
    console.log(
      chalk.redBright(
        `✖ Scan complete. ${findings.length} ${pluralize(findings.length, "issue")} found (${criticalCount} critical, ${highCount} high). Start with the priority fixes above.`
      )
    );
    return;
  }

  console.log(
    chalk.yellow(
      `▲ Scan complete. ${findings.length} ${pluralize(findings.length, "issue")} found. Review the suggested fix plan above.`
    )
  );
}

function renderRow(cells: string[], widths: number[]) {
  const formatted = cells.map((cell, i) => {
    const truncated = truncate(cell, widths[i]);
    const visible = stripAnsi(truncated);
    return ` ${truncated}${" ".repeat(Math.max(0, widths[i] - visible.length))} `;
  });
  return "│" + formatted.join("│") + "│";
}

function truncate(value: string, width: number) {
  const plain = stripAnsi(value);
  if (plain.length <= width) return value;
  return plain.slice(0, Math.max(0, width - 1)) + "…";
}

function renderWrappedRow(cells: string[], widths: number[]) {
  const wrappedCells = cells.map((cell, i) => wrapCell(cell, widths[i]));
  const rowHeight = Math.max(...wrappedCells.map(cellLines => cellLines.length));
  const rows: string[] = [];

  for (let lineIndex = 0; lineIndex < rowHeight; lineIndex++) {
    const formatted = wrappedCells.map((cellLines, i) => {
      const value = cellLines[lineIndex] ?? "";
      const visible = stripAnsi(value);
      return ` ${value}${" ".repeat(Math.max(0, widths[i] - visible.length))} `;
    });
    rows.push("│" + formatted.join("│") + "│");
  }

  return rows;
}

function wrapCell(value: string, width: number): string[] {
  const plain = stripAnsi(value);
  if (plain.length <= width) return [value];
  if (width <= 0) return [""];

  const lines: string[] = [];
  let remaining = plain.trim();

  while (remaining.length > width) {
    let breakAt = remaining.lastIndexOf(" ", width);
    if (breakAt <= 0) breakAt = width;
    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }

  if (remaining.length > 0) {
    lines.push(remaining);
  }

  return lines.length > 0 ? lines : [""];
}

export function printCompactOutput(
  findings: Finding[],
  scanInput?: ScanInput,
  options?: { offline?: boolean; all?: boolean },
) {
  console.log("");
  
  if (findings.length === 0) {
    console.log(chalk.greenBright("✔ Scan complete. No known vulnerabilities found."));
    console.log("");
    return;
  }

  // Vulnerabilities found section
  console.log("────────────────────────────────");
  console.log(chalk.bold("📦 Vulnerabilities found"));
  console.log("────────────────────────────────\n");

  // Reuse shared display selection logic so compact mode does not silently
  // drop direct unknown-severity findings.
  const urgentFindings = selectFindingsForCompact(findings, { urgentLimit: 3 });

  for (const finding of urgentFindings) {
    const sevLabel = finding.severity.toUpperCase().padEnd(8);
    const typeLabel = finding.relationship === "direct"
      ? "Direct dependency"
      : finding.relationship === "transitive"
        ? "Transitive dependency"
        : "Unknown dependency";
        
    let usageContext = "";
    if (finding.usage) {
      if (finding.usage.imported) {
        usageContext = chalk.red(` (imported in ${finding.usage.files.length} ${pluralize(finding.usage.files.length, "file")})`);
      } else {
        usageContext = chalk.green(` (no direct import found)`);
      }
    }
    
    console.log(`${formatSeverityLabel(sevLabel)} ${chalk.whiteBright(finding.pkg.name)}@${finding.pkg.version}`);
    console.log(`            ${typeLabel}${usageContext}`);
    
    const isMalicious = finding.vulnerabilities.some(v => v.id.startsWith("MAL-"));
    if (isMalicious) {
      const action = finding.relationship === "direct"
        ? "Remove this package from your dependencies immediately."
        : "Upgrade or remove the parent package that pulls it in.";
      console.log(`            ${chalk.red(`⚠ Malicious: ${action}`)}`);
    } else if (finding.recommendedNpmTransitiveRemediation?.kind === "update-parent-within-range") {
      console.log(
        `            ${chalk.gray(`Fix: lockfile refresh — ${finding.recommendedNpmTransitiveRemediation.package} already permits a safe version`)}`,
      );
    } else if (finding.recommendedParentUpgrade) {
      console.log(
        `            ${chalk.gray(`Fix: upgrade ${finding.recommendedParentUpgrade.package} to ${finding.recommendedParentUpgrade.targetVersion}`)}`,
      );
    } else if (finding.firstFixedVersion) {
      const displayFixVersion = finding.validatedFirstFixedVersion ?? finding.firstFixedVersion;
      let action: string;
      if (finding.relationship === "direct") {
        action = `upgrade to ${displayFixVersion}`;
      } else {
        const parent = getPrimaryParent(finding);
        action = parent
          ? `Upgrade ${parent} — check for release resolving ${finding.pkg.name} to ${displayFixVersion}+`
          : `No dependency path found — inspect lockfile to identify which package pulls in ${finding.pkg.name}`;
      }
      console.log(`            ${chalk.gray(`Fix: ${action}`)}`);
    } else {
      let action: string;
      if (finding.relationship === "direct") {
        action = "review and upgrade directly";
      } else {
        const parent = getPrimaryParent(finding);
        action = parent
          ? `Upgrade ${parent} to resolve ${finding.pkg.name}`
          : `No dependency path found — inspect lockfile to identify which package pulls in ${finding.pkg.name}`;
      }
      console.log(`            ${chalk.gray(`Fix: ${action}`)}`);
    }
    console.log("");
  }

  const plan = scanInput ? buildSuggestedFixCommandPlan(findings, scanInput, options) : null;

  if (plan) {
    if (plan?.sections.length) {
      console.log("────────────────────────────────");
      console.log(chalk.bold.yellow("🛠  Copy And Run These Fix Commands"));
      console.log("────────────────────────────────\n");
      console.log(`${chalk.gray("Detected package manager:")} ${chalk.cyan(plan.packageManager)} ${chalk.gray(`(${plan.sourceLabel})`)}`);
      console.log(formatFixCommandSummary(plan));
      const compactValidationSummary = summarizeAdjustedValidation(plan.targets);
      if (compactValidationSummary.checked > 0) {
        console.log(
          chalk.gray(
            `Validation: scanned ${compactValidationSummary.checked} package ${pluralize(compactValidationSummary.checked, "version")}; ${compactValidationSummary.vulnerable} ${pluralize(compactValidationSummary.vulnerable, "is", "are")} still known vulnerable.`,
          ),
        );
      }
      console.log("");
      for (const section of plan.sections.slice(0, 3)) {
        console.log(`${section.title}`);
        if (section.kind === "direct-adjusted") {
          for (const target of section.targets) {
            if (!target.adjustmentNote) continue;
            console.log(chalk.gray(`  Note: ${target.adjustmentNote}`));
          }
        }
        console.log(renderCommandCallout(section.command));
        console.log("");
      }
    }
  }

  // Summary
  console.log("────────────────────────────────");
  console.log("Summary");
  console.log("────────────────────────────────\n");

  const counts = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    unknown: findings.filter(f => f.severity === "unknown").length
  };

  const direct = findings.filter(f => f.relationship === "direct").length;
  const transitive = findings.filter(f => f.relationship === "transitive").length;

  const parts: string[] = [];
  if (counts.critical > 0) parts.push(chalk.redBright(`${counts.critical} critical`));
  if (counts.high > 0) parts.push(chalk.magenta(`${counts.high} high`));
  if (counts.medium > 0) parts.push(chalk.yellow(`${counts.medium} medium`));
  if (counts.low > 0) parts.push(chalk.green(`${counts.low} low`));
  if (counts.unknown > 0) parts.push(chalk.gray(`${counts.unknown} unknown`));

  const compactCVEs = countUniqueAdvisories(findings);
  const compactPkgLabel = findings.length === 1 ? "package" : "packages";
  const compactCveLabel = compactCVEs === 1 ? "CVE" : "CVEs";
  console.log(
    `${chalk.whiteBright(String(findings.length))} ${compactPkgLabel}` +
    chalk.gray(" · ") +
    `${chalk.whiteBright(String(compactCVEs))} ${compactCveLabel}`
  );
  console.log(parts.join(chalk.gray(" · ")));
  console.log(
    `${chalk.cyan(String(direct))} ${chalk.white("direct")}` +
    `${chalk.gray(" · ")}` +
    `${chalk.cyan(String(transitive))} ${chalk.white("transitive")}`
  );

  const maliciousCompact = findings.filter(f => f.vulnerabilities.some(v => v.id.startsWith("MAL-")));
  if (maliciousCompact.length > 0 && !options?.all) {
    console.log("");
    console.log(chalk.bold.red("⚠ Malicious package advisory:"));
    for (const f of maliciousCompact) {
      const action = f.relationship === "direct"
        ? "Remove it from your dependencies immediately."
        : "Upgrade or remove the parent package that pulls it in.";
      console.log(chalk.red(`  · ${f.pkg.name}@${f.pkg.version} — ${action}`));
    }
  }

  if (options?.all) {
    printTable(findings, null);
  } else {
    console.log("");
  }

  // Footer
  const urgentCount = counts.critical + counts.high;
  if (urgentCount > 0) {
    console.log(
      chalk.redBright(
        `✖ Scan complete. ${urgentCount} urgent ${pluralize(urgentCount, "issue")} found.`
      )
    );
  } else {
    console.log(
      chalk.yellow(
        `▲ Scan complete. ${findings.length} ${pluralize(findings.length, "issue")} found.`
      )
    );
  }
  if (!options?.all) {
    console.log(chalk.gray(`Run with ${chalk.whiteBright("--verbose")} for fix plan, paths, and full table.`));
  }
  console.log("");
}

function renderSeverityTable(counts: { critical: number; high: number; medium: number; low: number; unknown: number }): string {
  const labels = ["Critical", "High", "Medium", "Low", "Unknown"];
  const coloredValues = [
    chalk.redBright(String(counts.critical)),
    chalk.red(String(counts.high)),
    chalk.yellow(String(counts.medium)),
    chalk.blueBright(String(counts.low)),
    chalk.magenta(String(counts.unknown)),
  ];
  const rawValues = [
    String(counts.critical),
    String(counts.high),
    String(counts.medium),
    String(counts.low),
    String(counts.unknown),
  ];
  const widths = labels.map((label, i) => Math.max(label.length, rawValues[i].length));
  const line = (left: string, mid: string, right: string) =>
    left + widths.map(w => "─".repeat(w + 2)).join(mid) + right;
  const pad = (text: string, raw: string, width: number) => {
    const pad = width - raw.length;
    const left = Math.floor(pad / 2);
    const right = pad - left;
    return " ".repeat(left + 1) + text + " ".repeat(right + 1);
  };
  const headerRow = "│" + labels.map((label, i) => ` ${label.padStart(Math.floor((widths[i] - label.length) / 2) + label.length).padEnd(widths[i])} `).join("│") + "│";
  const valueRow = "│" + coloredValues.map((val, i) => pad(val, rawValues[i], widths[i])).join("│") + "│";
  return [line("┌", "┬", "┐"), headerRow, line("├", "┼", "┤"), valueRow, line("└", "┴", "┘")].join("\n");
}

function colorFixSectionTitle(
  severity: SeverityLabel,
  title: string,
) {
  if (severity === "critical") return chalk.redBright(title);
  if (severity === "high") return chalk.magenta(title);
  if (severity === "medium") return chalk.yellow(title);
  if (severity === "low") return chalk.green(title);
  return chalk.gray(title);
}

function formatFixCommandSummary(
  plan: ReturnType<typeof buildSuggestedFixCommandPlan>,
) {
  if (!plan) return "";

  const packageCount = plan.targets.length;
  const sectionCount = plan.sections.length;
  const severityCounts = new Map<SeverityLabel, number>();

  for (const section of plan.sections) {
    severityCounts.set(section.severity, (severityCounts.get(section.severity) ?? 0) + 1);
  }

  const severitySummary = (["critical", "high", "medium", "low", "unknown"] as SeverityLabel[])
    .filter(severity => (severityCounts.get(severity) ?? 0) > 0)
    .map(severity => `${severityCounts.get(severity)} ${severity}`)
    .join(", ");

  const packageLabel = packageCount === 1 ? "package" : "packages";
  const sectionLabel = sectionCount === 1 ? "group" : "groups";

  return `${sectionCount} command ${sectionLabel} ready across ${packageCount} ${packageLabel}${severitySummary ? ` (${severitySummary})` : ""}.`;
}

function renderCommandCallout(command: string) {
  return chalk.bold.cyan(`> ${command}`);
}


function summarizeAdjustedValidation(
  targets: Array<{ scannedVersions?: number | null; knownVulnerableVersions?: number | null }>,
): { checked: number; vulnerable: number } {
  let checked = 0;
  let vulnerable = 0;
  for (const target of targets) {
    if (target.scannedVersions === null || target.scannedVersions === undefined) continue;
    checked += target.scannedVersions;
    vulnerable += target.knownVulnerableVersions ?? 0;
  }
  return { checked, vulnerable };
}

function printDirectTargetsTable(
  targets: Array<{
    package: string;
    currentVersion?: string;
    targetVersion: string;
    scannedVersions?: number | null;
    knownVulnerableVersions?: number | null;
    adjustmentNote?: string | null;
    usage?: { imported: boolean; files: string[] } | null;
  }>,
  remainingNotes: string[],
  validationSummary: { checked: number; vulnerable: number } | null,
  widthsOverride?: number[],
): void {
  const headers = ["Package", "Current", "Target", "Usage", "Versions scanned", "Still known vulnerable", "Breaking?"];
  const rows = targets.map(target => {
    if (target.adjustmentNote) {
      const isCountedVulnerabilityNote =
        target.scannedVersions !== null &&
        target.scannedVersions !== undefined &&
        target.adjustmentNote.includes("is still known vulnerable for");
      if (!isCountedVulnerabilityNote) {
        remainingNotes.push(target.adjustmentNote);
      }
    }

    const isBreaking = !!target.currentVersion && isMajorVersionBump(target.currentVersion, target.targetVersion);
    let usageText = chalk.gray("n/a");
    if (target.usage) {
      usageText = target.usage.imported ? chalk.red(`${target.usage.files.length} file(s)`) : chalk.green("unused");
    }

    return [
      target.package,
      target.currentVersion ?? "-",
      chalk.cyan(target.targetVersion),
      usageText,
      target.scannedVersions !== null && target.scannedVersions !== undefined
        ? chalk.blue(String(target.scannedVersions))
        : "-",
      target.knownVulnerableVersions !== null && target.knownVulnerableVersions !== undefined
        ? target.knownVulnerableVersions > 0
          ? chalk.yellow(String(target.knownVulnerableVersions))
          : chalk.green(String(target.knownVulnerableVersions))
        : "-",
      isBreaking ? chalk.yellow("⚠") : "",
    ];
  });

  if (rows.length === 0) return;

  const widths = widthsOverride ?? computeTableWidths(headers, rows);

  const line = (left: string, mid: string, right: string) =>
    left + widths.map(w => "─".repeat(w + 2)).join(mid) + right;

  console.log(line("┌", "┬", "┐"));
  console.log(renderRow(headers, widths));
  console.log(line("├", "┼", "┤"));
  for (const row of rows) {
    console.log(renderRow(row.map(value => String(value)), widths));
  }
  if (validationSummary) {
    console.log(line("├", "┼", "┤"));
    console.log(
      renderRow(
        [
          chalk.bold("Total"),
          "-",
          "-",
          "-",
          chalk.blue(String(validationSummary.checked)),
          validationSummary.vulnerable > 0
            ? chalk.yellow(String(validationSummary.vulnerable))
            : chalk.green(String(validationSummary.vulnerable)),
          "",
        ],
        widths,
      ),
    );
  }
  console.log(line("└", "┴", "┘"));
}

function printParentUpgradeTargetsTable(
  targets: Array<{
    package: string;
    currentVersion?: string;
    targetVersion: string;
    displayTargetVersion?: string;
    kind: "direct" | "parent-upgrade" | "parent-update";
    reason: string;
    usage?: { imported: boolean; files: string[] } | null;
  }>,
  widthsOverride?: number[],
): void {
  const headers = ["Package", "Current", "Recommended target", "Usage", "Context"];
  const rows = targets.map(target => {
    let usageText = chalk.gray("n/a");
    if (target.usage) {
      usageText = target.usage.imported ? chalk.red(`${target.usage.files.length} file(s)`) : chalk.green("unused");
    }
    return [
      target.package,
      target.currentVersion ?? "-",
      chalk.cyan(target.displayTargetVersion ?? target.targetVersion),
      usageText,
      chalk.gray(target.reason),
    ];
  });
  if (rows.length === 0) return;

  // Allow the Context column (index 4) up to 60 chars so reason text is not truncated.
  const widths = widthsOverride ?? computeTableWidths(headers, rows, [40, 40, 40, 40, 60]);
  const line = (left: string, mid: string, right: string) =>
    left + widths.map(w => "─".repeat(w + 2)).join(mid) + right;

  console.log(line("┌", "┬", "┐"));
  console.log(renderRow(headers, widths));
  console.log(line("├", "┼", "┤"));
  for (const row of rows) {
    for (const outputRow of renderWrappedRow(row.map(value => String(value)), widths)) {
      console.log(outputRow);
    }
  }
  console.log(line("└", "┴", "┘"));
}

function computeTableWidths(headers: string[], rows: string[][], columnMaxWidths?: number[]): number[] {
  return headers.map((header, index) => {
    const maxWidth = columnMaxWidths?.[index] ?? 40;
    return Math.min(maxWidth, Math.max(header.length, ...rows.map(row => stripAnsi(String(row[index])).length)));
  });
}

function computeSharedDirectTableWidths(
  sections: Array<{
    kind: "urgent" | "direct" | "direct-adjusted" | "parent-upgrade" | "parent-update";
    targets: Array<{
      package: string;
      currentVersion?: string;
      targetVersion: string;
      scannedVersions?: number | null;
      knownVulnerableVersions?: number | null;
      usage?: { imported: boolean; files: string[] } | null;
    }>;
  }>,
): number[] | undefined {
  const directSections = sections.filter(section => section.kind === "direct" || section.kind === "direct-adjusted");
  if (directSections.length === 0) return undefined;

  const headers = ["Package", "Current", "Target", "Usage", "Versions scanned", "Still known vulnerable", "Breaking?"];
  const rows: string[][] = [];

  for (const section of directSections) {
    for (const target of section.targets) {
      const isBreaking = !!target.currentVersion && isMajorVersionBump(target.currentVersion, target.targetVersion);
      let usageText = "n/a";
      if (target.usage) {
        usageText = target.usage.imported ? `${target.usage.files.length} file(s)` : "unused";
      }
      rows.push([
        target.package,
        target.currentVersion ?? "-",
        target.targetVersion,
        usageText,
        target.scannedVersions !== null && target.scannedVersions !== undefined ? String(target.scannedVersions) : "-",
        target.knownVulnerableVersions !== null && target.knownVulnerableVersions !== undefined ? String(target.knownVulnerableVersions) : "-",
        isBreaking ? "⚠" : "",
      ]);
    }

    const summary = summarizeAdjustedValidation(section.targets);
    rows.push(["Total", "-", "-", "-", String(summary.checked), String(summary.vulnerable), ""]);
  }

  return computeTableWidths(headers, rows);
}

function shouldRenderParentUpgradeTable(
  targets: Array<{ kind: "direct" | "parent-upgrade" | "parent-update" }>,
): boolean {
  return targets.length > 0 && targets.every(target => target.kind === "parent-upgrade" || target.kind === "parent-update");
}

function computeSharedParentUpgradeTableWidths(
  sections: Array<{
    kind: "urgent" | "direct" | "direct-adjusted" | "parent-upgrade" | "parent-update";
    targets: Array<{
      package: string;
      currentVersion?: string;
      targetVersion: string;
      displayTargetVersion?: string;
      kind: "direct" | "parent-upgrade" | "parent-update";
      reason: string;
      usage?: { imported: boolean; files: string[] } | null;
    }>;
  }>,
): number[] | undefined {
  const parentSections = sections.filter(section => shouldRenderParentUpgradeTable(section.targets));
  if (parentSections.length === 0) return undefined;

  const headers = ["Package", "Current", "Recommended target", "Usage", "Context"];
  const rows: string[][] = [];
  for (const section of parentSections) {
    for (const target of section.targets) {
      let usageText = "n/a";
      if (target.usage) {
        usageText = target.usage.imported ? `${target.usage.files.length} file(s)` : "unused";
      }
      rows.push([
        target.package,
        target.currentVersion ?? "-",
        target.displayTargetVersion ?? target.targetVersion,
        usageText,
        target.reason,
      ]);
    }
  }

  return computeTableWidths(headers, rows, [40, 40, 40, 40, 60]);
}
