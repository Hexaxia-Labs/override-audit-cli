import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isEntryStale, loadCache, saveCache } from "../src/osv/cache.js";
import type { CacheFile } from "../src/types.js";

function createTempCacheDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-cache-test-"));
}

function removeDir(dirPath: string) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

describe("OSV cache", () => {
  it("returns an empty version 3 cache when the file does not exist", () => {
    const cacheDir = createTempCacheDir();
    try {
      const cache = loadCache(cacheDir);
      expect(cache.version).toBe(3);
      expect(cache.entries).toEqual({});
      expect(cache.queryEntries).toEqual({});
    } finally {
      removeDir(cacheDir);
    }
  });

  it("migrates a v1 cache file (no queryEntries) to v3", () => {
    const cacheDir = createTempCacheDir();
    const cacheFile = path.join(cacheDir, "osv-vulns.json");
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        entries: { "OSV-123": { id: "OSV-123", aliases: ["CVE-2026-0001"] } },
      }),
      "utf8",
    );
    try {
      const cache = loadCache(cacheDir);
      expect(cache.version).toBe(3);
      expect(cache.entries["OSV-123"]).toMatchObject({ id: "OSV-123" });
      expect(cache.queryEntries).toEqual({});
    } finally {
      removeDir(cacheDir);
    }
  });

  it("migrates a v2 cache (string[] queryEntries) to v3 and marks entries stale", () => {
    const cacheDir = createTempCacheDir();
    const cacheFile = path.join(cacheDir, "osv-vulns.json");
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        entries: {},
        queryEntries: { "npm:left-pad@1.0.0": ["OSV-123"] },
      }),
      "utf8",
    );
    try {
      const cache = loadCache(cacheDir);
      expect(cache.version).toBe(3);
      const entry = cache.queryEntries["npm:left-pad@1.0.0"];
      expect(entry?.vulnIds).toEqual(["OSV-123"]);
      expect(isEntryStale(entry!, Date.now())).toBe(true);
    } finally {
      removeDir(cacheDir);
    }
  });

  it("persists v3 queryEntries and reloads them correctly", () => {
    const cacheDir = createTempCacheDir();
    const now = new Date().toISOString();
    const cache: CacheFile = {
      version: 3,
      createdAt: now,
      entries: { "OSV-123": { id: "OSV-123", aliases: ["CVE-2026-0001"] } },
      queryEntries: {
        "npm:left-pad@1.0.0": { vulnIds: ["OSV-123"], cachedAt: now },
      },
    };
    try {
      saveCache(cache, cacheDir);
      const reloaded = loadCache(cacheDir);
      expect(reloaded.entries["OSV-123"]).toMatchObject({ id: "OSV-123" });
      expect(reloaded.queryEntries["npm:left-pad@1.0.0"]).toMatchObject({
        vulnIds: ["OSV-123"],
        cachedAt: now,
      });
    } finally {
      removeDir(cacheDir);
    }
  });

  it("isEntryStale returns true when cachedAt is more than 30 minutes ago", () => {
    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    expect(isEntryStale({ cachedAt: thirtyOneMinutesAgo }, Date.now())).toBe(true);
  });

  it("isEntryStale returns false when cachedAt is less than 30 minutes ago", () => {
    const twentyNineMinutesAgo = new Date(Date.now() - 29 * 60 * 1000).toISOString();
    expect(isEntryStale({ cachedAt: twentyNineMinutesAgo }, Date.now())).toBe(false);
  });

  it("isEntryStale returns false for a freshly written entry", () => {
    const now = new Date().toISOString();
    expect(isEntryStale({ cachedAt: now }, Date.now())).toBe(false);
  });
});
