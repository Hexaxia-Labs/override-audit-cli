import type { MultiFolderScanResult } from "../scan/multi-folder-scan.js";
import type { ParsedOptions } from "../types.js";
import { chalk } from "../utils/chalk.js";
import { logInfo, logWarn } from "./formatters.js";
import {
  printCompactOutput,
  printSummary,
  printActionSummary,
  printSuggestedFixCommands,
  printSuggestedFixCommandSkips,
  printCoverage,
  printSkippedDependencies,
  printTable,
  printFinalStatus,
} from "./printers.js";
import { pluralize } from "../utils/string.js";

export function printMultiFolderResults(
  results: MultiFolderScanResult[],
  options: ParsedOptions,
): void {
  const offline = !!options.offline || !!options.offlineDb;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    console.log(`\n${chalk.bold(`📁 ${result.subfolder}/`)}`);
    console.log(chalk.gray("─".repeat(50)));

    if (result.scanInput.warnings.length > 0) {
      for (const warning of result.scanInput.warnings) {
        logWarn(warning, options);
      }
    }

    if (options.verbose) {
      printSummary(result.sorted, result.allPackages.length, result.scanInput);
      printActionSummary(result.sorted);
      printSuggestedFixCommands(result.sorted, result.scanInput, { offline, subfolder: result.subfolder });
      printSuggestedFixCommandSkips(result.sorted, result.scanInput, { offline, subfolder: result.subfolder });
      if (result.scanInput.skippedDependencies.length > 0) {
        printSkippedDependencies(result.scanInput.skippedDependencies);
      }
      if (result.sorted.length > 0) {
        if (result.tableFindings.length > 0) {
          printTable(result.tableFindings, options.all ? null : result.minSeverity);
        } else {
          logInfo(`No findings met the table threshold of ${result.minSeverity}. Re-run with --all to show everything.`, options);
        }
      }
      printCoverage([...result.scanInput.notes, ...result.coverage]);
      printFinalStatus(result.sorted);
    } else {
      printCompactOutput(result.sorted, result.scanInput, { offline, all: !!options.all, subfolder: result.subfolder });
    }

    if (i < results.length - 1) {
      console.log(chalk.gray("\n" + "─".repeat(50)));
    }
  }

  const totalFindings = results.reduce((sum, r) => sum + r.sorted.length, 0);
  const folderNames = results.map(r => `${r.subfolder}/`).join(", ");
  console.log(chalk.gray(`\nScanned ${results.length} ${pluralize(results.length, "folder")}: ${folderNames}`));
  console.log(chalk.gray(`${totalFindings} total ${pluralize(totalFindings, "finding")} across all folders`));
}
