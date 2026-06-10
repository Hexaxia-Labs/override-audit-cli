/**
 * Plan 8: end-to-end per-package-manager coverage. For each of npm, pnpm,
 * yarn, and bun we build a real project on disk whose override container holds
 * an ORPHAN target (a package the lockfile does not resolve) alongside a real
 * resolved package, then run the actual `dist/index.js overrides <dir> --json`
 * binary and assert OA001 fires for the orphan.
 *
 * Why OA001 proves the lockfile parsed: the OA001 detector short-circuits to
 * an empty result when `lockfilePackageNames.size === 0` (see
 * src/overrides/detectors/oa001-orphaned-target.ts). So an OA001 finding for
 * the orphan can only appear if the binary parsed that PM's lockfile, found
 * the real package in it, and then noticed the override target is missing.
 * That exercises the full per-PM pipeline through the real CLI.
 *
 * The `overrides --json` output is `{ findings }` with no package-manager
 * field, so we assert the finding (which is itself proof the right lockfile
 * loader ran) rather than a detected-PM string.
 *
 * Lockfile shapes are taken from the parser sources and the existing passing
 * fixtures (tests/fixtures/bun-with-overrides, yarn-classic-with-resolutions):
 *   - npm:  package-lock.json v3, packages["node_modules/<name>"].version
 *   - pnpm: pnpm-lock.yaml v9, `snapshots:` with `<name>@<version>: {}`
 *   - yarn: yarn classic v1, `<name>@<range>:` block with `version "x"`
 *   - bun:  bun.lock JSONC, packages["<name>"] = ["<name>@<version>", ...]
 *
 * Run with: npm test -- tests/e2e/package-managers.test.ts
 */

import { runCli, mkProject, rmProject, npmProject, pnpmProject } from "./harness.js";
import type { CliResult } from "./harness.js";

const ORPHAN = "completely-unused-pkg";
const REAL = "lodash";
const REAL_VERSION = "4.17.21";

interface OverridesJson {
  findings: Array<{
    ruleId: string;
    package: { name: string };
    location?: { jsonPath?: string };
  }>;
}

/** Parse `{ findings }` from a green `overrides --json` run, asserting exit 0. */
function parseFindings(r: CliResult): OverridesJson["findings"] {
  expect(r.status).toBe(0);
  const out = JSON.parse(r.stdout) as OverridesJson;
  expect(Array.isArray(out.findings)).toBe(true);
  return out.findings;
}

/** Assert OA001 fired for the orphan and not for the real resolved package. */
function expectOrphanOA001(findings: OverridesJson["findings"]): void {
  const oa001 = findings.filter((f) => f.ruleId === "OA001");
  expect(oa001.map((f) => f.package.name)).toContain(ORPHAN);
  // The real package IS in the lockfile, so it must NOT be flagged as orphan.
  expect(oa001.map((f) => f.package.name)).not.toContain(REAL);
}

describe("e2e: each package manager pipeline through the real binary", () => {
  it("npm: package-lock.json parses and an orphan override fires OA001", () => {
    const dir = mkProject(
      npmProject(
        {
          name: "npm-orphan",
          dependencies: { [REAL]: "^4.17.20" },
          overrides: { [ORPHAN]: "1.0.0" },
        },
        { [REAL]: REAL_VERSION },
      ),
    );
    try {
      expectOrphanOA001(parseFindings(runCli(["overrides", dir, "--json"])));
    } finally {
      rmProject(dir);
    }
  });

  it("pnpm: pnpm-lock.yaml parses and an orphan pnpm.override fires OA001", () => {
    const dir = mkProject(
      pnpmProject(
        {
          name: "pnpm-orphan",
          dependencies: { [REAL]: "^4.17.20" },
          pnpm: { overrides: { [ORPHAN]: "1.0.0" } },
        },
        { [REAL]: REAL_VERSION },
      ),
    );
    try {
      expectOrphanOA001(parseFindings(runCli(["overrides", dir, "--json"])));
    } finally {
      rmProject(dir);
    }
  });

  it("yarn: yarn.lock (classic v1) parses and an orphan resolution fires OA001", () => {
    // Shape copied from tests/fixtures/yarn-classic-with-resolutions/yarn.lock.
    const yarnLock = [
      "# yarn lockfile v1",
      "",
      "",
      `${REAL}@^4.17.20:`,
      `  version "${REAL_VERSION}"`,
      `  resolved "https://registry.yarnpkg.com/lodash/-/lodash-${REAL_VERSION}.tgz#abc"`,
      "  integrity sha512-aaa==",
      "",
    ].join("\n");
    const dir = mkProject({
      "package.json": {
        name: "yarn-orphan",
        private: true,
        dependencies: { [REAL]: "^4.17.20" },
        resolutions: { [ORPHAN]: "1.0.0" },
      },
      "yarn.lock": yarnLock,
    });
    try {
      expectOrphanOA001(parseFindings(runCli(["overrides", dir, "--json"])));
    } finally {
      rmProject(dir);
    }
  });

  it("bun: bun.lock (JSONC) parses and an orphan override fires OA001", () => {
    // Shape copied from tests/fixtures/bun-with-overrides/bun.lock: the
    // `packages` map keys to a tuple whose first element is `name@version`.
    const bunLock = JSON.stringify(
      {
        lockfileVersion: 0,
        workspaces: {
          "": { name: "bun-orphan", dependencies: { [REAL]: "^4.17.20" } },
        },
        packages: {
          [REAL]: [`${REAL}@${REAL_VERSION}`, "", {}, ""],
        },
      },
      null,
      2,
    );
    const dir = mkProject({
      "package.json": {
        name: "bun-orphan",
        private: true,
        dependencies: { [REAL]: "^4.17.20" },
        overrides: { [ORPHAN]: "1.0.0" },
      },
      "bun.lock": bunLock,
    });
    try {
      expectOrphanOA001(parseFindings(runCli(["overrides", dir, "--json"])));
    } finally {
      rmProject(dir);
    }
  });
});
