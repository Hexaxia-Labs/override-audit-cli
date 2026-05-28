import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import { getPrimaryParent } from "../src/utils/finding.js";
import {
  countUniqueAdvisories,
  getRecommendedAction,
  logInfo,
  logWarn,
  printCacheSummary,
  serializeFinding,
  sortFindingsForOutput,
  summarizeNextAction,
  summarizeRisk,
} from "../src/output/formatters.js";
import { buildSuggestedFixCommandPlan } from "../src/remediation/fix-commands.js";
import {
  printActionSummary,
  printCompactOutput,
  printFinalStatus,
  printSuggestedFixCommands,
  printSuggestedFixCommandSkips,
  printSummary,
  printTable,
} from "../src/output/printers.js";
import { stripAnsi } from "../src/utils/chalk.js";
import type { Finding, OsvVuln, ScanInput } from "../src/types.js";

function createFinding(overrides?: Partial<Finding>): Finding {
  const vuln: OsvVuln = {
    id: "OSV-123",
    aliases: ["CVE-2026-0001"],
    summary: "Prototype pollution",
    severity: [{ score: "9.8" }],
  };

  return {
    pkg: {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
      paths: [["project", "app", "lodash"]],
    },
    vulnerabilities: [vuln],
    severity: "critical",
    cveAliases: ["CVE-2026-0001"],
    dependencyPaths: [["project", "app", "lodash"]],
    relationship: "transitive",
    firstFixedVersion: "4.17.21",
    recommendedParentUpgrade: {
      package: "app",
      currentVersion: "1.0.0",
      targetVersion: "1.1.0",
      viaPath: ["project", "app", "lodash"],
      vulnerablePackage: "lodash",
      confidence: "exact-direct-child",
      reason: "app@1.1.0 no longer allows lodash@4.17.20",
    },
    recommendedNpmTransitiveRemediation: undefined,
    ...overrides,
  };
}

function createScanInput(mode: ScanInput["mode"] = "resolved-lockfile"): ScanInput {
  return {
    mode,
    source: mode === "manifest-fallback" ? "package-json" : "package-lock",
    filePath: "/tmp/package-lock.json",
    packages: [],
    notes: [],
    warnings: [],
    skippedDependencies: [],
  };
}

function createScanInputForSource(source: ScanInput["source"]): ScanInput {
  return {
    mode: "resolved-lockfile",
    source,
    filePath:
      source === "package-lock"
        ? "/tmp/package-lock.json"
        : source === "pnpm-lock"
          ? "/tmp/pnpm-lock.yaml"
          : source === "yarn-lock"
            ? "/tmp/yarn.lock"
            : null,
    packages: [],
    notes: [],
    warnings: [],
    skippedDependencies: [],
  };
}

function captureLogs(run: () => void): string[] {
  const logs: string[] = [];
  const spy = jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(arg => String(arg)).join(" "));
  });

  try {
    run();
  } finally {
    spy.mockRestore();
  }

  return logs.map(line => stripAnsi(line));
}

