import fs from "node:fs";
import path from "node:path";
import { chalk } from "../utils/chalk.js";
import type { ParsedOptions, ScanInput, Finding, PackageRef } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import type { ProjectMeta } from "./cyclonedx.js";
import { serializeFinding } from "./formatters.js";
import { writeSarifReport, deriveLockfileUri } from "./sarif.js";
import { writeCycloneDxReport } from "./cyclonedx.js";

export type ScanState = {
  sorted: Finding[];
  allPackages: PackageRef[];
  suggestedFixCommands: SuggestedFixCommandPlan | null;
  coverage: string[];
  minSeverity: string;
  tableFindings: Finding[];
};

function readProjectMeta(projectPath: string): ProjectMeta {
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.name) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
    };
  } catch {
    return null;
  }
}

export async function writeOutputs(
  options: ParsedOptions,
  scanState: ScanState,
  scanInput: ScanInput,
  projectPath: string,
): Promise<void> {
  if (options.json) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const jsonFilename = `cve-lite-scan-${ts}.json`;
    const jsonOutputPath = path.join(process.cwd(), jsonFilename);
    fs.writeFileSync(jsonOutputPath, JSON.stringify({
      projectPath,
      mode: scanInput.mode,
      source: scanInput.source,
      packageCount: scanInput.packages.length,
      findingCount: scanState.sorted.length,
      suggestedFixCommands: scanState.suggestedFixCommands,
      notes: [...scanInput.notes, ...scanState.coverage],
      warnings: scanInput.warnings,
      skippedDependencies: scanInput.skippedDependencies,
      findings: scanState.sorted.map(finding => serializeFinding(finding, scanState.suggestedFixCommands)),
    }, null, 2));
    console.log(`${chalk.gray("JSON saved to")} ${chalk.cyan(jsonFilename)}`);
  }

  if (options.sarif) {
    const lockfileUri = deriveLockfileUri(scanInput);
    const sarifFilename = writeSarifReport(scanState.sorted, lockfileUri, scanState.suggestedFixCommands);
    console.log(`${chalk.gray("SARIF report written to")} ${chalk.cyan(sarifFilename)}`);
  }

  if (options.cdx) {
    const projectMeta = readProjectMeta(projectPath);
    const cdxFilename = writeCycloneDxReport(scanState.allPackages, scanState.sorted, scanState.suggestedFixCommands, projectMeta);
    console.log(`${chalk.gray("CycloneDX BOM written to")} ${chalk.cyan(cdxFilename)}`);
  }
}
