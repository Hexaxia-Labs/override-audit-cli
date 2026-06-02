import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, verify } from "../../src/overrides/api.js";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function noopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
}

describe("audit()", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "audit-api-test-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns findings for a project with an orphan override (OA001)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { "not-in-tree": "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/other": { version: "1.0.0" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.some((f) => f.ruleId === "OA001")).toBe(true);
  });

  it("returns empty findings for a clean project", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings).toHaveLength(0);
  });
});

describe("verify()", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "verify-test-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes when targets are clean", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { lodash: "4.17.21" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/lodash": { version: "4.17.21" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await verify([{ name: "lodash", version: "4.17.21" }], ctx);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("fails when target is orphan (OA001 fires)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { lodash: "4.17.21" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/other-package": { version: "1.0.0" },
      },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await verify([{ name: "lodash" }], ctx);
    expect(result.ok).toBe(false);
    expect(result.findings.find((f) => f.ruleId === "OA001")).toBeDefined();
  });
});
