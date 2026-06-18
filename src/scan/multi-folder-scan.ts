import path from "node:path";
import process from "node:process";
import type { Finding, ParsedOptions, PackageRef, SeverityLabel } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import type { ScanInput } from "../types.js";
import { loadMultiplePackages } from "../parsers/multi-package.js";
import { scanPackages, buildCoverageNotes } from "../scanner.js";
import { sortFindingsForOutput } from "../output/formatters.js";
import { normalizeSeverity } from "../osv/severity.js";
import { selectFindingsForTable } from "../output/finding-display.js";
import { buildSuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import { readDirectDependencyNames } from "../utils/package-json.js";
import { DEFAULT_BATCH_SIZE, DEFAULT_SEARCH_DEPTH, severityOrder } from "../constants.js";
import { printMultiFolderResults } from "../output/multi-folder-printer.js";
import { writeMultiFolderHtmlReport } from "../output/multi-folder-html-reporter.js";
import { chalk } from "../utils/chalk.js";
import { getCliVersion } from "../utils/version-info.js";
import { buildOverrideContext, audit } from "../overrides/index.js";
import { NULL_AUDIT_LOG } from "../audit-log/index.js";
import type { OverrideFinding } from "../overrides/types.js";

export interface MultiFolderScanResult {
  subfolder: string;
  scanInput: ScanInput;
  sorted: Finding[];
  suggestedFixCommands: SuggestedFixCommandPlan | null;
  coverage: string[];
  minSeverity: SeverityLabel;
  tableFindings: Finding[];
  allPackages: PackageRef[];
  /** Override hygiene findings for this folder, populated when --check-overrides is set. */
  overrideFindings: OverrideFinding[];
}

export async function runMultiFolderScan(params: {
  projectRoot: string;
  batchSize: number;
  options: ParsedOptions;
}): Promise<MultiFolderScanResult[]> {
  const searchDepth = Math.max(0, Number(params.options.searchDepth || DEFAULT_SEARCH_DEPTH));
  const folders = loadMultiplePackages(params.projectRoot, !!params.options.prodOnly, searchDepth);
  const offline = !!params.options.offline || !!params.options.offlineDb;
  const results: MultiFolderScanResult[] = [];

  for (const { scanInput, subfolder } of folders) {
    if (scanInput.packages.length === 0) continue;

    if (!params.options.json) {
      process.stdout.write(`\n${chalk.bold.cyan(`📁 ${subfolder}/`)}\n`);
    }

    const subfolderAbs = path.join(params.projectRoot, subfolder);
    const directDependencyNames = readDirectDependencyNames(subfolderAbs, !!params.options.prodOnly);
    const findings = await scanPackages(scanInput.packages, params.batchSize, params.options, {
      directDependencyNames,
      scanSource: scanInput.source,
      scanFilePath: scanInput.filePath,
    });

    const sorted = sortFindingsForOutput(findings);
    const coverage = buildCoverageNotes(scanInput, offline);
    const minSeverity = normalizeSeverity(params.options.minSeverity || "medium");
    const tableFindings = params.options.all ? sorted : selectFindingsForTable(sorted, minSeverity);
    const suggestedFixCommands = buildSuggestedFixCommandPlan(sorted, scanInput, { offline, subfolder });

    // Override hygiene per folder, mirroring the single-folder --check-overrides path.
    let overrideFindings: OverrideFinding[] = [];
    if (params.options.checkOverrides) {
      const overrideCtx = buildOverrideContext(subfolderAbs, {
        auditLog: NULL_AUDIT_LOG,
        logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
        checkNetwork: !!params.options.checkNetwork,
      });
      const overrideAudit = await audit(overrideCtx, { checkNetwork: !!params.options.checkNetwork });
      overrideFindings = overrideAudit.findings;
    }

    results.push({
      subfolder,
      scanInput,
      sorted,
      suggestedFixCommands,
      coverage,
      minSeverity,
      tableFindings,
      allPackages: scanInput.packages,
      overrideFindings,
    });
  }

  return results;
}

export async function handleMultiFolderScan(params: {
  projectRoot: string;
  batchSize: number;
  options: ParsedOptions;
}): Promise<void> {
  const results = await runMultiFolderScan(params);

  if (results.length === 0) {
    console.log(chalk.yellow("No scannable packages found in any subfolder."));
    process.exit(0);
    return;
  }

  if (params.options.fix) {
    console.error(chalk.yellow("--fix is not yet supported in multi-folder mode. Run cve-lite . from each subfolder individually."));
    process.exit(1);
    return;
  }

  if (params.options.sarif || params.options.cdx) {
    console.error(chalk.yellow("--sarif and --cdx are not yet supported in multi-folder mode."));
    process.exit(1);
    return;
  }

  if (params.options.json) {
    const { serializeFinding } = await import("../output/formatters.js");
    const allFindings = results.flatMap(r =>
      r.sorted.map(f => ({ ...serializeFinding(f, r.suggestedFixCommands), subfolder: r.subfolder }))
    );
    console.log(JSON.stringify({
      multiFolder: true,
      folders: results.map(r => r.subfolder),
      findings: allFindings,
      ...(params.options.checkOverrides
        ? {
            overrideFindings: results.flatMap(r =>
              r.overrideFindings.map(f => ({ ...f, subfolder: r.subfolder })),
            ),
          }
        : {}),
      scannedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    printMultiFolderResults(results, params.options);
    if (params.options.checkOverrides) {
      const { renderOverrideFindings } = await import("../output/formatters.js");
      for (const r of results) {
        process.stdout.write(`\n${chalk.bold.cyan(`📁 ${r.subfolder}/`)} ${chalk.gray("override hygiene")}\n`);
        console.log(renderOverrideFindings(r.overrideFindings));
      }
    }
  }

  if (params.options.report) {
    const outputDir = path.resolve(
      typeof params.options.report === "string" ? params.options.report : "./cve-report"
    );
    const cliVersion = getCliVersion();
    const { reportPath } = await writeMultiFolderHtmlReport({
      outputDir,
      results,
      projectPath: params.projectRoot,
      cliVersion,
      autoOpen: !params.options.noOpen,
    });
    console.log(`${chalk.gray("Report:")} ${chalk.cyan(reportPath)}`);
  }

  const failLevel = normalizeSeverity(params.options.failOn);
  const allSorted = results.flatMap(r => r.sorted);
  const shouldFail = allSorted.some(f => severityOrder[f.severity] >= severityOrder[failLevel]);
  process.exit(shouldFail ? 1 : 0);
}
