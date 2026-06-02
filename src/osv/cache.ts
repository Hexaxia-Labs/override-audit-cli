import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CacheFile, QueryCacheEntry } from "../types.js";
import type { DebugLogger } from "../output/debug.js";

function createEmptyCache(): CacheFile {
  return { version: 3, createdAt: new Date().toISOString(), entries: {}, queryEntries: {} };
}

export function getCacheFilePath(cacheDirOverride?: string): string {
  const baseDir = cacheDirOverride
    ? path.resolve(cacheDirOverride)
    : path.join(os.homedir(), ".cache", "cve-lite");

  fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, "osv-vulns.json");
}

export function isEntryStale(entry: { cachedAt: string }, nowMs: number): boolean {
  return nowMs - new Date(entry.cachedAt).getTime() > 30 * 60 * 1000;
}

export function loadCache(cacheDirOverride?: string, debugLog?: DebugLogger): CacheFile {
  const filePath = getCacheFilePath(cacheDirOverride);
  if (!fs.existsSync(filePath)) {
    debugLog?.("Cache loaded", {
      path: filePath,
      queryEntries: 0,
      detailEntries: 0,
      exists: false,
    });
    return createEmptyCache();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;

    if (typeof parsed !== "object" || parsed === null) {
      debugLog?.("Cache load failed", { path: filePath, reason: "invalid root object" });
      return createEmptyCache();
    }

    const entries = (parsed.entries && typeof parsed.entries === "object")
      ? parsed.entries as CacheFile["entries"]
      : {};

    // v2: queryEntries values are string[] — migrate to { vulnIds, cachedAt: epoch }
    if (parsed.version === 2) {
      const rawQuery = parsed.queryEntries as Record<string, string[]> | undefined;
      const queryEntries: CacheFile["queryEntries"] = {};
      for (const [key, vulnIds] of Object.entries(rawQuery ?? {})) {
        queryEntries[key] = { vulnIds: Array.isArray(vulnIds) ? vulnIds : [], cachedAt: new Date(0).toISOString() };
      }
      const migrated = { version: 3 as const, createdAt: String(parsed.createdAt ?? new Date().toISOString()), entries, queryEntries };
      debugLog?.("Cache loaded", {
        path: filePath,
        queryEntries: Object.keys(migrated.queryEntries).length,
        detailEntries: Object.keys(migrated.entries).length,
        migratedFrom: 2,
      });
      return migrated;
    }

    // v1 or unknown: no queryEntries
    if (parsed.version !== 3) {
      const upgraded = { version: 3 as const, createdAt: new Date().toISOString(), entries, queryEntries: {} };
      debugLog?.("Cache loaded", {
        path: filePath,
        queryEntries: 0,
        detailEntries: Object.keys(upgraded.entries).length,
        migratedFrom: parsed.version ?? "unknown",
      });
      return upgraded;
    }

    const rawQuery = parsed.queryEntries as Record<string, unknown> | undefined;
    const queryEntries: CacheFile["queryEntries"] = {};
    for (const [key, value] of Object.entries(rawQuery ?? {})) {
      if (value && typeof value === "object" && "vulnIds" in value && "cachedAt" in value) {
        queryEntries[key] = value as QueryCacheEntry;
      }
    }

    const loaded = {
      version: 3 as const,
      createdAt: String(parsed.createdAt ?? new Date().toISOString()),
      entries,
      queryEntries,
    };
    debugLog?.("Cache loaded", {
      path: filePath,
      queryEntries: Object.keys(loaded.queryEntries).length,
      detailEntries: Object.keys(loaded.entries).length,
    });
    return loaded;
  } catch (error) {
    debugLog?.("Cache load failed", {
      path: filePath,
      reason: error instanceof Error ? error.message : String(error),
    });
    return createEmptyCache();
  }
}

export function saveCache(cache: CacheFile, cacheDirOverride?: string, debugLog?: DebugLogger) {
  const filePath = getCacheFilePath(cacheDirOverride);
  cache.createdAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf8");
  if (debugLog) {
    debugLog("Cache saved", {
      path: filePath,
      queryEntries: Object.keys(cache.queryEntries).length,
      detailEntries: Object.keys(cache.entries).length,
    });
  }
}
