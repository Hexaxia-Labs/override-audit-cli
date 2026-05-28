import { spawn } from "node:child_process";
import { createSpinner } from "../output/spinner.js";
import { chalk } from "./chalk.js";
import type { ParsedOptions } from "../types.js";
import type { SeverityLabel } from "../types.js";
import { pluralize } from "./string.js";
import type { SuggestedFixCommandPlan, SuggestedFixTarget } from "../remediation/fix-commands.js";

export function buildFixCommandParts(
  packageManager: SuggestedFixCommandPlan["packageManager"],
  targets: SuggestedFixTarget[],
): string[] {
  if (packageManager === "npm") {
    return ["npm", "install", ...targets.map(target => `${target.package}@${target.targetVersion}`)];
  }
  if (packageManager === "pnpm") {
    return ["pnpm", "add", ...targets.map(target => `${target.package}@${target.targetVersion}`)];
  }
  if (packageManager === "bun") {
    return ["bun", "add", ...targets.map(target => `${target.package}@${target.targetVersion}`)];
  }
  return ["yarn", "add", ...targets.map(target => `${target.package}@${target.targetVersion}`)];
}

export async function runInstallCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ status: number | null; error: Error | null }> {
  return await new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});

    child.on("error", error => {
      resolve({ status: null, error });
    });
    child.on("close", code => {
      resolve({ status: code, error: null });
    });
  });
}

export function commandLabelForPackageManager(packageManager: SuggestedFixCommandPlan["packageManager"]): string {
  if (packageManager === "npm") return "npm install";
  if (packageManager === "pnpm") return "pnpm add";
  if (packageManager === "bun") return "bun add";
  return "yarn add";
}

export type FixExecutionResult = {
  appliedFixCount: number;
  skippedCount: number;
  skippedTransitiveCount: number;
  skippedNoValidatedTargetCount: number;
  applied: Array<{ package: string; from: string; to: string }>;
  note: string | null;
};

export async function applyFixesIfRequested(params: {
  plan: SuggestedFixCommandPlan | null;
  projectPath: string;
  totalFindings: number;
  options: ParsedOptions;
}): Promise<FixExecutionResult> {
  console.log("");
  console.log(chalk.bold.cyan("Applying fixes (--fix)"));

  if (!params.plan) {
    return {
      appliedFixCount: 0,
      skippedCount: params.totalFindings,
      skippedTransitiveCount: 0,
      skippedNoValidatedTargetCount: params.totalFindings,
      applied: [],
      note: "No package-manager-native fix command is available for this project.",
    };
  }

  const directTargets = params.plan.targets.filter(target => target.kind === "direct");
  const transitiveTargets = params.plan.targets.filter(target => target.kind !== "direct");
  const skippedDirect = params.plan.skipped.filter(skip => skip.relationship === "direct" || skip.relationship === "unknown");

  if (directTargets.length === 0) {
    const skippedCount = transitiveTargets.length + skippedDirect.length;
    return {
      appliedFixCount: 0,
      skippedCount,
      skippedTransitiveCount: transitiveTargets.length,
      skippedNoValidatedTargetCount: skippedDirect.length,
      applied: [],
      note: "No validated direct dependency fixes were eligible for auto-apply.",
    };
  }

  const commandLabel = commandLabelForPackageManager(params.plan.packageManager);
  const total = directTargets.length;
  const spinner = createSpinner(
    `Applying direct package fixes with ${commandLabel}... 0/${total}`,
    params.options,
  );
  const fixHint = `\nHint: Check that \`${params.plan.packageManager}\` is available and you have write access to node_modules.\nIf running in CI, ensure the install step has already run before cve-lite --fix.`;
  for (let i = 0; i < directTargets.length; i++) {
    const target = directTargets[i];
    const commandParts = buildFixCommandParts(params.plan.packageManager, [target]);
    spinner.update(`Applying direct fix ${i + 1}/${total}: ${commandParts.join(" ")}`);
    const run = await runInstallCommand(commandParts[0], commandParts.slice(1), params.projectPath);
    if (run.error) {
      spinner.fail("Failed to apply fixes");
      throw new Error(`Failed to apply fixes: ${run.error.message}${fixHint}`);
    }
    if ((run.status ?? 1) !== 0) {
      spinner.fail(`Fix command failed (${commandLabel})`);
      throw new Error(`Fix command exited with status ${run.status ?? 1}${fixHint}`);
    }
  }
  spinner.succeed(`Applied ${directTargets.length} direct package ${pluralize(directTargets.length, "fix", "fixes")} with ${commandLabel}`);

  const skippedCount = transitiveTargets.length + skippedDirect.length;
  return {
    appliedFixCount: directTargets.length,
    skippedCount,
    skippedTransitiveCount: transitiveTargets.length,
    skippedNoValidatedTargetCount: skippedDirect.length,
    applied: directTargets.map(target => ({
      package: target.package,
      from: target.currentVersion ?? "unknown",
      to: target.targetVersion,
    })),
    note: null,
  };
}

export function printFixModeSummary(params: {
  fixResult: FixExecutionResult | null;
  findingsBeforeFix: number;
  findingsAfterFix: number;
  remainingBySeverity: Record<SeverityLabel, number>;
}): void {
  const result = params.fixResult;
  if (!result) return;

  if (result.note) {
    console.log(chalk.gray(result.note));
  }
  if (result.applied.length > 0) {
    console.log("");
    console.log(chalk.bold.cyan("Applied fixes"));
    for (const item of result.applied) {
      console.log(
        `- ${chalk.white(item.package)}: ${chalk.gray(item.from)} ${chalk.cyan("->")} ${chalk.green(item.to)}`,
      );
    }
  }

  console.log("");
  console.log(chalk.bold.cyan("Fix summary"));
  console.log(`- Applied fixes: ${chalk.green(String(result.appliedFixCount))}`);
  console.log(`- Skipped findings: ${chalk.yellow(String(result.skippedCount))}`);
  if (result.skippedCount > 0) {
    console.log(`  - Transitive (v1 skip): ${chalk.yellow(String(result.skippedTransitiveCount))}`);
    console.log(`  - No validated direct target: ${chalk.yellow(String(result.skippedNoValidatedTargetCount))}`);
  }
  console.log(`- Findings before fix: ${chalk.white(String(params.findingsBeforeFix))}`);
  console.log(`- Remaining findings after fix: ${chalk.white(String(params.findingsAfterFix))}`);
  console.log(
    `- Remaining severity mix: critical ${chalk.redBright(String(params.remainingBySeverity.critical))}, high ${chalk.red(String(params.remainingBySeverity.high))}, medium ${chalk.yellow(String(params.remainingBySeverity.medium))}, low ${chalk.blueBright(String(params.remainingBySeverity.low))}, unknown ${chalk.magenta(String(params.remainingBySeverity.unknown))}`,
  );
}
