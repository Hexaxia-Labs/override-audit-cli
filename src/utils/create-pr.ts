import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Finding } from "../types.js";
import { severityOrder } from "../constants.js";
import { normalizeSeverity } from "../osv/severity.js";
import { pluralize } from "./string.js";
import type { FixExecutionResult } from "./fix-runner.js";

export type CreatePullRequestParams = {
  projectPath: string;
  baseBranch: string;
  fixResult: FixExecutionResult;
  findingsBeforeFix: Finding[];
  findingsAfterFix: Finding[];
  /** Number of override hygiene fixes applied to package.json before the PR. */
  overrideFixCount?: number;
};

export type CreatePullRequestResult = {
  branchName: string;
  prUrl: string | null;
  skipped: boolean;
  skipReason?: string;
};

type CommandResult = {
  stdout: string;
  stderr: string;
  status: number | null;
  error: Error | null;
};

const DEPENDENCY_FILES_TO_STAGE = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "npm-shrinkwrap.json",
] as const;

export function findingsMeetFailOnThreshold(findings: Finding[], failOn: string): boolean {
  const failLevel = normalizeSeverity(failOn);
  return findings.some(finding => severityOrder[finding.severity] >= severityOrder[failLevel]);
}

export function defaultFixBranchName(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `cve-lite/fix-${year}-${month}-${day}`;
}

export function buildPullRequestTitle(
  appliedCount: number,
  packageNames: string[],
  overrideFixCount = 0,
): string {
  if (appliedCount === 0 && overrideFixCount > 0) {
    return `[CVE-Lite-CLI] chore: ${overrideFixCount} override hygiene ${pluralize(overrideFixCount, "fix", "fixes")}`;
  }
  const pkgList =
    packageNames.length <= 3
      ? packageNames.join(", ")
      : `${packageNames.slice(0, 2).join(", ")} +${packageNames.length - 2} more`;
  const base = `[CVE-Lite-CLI] fix: upgrade ${pkgList} (${appliedCount} ${pluralize(appliedCount, "vulnerability", "vulnerabilities")} resolved)`;
  return overrideFixCount > 0
    ? `${base} + ${overrideFixCount} override hygiene ${pluralize(overrideFixCount, "fix", "fixes")}`
    : base;
}

export function collectAdvisoryIdsForPackage(findings: Finding[], packageName: string): string[] {
  const ids = new Set<string>();
  for (const finding of findings) {
    if (finding.pkg.name !== packageName) continue;
    for (const vuln of finding.vulnerabilities) {
      ids.add(vuln.id);
      for (const alias of vuln.aliases ?? []) {
        if (alias.startsWith("CVE-")) {
          ids.add(alias);
        }
      }
    }
  }
  return [...ids].sort();
}

export function buildPullRequestBody(params: {
  fixResult: FixExecutionResult;
  findingsBeforeFix: Finding[];
  findingsAfterFix: Finding[];
  overrideFixCount?: number;
}): string {
  const overrideFixCount = params.overrideFixCount ?? 0;
  const lines: string[] = [
    "## Summary",
    "",
    "Automated security fixes applied by [CVE Lite CLI](https://github.com/OWASP/cve-lite-cli) using OSV-validated target versions.",
    "",
    "## Fixed packages",
    "",
  ];

  if (params.fixResult.applied.length === 0) {
    lines.push("- _No direct CVE fixes in this PR._");
  }
  for (const item of params.fixResult.applied) {
    const advisoryIds = collectAdvisoryIdsForPackage(params.findingsBeforeFix, item.package);
    const advisoryText = advisoryIds.length > 0 ? advisoryIds.join(", ") : "n/a";
    lines.push(`- **${item.package}**: \`${item.from}\` → \`${item.to}\``);
    lines.push(`  - Advisories: ${advisoryText}`);
  }

  if (overrideFixCount > 0) {
    lines.push(
      "",
      "## Override hygiene",
      "",
      `- Applied **${overrideFixCount}** override hygiene ${pluralize(overrideFixCount, "fix", "fixes")} to \`package.json\` (e.g. removing orphaned or ineffective overrides). Each change is constrained to existing overrides; no new override key is ever introduced.`,
    );
  }

  lines.push(
    "",
    "## Scan results",
    "",
    `- Findings before fix: **${params.findingsBeforeFix.length}**`,
    `- Findings after fix: **${params.findingsAfterFix.length}**`,
    "",
    "## Notes",
    "",
    "- Only validated **direct** dependency upgrades are included in this PR.",
    "- Transitive vulnerabilities may still require parent package upgrades or upstream releases.",
  );

  return lines.join("\n");
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return await new Promise(resolve => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr += String(chunk);
    });

    child.on("error", error => {
      resolve({ stdout, stderr, status: null, error });
    });
    child.on("close", code => {
      resolve({ stdout, stderr, status: code, error: null });
    });
  });
}

async function assertGitRepository(projectPath: string): Promise<void> {
  const result = await runCommand("git", ["rev-parse", "--is-inside-work-tree"], projectPath);
  if (result.error || result.status !== 0 || result.stdout.trim() !== "true") {
    throw new Error("--create-pr requires a git repository. Run this command from your project root.");
  }
}

