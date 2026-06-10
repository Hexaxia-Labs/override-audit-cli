/**
 * Plan 8: end-to-end coverage for the --fix tiering gate, post-fix exit codes,
 * and the audit-log + scan integration surfaces. Spawns the real built CLI and
 * asserts on files written to disk, NDJSON contents, and exit codes.
 *
 * Notes on coverage gaps (documented, not faked):
 *  - Exit 2 (EXIT_VERIFY_FAILED, post-fix verify failure) is not reachable from
 *    the spawnable `overrides --fix` path: that path returns EXIT_OK/EXIT_FINDINGS
 *    and never runs the verify hook. The verify-failure substrate (verifyOk=false)
 *    is exercised in-process in tests/cli/fix-overrides-hook.test.ts.
 */

import { readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runCli,
  mkProject,
  rmProject,
  npmProject,
  installedManifest,
} from "./harness.js";

/** Read the project package.json back off disk after the CLI mutated it. */
function readPkg(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

/** Parse an NDJSON audit-log file into an array of events. */
function readNdjson(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/**
 * Project that triggers OA006 (coupled platform binary): an override on a
 * platform binary whose exact-pinned parent (esbuild) is installed under
 * node_modules. The override value is a concrete version (not a floating tag)
 * so OA002 stays silent and OA006 is the only finding - isolating the tier-2
 * (proposed) relocate fix.
 */
function makeOa006Project(): string {
  const dir = mkProject(
    npmProject(
      { name: "oa6", overrides: { "@esbuild/linux-x64": "0.25.0" } },
      { esbuild: "0.25.12", "@esbuild/linux-x64": "0.25.0" }
    )
  );
  installedManifest(dir, "esbuild", {
    name: "esbuild",
    version: "0.25.12",
    optionalDependencies: { "@esbuild/linux-x64": "0.25.12" },
  });
  installedManifest(dir, "@esbuild/linux-x64", {
    name: "@esbuild/linux-x64",
    version: "0.25.0",
  });
  return dir;
}

/** Project with a single orphan override (OA001): `gone` is not in the lockfile. */
function makeOrphanProject(): string {
  return mkProject(
    npmProject({ name: "x", overrides: { gone: "1.0.0" } }, { lodash: "4.17.21" })
  );
}

describe("e2e: overrides --fix tiering", () => {
  it("Tier 1 auto-apply: orphan override (OA001) is removed by --fix, exit 0", () => {
    const dir = makeOrphanProject();
    try {
      // Sanity: OA001 is present before the fix.
      const before = runCli(["overrides", dir, "--json"]);
      expect(before.status).toBe(0);
      expect(JSON.parse(before.stdout).findings.map((f: any) => f.ruleId)).toContain(
        "OA001"
      );

      const fix = runCli(["overrides", dir, "--fix"]);
      expect(fix.status).toBe(0);

      // Re-read the on-disk package.json: the orphan override is gone.
      const overrides = readPkg(dir).overrides as Record<string, unknown>;
      expect(overrides.gone).toBeUndefined();
    } finally {
      rmProject(dir);
    }
  });

  it("Tier 2 NOT auto-applied: OA006 relocate (proposed) survives --fix", () => {
    const dir = makeOa006Project();
    try {
      // OA006 is the only finding and its fix is tier "proposed".
      const before = runCli(["overrides", dir, "--json"]);
      expect(before.status).toBe(0);
      const beforeFindings = JSON.parse(before.stdout).findings;
      expect(beforeFindings.map((f: any) => f.ruleId)).toEqual(["OA006"]);
      expect(beforeFindings[0].fix.tier).toBe("proposed");

      const fix = runCli(["overrides", dir, "--fix"]);
      expect(fix.status).toBe(0);

      // The override must still be present and unrelocated: no /dependencies/esbuild
      // floor was written, and the binary override value is unchanged.
      const pkg = readPkg(dir);
      const overrides = pkg.overrides as Record<string, unknown>;
      expect(overrides["@esbuild/linux-x64"]).toBe("0.25.0");
      expect(pkg.dependencies).toBeUndefined();

      // And OA006 still fires on a re-run (the proposed fix was not consumed).
      const after = runCli(["overrides", dir, "--json"]);
      expect(JSON.parse(after.stdout).findings.map((f: any) => f.ruleId)).toContain(
        "OA006"
      );
    } finally {
      rmProject(dir);
    }
  });

  it("--fix exits 0 on the clean-after-fix case (orphan removed, nothing left)", () => {
    const dir = makeOrphanProject();
    try {
      const fix = runCli(["overrides", dir, "--fix"]);
      expect(fix.status).toBe(0);
      // A second --fix on the now-clean project is also exit 0.
      const again = runCli(["overrides", dir, "--fix"]);
      expect(again.status).toBe(0);
      // Exit 2 (post-fix verify failure) is not reachable from this spawnable
      // path; the verify-failure substrate is covered in-process in
      // tests/cli/fix-overrides-hook.test.ts (verifyOk=false assertions).
    } finally {
      rmProject(dir);
    }
  });
});

describe("e2e: audit-log + scan integration", () => {
  let logDir: string;
  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "e2e-log-"));
  });
  afterEach(() => {
    rmSync(logDir, { recursive: true, force: true });
  });

  it("scan --offline --audit-log writes scan.started and scan.finished", () => {
    const dir = makeOrphanProject();
    const logPath = join(logDir, "scan.ndjson");
    try {
      const r = runCli([dir, "--offline", "--audit-log", logPath]);
      expect(r.status).toBe(0);
      const types = new Set(readNdjson(logPath).map((e) => e.type));
      expect(types.has("scan.started")).toBe(true);
      expect(types.has("scan.finished")).toBe(true);
    } finally {
      rmProject(dir);
    }
  });

  it("overrides --audit-log emits oa.detected with ruleId OA001", () => {
    const dir = makeOrphanProject();
    const logPath = join(logDir, "oa.ndjson");
    try {
      const r = runCli(["overrides", dir, "--audit-log", logPath]);
      expect(r.status).toBe(0);
      const events = readNdjson(logPath);
      const detected = events.filter((e) => e.type === "oa.detected");
      expect(detected.length).toBeGreaterThan(0);
      expect(detected.map((e) => e.ruleId)).toContain("OA001");
    } finally {
      rmProject(dir);
    }
  });

  it("--check-overrides --json writes a scan json with overrideFindings (OA001)", () => {
    const dir = makeOrphanProject();
    // The scan json lands in process.cwd(); point cwd at a temp dir so we can
    // find and clean it up.
    const cwd = mkdtempSync(join(tmpdir(), "e2e-cwd-"));
    try {
      const r = runCli([dir, "--offline", "--check-overrides", "--json"], { cwd });
      expect(r.status).toBe(0);

      const scanFiles = readdirSync(cwd).filter((f) =>
        /^cve-lite-scan-.*\.json$/.test(f)
      );
      expect(scanFiles.length).toBe(1);

      const scan = JSON.parse(readFileSync(join(cwd, scanFiles[0]), "utf8"));
      expect(Array.isArray(scan.overrideFindings)).toBe(true);
      expect(scan.overrideFindings.map((f: any) => f.ruleId)).toContain("OA001");
    } finally {
      rmProject(dir);
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("--check-overrides renders the override section in the terminal (#35)", () => {
    // Regression guard: --check-overrides must SHOW override findings on screen,
    // not only thread them into --json/--sarif/--report. Plain terminal scan.
    const dir = makeOrphanProject();
    try {
      const r = runCli([dir, "--offline", "--check-overrides"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/Override hygiene/i);
      expect(r.stdout).toContain("OA001");
    } finally {
      rmProject(dir);
    }
  });

  it("CVE_LITE_AUDIT_LOG env var writes the same scan events as --audit-log", () => {
    const dir = makeOrphanProject();
    const logPath = join(logDir, "env.ndjson");
    try {
      const r = runCli([dir, "--offline"], {
        env: { CVE_LITE_AUDIT_LOG: logPath },
      });
      expect(r.status).toBe(0);
      const types = new Set(readNdjson(logPath).map((e) => e.type));
      expect(types.has("scan.started")).toBe(true);
      expect(types.has("scan.finished")).toBe(true);
    } finally {
      rmProject(dir);
    }
  });
});
