import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPackages } from "../../src/parsers/index.js";
import { loadFromBunLock } from "../../src/parsers/bun-lock.js";
import { loadNpmLockGraph } from "../../src/parsers/npm-lock-graph.js";
import { loadFromPackageJson } from "../../src/parsers/package-json.js";
import { loadFromPackageLock } from "../../src/parsers/package-lock.js";
import { loadFromPnpmLock } from "../../src/parsers/pnpm-lock.js";
import { loadFromYarnLock } from "../../src/parsers/yarn-lock.js";
import { removeDir } from "../test-utils.js";

function createTempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-parser-test-"));
}

describe("package.json parser", () => {
  it("loads exact versions and tracks skipped non-exact dependencies", () => {
    const projectDir = createTempProjectDir();
    const packageJsonPath = path.join(projectDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        dependencies: {
          chalk: "5.4.1",
          debug: "^4.3.0",
        },
        optionalDependencies: {
          yaml: "2.7.1",
        },
        devDependencies: {
          jest: "30.3.0",
          typescript: "~5.8.2",
        },
      }),
      "utf8",
    );

    try {
      const result = loadFromPackageJson(packageJsonPath, false);

      expect(result.packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "chalk", version: "5.4.1", dev: false, paths: [["project", "chalk"]] }),
          expect.objectContaining({ name: "yaml", version: "2.7.1", dev: false, paths: [["project", "yaml"]] }),
          expect.objectContaining({ name: "jest", version: "30.3.0", dev: true, paths: [["project", "jest"]] }),
        ]),
      );
      expect(result.skippedDependencies).toEqual(
        expect.arrayContaining([
          "dependencies:debug@^4.3.0",
          "devDependencies:typescript@~5.8.2",
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("omits devDependencies when prodOnly is enabled", () => {
    const projectDir = createTempProjectDir();
    const packageJsonPath = path.join(projectDir, "package.json");

    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        dependencies: { chalk: "5.4.1" },
        devDependencies: { jest: "30.3.0" },
      }),
      "utf8",
    );

    try {
      const result = loadFromPackageJson(packageJsonPath, true);

      expect(result.packages).toEqual([
        expect.objectContaining({ name: "chalk", version: "5.4.1", dev: false }),
      ]);
      expect(result.packages).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "jest" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });
});
