#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { parseArgs } from "./cli/args.js";
import { printBanner, printHelp } from "./cli/help.js";
import { validateOptions } from "./cli/validate.js";
import { loadPackages, buildNoPackagesMessage } from "./parsers/index.js";
import { scanPackages, buildCoverageNotes, createAdvisorySource } from "./scanner.js";
import { syncOsvAdvisories } from "./advisory/osv-sync.js";
import { normalizeSeverity } from "./osv/severity.js";
import { DEFAULT_BATCH_SIZE, DEFAULT_SEARCH_DEPTH, severityOrder } from "./constants.js";
import { chalk } from "./utils/chalk.js";
import { createSpinner } from "./output/spinner.js";
import { buildSuggestedFixCommandPlan } from "./remediation/fix-commands.js";
import { scanProjectForPackageUsage } from "./usage/scanner.js";
import { getCliVersion } from "./utils/version-info.js";
import {
  blockedAdvisoryRequestHint,
  fetchErrorCaCertHint,
  isLikelyBlockedAdvisoryRequestError,
  isRateLimitError,
  isServerError,
  isSslCertificateError,
  rateLimitAdvisoryRequestHint,
  serverAdvisoryRequestHint,
  sslCertificateErrorHint,
} from "./utils/network.js";
import { formatAdvisoryDbFreshness } from "./utils/time.js";
import { pluralize } from "./utils/string.js";
import type { ParsedOptions } from "./types.js";
import {
  formatAdvisorySourceLine,
  logInfo,
  logWarn,
  printCacheSummary,
  sortFindingsForOutput
} from "./output/formatters.js";
import { countBySeverity } from "./utils/severity.js";
import { buildReportData, writeHtmlReport } from "./output/html-reporter.js";
import { writeOutputs } from "./output/write-outputs.js";
import { selectFindingsForTable } from "./output/finding-display.js";
import {
  printSummary,
  printActionSummary,
  printSuggestedFixCommands,
  printSuggestedFixCommandSkips,
  printCoverage,
  printSkippedDependencies,
  printTable,
  printFinalStatus,
  printCompactOutput
} from "./output/printers.js";
import { installSkill } from "./skills/install.js";
import { readConfig, validateCaCertFile } from "./cli/config.js";
import { runConfigCommand } from "./cli/config-command.js";
import { readDirectDependencyNames } from "./utils/package-json.js";
import {
  applyFixesIfRequested,
  FixExecutionResult,
  printFixModeSummary,
} from "./utils/fix-runner.js";

