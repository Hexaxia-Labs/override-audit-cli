/**
 * Plan 8: end-to-end coverage of validation conflicts and output channels.
 *
 * Validation conflicts: each rejected flag combo (or invalid value) must exit
 * non-zero and print the relevant error phrase. Messages and exit code (1)
 * were confirmed by running the real binary; we assert that reality here.
 *
 * Output channels: each writer (terminal, scan --json file, overrides --json
 * stdout, --sarif, --report HTML, --cdx) must produce parseable, well-shaped
 * output via the real binary. cwd-sensitive writers run with opts.cwd set to a
 * throwaway dir so the timestamped files land where we can find them.
 *
 * Env note: CVE Lite skips its "update available" network banner when CI is
 * set (or when --offline/--json is passed). We set CI=1 on every spawn so
 * non-offline paths stay deterministic and offline-free.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runCli, mkProject, rmProject, npmProject } from "./harness.js";

const CI_ENV = { CI: "1" } as const;

/** A project whose override targets a package absent from the lock tree.
 *  That orphan triggers OA001 so override-aware outputs are populated. */
function orphanOverrideProject(): string {
  const files = npmProject(
    { name: "outproj", version: "1.0.0", overrides: { lodash: "4.17.21" } },
    { express: "4.18.2" },
  );
  return mkProject(files);
}

function findByExt(dir: string, ext: string): string[] {
  return readdirSync(dir).filter(f => f.endsWith(ext));
}

describe("validation conflicts", () => {
  let proj: string;
  beforeAll(() => {
    proj = mkProject(npmProject({ name: "vproj" }, { express: "4.18.2" }));
  });
  afterAll(() => rmProject(proj));

  // Each row: args (project injected), and a phrase that must appear on a
  // stream. All confirmed to exit 1 against the real binary.
  const cases: Array<{ name: string; args: string[]; phrase: string }> = [
    { name: "--fix --json", args: ["--fix", "--json"], phrase: "--fix cannot be used with --json" },
    { name: "--report --json", args: ["--report", "./r", "--json"], phrase: "--report cannot be used with --json" },
    { name: "--sarif --report", args: ["--sarif", "--report", "./r"], phrase: "cannot combine --sarif and --report" },
    { name: "--cdx --report", args: ["--cdx", "--report", "./r"], phrase: "cannot combine --cdx and --report" },
    { name: "--offline --osv-url", args: ["--offline", "--osv-url", "https://x"], phrase: "--offline/--offline-db cannot be used with --osv-url" },
    { name: "--no-cache --offline", args: ["--no-cache", "--offline"], phrase: "--no-cache cannot be used with --offline or --offline-db" },
    { name: "invalid --osv-url", args: ["--osv-url", "not-a-url"], phrase: "Invalid value for --osv-url: not-a-url" },
    { name: "invalid --ca-cert", args: ["--ca-cert", "/no/such/file.pem"], phrase: "--ca-cert" },
    { name: "unknown flag", args: ["--not-a-real-flag"], phrase: "Unknown option: --not-a-real-flag" },
  ];

  for (const c of cases) {
    it(`rejects ${c.name} with non-zero exit and an error message`, () => {
      const r = runCli([proj, ...c.args], { env: CI_ENV });
      expect(r.status).not.toBe(0);
      expect(r.status).toBe(1);
      const combined = r.stderr + r.stdout;
      expect(combined).toContain(c.phrase);
      // Errors are surfaced on stderr (console.error), not stdout.
      expect(r.stderr).toContain(c.phrase);
    });
  }
});

