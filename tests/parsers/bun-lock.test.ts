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

describe("bun.lock parser", () => {
  it("parses packages including scoped names and extracts name and version", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          "": {
            name: "fixture",
            dependencies: { chalk: "^5.0.0" },
            devDependencies: { jest: "^30.0.0" },
          },
        },
        packages: {
          "chalk": ["chalk@5.4.1", "", {}, "sha512-abc"],
          "@babel/core": ["@babel/core@7.29.0", "", {}, "sha512-def"],
          "jest": ["jest@30.3.0", "", {}, "sha512-ghi"],
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromBunLock(lockPath, false);

      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "chalk", version: "5.4.1", dev: false, paths: [["project", "chalk"]] }),
          expect.objectContaining({ name: "@babel/core", version: "7.29.0", dev: false }),
          expect.objectContaining({ name: "jest", version: "30.3.0", dev: true }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("tolerates trailing commas (JSONC format)", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "fixture",
      "dependencies": {
        "chalk": "^5.0.0",
      },
    },
  },
  "packages": {
    "chalk": ["chalk@5.4.1", "", {}, "sha512-abc"],
  },
}`,
      "utf8",
    );

    try {
      const packages = loadFromBunLock(lockPath, false);
      expect(packages).toEqual([
        expect.objectContaining({ name: "chalk", version: "5.4.1" }),
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("marks a package as dev only when it appears in devDependencies but not dependencies", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          "": {
            name: "fixture",
            dependencies: { chalk: "^5.0.0", shared: "1.0.0" },
            devDependencies: { jest: "^30.0.0", shared: "1.0.0" },
          },
        },
        packages: {
          "chalk": ["chalk@5.4.1", "", {}, "sha512-abc"],
          "jest": ["jest@30.3.0", "", {}, "sha512-def"],
          "shared": ["shared@1.0.0", "", {}, "sha512-ghi"],
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromBunLock(lockPath, false);
      const chalk = packages.find(p => p.name === "chalk");
      const jest = packages.find(p => p.name === "jest");
      const shared = packages.find(p => p.name === "shared");

      expect(chalk?.dev).toBe(false);
      expect(jest?.dev).toBe(true);
      // shared appears in both — treated as prod
      expect(shared?.dev).toBe(false);
    } finally {
      removeDir(projectDir);
    }
  });

  it("omits dev-only packages when prodOnly is enabled", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          "": {
            name: "fixture",
            dependencies: { chalk: "^5.0.0" },
            devDependencies: { jest: "^30.0.0" },
          },
        },
        packages: {
          "chalk": ["chalk@5.4.1", "", {}, "sha512-abc"],
          "jest": ["jest@30.3.0", "", {}, "sha512-def"],
        },
      }),
      "utf8",
    );

    try {
      const prodPackages = loadFromBunLock(lockPath, true);

      expect(prodPackages).toEqual([
        expect.objectContaining({ name: "chalk", version: "5.4.1" }),
      ]);
      expect(prodPackages).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "jest" })]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("reconstructs transitive dependency paths from bun.lock package relationships", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          "": {
            name: "fixture",
            dependencies: { axios: "0.21.1" },
          },
        },
        packages: {
          axios: ["axios@0.21.1", "", { "follow-redirects": "^1.10.0" }, ""],
          "follow-redirects": ["follow-redirects@1.14.0", "", {}, ""],
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromBunLock(lockPath, false);
      const axios = packages.find(pkg => pkg.name === "axios");
      const followRedirects = packages.find(pkg => pkg.name === "follow-redirects");

      expect(axios?.paths).toEqual([["project", "axios"]]);
      expect(followRedirects?.paths).toEqual([["project", "axios", "follow-redirects"]]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("treats transitive packages not listed in any workspace as prod", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");

    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: {
          "": {
            name: "fixture",
            dependencies: { chalk: "^5.0.0" },
          },
        },
        packages: {
          "chalk": ["chalk@5.4.1", "", { "dependencies": { "ansi-styles": "^6.0.0" } }, "sha512-abc"],
          "ansi-styles": ["ansi-styles@6.2.1", "", {}, "sha512-def"],
        },
      }),
      "utf8",
    );

    try {
      const packages = loadFromBunLock(lockPath, false);
      const ansiStyles = packages.find(p => p.name === "ansi-styles");
      expect(ansiStyles).toBeDefined();
      expect(ansiStyles?.dev).toBe(false);
    } finally {
      removeDir(projectDir);
    }
  });

  it("captures resolvedUrl from Bun lockfile package array second element", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "bun.lock");
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { "node-ipc": "9.2.3" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: { "": { name: "test", dependencies: { "node-ipc": "9.2.3" } } },
        packages: {
          "node-ipc": ["node-ipc@9.2.3", "https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz", {}, ""],
        },
      }),
      "utf8",
    );
    try {
      const packages = loadFromBunLock(lockPath, false);
      const nodeIpc = packages.find(p => p.name === "node-ipc");
      expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    } finally {
      removeDir(projectDir);
    }
  });

});
