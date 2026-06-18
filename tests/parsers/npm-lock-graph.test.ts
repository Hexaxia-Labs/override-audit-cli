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

  it("produces no duplicate entries in childrenFor/parentsFor when the same edge appears multiple times in the lockfile", () => {
    // Regression test for the Set accumulator refactor (PR #652).
    // The old unique([...spread]) pattern deduplicated on every insert.
    // The new Set.add() approach must produce the same deduplicated result
    // even if the same child-parent pair is encountered more than once
    // during graph construction.
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
            dependencies: { parent: "^1.0.0" },
          },
          "node_modules/parent": {
            version: "1.0.0",
            // child appears in both dependencies and optionalDependencies -
            // two declarations of the same edge that should collapse to one.
            dependencies: { child: "^1.0.0" },
            optionalDependencies: { child: "^1.0.0" },
          },
          "node_modules/child": { version: "1.0.0" },
        },
      }),
      "utf8",
    );

    try {
      const graph = loadNpmLockGraph(lockPath, { includePaths: true });
      const parentId = graph.nodeIdsFor("parent", "1.0.0")[0]!;
      const childId = graph.nodeIdsFor("child", "1.0.0")[0]!;

      const children = graph.childrenFor(parentId);
      const parents = graph.parentsFor(childId);

      // Each should appear exactly once despite two declarations of the same edge
      expect(children.filter(id => id === childId)).toHaveLength(1);
      expect(parents.filter(id => id === parentId)).toHaveLength(1);
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
