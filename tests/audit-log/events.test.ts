import type { AuditEvent } from "../../src/audit-log/events.js";

describe("audit-log event vocabulary", () => {
  it("discriminates events by type", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/tmp/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: { fix: false, json: false },
    };
    expect(e.type).toBe("scan.started");
  });

  it("oa.detected carries ruleId, severity, package", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "oa.detected",
      schemaVersion: 1,
      ruleId: "OA001",
      severity: "high",
      package: "postcss",
      message: "Override target not in resolved tree",
    };
    expect(e.ruleId).toBe("OA001");
  });

  it("verify.failed carries an array of failures", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "verify.failed",
      schemaVersion: 1,
      failures: [{ ruleId: "OA008", package: "lodash", reason: "vulnerable copy at node_modules/foo/node_modules/lodash" }],
    };
    expect(e.failures).toHaveLength(1);
  });
});
