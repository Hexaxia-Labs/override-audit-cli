import { existsSync } from "node:fs";
import { join } from "node:path";
import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

const noop = () =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }) as any;

describe("Plan 3 API smoke test", () => {
  it("audit() runs end-to-end against cve-lite-ref/examples/ghost via the public barrel", async () => {
    const project = join(process.cwd(), "cve-lite-ref/examples/ghost");
    if (!existsSync(join(project, "package.json"))) {
      console.log(`skip: ${project} not present`);
      return;
    }

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(project, {
      auditLog: log,
      logger: noop(),
      checkNetwork: false,
    });

    const result = await audit(ctx, { checkNetwork: false });

    expect(result.findings.length).toBeGreaterThan(0);
    const detected = log.events.filter((e) => e.type === "oa.detected");
    expect(detected.length).toBe(result.findings.length);
    console.log(
      `Ghost audit (Plan 3 API): ${result.findings.length} findings, ${detected.length} oa.detected events`,
    );
  });
});
