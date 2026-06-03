import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOverridesFixHook } from "../../src/cli/fix-overrides-hook.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

function noop() { return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any; }

describe("runOverridesFixHook", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fix-hook-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies an OA001 fix and verifies clean", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
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
    const updated = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(updated.overrides?.gone).toBeUndefined();
  });

  it("returns verifyOk=false when cve-fixed package still has OA issues", async () => {
    // Scenario: cve-lite bumped lodash as part of a CVE fix, but the project
    // still has an orphan override for a different package that we don't fix.
    // Verify runs on the CVE-touched targets (lodash) and passes, but we also
    // use the filterFindings to simulate an incomplete OA fix scenario.
    // Actually, to test verify failure: if we apply a fix but the target package
    // still appears in the final audit, verify will return false.
    // Simpler: leave an orphan unfixed and pass it in cveFixTargets.
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { nonexistent: "1.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    const log = new MemoryAuditLog();
    const result = await runOverridesFixHook({
      projectPath: dir,
      auditLog: log,
      logger: noop(),
      // Pretend CVE fix touched nonexistent, but don't fix the OA001 issue
      cveFixTargets: [{ name: "nonexistent" }],
      filterFindings: () => [], // block all OA fixes
    });

    expect(result.applied).toBe(0); // we blocked all OA fixes
    expect(result.verifyOk).toBe(false); // verify finds OA001 for nonexistent
    expect(result.verifyFailures.length).toBeGreaterThan(0);
  });

  it("verifies CVE-fix targets even when no OA fix is needed", async () => {
    // Simulates the post-`npm install` state where the package manager already upgraded
    // a package and there are no override-related fixes to apply. Verify still runs
    // against the cveFixTargets to catch any OA001/OA008 issues.
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { lodash: "4.17.21" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    const log = new MemoryAuditLog();
    const result = await runOverridesFixHook({
      projectPath: dir,
      auditLog: log,
      logger: noop(),
      cveFixTargets: [{ name: "lodash", version: "4.17.21" }],
    });

    expect(result.applied).toBe(0); // no OA fix needed for matching pin
    // verify() runs over the CVE-fix targets; should pass since lodash is in lockfile
    expect(result.verifyOk).toBe(true);
  });
});
