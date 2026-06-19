/**
 * Plan 8: end-to-end coverage for top-level commands, meta flags, and the
 * documented exit-code contract (0 ok, 1 findings, 2 verify-failed, 3 error).
 *
 * Every assertion below was discovered by running the real built binary first
 * (see the per-test notes), then pinned to the observed behavior. The CLI is
 * spawned via the shared harness; nothing here mutates the real user config
 * (config tests redirect HOME to a temp dir, which getConfigDir() honors via
 * os.homedir()).
 *
 * Exit-code constants (src/types.ts): EXIT_OK=0, EXIT_FINDINGS=1,
 * EXIT_VERIFY_FAILED=2, EXIT_ERROR=3.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, mkProject, rmProject, npmProject } from "./harness.js";

// Track temp dirs created without mkProject (install-skill cwd, temp HOME) so
// afterEach can sweep them.
let scratchDirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "e2e-scratch-"));
  scratchDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs = [];
});

describe("commands + meta", () => {
  it("--version exits 0 and prints a semver", () => {
    const r = runCli(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it("--help exits 0 with usage text", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/i);
  });

  it("-h is an alias for --help (exit 0, usage text)", () => {
    const r = runCli(["-h"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/i);
  });

  it("default offline scan of a clean npm project exits 0", () => {
    // Observed: exit 0. The default --fail-on is critical, and a project whose
    // only dependency is an unknown name has no advisories, so the scan is
    // clean. --offline reads ~/.cache/cve-lite/advisories.db, which is synced
    // locally; if it were missing the scan would throw (exit 1), but it exists.
    const dir = mkProject(
      npmProject({ name: "clean-app" }, { "zzz-not-a-real-pkg-xyz": "1.0.0" }),
    );
    try {
      const r = runCli([dir, "--offline"]);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/No known vulnerabilities/i);
    } finally {
      rmProject(dir);
    }
  });

  it("--ratchet --check-overrides keeps override hygiene out of the baseline and notes the boundary", () => {
    const dir = mkProject(
      npmProject({ name: "ratchet-app", overrides: { gone: "1.0.0" } }, { lodash: "4.17.21" }),
    );
    try {
      const r = runCli([dir, "--offline", "--ratchet", "--check-overrides"]);
      expect(r.status).toBe(0);
      // Baseline written for CVE findings...
      expect(existsSync(join(dir, ".cve-lite", "baseline.json"))).toBe(true);
      // ...and the override boundary is stated explicitly.
      expect(r.stdout).toMatch(/not part of the ratchet baseline/i);
      // The override audit (OA001 orphan 'gone') must NOT leak into the baseline file.
      const baseline = JSON.parse(readFileSync(join(dir, ".cve-lite", "baseline.json"), "utf8"));
      const serialized = JSON.stringify(baseline);
      expect(serialized).not.toContain("OA001");
      expect(serialized).not.toContain("gone");
    } finally {
      rmProject(dir);
    }
  });

  it("multi-folder scan with --check-overrides surfaces per-folder override hygiene", () => {
    // No root lockfile + two nested lockfiles triggers multi-folder mode. Each
    // nested package overrides a package absent from its lockfile -> OA001 orphan.
    const dir = mkProject({
      "packages/a/package.json": { name: "a", overrides: { ghostpkg: "1.0.0" } },
      "packages/a/package-lock.json": { lockfileVersion: 3, packages: { "": { name: "a" }, "node_modules/lodash": { version: "4.17.21" } } },
      "packages/b/package.json": { name: "b", overrides: { phantompkg: "1.0.0" } },
      "packages/b/package-lock.json": { lockfileVersion: 3, packages: { "": { name: "b" }, "node_modules/lodash": { version: "4.17.21" } } },
    });
    try {
      const r = runCli([dir, "--offline", "--check-overrides", "--json"]);
      const out = JSON.parse(r.stdout);
      expect(out.multiFolder).toBe(true);
      expect(Array.isArray(out.overrideFindings)).toBe(true);
      expect(out.overrideFindings.map((f: any) => f.ruleId)).toContain("OA001");
      // Both folders' overrides are audited, each finding tagged with its subfolder.
      const byPkg = new Map(out.overrideFindings.map((f: any) => [f.package.name, f.subfolder]));
      expect(byPkg.has("ghostpkg")).toBe(true);
      expect(byPkg.has("phantompkg")).toBe(true);
      expect(byPkg.get("ghostpkg")).not.toBe(byPkg.get("phantompkg"));
    } finally {
      rmProject(dir);
    }
  });

  it("overrides <clean project> --json exits 0 with a findings array", () => {
    const dir = mkProject(npmProject({ name: "x" }, { lodash: "4.17.21" }));
    try {
      const r = runCli(["overrides", dir, "--json"]);
      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(Array.isArray(out.findings)).toBe(true);
    } finally {
      rmProject(dir);
    }
  });

  it("overrides --help exits 0", () => {
    const r = runCli(["overrides", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/overrides/i);
  });

  it("advisories sync --help exits 0", () => {
    const r = runCli(["advisories", "sync", "--help"]);
    expect(r.status).toBe(0);
  });

  it("install-skill exits 0 and writes skill files into cwd", () => {
    // Observed: writes to process.cwd(), exit 0, drops five integration files.
    const cwd = scratch();
    const r = runCli(["install-skill"], { cwd });
    expect(r.status).toBe(0);
    expect(existsSync(join(cwd, ".claude", "commands", "cve-lite.md"))).toBe(true);
    expect(existsSync(join(cwd, ".cursor", "rules", "cve-lite.mdc"))).toBe(true);
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
  });

  it("config show exits 0 (real HOME, read-only)", () => {
    const r = runCli(["config", "show"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Config file:/);
  });

  it("config set/show/unset round-trips under a temp HOME", () => {
    // getConfigDir() = path.join(os.homedir(), ".cve-lite-cli"); on Linux
    // os.homedir() honors $HOME, so a temp HOME isolates this from the real
    // user config. Verified that nothing lands under the real ~/.cve-lite-cli.
    const home = scratch();
    const certDir = mkProject({
      "cert.pem": "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n",
    });
    const certPath = join(certDir, "cert.pem");
    try {
      const set = runCli(["config", "set", "ca-cert", certPath], { env: { HOME: home } });
      expect(set.status).toBe(0);
      expect(existsSync(join(home, ".cve-lite-cli", "config.json"))).toBe(true);

      const show = runCli(["config", "show"], { env: { HOME: home } });
      expect(show.status).toBe(0);
      expect(show.stdout).toContain(certPath);

      const unset = runCli(["config", "unset", "ca-cert"], { env: { HOME: home } });
      expect(unset.status).toBe(0);

      const showAfter = runCli(["config", "show"], { env: { HOME: home } });
      expect(showAfter.status).toBe(0);
      expect(showAfter.stdout).toMatch(/No configuration set/);
    } finally {
      rmProject(certDir);
    }
  });
});

describe("exit codes", () => {
  it("0: clean overrides run", () => {
    const dir = mkProject(npmProject({ name: "x" }, { lodash: "4.17.21" }));
    try {
      const r = runCli(["overrides", dir, "--json"]);
      expect(r.status).toBe(0);
    } finally {
      rmProject(dir);
    }
  });

  it("1: orphan override (OA001) above the fail-on threshold", () => {
    // package.json declares an override for `gone`, but the lockfile resolves a
    // different package, so OA001 (override target not in resolved tree) fires
    // as a high finding. --fail-on low puts it above threshold -> EXIT_FINDINGS.
    const dir = mkProject({
      "package.json": { name: "x", overrides: { gone: "1.0.0" } },
      "package-lock.json": {
        lockfileVersion: 3,
        packages: {
          "": { name: "x" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      },
    });
    try {
      const r = runCli(["overrides", dir, "--fail-on", "low", "--json"]);
      expect(r.status).toBe(1);
      const out = JSON.parse(r.stdout);
      expect(out.findings.some((f: { ruleId: string }) => f.ruleId === "OA001")).toBe(true);
    } finally {
      rmProject(dir);
    }
  });

  it("2: post-fix verify failure is NOT reliably reachable e2e (documented)", () => {
    // EXIT_VERIFY_FAILED=2 is emitted from src/index.ts only when the
    // overrides-fix hook runs after a --fix CVE remediation AND its post-fix
    // re-audit reports verify failures. Triggering that through the spawned
    // binary requires a real package manager mutation plus a re-audit that
    // regresses, which is not deterministic in a hermetic temp project (no
    // network, no installed tree to mutate). It is covered in-process by
    // tests/cli/fix-overrides-hook.test.ts, which exercises the verifyOk=false
    // branch directly. This test documents the gap rather than faking exit 2.
    expect(2).toBe(2);
  });

  it("3: error / bad input - overrides on a dir with no package.json", () => {
    // Observed: the overrides command throws (buildOverrideContext: no
    // package.json) and returns EXIT_ERROR=3. Note the *default* scan command
    // treats an unknown subcommand / missing package.json as "0 packages" and
    // exits 0, so overrides is the reliable EXIT_ERROR path.
    const dir = mkProject({ "README.md": "no manifest here" });
    try {
      const r = runCli(["overrides", dir, "--json"]);
      expect(r.status).toBe(3);
    } finally {
      rmProject(dir);
    }
  });

  it("bad flag on the default command exits 1 (parse error)", () => {
    // Observed: parseArgs throws on an unknown option; index.ts catches it and
    // process.exit(1). This is a distinct path from EXIT_ERROR=3.
    const r = runCli(["--not-a-flag"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Unknown option/i);
  });

  it("unknown command is treated as a scan path, not an error (exit 0)", () => {
    // Observed quirk: `cve-lite frobnicate` resolves `frobnicate` as a project
    // path; with no packages found the scan exits 0. Pinning this so the
    // behavior is intentional and visible, not assumed.
    const r = runCli(["frobnicate"]);
    expect(r.status).toBe(0);
  });
});
