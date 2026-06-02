import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function makeNoopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

describe("buildOverrideContext", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ctx-build-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("builds context for an npm project with one override", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { postcss: "8.5.15" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/postcss": { version: "8.5.15" },
      },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: makeNoopLogger() as any,
      checkNetwork: false,
    });

    expect(ctx.projectPath).toBe(dir);
    expect(ctx.packageManager).toBe("npm");
    expect(ctx.overrideEntries).toHaveLength(1);
    expect(ctx.overrideEntries[0].packageName).toBe("postcss");
    expect(ctx.lockfilePackageNames.has("postcss")).toBe(true);
  });

  it("flags OA001/OA004/OA006/OA008 as skipped when node_modules is absent", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { postcss: "8.5.15" },
    }));
    // No lockfile, no node_modules.

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: makeNoopLogger() as any,
      checkNetwork: false,
    });

    const ids = ctx.skippedDetectors.map((s) => s.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["OA001", "OA004", "OA006", "OA008"]));
  });
});
