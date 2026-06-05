import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../../dist/index.js");

describe("audit-log full event sequence", () => {
  let dir: string;
  let logPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-e2e-"));
    logPath = join(dir, "audit.ndjson");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("captures scan.started, scan.finished on a clean scan", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    try {
      execFileSync(process.execPath, [CLI, dir, "--audit-log", logPath, "--offline"]);
    } catch { /* exit code irrelevant for this test */ }

    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    const types = lines.map((l) => JSON.parse(l).type as string);
    expect(types).toContain("scan.started");
    expect(types).toContain("scan.finished");
  });

  it("captures oa.detected on a project with an orphan override", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    try {
      execFileSync(process.execPath, [CLI, "overrides", dir, "--audit-log", logPath]);
    } catch { /* exit code irrelevant */ }

    const lines = readFileSync(logPath, "utf8").trim().split("\n").filter((l) => l.length > 0);
    const events = lines.map((l) => JSON.parse(l));
    expect(events.find((e) => e.type === "oa.detected" && e.ruleId === "OA001")).toBeDefined();
  });
});
