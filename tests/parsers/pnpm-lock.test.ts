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

describe("pnpm-lock parser", () => {
  it("loads importer and package graph relationships", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");

    fs.writeFileSync(
      lockPath,
      `
lockfileVersion: '6.0'
importers:
  .:
    dependencies:
      react:
        version: 18.2.0
    devDependencies:
      jest:
        version: 30.3.0
packages:
  /react/18.2.0:
    dependencies:
      loose-envify: 1.4.0
  /loose-envify/1.4.0: {}
  /jest/30.3.0:
    dev: true
`,
      "utf8",
    );

    try {
      const allPackages = loadFromPnpmLock(lockPath, false);
      const prodPackages = loadFromPnpmLock(lockPath, true);

      expect(allPackages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "react", version: "18.2.0", paths: [["project", "react"]] }),
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

  it("parses v9 lockfiles using snapshots section and name@version keys", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");

    fs.writeFileSync(
      lockPath,
      `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      react:
        specifier: ^18.0.0
        version: 18.2.0
      '@scope/lib':
        specifier: ^1.0.0
        version: 1.0.0
    devDependencies:
      jest:
        specifier: ^30.0.0
        version: 30.3.0
snapshots:
  react@18.2.0:
    dependencies:
      loose-envify: 1.4.0
      handlebars: 4.7.8(foo@1.0.0)
  loose-envify@1.4.0: {}
  'handlebars@4.7.8(foo@1.0.0)': {}
  '@scope/lib@1.0.0': {}
  jest@30.3.0:
    dev: true
`,
      "utf8",
    );

    try {
      const allPackages = loadFromPnpmLock(lockPath, false);
      const prodPackages = loadFromPnpmLock(lockPath, true);

      expect(allPackages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "react", version: "18.2.0", paths: [["project", "react"]] }),
          expect.objectContaining({
            name: "loose-envify",
            version: "1.4.0",
            paths: [["project", "react", "loose-envify"]],
          }),
          expect.objectContaining({ name: "handlebars", version: "4.7.8" }),
          expect.objectContaining({ name: "@scope/lib", version: "1.0.0", paths: [["project", "@scope/lib"]] }),
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

  it("resolves transitive paths through pnpm v9 aliased dependencies", () => {
    // Reproduces the formisch/vm2 bug: a deep transitive package gets paths: []
    // when an intermediate node uses a pnpm alias (depName differs from real package name).
    // lockfile entry: '@remix-run/dev': '@vercel/remix-run-dev@1.16.1' — the value is not a
    // bare version string, so normalizePnpmDepRefV9 must handle it via lastIndexOf('@').
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");

    fs.writeFileSync(
      lockPath,
      `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      vercel:
        specifier: ^32.0.0
        version: 32.0.0
snapshots:
  vercel@32.0.0:
    dependencies:
      '@vercel/remix-builder': 2.0.0
  '@vercel/remix-builder@2.0.0':
    dependencies:
      '@remix-run/dev': '@vercel/remix-run-dev@1.16.1'
  '@vercel/remix-run-dev@1.16.1':
    dependencies:
      vm2: 3.9.19
  vm2@3.9.19: {}
`,
      "utf8",
    );

    try {
      const packages = loadFromPnpmLock(lockPath, false);
      const vm2 = packages.find(p => p.name === "vm2" && p.version === "3.9.19");

      expect(vm2).toBeDefined();
      expect(vm2?.paths).toEqual(
        expect.arrayContaining([
          ["project", "vercel", "@vercel/remix-builder", "@vercel/remix-run-dev", "vm2"],
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves multiple v9 paths to the same package version", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");

    fs.writeFileSync(
      lockPath,
      `
lockfileVersion: '9.0'
importers:
  .:
    devDependencies:
      lint-staged:
        specifier: ^16.4.0
        version: 16.4.0
      vite:
        specifier: ^7.3.2
        version: 7.3.2
      vitest:
        specifier: ^4.1.5
        version: 4.1.5
snapshots:
  lint-staged@16.4.0:
    dependencies:
      picomatch: 4.0.3
  vite@7.3.2:
    dependencies:
      picomatch: 4.0.3
      tinyglobby: 0.2.15
  vitest@4.1.5:
    dependencies:
      picomatch: 4.0.3
      vite: 7.3.2
  tinyglobby@0.2.15:
    dependencies:
      picomatch: 4.0.3
  picomatch@4.0.3: {}
`,
      "utf8",
    );

    try {
      const packages = loadFromPnpmLock(lockPath, false);
      const picomatch = packages.find(pkg => pkg.name === "picomatch" && pkg.version === "4.0.3");

      expect(picomatch?.paths).toEqual([
        ["project", "lint-staged", "picomatch"],
        ["project", "vite", "picomatch"],
        ["project", "vitest", "picomatch"],
        ["project", "vite", "tinyglobby", "picomatch"],
        ["project", "vitest", "vite", "picomatch"],
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("marks packages reachable only from devDependencies as dev in pnpm v9 lockfiles", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");

    fs.writeFileSync(
      lockPath,
      `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      axios:
        specifier: 0.21.1
        version: 0.21.1
    devDependencies:
      jest:
        specifier: ^29.0.0
        version: 29.0.0

snapshots:
  axios@0.21.1:
    dependencies:
      follow-redirects: 1.14.0

  follow-redirects@1.14.0: {}

  jest@29.0.0: {}
`,
      "utf8",
    );

    try {
      const packages = loadFromPnpmLock(lockPath, false);
      const axios = packages.find(p => p.name === "axios");
      const jest = packages.find(p => p.name === "jest");
      const followRedirects = packages.find(p => p.name === "follow-redirects");

      expect(axios?.dev).not.toBe(true);
      expect(jest?.dev).toBe(true);
      expect(followRedirects?.dev).not.toBe(true); // reachable from prod (axios) too
    } finally {
      removeDir(projectDir);
    }
  });

  it("captures resolvedUrl from pnpm legacy lockfile resolution.tarball", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { "node-ipc": "9.2.3" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `lockfileVersion: 6.0\n\nimporters:\n  .:\n    dependencies:\n      node-ipc:\n        specifier: 9.2.3\n        version: /node-ipc/9.2.3\n\npackages:\n\n  /node-ipc/9.2.3:\n    resolution: {tarball: 'https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz'}\n    dev: false\n`,
      "utf8",
    );
    try {
      const packages = loadFromPnpmLock(lockPath, false);
      const nodeIpc = packages.find(p => p.name === "node-ipc");
      expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    } finally {
      removeDir(projectDir);
    }
  });

  it("captures resolvedUrl from pnpm v9 lockfile resolution.tarball", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "pnpm-lock.yaml");
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { "node-ipc": "9.2.3" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      node-ipc:\n        specifier: 9.2.3\n        version: 9.2.3\n\npackages:\n  node-ipc@9.2.3:\n    resolution: {tarball: 'https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz'}\n\nsnapshots:\n  node-ipc@9.2.3: {}\n`,
      "utf8",
    );
    try {
      const packages = loadFromPnpmLock(lockPath, false);
      const nodeIpc = packages.find(p => p.name === "node-ipc");
      expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    } finally {
      removeDir(projectDir);
    }
  });

});
