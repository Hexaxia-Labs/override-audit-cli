import { buildSuggestedFixCommandPlan } from "../src/remediation/fix-commands.js";
import type { Finding, ScanInput } from "../src/types.js";

const minimalScanInput: ScanInput = {
  mode: "resolved-lockfile",
  source: "package-lock",
  filePath: "/fake/sessionManager/package-lock.json",
  packages: [],
  notes: [],
  warnings: [],
  skippedDependencies: [],
};

const minimalFinding: Finding = {
  pkg: { name: "axios", version: "1.7.7", ecosystem: "npm" },
  vulnerabilities: [{ id: "GHSA-test-1234-5678" }],
  severity: "high",
  cveAliases: [],
  dependencyPaths: [["axios"]],
  relationship: "direct",
  firstFixedVersion: "1.8.0",
  validatedFirstFixedVersion: "1.8.0",
};

describe("buildSuggestedFixCommandPlan with subfolder", () => {
  it("prefixes section commands with cd subfolder &&", () => {
    const plan = buildSuggestedFixCommandPlan(
      [minimalFinding],
      minimalScanInput,
      { subfolder: "sessionManager" },
    );
    expect(plan).not.toBeNull();
    for (const section of plan!.sections) {
      expect(section.command).toMatch(/^cd sessionManager && /);
    }
  });

  it("prefixes top-level command with cd subfolder &&", () => {
    const plan = buildSuggestedFixCommandPlan(
      [minimalFinding],
      minimalScanInput,
      { subfolder: "sessionManager" },
    );
    expect(plan?.command).toMatch(/^cd sessionManager && /);
  });

  it("does not prefix commands when subfolder is not set", () => {
    const plan = buildSuggestedFixCommandPlan(
      [minimalFinding],
      minimalScanInput,
    );
    expect(plan).not.toBeNull();
    for (const section of plan!.sections) {
      expect(section.command).not.toMatch(/^cd /);
    }
  });
});
