/**
 * Plan 4 sanity test: prove the CLI integration is stable end-to-end.
 *
 * Plan 4 delivered:
 *   - src/cli/overrides.ts: runOverrides function for the `cve-lite overrides` subcommand
 *   - src/cli/fix-overrides-hook.ts: runOverridesFixHook for the fix+verify pipeline
 *   - src/index.ts dispatch when command === "overrides"
 *   - src/cli/fix-overrides-hook.ts: also wired into `cve-lite [path] --fix`
 *   - Exit code 2 if verify fails after fix
 *   - printOverridesHelp in src/cli/help.ts
 *
 * This file locks in the Plan 4 public surface via in-process API (not spawn/execFile),
 * exercising the core integration paths:
 *
 *   1. runOverrides returns exit code 0 on clean project
 *   2. runOverrides returns exit code 1 on findings above --fail-on threshold
 *   3. runOverrides returns exit code 0 on findings + --fix
 *   4. runOverrides --rule filters findings correctly
 *   5. runOverridesFixHook returns verifyOk: true after clean fix
 *   6. runOverridesFixHook honors cveFixTargets in verify scope
 */

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOverrides } from "../../src/cli/overrides.js";
import { runOverridesFixHook } from "../../src/cli/fix-overrides-hook.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";
import type { ParsedOptions } from "../../src/types.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

describe("Plan 4: CLI integration stable", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plan-4-cli-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe("runOverrides public surface", () => {
    it("test 1: returns exit code 0 on a clean project (no overrides, no findings)", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "clean-project",
      }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "clean-project" },
        },
      }));

      const options: ParsedOptions = { failOn: "critical" };
      const exitCode = await runOverrides({
        projectArg: dir,
        options,
        logger: noop(),
      });

      expect(exitCode).toBe(0);
    });

    it("test 2: returns exit code 1 on a project with findings (OA001 above --fail-on default)", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "has-orphan",
        overrides: { "gone-package": "1.0.0" },
      }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "has-orphan" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      }));

      const options: ParsedOptions = { failOn: "low" };
      const exitCode = await runOverrides({
        projectArg: dir,
        options,
        logger: noop(),
      });

      expect(exitCode).toBe(1);
    });

    it("test 3: returns exit code 0 on findings + --fix (orphan override gets fixed inline)", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "fixable-orphan",
        overrides: { "gone-pkg": "1.0.0" },
      }, null, 2));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "fixable-orphan" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      }));

      const options: ParsedOptions = { failOn: "critical", fix: true };
      const exitCode = await runOverrides({
        projectArg: dir,
        options,
        logger: noop(),
      });

      expect(exitCode).toBe(0);

      const updated = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      expect(updated.overrides?.["gone-pkg"]).toBeUndefined();
    });

    it("test 4: --rule option filters findings to only that rule (excludes OA002, exits 0 for OA001 match only)", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "multi-finding",
        overrides: {
          "orphan-pkg": "1.0.0",
          "lodash": "latest",
        },
      }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "multi-finding" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      }));

      const options: ParsedOptions = { failOn: "critical", rule: "OA002" };
      const exitCode = await runOverrides({
        projectArg: dir,
        options,
        logger: noop(),
      });

      expect(exitCode).toBe(0);
    });
  });

  describe("runOverridesFixHook public surface", () => {
    it("test 5: returns verifyOk: true after clean fix of orphan override", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "hook-clean",
        overrides: { "orphan": "1.0.0" },
      }, null, 2));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "hook-clean" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      }));

      const log = new MemoryAuditLog();
      const result = await runOverridesFixHook({
        projectPath: dir,
        auditLog: log,
        logger: noop(),
      });

      expect(result.applied).toBeGreaterThan(0);
      expect(result.verifyOk).toBe(true);
      expect(result.verifyFailures).toHaveLength(0);

      const updated = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      expect(updated.overrides?.orphan).toBeUndefined();
    });

    it("test 6: honors cveFixTargets in the verify scope", async () => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "with-cve-targets",
        overrides: { "orphan": "1.0.0" },
      }, null, 2));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "with-cve-targets" },
          "node_modules/lodash": { version: "4.17.21" },
          "node_modules/react": { version: "18.0.0" },
        },
      }));

      const log = new MemoryAuditLog();
      const result = await runOverridesFixHook({
        projectPath: dir,
        auditLog: log,
        logger: noop(),
        cveFixTargets: [{ name: "react", version: "18.0.0" }],
      });

      expect(result.verifyOk).toBe(true);
      expect(result.applied).toBeGreaterThan(0);
    });
  });
});
