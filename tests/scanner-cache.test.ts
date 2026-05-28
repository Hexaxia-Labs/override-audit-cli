import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import type { OsvVuln, PackageRef, ParsedOptions } from "../src/types.js";
import { LocalAdvisoryDatabase } from "../src/advisory/local-db.js";
import { clearPackumentCache } from "../src/remediation/npm-registry.js";

const queryBatchMock = jest.fn();
const getVulnMock = jest.fn();
const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

jest.unstable_mockModule("../src/advisory/osv-advisory-source.js", () => ({
  OsvAdvisorySource: jest.fn().mockImplementation(() => ({
    queryBatch: queryBatchMock,
    getVuln: getVulnMock,
  })),
}));

const { scanPackages } = await import("../src/scanner.js");
const { loadCache } = await import("../src/osv/cache.js");

function createTempCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-scanner-test-"));
}

function removeDir(dirPath: string) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function createOptions(cacheDir: string): ParsedOptions {
  return {
    batchSize: "100",
    failOn: "critical",
    cacheDir,
    json: true,
  };
}

function createPackage(name: string, version: string): PackageRef {
  return {
    name,
    version,
    ecosystem: "npm",
    paths: [["root", name]],
  };
}

describe("scanPackages cache behavior", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    queryBatchMock.mockReset();
    getVulnMock.mockReset();
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("uses cached package matches and advisory details on repeat scans", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("left-pad", "1.0.0");
    const detail: OsvVuln = {
      id: "OSV-123",
      aliases: ["CVE-2026-0001"],
      affected: [{ ranges: [{ events: [{ fixed: "1.0.1" }] }] }],
    };

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-123" }],
      },
    ]);
    getVulnMock.mockResolvedValue(detail);

    try {
      const firstFindings = await scanPackages([pkg], 100, createOptions(cacheDir));
      expect(firstFindings).toHaveLength(1);
      expect(firstFindings[0]?.vulnerabilities).toEqual([detail]);
      expect(queryBatchMock).toHaveBeenCalledTimes(1);
      expect(getVulnMock).toHaveBeenCalledTimes(1);

      queryBatchMock.mockClear();
      getVulnMock.mockClear();

      const secondFindings = await scanPackages([pkg], 100, createOptions(cacheDir));
      expect(secondFindings).toHaveLength(1);
      expect(secondFindings[0]?.vulnerabilities).toEqual([detail]);
      expect(queryBatchMock).not.toHaveBeenCalled();
      expect(getVulnMock).not.toHaveBeenCalled();
    } finally {
      removeDir(cacheDir);
    }
  });

  it("does not retry advisory detail fetches for cached null entries", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("minimist", "0.0.8");
    const cacheFile = path.join(cacheDir, "osv-vulns.json");

    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 3,
        createdAt: new Date().toISOString(),
        entries: {
          "OSV-NULL": null,
        },
        queryEntries: {
          "npm:minimist@0.0.8": { vulnIds: ["OSV-NULL"], cachedAt: new Date().toISOString() },
        },
      }),
      "utf8",
    );

    try {
      const findings = await scanPackages([pkg], 100, createOptions(cacheDir));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.vulnerabilities).toEqual([]);
      expect(queryBatchMock).not.toHaveBeenCalled();
      expect(getVulnMock).not.toHaveBeenCalled();
    } finally {
      removeDir(cacheDir);
    }
  });

  it("stores package match results in the JSON cache after an uncached scan", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("debug", "4.0.0");
    const detail: OsvVuln = { id: "OSV-999" };

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-999" }],
      },
    ]);
    getVulnMock.mockResolvedValue(detail);

    try {
      await scanPackages([pkg], 100, createOptions(cacheDir));

      const cache = loadCache(cacheDir);
      expect(cache.queryEntries["npm:debug@4.0.0"]).toMatchObject({
        vulnIds: ["OSV-999"],
        cachedAt: expect.any(String),
      });
      expect(cache.entries["OSV-999"]).toMatchObject({ id: "OSV-999" });
    } finally {
      removeDir(cacheDir);
    }
  });

  it("runs transitive remediation in offline mode using the lockfile graph and never hits the npm registry", async () => {
    // The scanner used to skip both lockfile graph construction and transitive
    // remediation when offline, which silently dropped fix-plan suggestions
    // for transitive findings. Now it should build the graph from the lockfile
    // (a local read) and resolve in-range parent updates without any network.
    const tempDir = createTempCacheDir();
    const dbPath = path.join(tempDir, "advisories.db");
    const lockfilePath = path.join(tempDir, "package-lock.json");
    fs.writeFileSync(
      lockfilePath,
      JSON.stringify({
        name: "fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", version: "1.0.0", dependencies: { mocha: "^10.0.0" } },
          "node_modules/mocha": {
            name: "mocha",
            version: "10.0.0",
            dependencies: { diff: "^5.0.0" },
          },
          "node_modules/diff": { name: "diff", version: "5.0.0" },
        },
      }),
      "utf8",
    );

    const db = new LocalAdvisoryDatabase(dbPath);
    db.upsertVulnerability({
      id: "OSV-OFFLINE-TRANSITIVE",
      affected: [
        {
          package: { ecosystem: "npm", name: "diff" },
          ranges: [{ events: [{ introduced: "0" }, { fixed: "5.0.1" }] }],
        },
      ],
    });
    db.close();

    const mochaPkg: PackageRef = {
      name: "mocha",
      version: "10.0.0",
      ecosystem: "npm",
      paths: [["fixture", "mocha"]],
    };
    const transitivePkg: PackageRef = {
      name: "diff",
      version: "5.0.0",
      ecosystem: "npm",
      paths: [["fixture", "mocha", "diff"]],
    };

    try {
      const findings = await scanPackages(
        [mochaPkg, transitivePkg],
        100,
        {
          ...createOptions(tempDir),
          offline: true,
          offlineDb: dbPath,
        },
        {
          directDependencyNames: new Set(["mocha"]),
          scanSource: "package-lock",
          scanFilePath: lockfilePath,
        },
      );

      expect(findings).toHaveLength(1);
      expect(findings[0]?.relationship).toBe("transitive");
      expect(findings[0]?.recommendedNpmTransitiveRemediation).toMatchObject({
        kind: "update-parent-within-range",
        package: "mocha",
        currentVersion: "10.0.0",
        targetChildVersion: "5.0.1",
      });
      expect(queryBatchMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      removeDir(tempDir);
    }
  });

  it("uses the local advisory database in offline mode without calling OSV", async () => {
    const tempDir = createTempCacheDir();
    const dbPath = path.join(tempDir, "advisories.db");
    const pkg = createPackage("lodash", "4.17.20");
    const db = new LocalAdvisoryDatabase(dbPath);

    db.upsertVulnerability({
      id: "OSV-OFFLINE-1",
      aliases: ["CVE-2026-0101"],
      affected: [
        {
          package: {
            ecosystem: "npm",
            name: "lodash",
          },
          ranges: [
            {
              events: [{ introduced: "0" }, { fixed: "4.17.21" }],
            },
          ],
        },
      ],
    });
    db.close();

    try {
      const findings = await scanPackages([pkg], 100, {
        ...createOptions(tempDir),
        offline: true,
        offlineDb: dbPath,
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]?.vulnerabilities).toHaveLength(1);
      expect(findings[0]?.vulnerabilities[0]?.id).toBe("OSV-OFFLINE-1");
      expect(queryBatchMock).not.toHaveBeenCalled();
      expect(getVulnMock).not.toHaveBeenCalled();
    } finally {
      removeDir(tempDir);
    }
  });

  it("picks the lowest known non-vulnerable direct target when intermediate versions are still vulnerable", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("tar", "1.0.0");

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-1" }, { id: "OSV-2" }],
      },
    ]);
    getVulnMock.mockImplementation(async (id: string) => {
      if (id === "OSV-1") {
        return {
          id,
          affected: [
            {
              package: { ecosystem: "npm", name: "tar" },
              ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "1.0.2" }] }],
            },
          ],
        };
      }
      return {
        id,
        affected: [
          {
            package: { ecosystem: "npm", name: "tar" },
            ranges: [{ type: "SEMVER", events: [{ introduced: "1.0.2" }, { fixed: "1.0.4" }] }],
          },
        ],
      };
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        versions: {
          "1.0.0": {},
          "1.0.1": {},
          "1.0.2": {},
          "1.0.3": {},
          "1.0.4": {},
        },
      }),
    });

    try {
      const findings = await scanPackages([pkg], 100, createOptions(cacheDir));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.firstFixedVersion).toBe("1.0.2");
      expect(findings[0]?.validatedFirstFixedVersion).toBe("1.0.4");
      expect(findings[0]?.fixVersionValidationNote).toContain("scanned 4 package versions above current version");
      expect(findings[0]?.fixVersionValidationNote).toContain("(3 still known vulnerable)");
      expect(findings[0]?.fixVersionValidationNote).toContain("lowest known non-vulnerable version 1.0.4");
    } finally {
      removeDir(cacheDir);
    }
  });

  it("classifies short lockfile paths as transitive when not declared in the root manifest", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("tar", "6.2.1");
    const detail: OsvVuln = {
      id: "OSV-TRANSITIVE",
      affected: [{ ranges: [{ events: [{ fixed: "7.5.3" }] }] }],
    };

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-TRANSITIVE" }],
      },
    ]);
    getVulnMock.mockResolvedValue(detail);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ versions: { "6.2.1": {}, "7.5.3": {} } }),
    });

    try {
      const findings = await scanPackages([pkg], 100, createOptions(cacheDir), {
        directDependencyNames: new Set(["typescript", "jest"]),
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]?.relationship).toBe("transitive");
    } finally {
      removeDir(cacheDir);
    }
  });

  it("classifies manifest-declared dependencies as direct", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("diff", "4.0.2");
    const detail: OsvVuln = {
      id: "OSV-DIRECT",
      affected: [{ ranges: [{ events: [{ fixed: "4.0.4" }] }] }],
    };

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-DIRECT" }],
      },
    ]);
    getVulnMock.mockResolvedValue(detail);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ versions: { "4.0.2": {}, "4.0.4": {} } }),
    });

    try {
      const findings = await scanPackages([pkg], 100, createOptions(cacheDir), {
        directDependencyNames: new Set(["diff", "typescript"]),
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]?.relationship).toBe("direct");
    } finally {
      removeDir(cacheDir);
    }
  });

  it("falls back to fixed-version hint publication checks when advisory ranges are incomplete", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("tar", "2.0.0");

    queryBatchMock.mockResolvedValue([
      {
        package: pkg.name,
        version: pkg.version,
        vulnerabilities: [{ id: "OSV-FIXED" }, { id: "OSV-INCOMPLETE" }],
      },
    ]);
    getVulnMock.mockImplementation(async (id: string) => {
      if (id === "OSV-FIXED") {
        return {
          id,
          affected: [
            {
              package: { ecosystem: "npm", name: "tar" },
              ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "2.0.1" }] }],
            },
          ],
        };
      }
      return {
        id,
        affected: [
          {
            package: { ecosystem: "npm", name: "tar" },
            ranges: [],
          },
        ],
      };
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        versions: {
          "2.0.0": {},
          "2.0.1": {},
          "2.0.2": {},
        },
      }),
    });

    try {
      const findings = await scanPackages([pkg], 100, createOptions(cacheDir));

      expect(findings).toHaveLength(1);
      expect(findings[0]?.firstFixedVersion).toBe("2.0.1");
      expect(findings[0]?.validatedFirstFixedVersion).toBe("2.0.1");
      expect(findings[0]?.fixVersionValidationNote).toContain("incomplete");
    } finally {
      removeDir(cacheDir);
    }
  });

  it("fires all batch requests in parallel rather than sequentially", async () => {
    const cacheDir = createTempCacheDir();
    const packages = Array.from({ length: 3 }, (_, i) =>
      createPackage(`pkg-${i}`, "1.0.0")
    );

    queryBatchMock.mockImplementation(async (pkgs: PackageRef[]) => {
      return pkgs.map(() => ({ package: pkgs[0]?.name, version: "1.0.0", vulnerabilities: [] }));
    });

    try {
      await scanPackages(packages, 1, createOptions(cacheDir));
      expect(queryBatchMock).toHaveBeenCalledTimes(3);
    } finally {
      removeDir(cacheDir);
    }
  });

  it("re-queries a clean cache entry that is older than 30 minutes", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("stale-clean", "1.0.0");
    const staleTimestamp = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const cacheFile = path.join(cacheDir, "osv-vulns.json");

    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 3,
        createdAt: staleTimestamp,
        entries: {},
        queryEntries: {
          "npm:stale-clean@1.0.0": { vulnIds: [], cachedAt: staleTimestamp },
        },
      }),
      "utf8",
    );

    queryBatchMock.mockResolvedValue([
      { package: pkg.name, version: pkg.version, vulnerabilities: [] },
    ]);

    try {
      await scanPackages([pkg], 100, createOptions(cacheDir));
      expect(queryBatchMock).toHaveBeenCalledTimes(1);
    } finally {
      removeDir(cacheDir);
    }
  });

  it("re-queries a non-empty cache entry that is older than 30 minutes", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("stale-vuln", "2.0.0");
    const staleTimestamp = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const cacheFile = path.join(cacheDir, "osv-vulns.json");

    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 3,
        createdAt: staleTimestamp,
        entries: {},
        queryEntries: {
          "npm:stale-vuln@2.0.0": { vulnIds: ["OSV-OLD"], cachedAt: staleTimestamp },
        },
      }),
      "utf8",
    );

    queryBatchMock.mockResolvedValue([
      { package: pkg.name, version: pkg.version, vulnerabilities: [{ id: "OSV-OLD" }, { id: "OSV-NEW" }] },
    ]);
    getVulnMock.mockResolvedValue({ id: "OSV-OLD" });

    try {
      await scanPackages([pkg], 100, createOptions(cacheDir));
      expect(queryBatchMock).toHaveBeenCalledTimes(1);
    } finally {
      removeDir(cacheDir);
    }
  });

  it("bypasses queryEntries cache lookup when noCache is true", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("lodash", "4.17.20");
    const cacheFile = path.join(cacheDir, "osv-vulns.json");

    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 3,
        createdAt: new Date().toISOString(),
        entries: {},
        queryEntries: {
          "npm:lodash@4.17.20": { vulnIds: ["OSV-CACHED"], cachedAt: new Date().toISOString() },
        },
      }),
      "utf8",
    );

    queryBatchMock.mockResolvedValue([
      { package: pkg.name, version: pkg.version, vulnerabilities: [] },
    ]);

    try {
      await scanPackages([pkg], 100, { ...createOptions(cacheDir), noCache: true });
      expect(queryBatchMock).toHaveBeenCalledTimes(1);
    } finally {
      removeDir(cacheDir);
    }
  });

  it("still writes results to cache after a --no-cache scan", async () => {
    const cacheDir = createTempCacheDir();
    const pkg = createPackage("debug", "3.0.0");

    queryBatchMock.mockResolvedValue([
      { package: pkg.name, version: pkg.version, vulnerabilities: [{ id: "OSV-999" }] },
    ]);
    getVulnMock.mockResolvedValue({ id: "OSV-999" });

    try {
      await scanPackages([pkg], 100, { ...createOptions(cacheDir), noCache: true });
      const cache = loadCache(cacheDir);
      expect(cache.queryEntries["npm:debug@3.0.0"]).toMatchObject({
        vulnIds: ["OSV-999"],
        cachedAt: expect.any(String),
      });
    } finally {
      removeDir(cacheDir);
    }
  });
});