async function assertGhAvailable(): Promise<void> {
  const version = await runCommand("gh", ["--version"], process.cwd());
  if (version.error || version.status !== 0) {
    throw new Error(
      "--create-pr requires the GitHub CLI (gh). Install it from https://cli.github.com/ or set GITHUB_TOKEN and ensure gh is on PATH.",
    );
  }

  const auth = await runCommand("gh", ["auth", "status"], process.cwd());
  if (auth.status !== 0 && !process.env.GITHUB_TOKEN) {
    throw new Error(
      "--create-pr requires GitHub authentication. Run `gh auth login` or set the GITHUB_TOKEN environment variable.",
    );
  }
}

async function hasAnyChanges(projectPath: string): Promise<boolean> {
  const status = await runCommand("git", ["status", "--porcelain"], projectPath);
  if (status.error || status.status !== 0) {
    throw new Error(`Failed to inspect git status: ${status.stderr.trim() || status.error?.message || "unknown error"}`);
  }
  return status.stdout.trim().length > 0;
}

export async function stageDependencyFilesOnly(projectPath: string): Promise<void> {
  for (const filePath of DEPENDENCY_FILES_TO_STAGE) {
    if (!fs.existsSync(path.join(projectPath, filePath))) {
      continue;
    }
    const add = await runCommand("git", ["add", "--", filePath], projectPath);
    if (add.error || add.status !== 0) {
      throw new Error(`Failed to stage dependency file ${filePath}: ${add.stderr.trim() || add.error?.message || "unknown error"}`);
    }
  }
}

export async function hasStagedDependencyChanges(projectPath: string): Promise<boolean> {
  const diff = await runCommand("git", ["diff", "--cached", "--name-only"], projectPath);
  if (diff.error || diff.status !== 0) {
    throw new Error(`Failed to inspect staged changes: ${diff.stderr.trim() || diff.error?.message || "unknown error"}`);
  }
  const stagedFiles = diff.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return stagedFiles.some(filePath =>
    DEPENDENCY_FILES_TO_STAGE.some(target => filePath === target || filePath.endsWith(`/${target}`)),
  );
}

async function branchExists(projectPath: string, branchName: string): Promise<boolean> {
  const result = await runCommand("git", ["rev-parse", "--verify", branchName], projectPath);
  return result.status === 0;
}

export async function selectAvailableBranchName(projectPath: string, baseName: string): Promise<string> {
  if (!(await branchExists(projectPath, baseName))) {
    return baseName;
  }
  for (let suffix = 2; suffix <= 99; suffix++) {
    const candidate = `${baseName}-${suffix}`;
    if (!(await branchExists(projectPath, candidate))) {
      return candidate;
    }
  }
  throw new Error(`Failed to allocate a unique branch name based on ${baseName}`);
}

function extractPullRequestUrl(output: string): string | null {
  const match = output.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  return match?.[0] ?? null;
}

export async function createPullRequestForFixes(
  params: CreatePullRequestParams,
): Promise<CreatePullRequestResult> {
  const baseBranchName = defaultFixBranchName();
  const overrideFixCount = params.overrideFixCount ?? 0;

  if (params.fixResult.appliedFixCount === 0 && overrideFixCount === 0) {
    return {
      branchName: baseBranchName,
      prUrl: null,
      skipped: true,
      skipReason: "No direct dependency fixes were applied, so no pull request was created.",
    };
  }

  await assertGitRepository(params.projectPath);
  await assertGhAvailable();

  if (!(await hasAnyChanges(params.projectPath))) {
    return {
      branchName: baseBranchName,
      prUrl: null,
      skipped: true,
      skipReason: "No lockfile or manifest changes were detected after applying fixes.",
    };
  }

  const packageNames = params.fixResult.applied.map(a => a.package);
  const title = buildPullRequestTitle(params.fixResult.appliedFixCount, packageNames, overrideFixCount);
  const body = buildPullRequestBody({
    fixResult: params.fixResult,
    findingsBeforeFix: params.findingsBeforeFix,
    findingsAfterFix: params.findingsAfterFix,
    overrideFixCount,
  });

  await stageDependencyFilesOnly(params.projectPath);
  if (!(await hasStagedDependencyChanges(params.projectPath))) {
    return {
      branchName: baseBranchName,
      prUrl: null,
      skipped: true,
      skipReason: "No dependency manifest or lockfile changes were detected after applying fixes.",
    };
  }

  const branchName = await selectAvailableBranchName(params.projectPath, baseBranchName);
  const checkout = await runCommand("git", ["checkout", "-b", branchName], params.projectPath);
  if (checkout.error || checkout.status !== 0) {
    const message = checkout.stderr.trim() || checkout.error?.message || "unknown error";
    throw new Error(`Failed to create branch ${branchName}: ${message}`);
  }

  const commit = await runCommand("git", ["commit", "-m", title], params.projectPath);
  if (commit.error || commit.status !== 0) {
    throw new Error(`Failed to commit dependency changes: ${commit.stderr.trim() || commit.error?.message || "unknown error"}`);
  }

  const push = await runCommand("git", ["push", "-u", "origin", branchName], params.projectPath);
  if (push.error || push.status !== 0) {
    throw new Error(`Failed to push branch ${branchName}: ${push.stderr.trim() || push.error?.message || "unknown error"}`);
  }

  const create = await runCommand(
    "gh",
    ["pr", "create", "--base", params.baseBranch, "--head", branchName, "--title", title, "--body", body],
    params.projectPath,
  );
  if (create.error || create.status !== 0) {
    throw new Error(`Failed to open pull request: ${create.stderr.trim() || create.error?.message || "unknown error"}`);
  }

  const prUrl = extractPullRequestUrl(`${create.stdout}\n${create.stderr}`);
  return {
    branchName,
    prUrl,
    skipped: false,
  };
}
