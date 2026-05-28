import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildReportData, renderHtmlReport, writeHtmlReport } from "../src/output/html-reporter.js";
import type { Finding, OsvVuln } from "../src/types.js";
import type { SuggestedFixCommandPlan } from "../src/remediation/fix-commands.js";

function makeVuln(overrides?: Partial<OsvVuln>): OsvVuln {
  return {
    id: "CVE-2021-23337",
    aliases: ["CVE-2021-23337"],
    summary: "Prototype pollution",
    severity: [{ type: "CVSS_V3", score: "9.8" }],
    ...overrides,
  };
}

function makeFinding(overrides?: Partial<Finding>): Finding {
  return {
    pkg: { name: "lodash", version: "4.17.20", ecosystem: "npm" },
    vulnerabilities: [makeVuln()],
    severity: "critical",
    cveAliases: ["CVE-2021-23337"],
    dependencyPaths: [["my-app", "lodash"]],
    relationship: "direct",
    firstFixedVersion: "4.17.21",
    ...overrides,
  };
}

const BASE_PARAMS = {
  projectPath: "/home/user/my-app",
  cliVersion: "1.8.0",
  packageManager: "npm",
  lockfileSource: "package-lock",
  packageCount: 42,
  findings: [makeFinding()],
  suggestedFixCommands: null,
  notes: ["note1"],
  warnings: [],
};

describe("buildReportData", () => {
  it("maps scalar fields verbatim", () => {
    const data = buildReportData(BASE_PARAMS);
    expect(data.projectPath).toBe("/home/user/my-app");
    expect(data.cliVersion).toBe("1.8.0");
    expect(data.packageManager).toBe("npm");
    expect(data.lockfileSource).toBe("package-lock");
    expect(data.packageCount).toBe(42);
  });

  it("serializes findings", () => {
    const data = buildReportData(BASE_PARAMS);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].package).toBe("lodash");
    expect(data.findings[0].version).toBe("4.17.20");
    expect(data.findings[0].severity).toBe("critical");
  });

  it("passes through suggestedFixCommands as null when null", () => {
    const data = buildReportData(BASE_PARAMS);
    expect(data.suggestedFixCommands).toBeNull();
  });

  it("passes through suggestedFixCommands when provided", () => {
    const plan: SuggestedFixCommandPlan = {
      packageManager: "npm",
      sourceLabel: "package-lock.json",
      command: "npm install lodash@4.17.21",
      sections: [],
      targets: [],
      skipped: [],
    };
    const data = buildReportData({ ...BASE_PARAMS, suggestedFixCommands: plan });
    expect(data.suggestedFixCommands).toBe(plan);
  });

  it("produces a valid ISO timestamp for scannedAt", () => {
    const data = buildReportData(BASE_PARAMS);
    expect(() => new Date(data.scannedAt).toISOString()).not.toThrow();
  });

  it("attaches a runnable npm install command to findings that match a plan target", () => {
    const plan: SuggestedFixCommandPlan = {
      packageManager: "npm",
      sourceLabel: "package-lock.json",
      command: "npm install lodash@4.17.21",
      sections: [],
      targets: [
        {
          package: "lodash",
          currentVersion: "4.17.20",
          targetVersion: "4.17.21",
          kind: "direct",
          urgent: true,
          severity: "critical",
          adjusted: false,
          reason: "Direct upgrade target",
        },
      ],
      skipped: [],
    };

    const data = buildReportData({ ...BASE_PARAMS, suggestedFixCommands: plan });
    expect(data.findings[0].runnableFixCommand).toBe("npm install lodash@4.17.21");
  });

  it("emits a null runnableFixCommand for findings with no actionable plan target", () => {
    const finding = makeFinding({
      relationship: "transitive",
      dependencyPaths: [],
    });

    const data = buildReportData({
      ...BASE_PARAMS,
      findings: [finding],
      suggestedFixCommands: {
        packageManager: "npm",
        sourceLabel: "package-lock.json",
        command: null,
        sections: [],
        targets: [],
        skipped: [],
      },
    });

    expect(data.findings[0].runnableFixCommand).toBeNull();
  });
});

