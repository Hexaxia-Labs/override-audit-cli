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

describe("yarn.lock parser", () => {
  it("extracts package names and resolved versions from yarn classic lockfiles", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { chalk: "^5.0.0" } }),
      "utf8",
    );
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

  it("reconstructs transitive dependency paths from yarn classic lockfiles", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { axios: "0.21.1" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `
axios@0.21.1:
  version "0.21.1"
  dependencies:
    follow-redirects "^1.10.0"

follow-redirects@^1.10.0:
  version "1.14.0"
`,
      "utf8",
    );

    try {
      const packages = loadFromYarnLock(lockPath);
      const axios = packages.find(pkg => pkg.name === "axios");
      const followRedirects = packages.find(pkg => pkg.name === "follow-redirects");

      expect(axios?.paths).toEqual([["project", "axios"]]);
      expect(followRedirects?.paths).toEqual([["project", "axios", "follow-redirects"]]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("preserves deep transitive paths needed for within-range remediation", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ devDependencies: { "aws-amplify": "6.16.3" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `
aws-amplify@6.16.3:
  version "6.16.3"
  dependencies:
    "@aws-amplify/core" "6.16.1"

"@aws-amplify/core@6.16.1, @aws-amplify/core@^6.1.0":
  version "6.16.1"
  dependencies:
    js-cookie "^3.0.5"

js-cookie@^3.0.5:
  version "3.0.6"
`,
      "utf8",
    );

    try {
      const packages = loadFromYarnLock(lockPath);
      const jsCookie = packages.find(pkg => pkg.name === "js-cookie" && pkg.version === "3.0.6");

      expect(jsCookie?.paths).toEqual([
        ["project", "aws-amplify", "@aws-amplify/core", "js-cookie"],
      ]);
    } finally {
      removeDir(projectDir);
    }
  });

  it("parses Yarn Berry (v2+) lockfiles using the resolution field", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { lodash: "^4.17.0" } }),
      "utf8",
    );

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
          expect.objectContaining({ name: 'lodash', version: '4.17.21', paths: [['project', 'lodash']] }),
          expect.objectContaining({ name: '@babel/core', version: '7.23.5' }),
        ]),
      );
    } finally {
      removeDir(projectDir);
    }
  });

  it("marks packages reachable only from devDependencies as dev", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        dependencies: { axios: "0.21.1" },
        devDependencies: { jest: "^29.0.0" },
      }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `
axios@0.21.1:
  version "0.21.1"

jest@^29.0.0:
  version "29.0.0"
  dependencies:
    jest-runner "^29.0.0"

jest-runner@^29.0.0:
  version "29.0.0"
`,
      "utf8",
    );

    try {
      const packages = loadFromYarnLock(lockPath);
      const axios = packages.find(p => p.name === "axios");
      const jest = packages.find(p => p.name === "jest");
      const jestRunner = packages.find(p => p.name === "jest-runner");

      expect(axios?.dev).not.toBe(true);
      expect(jest?.dev).toBe(true);
      expect(jestRunner?.dev).toBe(true);
    } finally {
      removeDir(projectDir);
    }
  });

  it("does not mark as dev when package is reachable from both prod and dev roots", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");

    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({
        dependencies: { axios: "0.21.1" },
        devDependencies: { "test-lib": "^1.0.0" },
      }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `
axios@0.21.1:
  version "0.21.1"
  dependencies:
    follow-redirects "^1.10.0"

"test-lib@^1.0.0":
  version "1.0.0"
  dependencies:
    follow-redirects "^1.10.0"

follow-redirects@^1.10.0:
  version "1.14.0"
`,
      "utf8",
    );

    try {
      const packages = loadFromYarnLock(lockPath);
      const followRedirects = packages.find(p => p.name === "follow-redirects");
      expect(followRedirects?.dev).not.toBe(true);
    } finally {
      removeDir(projectDir);
    }
  });

  it("captures resolvedUrl from Yarn Classic lockfile resolved field", () => {
    const projectDir = createTempProjectDir();
    const lockPath = path.join(projectDir, "yarn.lock");
    fs.writeFileSync(
      path.join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { "node-ipc": "9.2.3" } }),
      "utf8",
    );
    fs.writeFileSync(
      lockPath,
      `# yarn lockfile v1\n\n\nnode-ipc@9.2.3:\n  version "9.2.3"\n  resolved "https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz"\n`,
      "utf8",
    );
    try {
      const packages = loadFromYarnLock(lockPath);
      const nodeIpc = packages.find(p => p.name === "node-ipc");
      expect(nodeIpc?.resolvedUrl).toBe("https://npm.internal.example.com/node-ipc/-/node-ipc-9.2.3.tgz");
    } finally {
      removeDir(projectDir);
    }
  });

});
