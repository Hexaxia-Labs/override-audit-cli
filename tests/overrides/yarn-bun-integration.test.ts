import { join } from "node:path";
import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

const YARN_FIXTURE = join(process.cwd(), "tests/fixtures/yarn-classic-with-resolutions");
const BUN_FIXTURE = join(process.cwd(), "tests/fixtures/bun-with-overrides");

describe("Plan 3.5: audit() against yarn and bun fixtures", () => {
  it("yarn-classic-with-resolutions: detects OA001 on completely-unused-pkg", async () => {
    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(YARN_FIXTURE, {
      auditLog: log,
      logger: noop(),
      checkNetwork: false,
    });

    expect(ctx.packageManager).toBe("yarn");
    expect(ctx.overrideEntries).toHaveLength(2);
    expect(ctx.lockfilePackageNames.has("lodash")).toBe(true);
    expect(ctx.lockfilePackageNames.has("completely-unused-pkg")).toBe(false);

    const result = await audit(ctx, { checkNetwork: false });
    const oa001 = result.findings.find((f) => f.ruleId === "OA001");
    expect(oa001).toBeDefined();
    expect(oa001!.package.name).toBe("completely-unused-pkg");
  });

  it("bun-with-overrides: detects OA001 on completely-unused-pkg", async () => {
    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(BUN_FIXTURE, {
      auditLog: log,
      logger: noop(),
      checkNetwork: false,
    });

    expect(ctx.packageManager).toBe("bun");
    expect(ctx.overrideEntries).toHaveLength(2);

    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBeGreaterThan(0);
    const ruleIds = result.findings.map((f) => f.ruleId);
    expect(ruleIds).toContain("OA001");
  });
});
