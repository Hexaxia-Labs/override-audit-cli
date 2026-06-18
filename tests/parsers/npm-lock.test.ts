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

describe("package-lock parser", () => {
  it("loads package paths from modern package-lock files and filters dev packages in prod mode", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "package-lock.json");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", version: "1.0.0" },
          "node_modules/chalk": { version: "5.4.1" },
          "node_modules/react/node_modules/loose-envify": { version: "1.4.0" },
          "node_modules/jest": { version: "30.3.0", dev: true },
        },
      }),
      "utf8",
    );

    try {
      const allPackages = loadFromPackageLock(lockPath, false);
      const prodPackages = loadFromPackageLock(lockPath, true);

      expect(allPackages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "chalk", version: "5.4.1", paths: [["project", "chalk"]] }),
          expect.objectContaining({
            name: "loose-envify",
            version: "1.4.0",
            paths: [["project", "react", "loose-envify"]],
          }),
          expect.objectContaining({ name: "jest", version: "30.3.0", dev: true }),
        ]),
      );
      expect(prodPackages).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "jest" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });


  it("preserves resolved URL from package-lock.json on PackageRef", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "package-lock.json");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        name: "test",
        lockfileVersion: 3,
        packages: {
          "": { name: "test", version: "1.0.0", dependencies: { "lodash": "^4.17.21" } },
          "node_modules/lodash": {
            version: "4.17.21",
            resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
            integrity: "sha512-abc"
          }
        }
      }),
      "utf8",
    );

    try {
      const packages = loadFromPackageLock(lockPath, false);
      const lodash = packages.find(p => p.name === "lodash");

      expect(lodash?.resolvedUrl).toBe("https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz");
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves workspace prefixes in normalized package-lock paths", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "package-lock.json");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", version: "1.0.0" },
          "server/node_modules/workspace-proof-parent": { version: "1.0.0" },
          "server/node_modules/workspace-proof-parent/node_modules/braces": { version: "3.0.2" },
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromPackageLock(lockPath, false);

      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "workspace-proof-parent",
            version: "1.0.0",
            paths: [["project", "server", "workspace-proof-parent"]],
          }),
          expect.objectContaining({
            name: "braces",
            version: "3.0.2",
            paths: [["project", "server", "workspace-proof-parent", "braces"]],
          }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("reconstructs logical parent chain for hoisted transitive packages using dependency declarations", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "package-lock.json");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "fixture",
            version: "1.0.0",
            dependencies: { "react-router-dom": "5.2.0" },
          },
          "node_modules/react-router-dom": {
            version: "5.2.0",
            dependencies: { "react-router": "5.2.0" },
          },
          "node_modules/react-router": {
            version: "5.2.0",
            dependencies: { "path-to-regexp": "^1.7.0" },
          },
          "node_modules/path-to-regexp": {
            version: "1.7.0",
          },
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromPackageLock(lockPath, false);
      const pathToRegexp = packages.find(p => p.name === "path-to-regexp");

      expect(pathToRegexp).toBeDefined();
      expect(pathToRegexp?.paths).toContainEqual([
        "project",
        "react-router-dom",
        "react-router",
        "path-to-regexp",
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("falls back to legacy dependencies when packages metadata is absent", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "package-lock.json");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 1,
        dependencies: {
          react: {
            version: "18.2.0",
            dependencies: {
              "loose-envify": {
                version: "1.4.0",
              },
            },
          },
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromPackageLock(lockPath, false);

      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "react", version: "18.2.0", paths: [["project", "react"]] }),
          expect.objectContaining({
            name: "loose-envify",
            version: "1.4.0",
            paths: [["project", "react", "loose-envify"]],
          }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });
});
