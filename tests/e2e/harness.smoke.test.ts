/**
 * Plan 8 Task 1: prove the e2e harness works - dist is built (globalSetup) and
 * runCli spawns the real binary.
 */

import { runCli, mkProject, rmProject, npmProject } from "./harness.js";

describe("e2e harness", () => {
  it("spawns the built CLI for --version (exit 0)", () => {
    const r = runCli(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it("mkProject + runCli round-trip: overrides on a clean project exits 0", () => {
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
});