let parsedArgs: ReturnType<typeof parseArgs> | null = null;
try {
  parsedArgs = parseArgs(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(chalk.red(`Error: ${message}`));
  console.error(chalk.gray("Run `cve-lite --help` to see supported options."));
  process.exit(1);
}

if (parsedArgs) {
  const { command, options, projectArg } = parsedArgs;
  const cliVersion = getCliVersion();

  if (options.help) {
    printHelp();
    process.exit(0);
  } else if (options.version) {
    printBanner(options);
    process.exit(0);
  } else {
  const projectPath = path.resolve(projectArg || ".");
  const batchSize = Number(options.batchSize || DEFAULT_BATCH_SIZE);
  const searchDepth = Math.max(0, Number(options.searchDepth || DEFAULT_SEARCH_DEPTH));

  async function main() {
    printBanner(options);

    if (command === "config") {
      const { configSubcommand } = parsedArgs!;
      if (!configSubcommand) {
        console.error(chalk.red("Error: config requires a subcommand: set, unset, show"));
        console.error(chalk.gray("Run `cve-lite --help` for usage."));
        process.exit(1);
      }
      try {
        runConfigCommand(configSubcommand);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Error: ${message}`));
        process.exit(1);
      }
      process.exit(0);
    }

    const savedConfig = readConfig();
    const resolvedCaCert = options.caCert ?? savedConfig.caCert;
    if (resolvedCaCert) {
      if (!options.caCert && savedConfig.caCert) {
        try {
          validateCaCertFile(resolvedCaCert);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(chalk.red(`Error: Saved ca-cert is no longer valid: ${message}`));
          console.error(chalk.gray(`Run \`cve-lite config unset ca-cert\` to remove it.`));
          process.exit(1);
        }
      }
      process.env.NODE_EXTRA_CA_CERTS = resolvedCaCert;
    }

    if (command === "advisories-sync") {
      const spinner = createSpinner("Preparing advisory sync...", options);
      const usePlainProgressLogs = !process.stdout.isTTY || !!options.json;
      const result = await syncOsvAdvisories({
        outputPath: options.output,
        onProgress: event => {
          if (event.phase === "complete") {
            return;
          }
          if (usePlainProgressLogs) {
            console.log(event.message);
            return;
          }
          spinner.update(event.message);
        },
      });
      if (usePlainProgressLogs) {
        console.log(`Advisory sync complete (${result.advisoryCount} records)`);
      } else {
        spinner.succeed(`Advisory sync complete (${result.advisoryCount} records)`);
      }
      console.log(
        `${chalk.gray("Advisory database:")} synced ${result.advisoryCount} ${pluralize(result.advisoryCount, "record")} to ${chalk.cyan(result.dbPath)}`,
      );
      process.exit(0);
      return;
    }

    if (command === "install-skill") {
      installSkill(process.cwd());
      process.exit(0);
      return;
    }

    validateOptions(options);

    let advisorySourceLine: string;
    let advisoryDbFreshnessLine: string | null = null;
    let advisoryDbWarning: string | null = null;
    try {
      const advisorySource = createAdvisorySource({
        osvUrl: options.osvUrl,
        offline: options.offline,
        offlineDb: options.offlineDb,
      });
      advisorySourceLine = advisorySource.sourceLabel;
      if (advisorySource.offline) {
        const metadata = advisorySource.advisoryDbMetadata;
        advisoryDbFreshnessLine = formatAdvisoryDbFreshness(metadata?.lastSyncAt ?? null);
        if (advisorySource.advisoryDbIsStale) {
          advisoryDbWarning = metadata?.lastSyncAt
            ? "The local advisory DB appears stale. Re-run `cve-lite advisories sync` to refresh it."
            : "The local advisory DB has no recorded sync timestamp. Re-run `cve-lite advisories sync` to refresh it.";
        }
      }
      advisorySource.cleanup();
    } catch (error) {
      if (options.offline || options.offlineDb) {
        throw new Error(`Offline advisory database is not available: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    }

    if (!options.json) {
      if (options.offline || options.offlineDb) {
        console.log(chalk.gray("Offline mode:") + " " + chalk.yellow("enabled") + " " + chalk.gray("(no external advisory calls will be made)"));
      }
      console.log(`${chalk.gray("Advisory source:")} ${formatAdvisorySourceLine(advisorySourceLine)}`);
      if (advisoryDbFreshnessLine) {
        console.log(`${chalk.gray("Advisory DB freshness:")} ${advisoryDbFreshnessLine}`);
      }
    }
    if (advisoryDbWarning) {
      logWarn(advisoryDbWarning, options);
    }

    let scanInput = loadPackages(projectPath, !!options.prodOnly, searchDepth);
    let packages = scanInput.packages;

    logInfo(
      `Parsed ${packages.length} ${pluralize(packages.length, "package")} from ${scanInput.source}${
        scanInput.filePath ? ` (${path.relative(projectPath, scanInput.filePath) || path.basename(scanInput.filePath)})` : ""
      }`,
      options
    );
    printCacheSummary(options.cacheDir, options);

    if (scanInput.warnings.length > 0) {
      for (const warning of scanInput.warnings) {
        logWarn(warning, options);
      }
    }

    if (packages.length === 0) {
      logWarn(buildNoPackagesMessage(projectPath), options);
      process.exit(0);
      return;
    }

    let scanState = await scanProject({
      scanInput,
      batchSize,
      options,
      projectPath,
    });
    const findingsBeforeFix = scanState.sorted.length;
    let fixResult: FixExecutionResult | null = null;

    if (options.fix) {
      fixResult = await applyFixesIfRequested({
        plan: scanState.suggestedFixCommands,
        projectPath,
        totalFindings: scanState.sorted.length,
        options,
      });

      if (fixResult.appliedFixCount > 0) {
        console.log(`${chalk.cyan("⠋")} ${chalk.gray("Rescanning project...")}`);
        scanInput = loadPackages(projectPath, !!options.prodOnly, searchDepth);
        packages = scanInput.packages;
        if (packages.length === 0) {
          logWarn(buildNoPackagesMessage(projectPath), options);
          process.exit(0);
          return;
        }

        scanState = await scanProject({
          scanInput,
          batchSize,
          options,
          projectPath,
        });
      }
    }

    if (options.fix) {
      printFixModeSummary({
        fixResult,
        findingsBeforeFix,
        findingsAfterFix: scanState.sorted.length,
        remainingBySeverity: countBySeverity(scanState.sorted),
      });
    } else {
      await writeOutputs(options, {
        sorted: scanState.sorted,
        allPackages: scanState.allPackages,
        suggestedFixCommands: scanState.suggestedFixCommands,
        coverage: scanState.coverage,
        minSeverity: scanState.minSeverity,
        tableFindings: scanState.tableFindings,
      }, scanInput, projectPath);

      if (!(options.json || options.sarif || options.cdx) || options.verbose) {
        const offline = !!options.offline || !!options.offlineDb;
        if (options.verbose) {
          printSummary(scanState.sorted, packages.length, scanInput);
          printActionSummary(scanState.sorted);
          printSuggestedFixCommands(scanState.sorted, scanInput, { offline });
          printSuggestedFixCommandSkips(scanState.sorted, scanInput, { offline });
          if (scanInput.skippedDependencies.length > 0) {
            printSkippedDependencies(scanInput.skippedDependencies);
          }
          if (scanState.sorted.length > 0) {
            if (scanState.tableFindings.length > 0) {
              printTable(scanState.tableFindings, options.all ? null : scanState.minSeverity);
            } else {
              logInfo(`No findings met the table threshold of ${scanState.minSeverity}. Re-run with --all to show everything.`, options);
            }
          }
          printCoverage([...scanInput.notes, ...scanState.coverage]);
          printFinalStatus(scanState.sorted);
        } else {
          printCompactOutput(scanState.sorted, scanInput, { offline, all: !!options.all });
        }
      }
    }

    if (options.report) {
      const outputDir = path.resolve(
        typeof options.report === "string" ? options.report : "./cve-report"
      );
      const reportData = buildReportData({
        projectPath,
        cliVersion,
        packageManager: scanInput.source,
        lockfileSource: scanInput.filePath ? path.basename(scanInput.filePath) : scanInput.source,
        packageCount: packages.length,
        findings: scanState.sorted,
        suggestedFixCommands: scanState.suggestedFixCommands,
        notes: [...scanInput.notes, ...scanState.coverage],
        warnings: scanInput.warnings,
      });
      const { reportPath } = await writeHtmlReport({
        outputDir,
        data: reportData,
        autoOpen: !options.noOpen,
      });
      console.log(`${chalk.gray("Report:")} ${chalk.cyan(reportPath)}`);
    }

    const failLevel = normalizeSeverity(options.failOn);
    const shouldFail = scanState.sorted.some(f => severityOrder[f.severity] >= severityOrder[failLevel]);
    process.exit(shouldFail ? 1 : 0);
    return;
  }

  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${errorMessage}`));
    if (isSslCertificateError(error)) {
      const [hint, ...rest] = sslCertificateErrorHint();
      console.error(chalk.yellow(hint));
      rest.forEach(line => console.error(chalk.gray(line)));
    } else if (isRateLimitError(errorMessage)) {
      const [hint, ...rest] = rateLimitAdvisoryRequestHint();
      console.error(chalk.yellow(hint));
      rest.forEach(line => console.error(chalk.gray(line)));
    } else if (isServerError(errorMessage)) {
      const [hint, ...rest] = serverAdvisoryRequestHint();
      console.error(chalk.yellow(hint));
      rest.forEach(line => console.error(chalk.gray(line)));
    } else if (isLikelyBlockedAdvisoryRequestError(errorMessage)) {
      const [hint, ...rest] = blockedAdvisoryRequestHint();
      console.error(chalk.yellow(hint));
      rest.forEach(line => console.error(chalk.gray(line)));
    } else {
      const [hint, ...rest] = fetchErrorCaCertHint();
      console.error(chalk.yellow(hint));
      rest.forEach(line => console.error(chalk.gray(line)));
    }
    process.exit(1);
  });
  }
}

