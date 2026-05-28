import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPackages } from "../src/parsers/index.js";
import { loadFromBunLock } from "../src/parsers/bun-lock.js";
import { loadNpmLockGraph } from "../src/parsers/npm-lock-graph.js";
import { loadFromPackageJson } from "../src/parsers/package-json.js";
import { loadFromPackageLock } from "../src/parsers/package-lock.js";
import { loadFromPnpmLock } from "../src/parsers/pnpm-lock.js";
import { loadFromYarnLock } from "../src/parsers/yarn-lock.js";

function createTempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-parser-test-"));
}

function removeDir(dirPath: string) {
  fs.rmSync(dirPath, { recursive: true, force: true });
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

describe("npm lock graph extraction", () => {
  it("reconstructs logical parents for hoisted transitive packages", () => {
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
            dependencies: {
              mocha: "^10.0.0",
            },
          },
          "node_modules/mocha": {
            version: "10.0.0",
            dependencies: {
              "serialize-javascript": "^6.0.0",
            },
          },
          "node_modules/serialize-javascript": {
            version: "6.0.2",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const mochaNodeId = graph.nodeIdsFor("mocha", "10.0.0")[0];
      const serializeNodeId = graph.nodeIdsFor("serialize-javascript", "6.0.2")[0];

      expect(graph.entryPackages).toContain(mochaNodeId);
      expect(graph.parentsFor(serializeNodeId)).toContain(mochaNodeId);
      expect(graph.pathsFor(serializeNodeId)).toContainEqual([
        "project",
        "mocha",
        "serialize-javascript",
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves npm alias names in lock graph node identity", () => {
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
            dependencies: {
              "proof-chokidar": "npm:chokidar@3.5.0",
            },
          },
          "node_modules/proof-chokidar": {
            name: "chokidar",
            version: "3.5.0",
            dependencies: {
              braces: "~3.0.2",
            },
          },
          "node_modules/proof-chokidar/node_modules/braces": {
            version: "3.0.2",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const parentNodeId = graph.nodeIdsFor("proof-chokidar", "3.5.0")[0];
      const bracesNodeId = graph.nodeIdsFor("braces", "3.0.2")[0];

      expect(parentNodeId).toBe("node_modules/proof-chokidar");
      expect(graph.parentsFor(bracesNodeId)).toContain(parentNodeId);
      expect(graph.pathsFor(bracesNodeId)).toContainEqual([
        "project",
        "proof-chokidar",
        "braces",
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("captures parent dependency ranges for child packages", () => {
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
            dependencies: {
              mocha: "^10.0.0",
            },
          },
          "node_modules/mocha": {
            version: "10.0.0",
            dependencies: {
              "serialize-javascript": "^6.0.0",
            },
          },
          "node_modules/serialize-javascript": {
            version: "6.0.2",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const mochaNodeId = graph.nodeIdsFor("mocha", "10.0.0")[0];

      expect(graph.rangeFor(mochaNodeId, "serialize-javascript")).toBe("^6.0.0");
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves duplicate same-version installs at different paths", () => {
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
            dependencies: {
              alpha: "^1.0.0",
              beta: "^1.0.0",
            },
          },
          "node_modules/alpha": {
            version: "1.0.0",
            dependencies: {
              shared: "^2.0.0",
            },
          },
          "node_modules/beta": {
            version: "1.0.0",
            dependencies: {
              shared: "^2.0.0",
            },
          },
          "node_modules/alpha/node_modules/shared": {
            version: "2.0.0",
          },
          "node_modules/beta/node_modules/shared": {
            version: "2.0.0",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const alphaNodeId = graph.nodeIdsFor("alpha", "1.0.0")[0];
      const betaNodeId = graph.nodeIdsFor("beta", "1.0.0")[0];
      const sharedNodeIds = graph.nodeIdsFor("shared", "2.0.0");

      expect(sharedNodeIds).toHaveLength(2);
      expect(sharedNodeIds.map((nodeId) => graph.parentsFor(nodeId))).toEqual(
        expect.arrayContaining([
          [alphaNodeId],
          [betaNodeId],
        ]),
      );
      expect(sharedNodeIds.map((nodeId) => graph.pathsFor(nodeId))).toEqual(
        expect.arrayContaining([
          [["project", "alpha", "shared"]],
          [["project", "beta", "shared"]],
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("ignores peer and nested dev dependency declarations as install-tree edges", () => {
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
            dependencies: {
              parent: "^1.0.0",
              react: "^18.2.0",
            },
            devDependencies: {
              jest: "^30.3.0",
            },
          },
          "node_modules/parent": {
            version: "1.0.0",
            dependencies: {
              child: "^1.0.0",
            },
            peerDependencies: {
              react: "^18.0.0",
            },
            devDependencies: {
              jest: "^30.0.0",
            },
          },
          "node_modules/child": {
            version: "1.0.0",
          },
          "node_modules/react": {
            version: "18.2.0",
          },
          "node_modules/jest": {
            version: "30.3.0",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const parentNodeId = graph.nodeIdsFor("parent", "1.0.0")[0];
      const childNodeId = graph.nodeIdsFor("child", "1.0.0")[0];
      const reactNodeId = graph.nodeIdsFor("react", "18.2.0")[0];
      const jestNodeId = graph.nodeIdsFor("jest", "30.3.0")[0];

      expect(graph.childrenFor(parentNodeId)).toEqual([childNodeId]);
      expect(graph.parentsFor(reactNodeId)).not.toContain(parentNodeId);
      expect(graph.parentsFor(jestNodeId)).not.toContain(parentNodeId);
      expect(graph.pathsFor(reactNodeId)).not.toContainEqual(["project", "parent", "react"]);
      expect(graph.pathsFor(jestNodeId)).not.toContainEqual(["project", "parent", "jest"]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves linked workspace nodes for child path reconstruction", () => {
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
            dependencies: {
              workspaceA: "file:packages/workspace-a",
            },
          },
          "node_modules/workspaceA": {
            resolved: "packages/workspace-a",
            link: true,
          },
          "packages/workspace-a": {
            name: "workspaceA",
            dependencies: {
              shared: "^1.0.0",
            },
          },
          "node_modules/shared": {
            version: "1.2.3",
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const workspaceNodeId = graph.nodeIdsFor("workspaceA", null)[0];
      const sharedNodeId = graph.nodeIdsFor("shared", "1.2.3")[0];

      expect(workspaceNodeId).toBe("node_modules/workspaceA");
      expect(graph.getNode(workspaceNodeId)).toEqual(
        expect.objectContaining({
          id: "node_modules/workspaceA",
          name: "workspaceA",
          version: null,
        }),
      );
      expect(graph.parentsFor(sharedNodeId)).toContain(workspaceNodeId);
      expect(graph.pathsFor(sharedNodeId)).toContainEqual(["project", "workspaceA", "shared"]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("bounds path depth and terminates on graphs with dependency cycles", () => {
    // pkg-a → pkg-b → pkg-c → pkg-a (cycle)
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
            dependencies: { "pkg-a": "1.0.0" },
          },
          "node_modules/pkg-a": {
            version: "1.0.0",
            dependencies: { "pkg-b": "1.0.0" },
          },
          "node_modules/pkg-b": {
            version: "1.0.0",
            dependencies: { "pkg-c": "1.0.0" },
          },
          "node_modules/pkg-c": {
            version: "1.0.0",
            dependencies: { "pkg-a": "1.0.0" },
          },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath);
      const pkgANodeId = graph.nodeIdsFor("pkg-a", "1.0.0")[0];
      const pkgBNodeId = graph.nodeIdsFor("pkg-b", "1.0.0")[0];
      const pkgCNodeId = graph.nodeIdsFor("pkg-c", "1.0.0")[0];

      const MAX_PATH_DEPTH = 10;
      const MAX_PATHS_PER_NODE = 5;

      // pkg-a is a direct dependency so paths must be non-empty
      expect(graph.pathsFor(pkgANodeId).length).toBeGreaterThan(0);

      for (const nodeId of [pkgANodeId, pkgBNodeId, pkgCNodeId]) {
        const paths = graph.pathsFor(nodeId);
        expect(paths.length).toBeLessThanOrEqual(MAX_PATHS_PER_NODE);
        for (const p of paths) {
          expect(p.length).toBeLessThanOrEqual(MAX_PATH_DEPTH);
        }
      }
    } finally {
      removeDir(projectDir);
    }
  });
});

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
});

describe("yarn.lock parser", () => {
  it("extracts package names and resolved versions from yarn classic lockfiles", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      lockPath,
      `
chalk@^5.0.0:
  version "5.4.1"
  resolved "https://registry.yarnpkg.com/chalk/-/chalk-5.4.1.tgz"

"@babel/code-frame@^7.0.0":
  version "7.24.0"
  resolved "https://registry.yarnpkg.com/@babel/code-frame/-/code-frame-7.24.0.tgz"
`,
      "utf8",
    );

    try {
      const packages = loadFromYarnLock(lockPath);

      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "chalk", version: "5.4.1", paths: [["project", "chalk"]] }),
          expect.objectContaining({ name: "@babel/code-frame", version: "7.24.0" }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("parses Yarn Berry (v2+) lockfiles using the resolution field", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    const lockContent = [
      '__metadata:',
      '  version: 8',
      '  cacheKey: 10c0',
      '',
      '"lodash@npm:^4.17.0, lodash@npm:^4.17.21":',
      '  version: 4.17.21',
      '  resolution: "lodash@npm:4.17.21"',
      '  checksum: 10c0/abc123',
      '  languageName: node',
      '  linkType: hard',
      '',
      '"@babel/core@npm:^7.0.0":',
      '  version: 7.23.5',
      '  resolution: "@babel/core@npm:7.23.5"',
      '  languageName: node',
      '  linkType: hard',
      '',
      '"workspace-only@workspace:.":',
      '  version: 0.0.0-use.local',
      '  resolution: "workspace-only@workspace:."',
      '  languageName: unknown',
      '  linkType: soft',
    ].join('\n');

    fs.writeFileSync(lockPath, lockContent, 'utf8');

    try {
      const packages = loadFromYarnLock(lockPath);

      expect(packages).toHaveLength(2);
      expect(packages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'lodash', version: '4.17.21' }),
          expect.objectContaining({ name: '@babel/core', version: '7.23.5' }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });
});

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
});

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
