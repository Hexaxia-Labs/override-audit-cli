import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, verify } from "../../src/overrides/api.js";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

function noopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
}

describe("api emits expected audit-log events", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "api-log-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("audit() emits one oa.detected per finding", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { "not-in-tree": "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/other": { version: "1.0.0" } },
    }));

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noopLogger(), checkNetwork: false });
    await audit(ctx, { checkNetwork: false });

    const detected = log.events.filter((e) => e.type === "oa.detected");
    expect(detected.length).toBeGreaterThan(0);
    expect(detected[0]).toMatchObject({ schemaVersion: 1, ruleId: "OA001", package: "not-in-tree" });
  });

  it("verify() emits verify.passed on clean targets", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { lodash: "4.17.21" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/lodash": { version: "4.17.21" } },
    }));

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noopLogger(), checkNetwork: false });
    await verify([{ name: "lodash", version: "4.17.21" }], ctx);

    const passed = log.events.find((e) => e.type === "verify.passed");
    expect(passed).toBeDefined();
  });

  it("verify() emits verify.failed when a target is orphan", async () => {
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

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noopLogger(), checkNetwork: false });
    await verify([{ name: "lodash" }], ctx);

    const failed = log.events.find((e) => e.type === "verify.failed") as any;
    expect(failed).toBeDefined();
    expect(failed.failures[0]).toMatchObject({ ruleId: "OA001", package: "lodash" });
  });
});
