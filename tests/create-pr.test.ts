import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPullRequestBody,
  buildPullRequestTitle,
  collectAdvisoryIdsForPackage,
  defaultFixBranchName,
  findingsMeetFailOnThreshold,
  selectAvailableBranchName,
  stageDependencyFilesOnly,
} from "../src/utils/create-pr.js";
import type { Finding, OsvVuln } from "../src/types.js";
import { validateOptions } from "../src/cli/validate.js";
import { parseArgs } from "../src/cli/args.js";

function createFinding(overrides?: Partial<Finding>): Finding {
  const vuln: OsvVuln = {
    id: "GHSA-abc",
    aliases: ["CVE-2026-0001"],
    summary: "Example",
  };

  return {
    pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm" },
    vulnerabilities: [vuln],
    severity: "high",
    cveAliases: ["CVE-2026-0001"],
    dependencyPaths: [["project", "lodash"]],
    relationship: "direct",
    firstFixedVersion: "4.17.21",
    ...overrides,
  };
}

describe("create-pr helpers", () => {
  it("builds a dated branch name", () => {
    expect(defaultFixBranchName(new Date("2026-05-30T12:00:00Z"))).toBe("cve-lite/fix-2026-05-30");
  });

  it("builds a pull request title for applied fixes", () => {
    expect(buildPullRequestTitle(1, ["lodash"])).toBe(
      "[CVE-Lite-CLI] fix: upgrade lodash (1 vulnerability resolved)",
    );
    expect(buildPullRequestTitle(4, ["lodash", "axios", "express", "minimist"])).toBe(
      "[CVE-Lite-CLI] fix: upgrade lodash, axios +2 more (4 vulnerabilities resolved)",
    );
  });

  it("collects OSV and CVE identifiers for a package", () => {
    const findings = [createFinding()];
    expect(collectAdvisoryIdsForPackage(findings, "lodash")).toEqual(["CVE-2026-0001", "GHSA-abc"]);
  });

  it("builds a markdown body with fixes and scan counts", () => {
    const body = buildPullRequestBody({
      fixResult: {
        appliedFixCount: 1,
        skippedCount: 0,
        skippedTransitiveCount: 0,
        skippedNoValidatedTargetCount: 0,
        applied: [{ package: "lodash", from: "4.17.20", to: "4.17.21" }],
        note: null,
      },
      findingsBeforeFix: [createFinding(), createFinding({ pkg: { name: "express", version: "4.0.0", ecosystem: "npm" } })],
      findingsAfterFix: [createFinding()],
    });

    expect(body).toContain("lodash");
    expect(body).toContain("4.17.20");
    expect(body).toContain("4.17.21");
    expect(body).toContain("CVE-2026-0001");
    expect(body).toContain("Findings before fix: **2**");
    expect(body).toContain("Findings after fix: **1**");
    expect(body).not.toContain("Closes #367");
  });

  it("checks fail-on threshold against initial findings", () => {
    expect(findingsMeetFailOnThreshold([createFinding({ severity: "high" })], "critical")).toBe(false);
    expect(findingsMeetFailOnThreshold([createFinding({ severity: "critical" })], "critical")).toBe(true);
  });

  it("adds numeric suffix when branch already exists", async () => {
    const branch = await selectAvailableBranchName(process.cwd(), "cve-lite/fix-2026-06-02");
    expect(branch).toMatch(/^cve-lite\/fix-2026-06-02(?:-\d+)?$/);
  });

  it("stages only existing dependency files without failing on missing lockfiles", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-create-pr-"));
    try {
      execSync("git init", { cwd: tmpDir, stdio: "ignore" });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: "ignore" });
      execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: "ignore" });

      fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test"}\n');
      fs.writeFileSync(path.join(tmpDir, "package-lock.json"), '{"lockfileVersion":3}\n');
      execSync("git add package.json package-lock.json", { cwd: tmpDir, stdio: "ignore" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "ignore" });

      fs.writeFileSync(path.join(tmpDir, "package.json"), '{"name":"test","version":"1.0.1"}\n');

      await expect(stageDependencyFilesOnly(tmpDir)).resolves.toBeUndefined();

      const staged = execSync("git diff --cached --name-only", { cwd: tmpDir, encoding: "utf8" });
      expect(staged.trim().split("\n")).toEqual(["package.json"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("create-pr CLI options", () => {
  it("parses --create-pr and --base", () => {
    const result = parseArgs([".", "--fix", "--create-pr", "--base", "develop"]);
    expect(result.options.fix).toBe(true);
    expect(result.options.createPr).toBe(true);
    expect(result.options.prBase).toBe("develop");
  });

  it("requires --fix for --create-pr", () => {
    expect(() => validateOptions({ failOn: "critical", batchSize: "100", searchDepth: "4", createPr: true })).toThrow(
      "--create-pr requires --fix",
    );
  });
});
