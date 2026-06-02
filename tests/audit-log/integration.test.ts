import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuditLog, type AuditEvent } from "../../src/audit-log/index.js";

describe("audit-log integration (factory + round trip)", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-itest-"));
    path = join(dir, "audit.ndjson");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("createAuditLog(undefined) returns a no-op handle", () => {
    const h = createAuditLog(undefined);
    expect(h.isNoOp).toBe(true);
  });

  it("createAuditLog(path) returns a real writer that round-trips events", () => {
    const h = createAuditLog(path);
    expect(h.isNoOp).toBe(false);

    const events: AuditEvent[] = [
      {
        ts: "2026-05-28T00:00:00.000Z",
        type: "scan.started",
        schemaVersion: 1,
        projectPath: dir,
        mode: "resolved-lockfile",
        source: "package-lock",
        flags: { fix: true, json: false },
      },
      {
        ts: "2026-05-28T00:00:00.500Z",
        type: "cve.detected",
        schemaVersion: 1,
        package: { name: "lodash", version: "4.17.20" },
        severity: "high",
        cveAliases: ["CVE-2021-23337"],
        vulnerabilityIds: ["GHSA-35jh-r3h4-6jhm"],
      },
      {
        ts: "2026-05-28T00:00:01.000Z",
        type: "scan.finished",
        schemaVersion: 1,
        durationMs: 1000,
        findingsCount: 1,
        exitCode: 1,
      },
    ];
    for (const e of events) h.emit(e);
    h.close();

    const parsed = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AuditEvent);
    expect(parsed).toEqual(events);
  });
});
