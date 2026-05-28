import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../src/cli/args.js";
import { maxSeverity, inferSeverity, normalizeSeverity } from "../src/osv/severity.js";
import {
  chooseBestLockfile,
  findFiles,
  findNearestPackageJson,
  relativeOrName,
  safeReadText,
} from "../src/utils/file.js";
import {
  compareVersions,
  isMajorVersionBump,
  isPreReleaseVersion,
  looksLikeVersion,
  normalizeRawVersion,
  parseExactManifestVersion,
} from "../src/utils/version.js";
import { runWithConcurrency } from "../src/utils/array.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-helper-test-"));
}

function removeDir(dirPath: string) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

describe("parseArgs", () => {
  it("returns default options when no arguments are provided", () => {
    const result = parseArgs([]);

    expect(result).toEqual({
      command: "scan",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
    });
  });

  it("parses flags, inline values, and a project path together", () => {
    const result = parseArgs([
      "--json",
      "--fix",
      "--verbose",
      "--prod-only",
      "--offline",
      "--offline-db",
      "/tmp/local-advisories.db",
      "--all",
      "--fail-on=high",
      "--batch-size",
      "25",
      "--cache-dir=.cache/test",
      "--osv-url",
      "https://example.com/osv",
      "--search-depth=7",
      "--min-severity",
      "low",
      "./fixture",
    ]);

    expect(result).toEqual({
      command: "scan",
      options: {
        json: true,
        fix: true,
        verbose: true,
        prodOnly: true,
        offline: true,
        offlineDb: "/tmp/local-advisories.db",
        all: true,
        failOn: "high",
        batchSize: "25",
        cacheDir: ".cache/test",
        osvUrl: "https://example.com/osv",
        searchDepth: "7",
        minSeverity: "low",
      },
      projectArg: "./fixture",
    });
  });

  it("parses the advisories sync command and its output path option", () => {
    const result = parseArgs(["advisories", "sync", "--output", "./tmp/advisories.db"]);

    expect(result).toEqual({
      command: "advisories-sync",
      options: {
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
        output: "./tmp/advisories.db",
      },
    });
  });

  it("parses the version flag in scan and advisories sync modes", () => {
    expect(parseArgs(["--version"])).toEqual({
      command: "scan",
      options: {
        version: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
    });

    expect(parseArgs(["advisories", "sync", "--version"])).toEqual({
      command: "advisories-sync",
      options: {
        version: true,
        failOn: "critical",
        batchSize: "100",
        searchDepth: "4",
        minSeverity: "medium",
      },
    });
  });

  it("throws on unknown options and unexpected extra arguments", () => {
    expect(() => parseArgs(["--wat"])).toThrow("Unknown option: --wat");
    expect(() => parseArgs(["project-a", "project-b"])).toThrow("Unexpected argument: project-b");
    expect(() => parseArgs(["advisories", "sync", "extra"])).toThrow("Unexpected argument: extra");
  });

  it("parses install-skill command", () => {
    const result = parseArgs(["install-skill"]);
    expect(result.command).toBe("install-skill");
  });

  it("parses install-skill with --help flag", () => {
    const result = parseArgs(["install-skill", "--help"]);
    expect(result.command).toBe("install-skill");
    expect(result.options.help).toBe(true);
  });

  it("throws on unknown option for install-skill", () => {
    expect(() => parseArgs(["install-skill", "--unknown"])).toThrow("Unknown option: --unknown");
  });

  it("throws on unexpected argument for install-skill", () => {
    expect(() => parseArgs(["install-skill", "extra"])).toThrow("Unexpected argument: extra");
  });

  it("sets cdx option when --cdx is passed", () => {
    const result = parseArgs(["--cdx"]);
    expect(result.options.cdx).toBe(true);
  });

  it("throws when --cdx and --report are combined", () => {
    expect(() => parseArgs(["--cdx", "--report"])).toThrow("cannot combine --cdx and --report");
  });

  it("allows --cdx combined with --json and --sarif", () => {
    const result = parseArgs(["--cdx", "--json", "--sarif"]);
    expect(result.options.cdx).toBe(true);
    expect(result.options.json).toBe(true);
    expect(result.options.sarif).toBe(true);
  });
});

describe("severity helpers", () => {
  it("infers severity from score ranges and database fallback", () => {
    expect(inferSeverity({ id: "1", severity: [{ score: "9.8" }] })).toBe("critical");
    expect(inferSeverity({ id: "2", severity: [{ score: "7.5" }] })).toBe("high");
    expect(inferSeverity({ id: "3", severity: [{ score: "5.6" }] })).toBe("medium");
    expect(inferSeverity({ id: "4", severity: [{ score: "2.1" }] })).toBe("low");
    expect(inferSeverity({ id: "5", severity: [{ score: "0.0" }] })).toBe("none");
    expect(inferSeverity({ id: "6", database_specific: { severity: "HIGH" } })).toBe("high");
    expect(inferSeverity({ id: "7" })).toBe("unknown");
  });

  it("maps OSV MODERATE label to medium", () => {
    // OSV uses "MODERATE" where our severity label is "medium".
    expect(inferSeverity({ id: "got", database_specific: { severity: "MODERATE" } })).toBe("medium");
    expect(inferSeverity({ id: "got-lower", database_specific: { severity: "moderate" } })).toBe("medium");
    // Combined: CVSS vector falls through to MODERATE db label → medium
    expect(
      inferSeverity({
        id: "got-vector",
        severity: [{ score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L" }],
        database_specific: { severity: "MODERATE" },
      }),
    ).toBe("medium");
  });

  it("falls through to database_specific when score is a CVSS vector string", () => {
    // OSV returns CVSS vector strings in severity[].score (e.g. "CVSS:3.1/AV:N/...").
    // The version number in the prefix (3.1) must not be mistaken for a base score.
    expect(
      inferSeverity({
        id: "crypto-js",
        severity: [{ score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N" }],
        database_specific: { severity: "CRITICAL" },
      }),
    ).toBe("critical");
    expect(
      inferSeverity({
        id: "braces",
        severity: [{ score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H" }],
        database_specific: { severity: "HIGH" },
      }),
    ).toBe("high");
    expect(
      inferSeverity({
        id: "vector-only-no-db",
        severity: [{ score: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }],
      }),
    ).toBe("unknown");
  });

  it("returns the highest severity across multiple vulnerabilities", () => {
    expect(
      maxSeverity([
        { id: "1", severity: [{ score: "3.0" }] },
        { id: "2", severity: [{ score: "9.1" }] },
        { id: "3", database_specific: { severity: "medium" } },
      ]),
    ).toBe("critical");
  });

  it("normalizes valid labels and falls back invalid ones to critical", () => {
    expect(normalizeSeverity("HIGH")).toBe("high");
    expect(normalizeSeverity("unknown")).toBe("unknown");
    expect(normalizeSeverity("not-a-level")).toBe("critical");
  });
});

describe("version helpers", () => {
  it("recognizes supported exact versions", () => {
    expect(looksLikeVersion("1.2.3")).toBe(true);
    expect(looksLikeVersion("1.2.3-beta")).toBe(true);
    expect(looksLikeVersion("1.2")).toBe(false);
    expect(looksLikeVersion("^1.2.3")).toBe(false);
  });

  it("detects major version bumps", () => {
    expect(isMajorVersionBump("8.5.1", "9.0.0")).toBe(true);   // 8 → 9
    expect(isMajorVersionBump("3.6.2", "4.17.21")).toBe(true); // 3 → 4
    expect(isMajorVersionBump("5.8.4", "5.8.5")).toBe(false);  // patch only
    expect(isMajorVersionBump("1.2.3", "1.3.0")).toBe(false);  // minor only
    expect(isMajorVersionBump("1.0.0", "1.0.0")).toBe(false);  // same
    expect(isMajorVersionBump("not-a-ver", "9.0.0")).toBe(false); // unparseable from
    expect(isMajorVersionBump("8.0.0", "not-a-ver")).toBe(false); // unparseable to
  });

  it("detects pre-release versions", () => {
    expect(isPreReleaseVersion("22.0.0-next.0")).toBe(true);
    expect(isPreReleaseVersion("1.0.0-beta.1")).toBe(true);
    expect(isPreReleaseVersion("1.0.0-alpha")).toBe(true);
    expect(isPreReleaseVersion("1.0.0-rc.1")).toBe(true);
    expect(isPreReleaseVersion("22.7.0-beta.8")).toBe(true);
    expect(isPreReleaseVersion("1.0.0-0")).toBe(true);
    expect(isPreReleaseVersion("1.0.0-canary.1")).toBe(true);
    expect(isPreReleaseVersion("1.0.0")).toBe(false);
    expect(isPreReleaseVersion("22.0.0")).toBe(false);
    expect(isPreReleaseVersion("4.17.21")).toBe(false);
    expect(isPreReleaseVersion("3.9.2")).toBe(false);
    expect(isPreReleaseVersion("1.0.0-beta GARBAGE")).toBe(false);
    expect(isPreReleaseVersion("1.0.0-")).toBe(false);
  });

  it("compares versions numerically and with suffix segments", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3-beta", "1.2.3-alpha")).toBeGreaterThan(0);
  });

  it("parses exact manifest versions and normalizes raw versions", () => {
    expect(parseExactManifestVersion("1.2.3")).toBe("1.2.3");
    expect(parseExactManifestVersion(" npm:1.2.3 ")).toBe("1.2.3");
    expect(parseExactManifestVersion("^1.2.3")).toBeNull();

    expect(normalizeRawVersion("workspace:1.2.3")).toBe("1.2.3");
    expect(normalizeRawVersion("npm:4.5.6")).toBe("4.5.6");
    expect(normalizeRawVersion("../local-package")).toBeNull();
    expect(normalizeRawVersion(42)).toBeNull();
  });
});

describe("file helpers", () => {
  it("safely reads files and returns an empty string for missing paths", () => {
    const tempDir = createTempDir();
    const filePath = path.join(tempDir, "note.txt");
    fs.writeFileSync(filePath, "hello", "utf8");

    try {
      expect(safeReadText(filePath)).toBe("hello");
      expect(safeReadText(path.join(tempDir, "missing.txt"))).toBe("");
    } finally {
      removeDir(tempDir);
    }
  });

  it("returns relative paths when possible and falls back to the file name", () => {
    const rootDir = "/tmp/project";
    expect(relativeOrName(rootDir, "/tmp/project/src/index.ts")).toBe(path.join("src", "index.ts"));
    expect(relativeOrName(rootDir, rootDir)).toBe("project");
  });

  it("finds matching files by depth while skipping excluded directories", () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, "packages", "app");
    const gitDir = path.join(tempDir, ".git", "hooks");
    const nodeModulesDir = path.join(tempDir, "node_modules", "left-pad");

    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(gitDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    const rootLock = path.join(tempDir, "package-lock.json");
    const nestedLock = path.join(nestedDir, "yarn.lock");
    const ignoredLock = path.join(nodeModulesDir, "package-lock.json");

    fs.writeFileSync(rootLock, "{}", "utf8");
    fs.writeFileSync(nestedLock, "content", "utf8");
    fs.writeFileSync(ignoredLock, "{}", "utf8");

    try {
      const files = findFiles(tempDir, ["package-lock.json", "yarn.lock"], 3);
      expect(files).toEqual([rootLock, nestedLock]);
    } finally {
      removeDir(tempDir);
    }
  });

  it("finds the nearest package.json and chooses the preferred lockfile", () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, "packages", "app");
    fs.mkdirSync(nestedDir, { recursive: true });

    try {
      expect(findNearestPackageJson(tempDir, 3)).toBeNull();

      const nestedPackageJson = path.join(nestedDir, "package.json");
      fs.writeFileSync(nestedPackageJson, "{}", "utf8");
      expect(findNearestPackageJson(tempDir, 3)).toBe(nestedPackageJson);

      const rootPackageJson = path.join(tempDir, "package.json");
      fs.writeFileSync(rootPackageJson, "{}", "utf8");
      expect(findNearestPackageJson(tempDir, 3)).toBe(rootPackageJson);

      expect(
        chooseBestLockfile([
          path.join(tempDir, "packages", "app", "yarn.lock"),
          path.join(tempDir, "pnpm-lock.yaml"),
          path.join(tempDir, "package-lock.json"),
        ]),
      ).toBe(path.join(tempDir, "package-lock.json"));
    } finally {
      removeDir(tempDir);
    }
  });
});

describe("runWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const order: number[] = [];
    const results = await runWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise(r => setTimeout(r, ms));
      order.push(ms);
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40]);
    expect(order).toEqual([10, 20, 30]);
  });

  it("runs at most `limit` tasks concurrently", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    });
    expect(maxConcurrent).toBe(2);
  });

  it("handles an empty input array", async () => {
    const results = await runWithConcurrency([], 3, async (x: number) => x);
    expect(results).toEqual([]);
  });

  it("propagates errors from individual tasks", async () => {
    await expect(
      runWithConcurrency([1, 2, 3], 3, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
  });
});
