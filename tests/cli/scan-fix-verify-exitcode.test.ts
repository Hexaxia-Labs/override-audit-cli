import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../../dist/index.js");

describe("cve-lite [path] --fix exit codes", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "scan-fix-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns 0 when --fix applies OA fixes and verify passes", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    let exitCode: number = -1;
    try {
      execFileSync(process.execPath, [CLI, dir, "--fix", "--offline"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      exitCode = 0;
    } catch (err: any) {
      exitCode = err.status ?? -1;
    }
    expect(exitCode).toBe(0);

    // Confirm the OA fix landed
    const updated = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(updated.overrides?.gone).toBeUndefined();
  });
});
