import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NdjsonAuditLog } from "../../src/audit-log/ndjson-writer.js";

describe("NdjsonAuditLog", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-test-"));
    path = join(dir, "audit.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes one JSON object per line", () => {
    const log = new NdjsonAuditLog(path);
    log.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: { fix: false },
    });
    log.emit({
      ts: "2026-05-28T00:00:01.000Z",
      type: "scan.finished",
      schemaVersion: 1,
      durationMs: 100,
      findingsCount: 0,
      exitCode: 0,
    });
    log.close();

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe("scan.started");
    expect(JSON.parse(lines[1]).type).toBe("scan.finished");
  });

  it("isNoOp is false for the real writer", () => {
    const log = new NdjsonAuditLog(path);
    expect(log.isNoOp).toBe(false);
    log.close();
  });

  it("appends to existing file (does not truncate)", () => {
    const a = new NdjsonAuditLog(path);
    a.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "error",
      schemaVersion: 1,
      phase: "first",
      message: "x",
    });
    a.close();
    const b = new NdjsonAuditLog(path);
    b.emit({
      ts: "2026-05-28T00:00:01.000Z",
      type: "error",
      schemaVersion: 1,
      phase: "second",
      message: "y",
    });
    b.close();

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).phase).toBe("first");
    expect(JSON.parse(lines[1]).phase).toBe("second");
  });

  it("emit after close throws", () => {
    const log = new NdjsonAuditLog(path);
    log.close();
    expect(() =>
      log.emit({
        ts: "2026-05-28T00:00:00.000Z",
        type: "error",
        schemaVersion: 1,
        phase: "p",
        message: "m",
      })
    ).toThrow(/closed/i);
  });
});