describe("renderHtmlReport", () => {
  const data = buildReportData(BASE_PARAMS);

  it("returns a string starting with <!DOCTYPE html>", () => {
    expect(renderHtmlReport(data)).toMatch(/^<!DOCTYPE html>/);
  });

  it("embeds the project path in the output", () => {
    expect(renderHtmlReport(data)).toContain("my-app");
  });

  it("includes a Download JSON button and handler", () => {
    const html = renderHtmlReport(buildReportData(BASE_PARAMS));
    expect(html).toContain("Download JSON");
    expect(html).toContain("downloadReportJson");
    expect(html).toContain("cve-lite-report.json");
  });

  it("embeds cliVersion in the footer", () => {
    expect(renderHtmlReport(data)).toContain("1.8.0");
  });

  it("embeds reportData as an inline script", () => {
    const html = renderHtmlReport(data);
    expect(html).toContain("const reportData =");
    expect(html).toContain('"lodash"');
  });

  it("contains the logo as a base64 data URI", () => {
    expect(renderHtmlReport(data)).toContain("data:image/png;base64,");
  });

  it("contains the GitHub repo link", () => {
    expect(renderHtmlReport(data)).toContain("github.com/OWASP/cve-lite-cli");
  });

  it("contains the OWASP project link", () => {
    expect(renderHtmlReport(data)).toContain("owasp.org/cve-lite-cli");
  });

  it("links CVE IDs to osv.dev", () => {
    expect(renderHtmlReport(data)).toContain("osv.dev/vulnerability/CVE-2021-23337");
  });

  it("links GHSA IDs to github.com/advisories", () => {
    const ghsaFinding = makeFinding({
      cveAliases: ["GHSA-abcd-1234-efgh"],
      vulnerabilities: [makeVuln({ id: "GHSA-abcd-1234-efgh", aliases: ["GHSA-abcd-1234-efgh"] })],
    });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [ghsaFinding] }));
    expect(html).toContain("github.com/advisories/GHSA-abcd-1234-efgh");
  });

  it("renders a runnable fix command with a Copy button when one is available for a finding", () => {
    const plan: SuggestedFixCommandPlan = {
      packageManager: "npm",
      sourceLabel: "package-lock.json",
      command: "npm install lodash@4.17.21",
      sections: [],
      targets: [
        {
          package: "lodash",
          currentVersion: "4.17.20",
          targetVersion: "4.17.21",
          kind: "direct",
          urgent: true,
          severity: "critical",
          adjusted: false,
          reason: "Direct upgrade target",
        },
      ],
      skipped: [],
    };

    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, suggestedFixCommands: plan }));

    expect(html).toContain("<code>npm install lodash@4.17.21</code>");
    expect(html).toContain('data-cmd="npm install lodash@4.17.21"');
  });

  it("renders partial path coverage notes for parent-upgrade fix targets", () => {
    const plan: SuggestedFixCommandPlan = {
      packageManager: "pnpm",
      sourceLabel: "pnpm-lock.yaml",
      command: "pnpm add lint-staged@17.0.0",
      sections: [
        {
          key: "urgent:high",
          kind: "urgent",
          severity: "high",
          title: "High severity fix commands",
          command: "pnpm add lint-staged@17.0.0",
          targets: [
            {
              package: "lint-staged",
              currentVersion: "16.4.0",
              targetVersion: "17.0.0",
              kind: "parent-upgrade",
              urgent: true,
              severity: "high",
              adjusted: false,
              reason:
                "Path-specific parent upgrade for project -> lint-staged -> picomatch (picomatch@4.0.3); run this command, then rescan. 1 other known path may still need separate parent upgrades.",
              coverage: "partial",
              coveredPaths: [["project", "lint-staged", "picomatch"]],
              remainingPaths: [["project", "vite", "picomatch"]],
            },
          ],
        },
      ],
      targets: [],
      skipped: [],
    };

    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, suggestedFixCommands: plan }));

    expect(html).toContain("Path-specific remediation. Run this command, then rescan; 1 other known path may still need separate parent upgrades.");
  });

  it("renders the descriptive recommendation without a Copy button when no runnable command exists", () => {
    const finding = makeFinding({
      relationship: "transitive",
      dependencyPaths: [],
    });

    const html = renderHtmlReport(
      buildReportData({
        ...BASE_PARAMS,
        findings: [finding],
        suggestedFixCommands: {
          packageManager: "npm",
          sourceLabel: "package-lock.json",
          command: null,
          sections: [],
          targets: [],
          skipped: [],
        },
      }),
    );

    // The expanded action panel for this finding should be the explanatory note,
    // not a fix-cmd-inline command box with a Copy button.
    expect(html).toContain('<p class="fix-cmd-note">No parent dependency was identified for lodash');
    const recommendedActionIdx = html.indexOf("<h4>Recommended action</h4>");
    const nextHeadingIdx = html.indexOf("</div>", recommendedActionIdx);
    const recommendedActionBlock = html.slice(recommendedActionIdx, nextHeadingIdx);
    expect(recommendedActionBlock).not.toContain("copy-btn");
    expect(recommendedActionBlock).not.toContain("fix-cmd-inline");
  });

  it("escapes </script> sequences in embedded JSON", () => {
    const xssFinding = makeFinding({
      vulnerabilities: [makeVuln({ summary: '</script><img src=x onerror=alert(1)>' })],
    });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [xssFinding] }));
    const scriptIdx = html.indexOf("const reportData =");
    const endOfJson = html.indexOf(";", scriptIdx);
    const jsonBlob = html.slice(scriptIdx, endOfJson);
    expect(jsonBlob).not.toContain("</script>");
  });

  describe("transitive context column", () => {
    it("shows ✓ Fix available badge when recommendedNpmTransitiveRemediation is set", () => {
      const finding = makeFinding({
        pkg: { name: "qs", version: "6.5.2", ecosystem: "npm" },
        relationship: "transitive",
        dependencyPaths: [["project", "express", "qs"]],
        firstFixedVersion: "6.11.0",
        recommendedNpmTransitiveRemediation: {
          kind: "update-parent-within-range",
          package: "express",
          currentVersion: "4.17.1",
          viaPath: ["project", "express"],
          reason: "Safe child version available within current range",
          targetChildVersion: "6.11.0",
        },
      });

      const html = renderHtmlReport(
        buildReportData({ ...BASE_PARAMS, findings: [finding], suggestedFixCommands: null }),
      );

      expect(html).toContain("<h4>Context</h4>");
      expect(html).toContain("tier-ok");
      expect(html).toContain("✓ Fix available");
      expect(html).toContain("Parent: express");
    });

    it("shows ⚠ No safe version badge when parent is known but no fix is available", () => {
      const finding = makeFinding({
        pkg: { name: "express", version: "4.17.1", ecosystem: "npm" },
        relationship: "transitive",
        dependencyPaths: [["project", "nest-core", "express"]],
        firstFixedVersion: "4.18.2",
      });

      const html = renderHtmlReport(
        buildReportData({ ...BASE_PARAMS, findings: [finding], suggestedFixCommands: null }),
      );

      expect(html).toContain("<h4>Context</h4>");
      expect(html).toContain("tier-warn");
      expect(html).toContain("⚠ No safe version identified");
      expect(html).toContain("Parent: nest-core");
    });

    it("shows ✕ No parent badge when no parent is identifiable from the dependency path", () => {
      const finding = makeFinding({
        relationship: "transitive",
        dependencyPaths: [],
      });

      const html = renderHtmlReport(
        buildReportData({ ...BASE_PARAMS, findings: [finding], suggestedFixCommands: null }),
      );

      expect(html).toContain("<h4>Context</h4>");
      expect(html).toContain("tier-err");
      expect(html).toContain("✕ No parent identified");
      expect(html).toContain("npm ls lodash");
    });
  });

  it("shows ⚠ No fix in the fix column when no fixed version is available", () => {
    const finding = makeFinding({ firstFixedVersion: null });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [finding] }));
    expect(html).toContain("⚠ No fix");
    expect(html).toContain('title="No known fix — consider replacing this package"');
  });

  it("shows malicious tooltip when finding has MAL-* advisory", () => {
    const finding = makeFinding({
      firstFixedVersion: null,
      vulnerabilities: [makeVuln({ id: "MAL-2025-21003" })],
    });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [finding] }));
    expect(html).toContain('title="Malicious code advisory — remove this package"');
    expect(html).toContain("⚠ Malicious");
  });

  it("shows generic no-fix tooltip when finding has non-MAL advisory and no fix version", () => {
    const finding = makeFinding({ firstFixedVersion: null });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [finding] }));
    expect(html).toContain('title="No known fix — consider replacing this package"');
  });

  it("does not show ⚠ No fix when a fixed version is available", () => {
    const finding = makeFinding({ firstFixedVersion: "4.17.21" });
    const html = renderHtmlReport(buildReportData({ ...BASE_PARAMS, findings: [finding] }));
    expect(html).toContain("4.17.21");
    expect(html).not.toContain("⚠ No fix");
  });

  describe("renderHtmlReport CVE card", () => {
    it("renders a Packages card and a CVEs card", () => {
      const findings = [
        makeFinding({
          vulnerabilities: [
            makeVuln({ id: "CVE-2021-001" }),
            makeVuln({ id: "CVE-2021-002" }),
          ],
          cveAliases: ["CVE-2021-001", "CVE-2021-002"],
        }),
        makeFinding({
          pkg: { name: "express", version: "4.0.0", ecosystem: "npm" },
          vulnerabilities: [makeVuln({ id: "CVE-2021-003" })],
          cveAliases: ["CVE-2021-003"],
        }),
      ];
      const data = buildReportData({ ...BASE_PARAMS, findings });
      const html = renderHtmlReport(data);
      expect(html).toContain('<span class="label">Packages</span>');
      expect(html).toContain('<span class="label">CVEs</span>');
      expect(html).toContain('<span class="count">3</span>'); // 3 total CVEs
      expect(html).not.toContain('<span class="label">Total</span>');
    });
  });
});