describe("output formatters", () => {
  it("getPrimaryParent returns null for paths shorter than 3 nodes", () => {
    const shortPath = createFinding({
      dependencyPaths: [["project", "lodash"]],
    });
    expect(getPrimaryParent(shortPath)).toBeNull();
  });

  it("getPrimaryParent returns null for empty paths", () => {
    const noPath = createFinding({ dependencyPaths: [] });
    expect(getPrimaryParent(noPath)).toBeNull();
  });

  it("derives the primary parent and recommendation text from findings", () => {
    const finding = createFinding();

    expect(getPrimaryParent(finding)).toBe("app");
    expect(getRecommendedAction(finding)).toContain("Upgrade app from 1.0.0 to 1.1.0");
    expect(summarizeRisk(finding)).toContain("specific parent upgrade target");
    expect(summarizeNextAction(finding)).toBe("Upgrade app 1.0.0 -> 1.1.0.");
  });

  it("serializes findings with inferred vulnerability severity", () => {
    const finding = createFinding();
    const serialized = serializeFinding(finding);

    expect(serialized).toMatchObject({
      package: "lodash",
      version: "4.17.20",
      severity: "critical",
      relationship: "transitive",
      firstFixedVersion: "4.17.21",
      primaryParent: "app",
      cves: ["CVE-2026-0001"],
    });
    expect(serialized.vulnerabilities[0]).toMatchObject({
      id: "OSV-123",
      severity: "critical",
    });
  });

  it("sorts findings by severity and then package name", () => {
    const findings = [
      createFinding({ pkg: { name: "zlib", version: "1.0.0", ecosystem: "npm" }, severity: "medium" }),
      createFinding({ pkg: { name: "axios", version: "1.0.0", ecosystem: "npm" }, severity: "medium" }),
      createFinding({ pkg: { name: "chalk", version: "1.0.0", ecosystem: "npm" }, severity: "high" }),
    ];

    const sorted = sortFindingsForOutput(findings);
    expect(sorted.map(item => `${item.severity}:${item.pkg.name}`)).toEqual([
      "high:chalk",
      "medium:axios",
      "medium:zlib",
    ]);
  });

  it("prints cache and info/warn lines when output is not json", () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-output-cache-"));
    fs.writeFileSync(
      path.join(cacheDir, "osv-vulns.json"),
      JSON.stringify({
        version: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        entries: { "OSV-123": { id: "OSV-123" }, "OSV-404": null },
        queryEntries: { "npm:lodash@4.17.20": ["OSV-123"] },
      }),
      "utf8",
    );

    try {
      const lines = captureLogs(() => {
        printCacheSummary(cacheDir);
        logInfo("hello");
        logWarn("careful");
      });

      expect(lines[0]).toContain("Cache: 1 package match record, 1 advisory detail record, 1 empty lookup");
      expect(lines[1]).toBe("hello");
      expect(lines[2]).toBe("careful");
    } finally {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("builds a package-manager-aware fix command plan for urgent findings", () => {
    const findings = [
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm", paths: [["project", "minimist"]] },
        relationship: "direct",
        dependencyPaths: [["project", "minimist"]],
        severity: "critical",
        firstFixedVersion: "1.2.8",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm", paths: [["project", "app", "lodash"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "app", "lodash"]],
        severity: "high",
        recommendedParentUpgrade: {
          package: "app",
          currentVersion: "1.0.0",
          targetVersion: "1.1.0",
          viaPath: ["project", "app", "lodash"],
          vulnerablePackage: "lodash",
          confidence: "exact-direct-child",
          reason: "app@1.1.0 no longer allows lodash@4.17.20",
        },
      }),
      createFinding({
        pkg: { name: "marsdb", version: "0.6.11", ecosystem: "npm", paths: [["project", "marsdb"]] },
        relationship: "direct",
        dependencyPaths: [["project", "marsdb"]],
        severity: "critical",
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const npmPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));
    const pnpmPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("pnpm-lock"));
    const yarnPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("yarn-lock"));
    const bunPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("bun-lock"));

    expect(npmPlan?.command).toBe("npm install minimist@1.2.8 app@1.1.0");
    expect(pnpmPlan?.command).toBe("pnpm add minimist@1.2.8 app@1.1.0");
    expect(yarnPlan?.command).toBe("yarn add minimist@1.2.8 app@1.1.0");
    expect(bunPlan?.command).toBe("bun add minimist@1.2.8 app@1.1.0");
    expect(npmPlan?.sections).toEqual([
      expect.objectContaining({
        key: "urgent:critical",
        severity: "critical",
        command: "npm install minimist@1.2.8",
      }),
      expect.objectContaining({
        key: "urgent:high",
        severity: "high",
        command: "npm install app@1.1.0",
      }),
    ]);
    expect(npmPlan?.skipped).toEqual([
      expect.objectContaining({
        package: "marsdb",
        reason: "No safe upgrade target is known for this urgent direct dependency.",
      }),
    ]);
  });

  it("includes additional direct and parent upgrade commands beyond urgent findings", () => {
    const findings = [
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm", paths: [["project", "minimist"]] },
        relationship: "direct",
        dependencyPaths: [["project", "minimist"]],
        severity: "high",
        firstFixedVersion: "1.2.8",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "tar", version: "6.2.1", ecosystem: "npm", paths: [["project", "tar"]] },
        relationship: "direct",
        dependencyPaths: [["project", "tar"]],
        severity: "medium",
        firstFixedVersion: "7.5.3",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "diff", version: "2.2.3", ecosystem: "npm", paths: [["project", "gulp-diff", "diff"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "gulp-diff", "diff"]],
        severity: "medium",
        firstFixedVersion: "3.5.0",
        recommendedParentUpgrade: {
          package: "gulp-diff",
          currentVersion: "5.2.1",
          targetVersion: "6.0.0",
          viaPath: ["project", "gulp-diff", "diff"],
          vulnerablePackage: "diff",
          confidence: "exact-direct-child",
          reason: "gulp-diff@6.0.0 no longer pulls vulnerable diff",
        },
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([
      expect.objectContaining({
        key: "urgent:high",
        title: "High severity fix commands",
        command: "npm install minimist@1.2.8",
      }),
      expect.objectContaining({
        key: "direct:medium",
        title: "Medium severity direct fixes",
        command: "npm install tar@7.5.3",
      }),
      expect.objectContaining({
        key: "parent-upgrade:medium",
        title: "Medium severity parent upgrades",
        command: "npm install gulp-diff@6.0.0",
      }),
    ]);
  });

  it("builds an npm update command for transitive findings resolvable within the current parent range", () => {
    const findings = [
      createFinding({
        pkg: { name: "diff", version: "5.0.0", ecosystem: "npm", paths: [["project", "mocha", "diff"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "mocha", "diff"]],
        severity: "high",
        firstFixedVersion: "5.0.1",
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: {
          kind: "update-parent-within-range",
          package: "mocha",
          currentVersion: "10.0.0",
          targetChildVersion: "5.1.0",
          viaPath: ["project", "mocha", "diff"],
          reason: "mocha@10.0.0 already allows diff@5.1.0 within the current dependency range",
        },
      }),
    ];

    const npmPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));
    const pnpmPlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("pnpm-lock"));

    expect(npmPlan?.command).toBe("npm update mocha");
    expect(npmPlan?.sections).toEqual([
      expect.objectContaining({
        key: "parent-update:high",
        command: "npm update mocha",
        targets: [
          expect.objectContaining({
            package: "mocha",
            currentVersion: "10.0.0",
            targetVersion: "5.1.0",
            kind: "parent-update",
            displayTargetVersion: "lockfile refresh",
          }),
        ],
      }),
    ]);
    expect(pnpmPlan?.command).toBe("pnpm update --recursive --no-save diff");
    expect(pnpmPlan?.sections).toEqual([
      expect.objectContaining({
        key: "parent-update:high",
        command: "pnpm update --recursive --no-save diff",
        targets: [
          expect.objectContaining({
            package: "diff",
            currentVersion: "5.0.0",
            targetVersion: "5.1.0",
            kind: "parent-update",
            displayTargetVersion: "lockfile refresh",
          }),
        ],
      }),
    ]);
    expect(pnpmPlan?.skipped).toEqual([]);
  });

  it("skips fixed-version hints that are not real upgrades", () => {
    const findings = [
      createFinding({
        pkg: { name: "diff", version: "4.0.2", ecosystem: "npm", paths: [["project", "diff"]] },
        relationship: "direct",
        dependencyPaths: [["project", "diff"]],
        severity: "medium",
        firstFixedVersion: "3.5.1",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([]);
    expect(plan?.skipped).toEqual([
      expect.objectContaining({
        package: "diff",
        reason: "Fixed-version hint 3.5.1 is not an upgrade from installed 4.0.2.",
      }),
    ]);
  });

  it("keeps exact published fixed versions in the normal direct section", () => {
    const findings = [
      createFinding({
        pkg: { name: "tar", version: "7.5.4", ecosystem: "npm", paths: [["project", "tar"]] },
        relationship: "direct",
        dependencyPaths: [["project", "tar"]],
        severity: "medium",
        firstFixedVersion: "7.5.7",
        validatedFirstFixedVersion: "7.5.7",
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([
      expect.objectContaining({
        key: "direct:medium",
        title: "Medium severity direct fixes",
        command: "npm install tar@7.5.7",
      }),
    ]);
    expect(plan?.sections.find(section => section.kind === "direct-adjusted")).toBeUndefined();
  });

  it("moves nearest-published fallbacks into the registry-adjusted section with notes", () => {
    const findings = [
      createFinding({
        pkg: { name: "lodash.template", version: "3.6.2", ecosystem: "npm", paths: [["project", "lodash.template"]] },
        relationship: "direct",
        dependencyPaths: [["project", "lodash.template"]],
        severity: "low",
        firstFixedVersion: "4.17.21",
        validatedFirstFixedVersion: "4.18.0",
        fixVersionValidationNote:
          "Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([
      expect.objectContaining({
        key: "direct-adjusted:low",
        title: "Low severity direct fixes (registry-adjusted)",
        command: "npm install lodash.template@4.18.0",
        targets: [
          expect.objectContaining({
            package: "lodash.template",
            targetVersion: "4.18.0",
            adjusted: true,
            adjustmentNote:
              "Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.",
          }),
        ],
      }),
    ]);
  });

  it("keeps normal direct fixes separate from registry-adjusted fixes", () => {
    const findings = [
      createFinding({
        pkg: { name: "serialize-javascript", version: "7.0.3", ecosystem: "npm", paths: [["project", "serialize-javascript"]] },
        relationship: "direct",
        dependencyPaths: [["project", "serialize-javascript"]],
        severity: "low",
        firstFixedVersion: "7.0.5",
        validatedFirstFixedVersion: "7.0.5",
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "lodash.template", version: "3.6.2", ecosystem: "npm", paths: [["project", "lodash.template"]] },
        relationship: "direct",
        dependencyPaths: [["project", "lodash.template"]],
        severity: "low",
        firstFixedVersion: "4.17.21",
        validatedFirstFixedVersion: "4.18.0",
        fixVersionValidationNote:
          "Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([
      expect.objectContaining({
        key: "direct:low",
        command: "npm install serialize-javascript@7.0.5",
        targets: [
          expect.objectContaining({
            package: "serialize-javascript",
            adjusted: false,
          }),
        ],
      }),
      expect.objectContaining({
        key: "direct-adjusted:low",
        command: "npm install lodash.template@4.18.0",
        targets: [
          expect.objectContaining({
            package: "lodash.template",
            adjusted: true,
          }),
        ],
      }),
    ]);
  });

  it("falls back to firstFixedVersion for direct upgrades in offline mode", () => {
    // In offline mode validateDirectFixTargets does not run, so
    // validatedFirstFixedVersion stays null. The plan must still emit a fix
    // command using the advisory hint instead of dropping the target.
    const findings = [
      createFinding({
        pkg: { name: "@angular/compiler", version: "19.2.19", ecosystem: "npm", paths: [["project", "@angular/compiler"]] },
        relationship: "direct",
        dependencyPaths: [["project", "@angular/compiler"]],
        severity: "high",
        firstFixedVersion: "19.2.20",
        validatedFirstFixedVersion: null,
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const offlinePlan = buildSuggestedFixCommandPlan(
      findings,
      createScanInputForSource("package-lock"),
      { offline: true },
    );

    expect(offlinePlan?.command).toBe("npm install @angular/compiler@19.2.20");
    expect(offlinePlan?.sections).toEqual([
      expect.objectContaining({
        key: "urgent:high",
        command: "npm install @angular/compiler@19.2.20",
        targets: [
          expect.objectContaining({
            package: "@angular/compiler",
            currentVersion: "19.2.19",
            targetVersion: "19.2.20",
            kind: "direct",
          }),
        ],
      }),
    ]);
    expect(offlinePlan?.skipped).toEqual([]);
  });

  it("still skips direct findings in online mode when validation cleared validatedFirstFixedVersion", () => {
    // Online mode treats a null validatedFirstFixedVersion as a confirmed
    // validation failure (no safe target was found on npm), so the finding
    // must be skipped — not pushed back into the plan with the advisory hint.
    const findings = [
      createFinding({
        pkg: { name: "@angular/compiler", version: "19.2.19", ecosystem: "npm", paths: [["project", "@angular/compiler"]] },
        relationship: "direct",
        dependencyPaths: [["project", "@angular/compiler"]],
        severity: "high",
        firstFixedVersion: "19.2.20",
        validatedFirstFixedVersion: null,
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const onlinePlan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(onlinePlan?.sections).toEqual([]);
    expect(onlinePlan?.skipped).toEqual([
      expect.objectContaining({
        package: "@angular/compiler",
        version: "19.2.19",
      }),
    ]);
  });

  it("getRecommendedAction Tier 2: names the parent and is honest about no known safe version", () => {
    const finding = createFinding({
      relationship: "transitive",
      dependencyPaths: [["project", "app", "lodash"]],
      recommendedParentUpgrade: undefined,
      firstFixedVersion: "4.17.21",
    });
    const action = getRecommendedAction(finding);
    expect(action).toContain("Upgrade app");
    expect(action).toContain("no safe version was identified automatically");
    expect(action).toContain("4.17.21");
  });

  it("getRecommendedAction Tier 3: honest message when no parent can be identified", () => {
    const finding = createFinding({
      relationship: "transitive",
      dependencyPaths: [],
      recommendedParentUpgrade: undefined,
      firstFixedVersion: "4.17.21",
    });
    const action = getRecommendedAction(finding);
    expect(action).toContain("No parent dependency was identified for lodash");
    expect(action).toContain("npm ls lodash");
    expect(action).toContain("4.17.21");
    expect(action).not.toContain("Upgrade the parent dependency chain");
  });

  it("summarizeNextAction Tier 2: names the parent when path is available", () => {
    const finding = createFinding({
      relationship: "transitive",
      dependencyPaths: [["project", "app", "lodash"]],
      recommendedParentUpgrade: undefined,
      firstFixedVersion: "4.17.21",
    });
    const summary = summarizeNextAction(finding);
    expect(summary).toContain("Upgrade app");
    expect(summary).toContain("no safe version identified");
    expect(summary).toContain("4.17.21");
  });

  it("summarizeNextAction Tier 3: honest message when no parent can be identified", () => {
    const finding = createFinding({
      relationship: "transitive",
      dependencyPaths: [],
      recommendedParentUpgrade: undefined,
      firstFixedVersion: "4.17.21",
    });
    const summary = summarizeNextAction(finding);
    expect(summary).toContain("No parent identified in the lockfile");
    expect(summary).toContain("npm ls lodash");
    expect(summary).toContain("4.17.21");
    expect(summary).not.toContain("Upgrade the parent dependency chain");
  });

  it("getRecommendedAction prefers the registry-validated target over the raw advisory hint for direct findings (#302)", () => {
    // Online scans validate the advisory hint against the npm registry and may
    // pick a higher version than the hint when intermediate versions are still
    // vulnerable. The recommendation prose must agree with the fix-command
    // table — both should reference the validated target.
    const finding = createFinding({
      pkg: { name: "axios", version: "0.21.1", ecosystem: "npm", paths: [["project", "axios"]] },
      relationship: "direct",
      dependencyPaths: [["project", "axios"]],
      firstFixedVersion: "0.21.2",
      validatedFirstFixedVersion: "0.31.0",
    });
    const action = getRecommendedAction(finding);
    expect(action).toContain("0.31.0");
    expect(action).not.toContain("0.21.2");
  });

  it("summarizeNextAction prefers the registry-validated target over the raw advisory hint for direct findings (#302)", () => {
    const finding = createFinding({
      pkg: { name: "axios", version: "0.21.1", ecosystem: "npm", paths: [["project", "axios"]] },
      relationship: "direct",
      dependencyPaths: [["project", "axios"]],
      firstFixedVersion: "0.21.2",
      validatedFirstFixedVersion: "0.31.0",
    });
    const summary = summarizeNextAction(finding);
    expect(summary).toContain("0.31.0");
    expect(summary).not.toContain("0.21.2");
  });

  it("getRecommendedAction does not claim the path is missing when only a degenerate (length 2) lockfile path is available (#301)", () => {
    // For npm v7+ hoisted layouts, a transitive package can end up at
    // top-level node_modules with a path of [project, vulnerable]. The
    // primary parent isn't identifiable from that path, but the path itself
    // exists. The previous "No dependency path found" wording contradicted
    // the dependency-path section that displayed the same path.
    const finding = createFinding({
      pkg: { name: "micromatch", version: "4.0.5", ecosystem: "npm", paths: [["project", "micromatch"]] },
      relationship: "transitive",
      dependencyPaths: [["project", "micromatch"]],
      recommendedParentUpgrade: undefined,
      firstFixedVersion: "4.0.8",
    });
    const action = getRecommendedAction(finding);
    expect(action).not.toContain("No dependency path found");
    expect(action).toContain("npm ls micromatch");
    expect(action).toContain("4.0.8");
  });

  it("skips Tier 2 transitive finding with parent-aware reason", () => {
    const findings = [
      createFinding({
        pkg: { name: "picomatch", version: "2.2.1", ecosystem: "npm", paths: [["project", "lint-staged", "picomatch"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "lint-staged", "picomatch"]],
        severity: "high",
        firstFixedVersion: "2.3.1",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.skipped).toEqual([
      expect.objectContaining({
        package: "picomatch",
        reason: expect.stringContaining("lint-staged"),
      }),
    ]);
    expect(plan?.skipped[0].reason).toContain("2.3.1");
    expect(plan?.skipped[0].reason).not.toBe("No specific parent upgrade target was found for this transitive issue.");
  });

  it("skips Tier 3 transitive finding with honest no-path reason", () => {
    const findings = [
      createFinding({
        pkg: { name: "picomatch", version: "2.2.1", ecosystem: "npm", paths: [] },
        relationship: "transitive",
        dependencyPaths: [],
        severity: "high",
        firstFixedVersion: "2.3.1",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.skipped).toEqual([
      expect.objectContaining({
        package: "picomatch",
        reason: expect.stringContaining("No dependency path available"),
      }),
    ]);
  });

  describe("malicious advisory messages", () => {
    function createMaliciousFinding(overrides?: Partial<Finding>): Finding {
      return createFinding({
        relationship: "direct",
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: undefined,
        vulnerabilities: [{
          id: "MAL-2025-21003",
          aliases: [],
          summary: "Malicious code in fs (npm)",
          severity: [],
        }],
        ...overrides,
      });
    }

    it("getRecommendedAction: direct malicious finding returns remove message", () => {
      const finding = createMaliciousFinding({ relationship: "direct" });
      expect(getRecommendedAction(finding)).toBe(
        "This package has a malicious code advisory. Remove it from your dependencies."
      );
    });

    it("getRecommendedAction: transitive malicious finding returns upgrade/remove parent message", () => {
      const finding = createMaliciousFinding({
        relationship: "transitive",
        dependencyPaths: [["project", "parent", "lodash"]],
      });
      expect(getRecommendedAction(finding)).toBe(
        "This package has a malicious code advisory. Upgrade or remove the parent package that pulls it in."
      );
    });

    it("summarizeNextAction: direct malicious finding returns remove message", () => {
      const finding = createMaliciousFinding({ relationship: "direct" });
      expect(summarizeNextAction(finding)).toBe(
        "This package has a malicious code advisory. Remove it from your dependencies."
      );
    });

    it("summarizeNextAction: transitive malicious finding returns upgrade/remove parent message", () => {
      const finding = createMaliciousFinding({
        relationship: "transitive",
        dependencyPaths: [["project", "parent", "lodash"]],
      });
      expect(summarizeNextAction(finding)).toBe(
        "This package has a malicious code advisory. Upgrade or remove the parent package that pulls it in."
      );
    });

    it("non-MAL advisory is not treated as malicious", () => {
      const finding = createFinding({
        relationship: "direct",
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: undefined,
        vulnerabilities: [{
          id: "GHSA-abc1-2345-6789",
          aliases: [],
          summary: "Some vulnerability",
          severity: [],
        }],
      });
      expect(getRecommendedAction(finding)).toContain("Consider replacing");
    });
  });

  it("moves unpublishable fixed-version hints out of runnable commands", () => {
    const findings = [
      createFinding({
        pkg: { name: "request", version: "2.88.2", ecosystem: "npm", paths: [["project", "request"]] },
        relationship: "direct",
        dependencyPaths: [["project", "request"]],
        severity: "low",
        firstFixedVersion: "3.0.0",
        validatedFirstFixedVersion: null,
        fixVersionValidationNote:
          "Advisory fixed-version hint 3.0.0 is not published on npm for request, and no published version >= 3.0.0 was found.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const plan = buildSuggestedFixCommandPlan(findings, createScanInputForSource("package-lock"));

    expect(plan?.sections).toEqual([]);
    expect(plan?.skipped).toEqual([
      expect.objectContaining({
        package: "request",
        reason:
          "Advisory fixed-version hint 3.0.0 is not published on npm for request, and no published version >= 3.0.0 was found.",
      }),
    ]);
  });
});

describe("output printers", () => {
  it("prints an empty summary for clean manifest fallback scans", () => {
    const lines = captureLogs(() => {
      printSummary([], 2, createScanInput("manifest-fallback"));
    });

    expect(lines).toEqual([
      "✓ No known OSV matches found for manifest fallback packages (2 exact direct dependencies checked)",
    ]);
  });

  it("prints a finding summary and action summary for vulnerable packages", () => {
    const findings = [
      createFinding(),
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm", paths: [["project", "minimist"]] },
        relationship: "direct",
        dependencyPaths: [["project", "minimist"]],
        severity: "high",
        firstFixedVersion: "1.2.8",
        recommendedParentUpgrade: undefined,
        vulnerabilities: [{ id: "OSV-456", severity: [{ score: "7.5" }] }],
      }),
    ];

    const lines = captureLogs(() => {
      printSummary(findings, 25, createScanInput());
      printActionSummary(findings);
    });

    expect(lines[0]).toContain("✗ Found 2 packages (2 CVEs) with known OSV matches from package-lock");
    expect(lines.join("\n")).toContain("Quick take");
    expect(lines.join("\n")).toContain("1 vulnerable package look directly fixable in this project.");
    expect(lines.join("\n")).toContain("1 issue come through other dependencies.");
  });

  it("prints a table and final status for findings", () => {
    const findings = [createFinding()];

    const lines = captureLogs(() => {
      printTable(findings, "high");
      printFinalStatus(findings);
    });

    expect(lines.join("\n")).toContain("Showing high+ findings in the main table. Use --all to show everything.");
    expect(lines.join("\n")).toContain("Package");
    expect(lines.join("\n")).toContain("lodash");
    expect(lines.join("\n")).toContain("OSV-123");
    expect(lines.join("\n")).toContain("✖ Scan complete. 1 issue found (1 critical, 0 high).");
  });

  it("shows ⚠ no fix in the Fixed column when firstFixedVersion is null", () => {
    const finding = createFinding({
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
    });

    const lines = captureLogs(() => {
      printTable([finding], null);
    });

    const output = lines.join("\n");
    expect(output).toContain("⚠ no fix");
  });

  it("shows ⚠ Malicious in the Fixed column for malicious advisory findings", () => {
    const finding = createFinding({
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
      vulnerabilities: [{
        id: "MAL-2025-21003",
        aliases: [],
        summary: "Malicious code in fs (npm)",
        severity: [],
      }],
    });

    const lines = captureLogs(() => {
      printTable([finding], null);
    });

    const output = lines.join("\n");
    expect(output).toContain("⚠ Malicious");
    expect(output).not.toContain("⚠ no fix");
  });

  it("prints malicious package legend after table for MAL-* findings", () => {
    const direct = createFinding({
      pkg: { name: "fs", version: "0.0.1-security", ecosystem: "npm", paths: [["project", "fs"]] },
      relationship: "direct",
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
      vulnerabilities: [{
        id: "MAL-2025-21003",
        aliases: [],
        summary: "Malicious code in fs (npm)",
        severity: [],
      }],
    });

    const lines = captureLogs(() => {
      printTable([direct], null);
    });

    const output = lines.join("\n");
    expect(output).toContain("⚠ Malicious package advisory:");
    expect(output).toContain("fs@0.0.1-security");
    expect(output).toContain("Remove it from your dependencies immediately.");
  });

  it("prints transitive malicious package legend with parent upgrade message", () => {
    const transitive = createFinding({
      pkg: { name: "bad-pkg", version: "1.0.0", ecosystem: "npm", paths: [["project", "parent", "bad-pkg"]] },
      relationship: "transitive",
      dependencyPaths: [["project", "parent", "bad-pkg"]],
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
      vulnerabilities: [{
        id: "MAL-2024-99999",
        aliases: [],
        summary: "Malicious code in bad-pkg",
        severity: [],
      }],
    });

    const lines = captureLogs(() => {
      printTable([transitive], null);
    });

    const output = lines.join("\n");
    expect(output).toContain("⚠ Malicious package advisory:");
    expect(output).toContain("bad-pkg@1.0.0");
    expect(output).toContain("Upgrade or remove the parent package that pulls it in.");
  });

  it("does not print malicious legend when no malicious findings present", () => {
    const finding = createFinding({ firstFixedVersion: "1.2.3" });

    const lines = captureLogs(() => {
      printTable([finding], null);
    });

    const output = lines.join("\n");
    expect(output).not.toContain("⚠ Malicious package advisory:");
  });

  it("prints suggested fix commands for verbose output", () => {
    const findings = [
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm", paths: [["project", "minimist"]] },
        relationship: "direct",
        dependencyPaths: [["project", "minimist"]],
        severity: "critical",
        firstFixedVersion: "1.2.8",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "tar", version: "6.2.1", ecosystem: "npm", paths: [["project", "tar"]] },
        relationship: "direct",
        dependencyPaths: [["project", "tar"]],
        severity: "medium",
        firstFixedVersion: "7.5.3",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "marsdb", version: "0.6.11", ecosystem: "npm", paths: [["project", "marsdb"]] },
        relationship: "direct",
        dependencyPaths: [["project", "marsdb"]],
        severity: "critical",
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });

    expect(lines.join("\n")).toContain("Copy And Run These Fix Commands");
    expect(lines.join("\n")).toContain("Detected package manager: npm (package-lock.json)");
    expect(lines.join("\n")).toContain("2 command groups ready across 2 packages");
    expect(lines.join("\n")).toContain("Critical severity fix commands");
    expect(lines.join("\n")).toContain("> npm install minimist@1.2.8");
    expect(lines.join("\n")).toContain("npm install minimist@1.2.8");
    expect(lines.join("\n")).toContain("Medium severity direct fixes");
    expect(lines.join("\n")).toContain("npm install tar@7.5.3");
  });

  it("prints a parent-upgrade table before the command callout when transitive targets are actionable", () => {
    const findings = [
      createFinding({
        pkg: { name: "diff", version: "7.0.0", ecosystem: "npm", paths: [["project", "mocha", "diff"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "mocha", "diff"]],
        severity: "medium",
        firstFixedVersion: "3.5.1",
        recommendedParentUpgrade: {
          package: "mocha",
          currentVersion: "11.7.5",
          targetVersion: "12.0.0-beta-4",
          viaPath: ["project", "mocha", "diff"],
          vulnerablePackage: "diff",
          confidence: "exact-direct-child",
          reason: "mocha@12.0.0-beta-4 no longer allows diff@7.0.0",
        },
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Medium severity parent upgrades");
    expect(output).toContain("Package");
    expect(output).toContain("Current");
    expect(output).toContain("Recommended target");
    expect(output).toContain("Context");
    expect(output).toContain("mocha");
    expect(output).toContain("11.7.5");
    expect(output).toContain("12.0.0-beta-4");
    expect(output).toContain("Parent upgrade for vulnerable diff@7.0.0");
    expect(output.indexOf("Context")).toBeLessThan(output.indexOf("> npm install mocha@12.0.0-beta-4"));
  });

  it("prints npm update commands for in-range transitive remediation outcomes", () => {
    const findings = [
      createFinding({
        pkg: { name: "diff", version: "5.0.0", ecosystem: "npm", paths: [["project", "mocha", "diff"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "mocha", "diff"]],
        severity: "high",
        firstFixedVersion: "5.0.1",
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: {
          kind: "update-parent-within-range",
          package: "mocha",
          currentVersion: "10.0.0",
          targetChildVersion: "5.1.0",
          viaPath: ["project", "mocha", "diff"],
          reason: "mocha@10.0.0 already allows diff@5.1.0 within the current dependency range",
        },
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
      printCompactOutput(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("High severity parent updates within range");
    expect(output).toContain("lockfile refresh");
    expect(output).toContain("> npm update mocha");
    expect(output).toContain("npm update mocha");
    expect(output).toContain("already permits");
    expect(output).not.toContain("npm install mocha@5.1.0");
  });

  it("prints registry-adjusted notes before the adjusted command", () => {
    const findings = [
      createFinding({
        pkg: { name: "serialize-javascript", version: "7.0.3", ecosystem: "npm", paths: [["project", "serialize-javascript"]] },
        relationship: "direct",
        dependencyPaths: [["project", "serialize-javascript"]],
        severity: "low",
        firstFixedVersion: "7.0.5",
        validatedFirstFixedVersion: "7.0.5",
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "lodash.template", version: "3.6.2", ecosystem: "npm", paths: [["project", "lodash.template"]] },
        relationship: "direct",
        dependencyPaths: [["project", "lodash.template"]],
        severity: "low",
        firstFixedVersion: "4.17.21",
        validatedFirstFixedVersion: "4.18.0",
        fixVersionValidationNote:
          "Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Low severity direct fixes");
    expect(output).toContain("> npm install serialize-javascript@7.0.5");
    expect(output).toContain("Low severity direct fixes (registry-adjusted)");
    expect(output).toContain("Package");
    expect(output).toContain("Current");
    expect(output).toContain("Target");
    expect(output).toContain("Versions scanned");
    expect(output).toContain("Still known vulnerable");
    expect(output).toContain("lodash.template");
    expect(output).toContain("3.6.2");
    expect(output).toContain("4.18.0");
    expect(output).toContain(
      "Note: Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.",
    );
    expect(output).toContain("> npm install lodash.template@4.18.0");
    expect(output.indexOf("Low severity direct fixes")).toBeLessThan(output.indexOf("Low severity direct fixes (registry-adjusted)"));
    expect(output.indexOf("lodash.template")).toBeLessThan(
      output.indexOf("Note: Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0."),
    );
    expect(output.indexOf("Note: Advisory fixed-version hint 4.17.21 is not published on npm for lodash.template; using nearest published version 4.18.0.")).toBeLessThan(
      output.indexOf("> npm install lodash.template@4.18.0"),
    );
  });

  it("prints a validation summary for adjusted targets that include candidate-evaluation counts", () => {
    const findings = [
      createFinding({
        pkg: { name: "diff", version: "3.5.1", ecosystem: "npm", paths: [["project", "diff"]] },
        relationship: "direct",
        dependencyPaths: [["project", "diff"]],
        severity: "medium",
        firstFixedVersion: "3.5.1",
        validatedFirstFixedVersion: "4.0.4",
        validatedTargetScannedVersions: 2,
        validatedTargetKnownVulnerableVersions: 1,
        fixVersionValidationNote:
          "Advisory fixed-version hint 3.5.1 is still known vulnerable for diff; scanned 2 package versions above current version (1 still known vulnerable); using lowest known non-vulnerable version 4.0.4.",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "tar", version: "7.5.3", ecosystem: "npm", paths: [["project", "tar"]] },
        relationship: "direct",
        dependencyPaths: [["project", "tar"]],
        severity: "medium",
        firstFixedVersion: "7.5.3",
        validatedFirstFixedVersion: "7.5.11",
        validatedTargetScannedVersions: 22,
        validatedTargetKnownVulnerableVersions: 21,
        fixVersionValidationNote:
          "Advisory fixed-version hint 7.5.3 is still known vulnerable for tar; scanned 22 package versions above current version (21 still known vulnerable); using lowest known non-vulnerable version 7.5.11.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Package");
    expect(output).toContain("Current");
    expect(output).toContain("Target");
    expect(output).toContain("Versions scanned");
    expect(output).toContain("Still known vulnerable");
    expect(output).toContain("diff");
    expect(output).toContain("3.5.1");
    expect(output).toContain("4.0.4");
    expect(output).toContain("2");
    expect(output).toContain("1");
    expect(output).toContain("tar");
    expect(output).toContain("7.5.3");
    expect(output).toContain("7.5.11");
    expect(output).toContain("22");
    expect(output).toContain("21");
    expect(output).toContain("Total");
    expect(output).toContain("24");
    expect(output).toContain("22");
    expect(output).not.toContain("Note: Advisory fixed-version hint 3.5.1 is still known vulnerable for diff;");
    expect(output).not.toContain("Note: Advisory fixed-version hint 7.5.3 is still known vulnerable for tar;");
  });

  it("shows Breaking? column with ⚠ for major-version bumps and blank for patch bumps", () => {
    const findings = [
      createFinding({
        pkg: { name: "jsonwebtoken", version: "8.5.1", ecosystem: "npm", paths: [["project", "jsonwebtoken"]] },
        relationship: "direct",
        dependencyPaths: [["project", "jsonwebtoken"]],
        severity: "high",
        firstFixedVersion: "9.0.0",
        validatedFirstFixedVersion: "9.0.0",
        validatedTargetScannedVersions: 1,
        validatedTargetKnownVulnerableVersions: 0,
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "fastify", version: "5.8.4", ecosystem: "npm", paths: [["project", "fastify"]] },
        relationship: "direct",
        dependencyPaths: [["project", "fastify"]],
        severity: "medium",
        firstFixedVersion: "5.8.5",
        validatedFirstFixedVersion: "5.8.5",
        validatedTargetScannedVersions: 1,
        validatedTargetKnownVulnerableVersions: 0,
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    // Breaking? column header is present
    expect(output).toContain("Breaking?");
    // Target version appears without inline annotation
    expect(output).toContain("9.0.0");
    expect(output).not.toContain("9.0.0 (breaking change)");
    // ⚠ icon appears for major-version bump (jsonwebtoken 8→9)
    expect(output).toContain("⚠");
    // Patch bump (fastify 5.8.4→5.8.5) does not trigger the icon
    expect(output).not.toContain("5.8.5 (breaking change)");
    // Column alignment: each data row should have 6 pipe-delimited cells
    const tableRows = lines.filter(l => l.startsWith("│"));
    for (const row of tableRows) {
      expect((row.match(/│/g) ?? []).length).toBe(8); // 7 cells = 8 pipes
    }
  });

  it("renders the validation table for urgent (high/critical) direct fix sections", () => {
    // Before the fix, urgent sections skipped the table because the printer only
    // checked for kind === "direct". After reclassifying CVSS vectors, direct
    // deps like jsonwebtoken jump from low → high (urgent) and must still show
    // Package/Current/Target/Versions scanned/Still known vulnerable/Breaking?.
    const findings = [
      createFinding({
        pkg: { name: "jsonwebtoken", version: "8.5.1", ecosystem: "npm", paths: [["project", "jsonwebtoken"]] },
        relationship: "direct",
        dependencyPaths: [["project", "jsonwebtoken"]],
        severity: "high",
        firstFixedVersion: "9.0.0",
        validatedFirstFixedVersion: "9.0.0",
        validatedTargetScannedVersions: 1,
        validatedTargetKnownVulnerableVersions: 0,
        fixVersionValidationNote: null,
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("High severity fix commands");
    expect(output).toContain("Package");
    expect(output).toContain("Target");
    expect(output).toContain("Versions scanned");
    expect(output).toContain("jsonwebtoken");
    expect(output).toContain("9.0.0");
    // Table must appear before the command callout
    expect(output.indexOf("Target")).toBeLessThan(output.indexOf("> npm install jsonwebtoken@9.0.0"));
  });

  it("excludes transitive skips from the no-auto-fix section and only shows direct ones", () => {
    // Transitive findings without a parent upgrade path are already covered by
    // printFixPlan step 2, so repeating them in "no auto-fix" creates duplication.
    // Only direct deps with no confident fix command should appear there.
    const findings = [
      createFinding({
        pkg: { name: "marsdb", version: "0.6.11", ecosystem: "npm", paths: [["project", "marsdb"]] },
        relationship: "direct",
        dependencyPaths: [["project", "marsdb"]],
        severity: "critical",
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "braces", version: "2.3.2", ecosystem: "npm", paths: [["project", "check-dependencies", "braces"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "check-dependencies", "braces"]],
        severity: "high",
        firstFixedVersion: "3.0.3",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommandSkips(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("No auto-fix command available for these direct dependencies:");
    expect(output).toContain("marsdb@0.6.11");
    // transitive must not appear in this section
    expect(output).not.toContain("braces@2.3.2");
  });

  it("prints unpublishable fixed-version hints separately from runnable commands", () => {
    const findings = [
      createFinding({
        pkg: { name: "request", version: "2.88.2", ecosystem: "npm", paths: [["project", "request"]] },
        relationship: "direct",
        dependencyPaths: [["project", "request"]],
        severity: "low",
        firstFixedVersion: "3.0.0",
        validatedFirstFixedVersion: null,
        fixVersionValidationNote:
          "Advisory fixed-version hint 3.0.0 is not published on npm for request, and no published version >= 3.0.0 was found.",
        recommendedParentUpgrade: undefined,
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
      printSuggestedFixCommandSkips(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).not.toContain("Copy And Run These Fix Commands");
    expect(output).toContain("Unpublishable fixed-version hints:");
    expect(output).toContain(
      "request@2.88.2: Advisory fixed-version hint 3.0.0 is not published on npm for request, and no published version >= 3.0.0 was found.",
    );
  });

  it("renders a severity table in printSummary when findings exist", () => {
    const findings = [
      createFinding({ severity: "critical" }),
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm" },
        severity: "high",
      }),
      createFinding({
        pkg: { name: "tar", version: "6.0.0", ecosystem: "npm" },
        severity: "high",
      }),
    ];

    const lines = captureLogs(() => {
      printSummary(findings, 10, createScanInput());
    });
    const output = lines.join("\n");

    expect(output).toContain("┌");
    expect(output).toContain("Critical");
    expect(output).toContain("High");
    expect(output).toContain("Medium");
    expect(output).toContain("Low");
    expect(output).toContain("Unknown");
    // flat "critical: 1" format must not appear
    expect(output).not.toMatch(/critical:\s*1/);
  });

  it("suppresses the --all tip and Showing header when printTable threshold is null", () => {
    const findings = [createFinding()];

    const linesWithThreshold = captureLogs(() => {
      printTable(findings, "medium");
    });
    const linesWithNull = captureLogs(() => {
      printTable(findings, null);
    });

    expect(linesWithThreshold.join("\n")).toContain("Showing medium+ findings in the main table. Use --all to show everything.");
    expect(linesWithThreshold.join("\n")).toContain("Tip: use --all to include low findings");
    expect(linesWithNull.join("\n")).not.toContain("Showing medium+ findings");
    expect(linesWithNull.join("\n")).not.toContain("Tip: use --all to include low findings");
  });

  it("shows the full findings table in compact output when all option is true", () => {
    const findings = [
      createFinding({ severity: "critical" }),
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm" },
        severity: "low",
        relationship: "direct",
      }),
    ];

    const linesAll = captureLogs(() => {
      printCompactOutput(findings, createScanInputForSource("package-lock"), { all: true });
    });
    const linesDefault = captureLogs(() => {
      printCompactOutput(findings, createScanInputForSource("package-lock"));
    });
    const outputAll = linesAll.join("\n");
    const outputDefault = linesDefault.join("\n");

    // --all: table present, tip suppressed, --verbose hint suppressed
    expect(outputAll).toContain("Package");
    expect(outputAll).toContain("Severity");
    expect(outputAll).toContain("lodash");
    expect(outputAll).toContain("minimist");
    expect(outputAll).not.toContain("Tip: use --all to include low findings");
    expect(outputAll).not.toContain("Run with --verbose");

    // default: no table, --verbose hint shown
    expect(outputDefault).not.toContain("│ Package");
    expect(outputDefault).toContain("Run with --verbose for fix plan");
  });

  it("shows malicious advisory inline hint and legend in compact output", () => {
    const finding = createFinding({
      pkg: { name: "fs", version: "0.0.1-security", ecosystem: "npm", paths: [["project", "fs"]] },
      severity: "unknown",
      relationship: "direct",
      dependencyPaths: [["project", "fs"]],
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
      recommendedNpmTransitiveRemediation: undefined,
      vulnerabilities: [{ id: "MAL-2025-21003", aliases: [], summary: "Malicious code in fs (npm)", severity: [] }],
    });
    const lines = captureLogs(() => {
      printCompactOutput([finding], createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");
    expect(output).toContain("fs");
    expect(output).toContain("UNKNOWN");
    expect(output).toContain("⚠ Malicious: Remove this package from your dependencies immediately.");
    expect(output).toContain("⚠ Malicious package advisory:");
    expect(output).toContain("fs@0.0.1-security — Remove it from your dependencies immediately.");
  });

  it("does not show malicious legend in compact output when --all is set (printTable shows it instead)", () => {
    const finding = createFinding({
      pkg: { name: "fs", version: "0.0.1-security", ecosystem: "npm", paths: [["project", "fs"]] },
      severity: "unknown",
      relationship: "direct",
      dependencyPaths: [["project", "fs"]],
      firstFixedVersion: null,
      recommendedParentUpgrade: undefined,
      recommendedNpmTransitiveRemediation: undefined,
      vulnerabilities: [{ id: "MAL-2025-21003", aliases: [], summary: "Malicious code in fs (npm)", severity: [] }],
    });
    const lines = captureLogs(() => {
      printCompactOutput([finding], createScanInputForSource("package-lock"), { all: true });
    });
    const output = lines.join("\n");
    // legend appears exactly once — from printTable, not from the compact legend block
    const legendCount = (output.match(/⚠ Malicious package advisory:/g) ?? []).length;
    expect(legendCount).toBe(1);
  });

  it("prints compact output for urgent findings and a clean final line for empty scans", () => {
    const linesWithFinding = captureLogs(() => {
      printCompactOutput([createFinding()], createScanInputForSource("package-lock"));
    });
    const emptyLines = captureLogs(() => {
      printCompactOutput([], createScanInputForSource("package-lock"));
    });

    expect(linesWithFinding.join("\n")).toContain("📦 Vulnerabilities found");
    expect(linesWithFinding.join("\n")).toContain("🛠  Copy And Run These Fix Commands");
    expect(linesWithFinding.join("\n")).toContain("1 command group ready across 1 package");
    expect(linesWithFinding.join("\n")).toContain("> npm install app@1.1.0");
    expect(linesWithFinding.join("\n")).toContain("npm install app@1.1.0");
    expect(emptyLines).toContain("✔ Scan complete. No known vulnerabilities found.");
  });

  it("keeps direct unknown-severity findings visible in compact output even when urgent slots are full", () => {
    const findings = [
      createFinding({
        pkg: { name: "critical-a", version: "1.0.0", ecosystem: "npm", paths: [["project", "critical-a"]] },
        severity: "critical",
        relationship: "direct",
        dependencyPaths: [["project", "critical-a"]],
      }),
      createFinding({
        pkg: { name: "critical-b", version: "1.0.0", ecosystem: "npm", paths: [["project", "critical-b"]] },
        severity: "critical",
        relationship: "direct",
        dependencyPaths: [["project", "critical-b"]],
      }),
      createFinding({
        pkg: { name: "high-c", version: "1.0.0", ecosystem: "npm", paths: [["project", "high-c"]] },
        severity: "high",
        relationship: "direct",
        dependencyPaths: [["project", "high-c"]],
      }),
      createFinding({
        pkg: { name: "fs", version: "0.0.1-security", ecosystem: "npm", paths: [["project", "fs"]] },
        severity: "unknown",
        relationship: "direct",
        dependencyPaths: [["project", "fs"]],
        firstFixedVersion: null,
        recommendedParentUpgrade: undefined,
        recommendedNpmTransitiveRemediation: undefined,
        vulnerabilities: [{ id: "MAL-2025-21003", aliases: [], summary: "Malicious code in fs (npm)", severity: [] }],
      }),
    ];

    const lines = captureLogs(() => {
      printCompactOutput(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("critical-a@1.0.0");
    expect(output).toContain("critical-b@1.0.0");
    expect(output).toContain("high-c@1.0.0");
    expect(output).toContain("fs@0.0.1-security");
    expect(output).toContain("⚠ Malicious: Remove this package from your dependencies immediately.");
  });

  it("renders Context column for parent-upgrade targets in urgent sections", () => {
    const findings = [
      createFinding({
        pkg: { name: "minimist", version: "0.0.8", ecosystem: "npm", paths: [["project", "minimist"]] },
        relationship: "direct",
        dependencyPaths: [["project", "minimist"]],
        severity: "critical",
        firstFixedVersion: "1.2.8",
        recommendedParentUpgrade: undefined,
      }),
      createFinding({
        pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm", paths: [["project", "app", "lodash"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "app", "lodash"]],
        severity: "critical",
        firstFixedVersion: "4.17.21",
        recommendedParentUpgrade: {
          package: "app",
          currentVersion: "1.0.0",
          targetVersion: "1.1.0",
          viaPath: ["project", "app", "lodash"],
          vulnerablePackage: "lodash",
          confidence: "exact-direct-child",
          reason: "app@1.1.0 no longer allows lodash@4.17.20",
        },
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Context");
    expect(output).toContain("Parent upgrade for vulnerable lodash@4.17.20");
    expect(output).toContain("> npm install minimist@1.2.8 app@1.1.0");
  });

  it("renders Context column for urgent sections containing only parent-upgrade targets", () => {
    const findings = [
      createFinding({
        pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm", paths: [["project", "app", "lodash"]] },
        relationship: "transitive",
        dependencyPaths: [["project", "app", "lodash"]],
        severity: "critical",
        firstFixedVersion: "4.17.21",
        recommendedParentUpgrade: {
          package: "app",
          currentVersion: "1.0.0",
          targetVersion: "1.1.0",
          viaPath: ["project", "app", "lodash"],
          vulnerablePackage: "lodash",
          confidence: "exact-direct-child",
          reason: "app@1.1.0 no longer allows lodash@4.17.20",
        },
      }),
    ];

    const lines = captureLogs(() => {
      printSuggestedFixCommands(findings, createScanInputForSource("package-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Context");
    expect(output).toContain("Parent upgrade for vulnerable lodash@4.17.20");
    expect(output).not.toContain("Versions scanned");
    expect(output).not.toContain("Breaking?");
    expect(output).toContain("> npm install app@1.1.0");
  });

  it("marks parent-upgrade targets as partial when other known paths remain and wraps the full context", () => {
    const finding = createFinding({
      pkg: {
        name: "picomatch",
        version: "4.0.3",
        ecosystem: "npm",
        paths: [
          ["project", "lint-staged", "picomatch"],
          ["project", "vite", "picomatch"],
        ],
      },
      relationship: "transitive",
      dependencyPaths: [
        ["project", "lint-staged", "picomatch"],
        ["project", "vite", "picomatch"],
      ],
      severity: "high",
      firstFixedVersion: "4.0.4",
      recommendedParentUpgrade: {
        package: "lint-staged",
        currentVersion: "16.4.0",
        targetVersion: "17.0.0",
        viaPath: ["project", "lint-staged", "picomatch"],
        vulnerablePackage: "picomatch",
        confidence: "exact-direct-child",
        reason: "lint-staged@17.0.0 no longer allows picomatch@4.0.3",
      },
    });

    const plan = buildSuggestedFixCommandPlan([finding], createScanInputForSource("pnpm-lock"));

    expect(plan?.targets[0]).toEqual(
      expect.objectContaining({
        coverage: "partial",
        coveredPaths: [["project", "lint-staged", "picomatch"]],
        remainingPaths: [["project", "vite", "picomatch"]],
        reason:
          "Path-specific parent upgrade for project -> lint-staged -> picomatch (picomatch@4.0.3); run this command, then rescan. 1 other known path may still need separate parent upgrades.",
      }),
    );

    const lines = captureLogs(() => {
      printSuggestedFixCommands([finding], createScanInputForSource("pnpm-lock"));
    });
    const output = lines.join("\n");

    expect(output).toContain("Path-specific parent upgrade for project -> lint-staged ->");
    expect(output).toContain("picomatch (picomatch@4.0.3); run this command, then rescan.");
    expect(output).toContain("1 other known path may still need separate parent upgrades.");
    expect(output).not.toContain("…");
  });

  it("prints compact validation summary when scanned-version metrics are available", () => {
    const lines = captureLogs(() => {
      printCompactOutput(
        [
          createFinding({
            pkg: { name: "tar", version: "7.5.3", ecosystem: "npm", paths: [["project", "tar"]] },
            relationship: "direct",
            dependencyPaths: [["project", "tar"]],
            severity: "medium",
            firstFixedVersion: "7.5.3",
            validatedFirstFixedVersion: "7.5.11",
            validatedTargetScannedVersions: 22,
            validatedTargetKnownVulnerableVersions: 21,
            fixVersionValidationNote:
              "Advisory fixed-version hint 7.5.3 is still known vulnerable for tar; scanned 22 package versions above current version (21 still known vulnerable); using lowest known non-vulnerable version 7.5.11.",
            recommendedParentUpgrade: undefined,
          }),
        ],
        createScanInputForSource("package-lock"),
      );
    });

    const output = lines.join("\n");
    expect(output).toContain("Validation: scanned 22 package versions; 21 are still known vulnerable.");
  });
});

describe("printSummary CVE count", () => {
  it("includes CVE count in the found line", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const findings = [
      createFinding({
        vulnerabilities: [
          { id: "OSV-001", aliases: ["CVE-2026-0001"], summary: "A", severity: [] },
          { id: "OSV-002", aliases: ["CVE-2026-0002"], summary: "B", severity: [] },
        ],
      }),
      createFinding({
        pkg: { name: "express", version: "4.0.0", ecosystem: "npm" },
        vulnerabilities: [
          { id: "OSV-003", aliases: [], summary: "C", severity: [] },
        ],
      }),
    ];
    printSummary(findings, 100, createScanInput());
    const allOutput = consoleSpy.mock.calls.map(c => stripAnsi(String(c[0]))).join("\n");
    expect(allOutput).toContain("2 packages (3 CVEs)");
    consoleSpy.mockRestore();
  });

  it("uses singular package and CVE when counts are 1", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const findings = [createFinding()]; // 1 package, 1 CVE (OSV-123)
    printSummary(findings, 100, createScanInput());
    const allOutput = consoleSpy.mock.calls.map(c => stripAnsi(String(c[0]))).join("\n");
    expect(allOutput).toContain("1 package (1 CVE)");
    consoleSpy.mockRestore();
  });
});

describe("printActionSummary CVE count", () => {
  it("prints CVEs label instead of unique advisories", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const findings = [
      createFinding({
        vulnerabilities: [
          { id: "OSV-001", aliases: [], summary: "A", severity: [] },
          { id: "OSV-002", aliases: [], summary: "B", severity: [] },
        ],
      }),
    ];
    printActionSummary(findings);
    const allOutput = consoleSpy.mock.calls.map(c => stripAnsi(String(c[0]))).join("\n");
    expect(allOutput).toContain("2 CVEs matched overall");
    expect(allOutput).not.toContain("unique advisories");
    consoleSpy.mockRestore();
  });
});

describe("printCompactOutput CVE count", () => {
  it("shows packages and CVE count on the count line", () => {
    const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const findings = [
      createFinding({
        vulnerabilities: [
          { id: "OSV-001", aliases: [], summary: "A", severity: [] },
          { id: "OSV-002", aliases: [], summary: "B", severity: [] },
        ],
      }),
      createFinding({
        pkg: { name: "express", version: "4.0.0", ecosystem: "npm" },
        vulnerabilities: [
          { id: "OSV-003", aliases: [], summary: "C", severity: [] },
        ],
      }),
    ];
    printCompactOutput(findings, 100, createScanInput(), {});
    const allOutput = consoleSpy.mock.calls.map(c => stripAnsi(String(c[0]))).join("\n");
    expect(allOutput).toContain("2 packages");
    expect(allOutput).toContain("3 CVEs");
    expect(allOutput).not.toContain("vulnerable packages");
    consoleSpy.mockRestore();
  });
});

describe("countUniqueAdvisories", () => {
  it("returns 0 for empty findings", () => {
    expect(countUniqueAdvisories([])).toBe(0);
  });

  it("counts one advisory for a single-vuln finding", () => {
    const f = createFinding(); // has one vulnerability: OSV-123
    expect(countUniqueAdvisories([f])).toBe(1);
  });

  it("counts multiple advisories on one finding", () => {
    const f = createFinding({
      vulnerabilities: [
        { id: "OSV-001", aliases: ["CVE-2026-0001"], summary: "A", severity: [] },
        { id: "OSV-002", aliases: ["CVE-2026-0002"], summary: "B", severity: [] },
      ],
    });
    expect(countUniqueAdvisories([f])).toBe(2);
  });

  it("deduplicates the same advisory ID appearing in multiple findings", () => {
    const sharedVuln = { id: "OSV-001", aliases: [], summary: "X", severity: [] };
    const f1 = createFinding({ vulnerabilities: [sharedVuln] });
    const f2 = createFinding({
      pkg: { name: "express", version: "4.0.0", ecosystem: "npm" },
      vulnerabilities: [sharedVuln],
    });
    expect(countUniqueAdvisories([f1, f2])).toBe(1);
  });

  it("sums distinct advisories across multiple findings", () => {
    const f1 = createFinding({
      vulnerabilities: [
        { id: "OSV-001", aliases: [], summary: "A", severity: [] },
        { id: "OSV-002", aliases: [], summary: "B", severity: [] },
      ],
    });
    const f2 = createFinding({
      pkg: { name: "express", version: "4.0.0", ecosystem: "npm" },
      vulnerabilities: [
        { id: "OSV-003", aliases: [], summary: "C", severity: [] },
      ],
    });
    expect(countUniqueAdvisories([f1, f2])).toBe(3);
  });
});
