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

describe("loadPackages", () => {
  it("detects bun.lock at the root and reports bun-lock source", () => {
    const projectDir = createTempProjectDir();

    fs.writeFileSync(
      path.join(projectDir, "bun.lock"),
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: { "": { name: "fixture", dependencies: { chalk: "^5.0.0" } } },
        packages: { "chalk": ["chalk@5.4.1", "", {}, "sha512-abc"] },
      }),
      "utf8",
    );

    try {
      const result = loadPackages(projectDir, false, 4);

      expect(result.source).toBe("bun-lock");
      expect(path.basename(result.filePath ?? "")).toBe("bun.lock");
      expect(result.mode).toBe("resolved-lockfile");
      expect(result.warnings).toEqual([]);
      expect(result.packages).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "chalk", version: "5.4.1" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("prefers a root lockfile over nested lockfiles", () => {
    const projectDir = createTempProjectDir();
    const nestedDir = path.join(projectDir, "packages", "app");
    fs.mkdirSync(nestedDir, { recursive: true });

    fs.writeFileSync(
      path.join(projectDir, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/chalk": { version: "5.4.1" },
        },
      }),
      "utf8",
    );

    fs.writeFileSync(
      path.join(nestedDir, "pnpm-lock.yaml"),
      `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      react:
        version: 18.2.0
packages:
  react@18.2.0: {}
`,
      "utf8",
    );

    try {
      const result = loadPackages(projectDir, false, 4);

      expect(result.source).toBe("package-lock");
      expect(path.basename(result.filePath ?? "")).toBe("package-lock.json");
      expect(result.warnings).toEqual([]);
      expect(result.packages).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "chalk", version: "5.4.1" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("detects npm-shrinkwrap.json at root and reports npm-shrinkwrap source", () => {
    const projectDir = createTempProjectDir();

    fs.writeFileSync(
      path.join(projectDir, "npm-shrinkwrap.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/lodash": { version: "4.17.21" },
        },
      }),
      "utf8",
    );

    try {
      const result = loadPackages(projectDir, false, 4);

      expect(result.source).toBe("npm-shrinkwrap");
      expect(path.basename(result.filePath ?? "")).toBe("npm-shrinkwrap.json");
      expect(result.mode).toBe("resolved-lockfile");
      expect(result.warnings).toEqual([]);
      expect(result.packages).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "lodash", version: "4.17.21" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("prefers npm-shrinkwrap.json over package-lock.json when both exist", () => {
    const projectDir = createTempProjectDir();

    fs.writeFileSync(
      path.join(projectDir, "npm-shrinkwrap.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/lodash": { version: "4.17.21" },
        },
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectDir, "package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": {},
          "node_modules/express": { version: "4.18.0" },
        },
      }),
      "utf8",
    );

    try {
      const result = loadPackages(projectDir, false, 4);

      expect(result.source).toBe("npm-shrinkwrap");
      expect(path.basename(result.filePath ?? "")).toBe("npm-shrinkwrap.json");
      expect(result.packages).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "lodash" })]),
      );
      expect(result.packages.map(p => p.name)).not.toContain("express");
    } finally {
      removeDir(projectDir);
    }
  });

  it("falls back to package.json and surfaces the npmrc package-lock warning", () => {
    const projectDir = createTempProjectDir();

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        dependencies: {
          chalk: "5.4.1",
          debug: "^4.3.0",
        },
      }),
      "utf8",
    );
    fs.writeFileSync(path.join(projectDir, ".npmrc"), "package-lock=false\n", "utf8");

    try {
      const result = loadPackages(projectDir, false, 3);

      expect(result.mode).toBe("manifest-fallback");
      expect(result.source).toBe("package-json");
      expect(result.packages).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "chalk", version: "5.4.1" })]),
      );
      expect(result.skippedDependencies).toContain("dependencies:debug@^4.3.0");
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          "No supported lockfile was found, so the scanner fell back to package.json.",
          expect.stringContaining("This repo disables package-lock generation in .npmrc."),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });
});