describe("writeHtmlReport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates the output directory if it does not exist", async () => {
    const outputDir = path.join(tmpDir, "nested", "report");
    const data = buildReportData(BASE_PARAMS);
    await writeHtmlReport({ outputDir, data, autoOpen: false });
    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it("writes index.html to the output directory", async () => {
    const outputDir = path.join(tmpDir, "report");
    const data = buildReportData(BASE_PARAMS);
    await writeHtmlReport({ outputDir, data, autoOpen: false });
    expect(fs.existsSync(path.join(outputDir, "index.html"))).toBe(true);
  });

  it("writes report.json to the output directory", async () => {
    const outputDir = path.join(tmpDir, "report");
    const data = buildReportData(BASE_PARAMS);
    await writeHtmlReport({ outputDir, data, autoOpen: false });
    expect(fs.existsSync(path.join(outputDir, "report.json"))).toBe(true);
  });

  it("report.json is valid JSON matching ReportData", async () => {
    const outputDir = path.join(tmpDir, "report");
    const data = buildReportData(BASE_PARAMS);
    await writeHtmlReport({ outputDir, data, autoOpen: false });
    const json = JSON.parse(fs.readFileSync(path.join(outputDir, "report.json"), "utf8"));
    expect(json.cliVersion).toBe("1.8.0");
    expect(json.findings).toHaveLength(1);
  });

  it("returns the reportPath as the absolute path to index.html", async () => {
    const outputDir = path.join(tmpDir, "report");
    const data = buildReportData(BASE_PARAMS);
    const result = await writeHtmlReport({ outputDir, data, autoOpen: false });
    expect(result.reportPath).toBe(path.join(outputDir, "index.html"));
  });

  it("overwrites existing files on a second call", async () => {
    const outputDir = path.join(tmpDir, "report");
    const data1 = buildReportData({ ...BASE_PARAMS, cliVersion: "1.0.0" });
    const data2 = buildReportData({ ...BASE_PARAMS, cliVersion: "2.0.0" });
    await writeHtmlReport({ outputDir, data: data1, autoOpen: false });
    await writeHtmlReport({ outputDir, data: data2, autoOpen: false });
    const json = JSON.parse(fs.readFileSync(path.join(outputDir, "report.json"), "utf8"));
    expect(json.cliVersion).toBe("2.0.0");
  });
});
