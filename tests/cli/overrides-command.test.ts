import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../../dist/index.js");

describe("cve-lite overrides (end-to-end)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "overrides-e2e-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns 0 on a clean project", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" } },
    }));
    const out = execFileSync(process.execPath, [CLI, "overrides", dir, "--json"]);
    const result = JSON.parse(out.toString());
    expect(result.findings).toHaveLength(0);
  });

  it("returns 1 on a project with an orphan override above --fail-on", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [CLI, "overrides", dir, "--json", "--fail-on", "high"]);
    } catch (err: any) {
      exitCode = err.status ?? -1;
    }
    expect(exitCode).toBe(1);
  });
});