describe("output channels", () => {
  // Terminal default: human-readable scan summary on stdout, exit 0.
  it("terminal default (--offline) prints human-readable content to stdout", () => {
    const proj = mkProject(npmProject({ name: "termproj" }, { express: "4.18.2" }));
    try {
      const r = runCli([proj, "--offline"], { env: CI_ENV });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("CVE Lite CLI");
      expect(r.stdout).toContain("Summary");
      // Not JSON: stdout should not parse as a JSON document.
      expect(() => JSON.parse(r.stdout)).toThrow();
    } finally {
      rmProject(proj);
    }
  });

  // Scan --json writes a timestamped FILE (cve-lite-scan-<ts>.json) to cwd,
  // not stdout. With --check-overrides the file carries an overrideFindings key.
  it("--json scan writes a timestamped JSON file with expected keys and overrideFindings", () => {
    const proj = orphanOverrideProject();
    const cwd = mkProject({});
    try {
      const r = runCli([proj, "--offline", "--json", "--check-overrides"], { cwd, env: CI_ENV });
      expect(r.status).toBe(0);

      const jsonFiles = findByExt(cwd, ".json").filter(f => f.startsWith("cve-lite-scan-"));
      expect(jsonFiles).toHaveLength(1);

      const payload = JSON.parse(readFileSync(join(cwd, jsonFiles[0]), "utf8"));
      for (const key of ["projectPath", "mode", "source", "packageCount", "findingCount", "findings"]) {
        expect(payload).toHaveProperty(key);
      }
      expect(Array.isArray(payload.findings)).toBe(true);

      // --check-overrides populates the override channel with the OA001 orphan.
      expect(payload).toHaveProperty("overrideFindings");
      expect(Array.isArray(payload.overrideFindings)).toBe(true);
      expect(payload.overrideFindings.length).toBeGreaterThan(0);
      expect(payload.overrideFindings[0].ruleId).toBe("OA001");
    } finally {
      rmProject(proj);
      rmProject(cwd);
    }
  });

  // overrides subcommand --json prints a JSON document with .findings to stdout.
  it("overrides --json prints parseable JSON with a findings array to stdout", () => {
    const proj = orphanOverrideProject();
    try {
      const r = runCli(["overrides", proj, "--json"], { env: CI_ENV });
      // Findings present but below the default fail-on threshold, so exit 0.
      const payload = JSON.parse(r.stdout);
      expect(payload).toHaveProperty("findings");
      expect(Array.isArray(payload.findings)).toBe(true);
      expect(payload.findings.length).toBeGreaterThan(0);
    } finally {
      rmProject(proj);
    }
  });

  // --sarif writes cve-lite-scan-<ts>.sarif. Valid SARIF has runs[0].tool.driver;
  // with override findings the OA tool component sits under tool.extensions.
  it("--sarif writes a valid SARIF file with the OA tool component", () => {
    const proj = orphanOverrideProject();
    const cwd = mkProject({});
    try {
      const r = runCli([proj, "--offline", "--sarif", "--check-overrides"], { cwd, env: CI_ENV });
      expect(r.status).toBe(0);

      const sarifFiles = findByExt(cwd, ".sarif");
      expect(sarifFiles).toHaveLength(1);

      const sarif = JSON.parse(readFileSync(join(cwd, sarifFiles[0]), "utf8"));
      expect(sarif.version).toBe("2.1.0");
      const run = sarif.runs[0];
      expect(run.tool.driver).toBeDefined();
      expect(run.tool.driver.name).toBe("CVE Lite CLI");

      // Override findings present -> OA component registered as an extension.
      expect(Array.isArray(run.tool.extensions)).toBe(true);
      expect(run.tool.extensions[0].name).toBe("cve-lite-cli-overrides");
    } finally {
      rmProject(proj);
      rmProject(cwd);
    }
  });

  // --report ./rep --no-open writes an HTML report (rep/index.html). With
  // --check-overrides the "Override hygiene" section is populated.
  it("--report writes HTML containing an Override hygiene section", () => {
    const proj = orphanOverrideProject();
    const cwd = mkProject({});
    try {
      const r = runCli([proj, "--offline", "--report", "./rep", "--no-open", "--check-overrides"], { cwd, env: CI_ENV });
      expect(r.status).toBe(0);

      // The binary prints the resolved report path; trust the filesystem too.
      const indexPath = join(cwd, "rep", "index.html");
      expect(existsSync(indexPath)).toBe(true);

      const html = readFileSync(indexPath, "utf8");
      expect(html).toContain("Override hygiene");
    } finally {
      rmProject(proj);
      rmProject(cwd);
    }
  });

  // --cdx writes cve-lite-scan-<ts>.cdx.json. Valid CycloneDX BOM. Per spec the
  // CycloneDX channel is CVE-only (no OA component); we assert it does not error.
  it("--cdx writes a valid CycloneDX BOM without erroring", () => {
    const proj = orphanOverrideProject();
    const cwd = mkProject({});
    try {
      const r = runCli([proj, "--offline", "--cdx", "--check-overrides"], { cwd, env: CI_ENV });
      expect(r.status).toBe(0);

      const cdxFiles = findByExt(cwd, ".cdx.json");
      expect(cdxFiles).toHaveLength(1);

      const bom = JSON.parse(readFileSync(join(cwd, cdxFiles[0]), "utf8"));
      expect(bom.bomFormat).toBe("CycloneDX");
      expect(typeof bom.specVersion).toBe("string");
    } finally {
      rmProject(proj);
      rmProject(cwd);
    }
  });
});