async function scanProject(params: {
  scanInput: ReturnType<typeof loadPackages>;
  batchSize: number;
  options: ParsedOptions;
  projectPath: string;
}) {
  const directDependencyNames = readDirectDependencyNames(params.projectPath, !!params.options.prodOnly);
  const findings = await scanPackages(params.scanInput.packages, params.batchSize, params.options, {
    directDependencyNames,
    scanSource: params.scanInput.source,
    scanFilePath: params.scanInput.filePath,
  });

  if (params.options.usage) {
    logInfo(`Scanning project source for usage hints...`, params.options);
    const pkgNames = new Set(findings.map(f => f.pkg.name));
    const usageData = scanProjectForPackageUsage(params.projectPath, pkgNames);
    for (const finding of findings) {
      const files = usageData[finding.pkg.name];
      if (files) {
        finding.usage = {
          imported: files.length > 0,
          files,
        };
      }
    }
  }
  let finalFindings = findings;
  if (params.options.onlyUsed) {
    finalFindings = finalFindings.filter(f => f.usage?.imported);
  }

  const offline = !!params.options.offline || !!params.options.offlineDb;
  const sorted = sortFindingsForOutput(finalFindings);
  const coverage = buildCoverageNotes(params.scanInput, offline);
  const minSeverity = normalizeSeverity(params.options.minSeverity || "medium");
  const tableFindings = params.options.all
    ? sorted
    : selectFindingsForTable(sorted, minSeverity);
  const suggestedFixCommands = buildSuggestedFixCommandPlan(sorted, params.scanInput, { offline });

  return {
    sorted,
    coverage,
    minSeverity,
    tableFindings,
    suggestedFixCommands,
    allPackages: params.scanInput.packages,
  };
}

