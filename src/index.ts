#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { existsSync } from "node:fs";
import { parseArgs } from "./cli/args.js";
import { printBanner, printHelp, printOverridesHelp } from "./cli/help.js";
import { validateOptions } from "./cli/validate.js";
import { loadPackages, buildNoPackagesMessage } from "./parsers/index.js";
import { scanPackages, buildCoverageNotes, createAdvisorySource } from "./scanner.js";
import { syncOsvAdvisories } from "./advisory/osv-sync.js";
import { normalizeSeverity } from "./osv/severity.js";
import { DEFAULT_BATCH_SIZE, DEFAULT_SEARCH_DEPTH, severityOrder } from "./constants.js";
import { chalk } from "./utils/chalk.js";
import { createSpinner } from "./output/spinner.js";
import { createDebugLogger, type DebugLogger } from "./output/debug.js";
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
  offlineDbSyncHint,
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
import { renderOverrideFindings } from "./output/override-findings-terminal.js";
import { installSkill } from "./skills/install.js";
import { readConfig, validateCaCertFile } from "./cli/config.js";
import { runConfigCommand } from "./cli/config-command.js";
import { readDirectDependencyNames } from "./utils/package-json.js";
import {
  applyFixesIfRequested,
  FixExecutionResult,
  printFixModeSummary,
} from "./utils/fix-runner.js";
import { createAuditLog } from "./audit-log/index.js";
import { audit, buildOverrideContext } from "./overrides/index.js";
import type { OverrideFinding } from "./overrides/types.js";
import { hasRootLockfile, findNestedLockfiles } from "./parsers/multi-package.js";
import { handleMultiFolderScan } from "./scan/multi-folder-scan.js";
import {
  createPullRequestForFixes,
  findingsMeetFailOnThreshold,
} from "./utils/create-pr.js";
import { readBaseline, writeBaseline, filterNewFindings } from "./utils/baseline.js";
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
    if (command === "overrides") {
      printOverridesHelp();
    } else {
      printHelp();
    }
    process.exit(0);
  } else if (options.version) {
    printBanner(options);
    process.exit(0);
  } else {
  const projectPath = path.resolve(projectArg || ".");
  // #34: a known command would have been dispatched before this branch, so an
  // explicit first argument that does not resolve to an existing path is almost
  // certainly a mistyped command (e.g. `cve-lite frobnicate`). Error instead of
  // silently scanning a nonexistent path and reporting "0 packages, exit 0" - a
  // clean exit on a typo'd command is a foot-gun for a security tool.
  if (projectArg && !existsSync(projectPath)) {
    const near = nearestCommand(projectArg);
    console.error(chalk.red(
      `Error: '${projectArg}' is not an existing path or a known command.` +
      (near ? ` Did you mean '${near}'?` : "")
    ));
    console.error(chalk.gray("Run 'cve-lite --help' for usage."));
    process.exit(3);
  }
  const batchSize = Number(options.batchSize || DEFAULT_BATCH_SIZE);
  const searchDepth = Math.max(0, Number(options.searchDepth || DEFAULT_SEARCH_DEPTH));
  const debugSession = createDebugLogger(!!options.debug);
  const debugLog = debugSession.log;
  const scanStartedAt = Date.now();
  const auditLogHandle = createAuditLog(options.auditLog ?? process.env.CVE_LITE_AUDIT_LOG);

  async function main() {
    printBanner(options);
    debugSession.announcePath();

    debugLog("CLI started", {
      version: cliVersion,
      args: process.argv.slice(2),
    });

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
    debugLog("Config loaded", {
      caCert: resolvedCaCert ?? null,
      nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS ?? null,
    });

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

    if (command === "overrides") {
      const { runOverrides } = await import("./cli/overrides.js");
      const logger = {
        info: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
        error: (msg: string) => console.error(msg),
        debug: (msg: string) => console.debug(msg),
      };
      const exitCode = await runOverrides({
        projectArg,
        options,
        logger,
      });
      process.exit(exitCode);
    }

    validateOptions(options);

    // Multi-folder mode: if no root lockfile and 2+ nested lockfiles exist,
    // route to dedicated multi-folder handler instead of single-lockfile scan
    const nestedLockfiles = findNestedLockfiles(projectPath, searchDepth);
    if (!hasRootLockfile(projectPath) && nestedLockfiles.length >= 2) {
      await handleMultiFolderScan({ projectRoot: projectPath, batchSize, options });
      return;
    }

    let advisorySourceLine = "";
    let advisoryDbFreshnessLine: string | null = null;
    let advisoryDbWarning: string | null = null;
    try {
      const advisorySource = createAdvisorySource({
        osvUrl: options.osvUrl,
        offline: options.offline,
        offlineDb: options.offlineDb,
        debugLog,
      });
      advisorySourceLine = advisorySource.sourceLabel;
      debugLog("Advisory source", {
        mode: advisorySource.offline ? "offline" : "online",
        url: options.osvUrl ?? (advisorySource.offline ? null : "https://api.osv.dev"),
        label: advisorySourceLine,
      });
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
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Offline advisory database is not available: ${reason}\n${offlineDbSyncHint(options.offlineDb).join("\n")}`);
      }
      throw error;
    }

    if (!options.json && !options.ratchet) {
      if (options.offline || options.offlineDb) {
        console.log(chalk.gray("Offline mode:") + " " + chalk.yellow("enabled") + " " + chalk.gray("(no external advisory calls will be made)"));
      }
      if (advisorySourceLine) {
        console.log(`${chalk.gray("Advisory source:")} ${formatAdvisorySourceLine(advisorySourceLine)}`);
      }
      if (advisoryDbFreshnessLine) {
        console.log(`${chalk.gray("Advisory DB freshness:")} ${advisoryDbFreshnessLine}`);
      }
    }
    if (advisoryDbWarning) {
      logWarn(advisoryDbWarning, options);
    }

    let scanInput = loadPackages(projectPath, !!options.prodOnly, searchDepth);
    let packages = scanInput.packages;
    if (scanInput.filePath) {
      debugLog("Lockfile selected", {
        source: scanInput.source,
        path: scanInput.filePath,
      });
    }
    debugLog("Packages parsed", {
      count: packages.length,
      source: scanInput.source,
    });

    // Emit scan.started event after loading packages
    const scanStartTime = Date.now();
    auditLogHandle.emit({
      ts: new Date().toISOString(),
      type: "scan.started",
      schemaVersion: 1,
      projectPath,
      mode: scanInput.mode,
      source: scanInput.source,
      flags: {
        fix: options.fix === true,
        json: options.json === true,
        prodOnly: options.prodOnly === true,
        offline: options.offline === true,
        checkOverrides: options.checkOverrides === true,
      },
    });

    if (!options.ratchet) {
      logInfo(
        `Parsed ${packages.length} ${pluralize(packages.length, "package")} from ${scanInput.source}${
          scanInput.filePath ? ` (${path.relative(projectPath, scanInput.filePath) || path.basename(scanInput.filePath)})` : ""
        }`,
        options
      );
      printCacheSummary(options.cacheDir, options);
    }

    if (scanInput.warnings.length > 0) {
      for (const warning of scanInput.warnings) {
        logWarn(warning, options);
      }
    }

    if (packages.length === 0) {
      debugLog("Scan skipped", { reason: "no packages found", projectPath });
      logWarn(buildNoPackagesMessage(projectPath), options);
      auditLogHandle.emit({
        ts: new Date().toISOString(),
        type: "scan.finished",
        schemaVersion: 1,
        durationMs: Date.now() - scanStartTime,
        findingsCount: 0,
        exitCode: 0,
      });
      auditLogHandle.close();
      process.exit(0);
      return;
    }

    if (!options.json && !options.ratchet) console.log();
    let scanState = await scanProject({
      scanInput,
      batchSize,
      options,
      projectPath,
      debugLog,
    });
    const findingsBeforeFixList = scanState.sorted;
    const findingsBeforeFix = findingsBeforeFixList.length;
    let fixResult: FixExecutionResult | null = null;
    let baseline = readBaseline(projectArg ?? ".");
    let suppressedCount = 0;

    // Collect override findings if --check-overrides is set
    let overrideFindings: OverrideFinding[] = [];
    if (options.checkOverrides) {
      const overrideCtx = buildOverrideContext(projectPath, {
        auditLog: auditLogHandle,
        logger: {
          info: (msg: string) => debugLog("oa.info", { message: msg }),
          warn: (msg: string) => debugLog("oa.warn", { message: msg }),
          error: (msg: string) => debugLog("oa.error", { message: msg }),
          debug: (msg: string) => debugLog("oa.debug", { message: msg }),
        },
        checkNetwork: !!options.checkNetwork,
      });
      const auditResult = await audit(overrideCtx, { checkNetwork: !!options.checkNetwork });
      overrideFindings = auditResult.findings;
    }

    // Emit cve.detected for each CVE finding
    for (const f of scanState.sorted) {
      auditLogHandle.emit({
        ts: new Date().toISOString(),
        type: "cve.detected",
        schemaVersion: 1,
        package: { name: f.pkg.name, version: f.pkg.version },
        severity: f.severity,
        cveAliases: f.cveAliases,
        vulnerabilityIds: f.vulnerabilities.map((v) => v.id),
      });
    }

    if (options.fix) {
      fixResult = await applyFixesIfRequested({
        plan: scanState.suggestedFixCommands,
        projectPath,
        totalFindings: scanState.sorted.length,
        options,
        debugLog,
      });

      if (fixResult.appliedFixCount > 0) {
        console.log(`${chalk.cyan("⠋")} ${chalk.gray("Rescanning project...")}`);
        scanInput = loadPackages(projectPath, !!options.prodOnly, searchDepth);
        packages = scanInput.packages;
        if (packages.length === 0) {
          debugLog("Scan skipped", { reason: "no packages found after fix rescan", projectPath });
          logWarn(buildNoPackagesMessage(projectPath), options);
          auditLogHandle.emit({
            ts: new Date().toISOString(),
            type: "scan.finished",
            schemaVersion: 1,
            durationMs: Date.now() - scanStartTime,
            findingsCount: 0,
            exitCode: 0,
          });
          auditLogHandle.close();
          process.exit(0);
          return;
        }

        scanState = await scanProject({
          scanInput,
          batchSize,
          options,
          projectPath,
          debugLog,
        });
      }
    }

    let overridesFixHookResult = null;
    if (options.fix && fixResult) {
      const { runOverridesFixHook } = await import("./cli/fix-overrides-hook.js");
      const projectPathResolved = path.resolve(projectArg ?? ".");
      const auditLogHandle = createAuditLog(options.auditLog ?? process.env.CVE_LITE_AUDIT_LOG);

      // Collect CVE-touched targets from cve-lite's fix result.
      const cveFixTargets = fixResult.applied.map((entry) => ({
        name: entry.package,
        version: entry.to,
      }));

      // Create a simple logger adapter if needed
      const hookLogger = {
        info: (msg: string) => debugLog("hook.info", { message: msg }),
        warn: (msg: string) => debugLog("hook.warn", { message: msg }),
        error: (msg: string) => debugLog("hook.error", { message: msg }),
        debug: (msg: string) => debugLog("hook.debug", { message: msg }),
      };

      overridesFixHookResult = await runOverridesFixHook({
        projectPath: projectPathResolved,
        auditLog: auditLogHandle,
        logger: hookLogger,
        cveFixTargets,
      });
      auditLogHandle.close();

      if (!overridesFixHookResult.verifyOk) {
        debugLog("overrides-fix-hook verify failed", {
          failures: overridesFixHookResult.verifyFailures,
        });
        console.log(
          chalk.red(
            `Overrides fix verify failed:\n${overridesFixHookResult.verifyFailures
              .map((v) => `  ${v.ruleId} ${v.package}: ${v.reason}`)
              .join("\n")}`
          )
        );
        process.exit(2);
      }
    }

    // Emit cve.fix.applied for each target in the fix plan
    if (scanState.suggestedFixCommands?.targets) {
      for (const target of scanState.suggestedFixCommands.targets) {
        auditLogHandle.emit({
          ts: new Date().toISOString(),
          type: "cve.fix.applied",
          schemaVersion: 1,
          package: target.package,
          fromVersion: target.currentVersion ?? "unknown",
          toVersion: target.targetVersion,
          mechanism: target.kind,
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

      if (options.createPr && fixResult) {
        if (fixResult.appliedFixCount === 0) {
          logWarn("Skipping pull request creation: no direct fixes were applied.", options);
        } else {
          console.log("");
          console.log(chalk.bold.cyan("Creating pull request (--create-pr)"));
          const prResult = await createPullRequestForFixes({
            projectPath,
            baseBranch: options.prBase ?? "main",
            fixResult,
            findingsBeforeFix: findingsBeforeFixList,
            findingsAfterFix: scanState.sorted,
          });
          if (prResult.skipped) {
            logWarn(prResult.skipReason ?? "Pull request was not created.", options);
          } else if (prResult.prUrl) {
            console.log(`${chalk.gray("Pull request:")} ${chalk.cyan(prResult.prUrl)}`);
            console.log(`${chalk.gray("Branch:")} ${chalk.cyan(prResult.branchName)}`);
          } else {
            logWarn(`Branch ${prResult.branchName} was pushed, but no pull request URL was returned.`, options);
          }
        }
      }
    } else {
      // --ratchet: save baseline and exit 0
      if (options.ratchet) {
        writeBaseline(projectArg ?? ".", scanState.sorted);
        const count = scanState.sorted.length;
        console.log(chalk.green(`✓ Baseline saved to .cve-lite/baseline.json with ${count} ${count === 1 ? "finding" : "findings"}. Future scans will only report findings above this baseline.`));
        process.exit(0);
        return;
      }

      // auto-apply baseline if it exists - filter before output
      if (baseline) {
        const filtered = filterNewFindings(scanState.sorted, baseline);
        scanState.sorted = filtered.newFindings;
        scanState.tableFindings = scanState.tableFindings.filter(f =>
          filtered.newFindings.some(nf => nf.pkg.name === f.pkg.name && nf.pkg.version === f.pkg.version)
        );
        suppressedCount = filtered.suppressedCount;
      }

      await writeOutputs(options, {
        sorted: scanState.sorted,
        allPackages: scanState.allPackages,
        suggestedFixCommands: scanState.suggestedFixCommands,
        coverage: scanState.coverage,
        minSeverity: scanState.minSeverity,
        tableFindings: scanState.tableFindings,
        overrideFindings,
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
              const skippedKeys = new Set(
                (scanState.suggestedFixCommands?.skipped ?? []).map(s => `${s.package}@${s.version}`)
              );
              printTable(scanState.tableFindings, options.all ? null : scanState.minSeverity, skippedKeys);
            } else {
              logInfo(`No findings met the table threshold of ${scanState.minSeverity}. Re-run with --all to show everything.`, options);
            }
          }
          printCoverage([...scanInput.notes, ...scanState.coverage]);
          printFinalStatus(scanState.sorted);
        } else {
          printCompactOutput(scanState.sorted, scanInput, { offline, all: !!options.all });
        }
        // Override hygiene section: --check-overrides collects these and threads
        // them to JSON/SARIF/HTML; render them in the terminal too so the feature
        // is visible in a plain scan, not only in machine output (#35).
        if (options.checkOverrides) {
          console.log(renderOverrideFindings(overrideFindings));
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
        overrideFindings,
      });
      const { reportPath } = await writeHtmlReport({
        outputDir,
        data: reportData,
        autoOpen: !options.noOpen,
      });
      console.log(`${chalk.gray("Report:")} ${chalk.cyan(reportPath)}`);
    }

    debugLog("Scan finished", {
      totalDurationMs: Date.now() - scanStartedAt,
      findings: scanState.sorted.length,
      packages: packages.length,
    });

    if (baseline) {
      if (scanState.sorted.length === 0) {
        console.log(chalk.green(`No new findings above baseline - ${suppressedCount} existing ${suppressedCount === 1 ? "finding" : "findings"} suppressed`));
      } else {
        console.log(chalk.yellow(`${scanState.sorted.length} new ${scanState.sorted.length === 1 ? "finding" : "findings"} above baseline - ${suppressedCount} existing ${suppressedCount === 1 ? "finding" : "findings"} suppressed`));
      }
    }

    const failLevel = normalizeSeverity(options.failOn);
    const shouldFail = scanState.sorted.some(f => severityOrder[f.severity] >= severityOrder[failLevel]);
    const exitCode = shouldFail ? 1 : 0;

    // Emit scan.finished event and close audit-log
    auditLogHandle.emit({
      ts: new Date().toISOString(),
      type: "scan.finished",
      schemaVersion: 1,
      durationMs: Date.now() - scanStartTime,
      findingsCount: scanState.sorted.length + overrideFindings.length,
      exitCode,
    });
    auditLogHandle.close();

    process.exit(exitCode);
    return;
  }

  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${errorMessage}`));
    if (options.debug && error instanceof Error && error.stack) {
      debugLog("Unhandled error", { message: error.message, stack: error.stack });
    }

    // Emit error event to audit-log
    auditLogHandle.emit({
      ts: new Date().toISOString(),
      type: "error",
      schemaVersion: 1,
      phase: "scan",
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    auditLogHandle.close();

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

/**
 * Suggest the nearest known command for a mistyped first argument (#34).
 * Returns undefined when nothing is within edit distance 2 (e.g. a real typo'd
 * path rather than a typo'd command).
 */
function nearestCommand(arg: string): string | undefined {
  const commands = ["overrides", "advisories", "install-skill", "config"];
  let best: string | undefined;
  let bestDist = 3;
  for (const c of commands) {
    const d = levenshtein(arg.toLowerCase(), c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

async function scanProject(params: {
  scanInput: ReturnType<typeof loadPackages>;
  batchSize: number;
  options: ParsedOptions;
  projectPath: string;
  debugLog: DebugLogger;
}) {
  const directDependencyNames = readDirectDependencyNames(params.projectPath, !!params.options.prodOnly);
  const findings = await scanPackages(params.scanInput.packages, params.batchSize, params.options, {
    directDependencyNames,
    scanSource: params.scanInput.source,
    scanFilePath: params.scanInput.filePath,
  }, params.debugLog);

  if (params.options.usage) {
    logInfo(`Scanning project source for usage hints...`, params.options);
    const usageStartedAt = Date.now();
    const pkgNames = new Set(findings.map(f => f.pkg.name));
    const usageData = scanProjectForPackageUsage(params.projectPath, pkgNames);
    let matchedPackages = 0;
    for (const finding of findings) {
      const files = usageData[finding.pkg.name];
      if (files) {
        if (files.length > 0) {
          matchedPackages += 1;
        }
        finding.usage = {
          imported: files.length > 0,
          files,
        };
      }
    }
    if (params.options.debug) {
      params.debugLog("Usage scan", {
        durationMs: Date.now() - usageStartedAt,
        packagesChecked: pkgNames.size,
        matchedPackages,
      });
    }
  }
  let finalFindings = findings;
  if (params.options.onlyUsed) {
    const beforeCount = finalFindings.length;
    finalFindings = finalFindings.filter(f => f.usage?.imported);
    if (params.options.debug) {
      params.debugLog("Findings filtered", {
        reason: "only-used",
        before: beforeCount,
        after: finalFindings.length,
      });
    }
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

