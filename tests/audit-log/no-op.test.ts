import { NullAuditLog } from "../../src/audit-log/handle.js";

describe("NullAuditLog (no-op handle)", () => {
  it("emit is callable and returns undefined", () => {
    const h = new NullAuditLog();
    const result = h.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: {},
    });
    expect(result).toBeUndefined();
  });

  it("close is callable and returns undefined", () => {
    const h = new NullAuditLog();
    expect(h.close()).toBeUndefined();
  });

  it("is recognizably a no-op via isNoOp flag", () => {
    const h = new NullAuditLog();
    expect(h.isNoOp).toBe(true);
  });
});
