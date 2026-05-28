import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { CacheFile, QueryCacheEntry } from "../types.js";

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

export function loadCache(cacheDirOverride?: string): CacheFile {
  const filePath = getCacheFilePath(cacheDirOverride);
  if (!fs.existsSync(filePath)) {
    return createEmptyCache();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;

    if (typeof parsed !== "object" || parsed === null) return createEmptyCache();

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
      return { version: 3, createdAt: String(parsed.createdAt ?? new Date().toISOString()), entries, queryEntries };
    }

    // v1 or unknown: no queryEntries
    if (parsed.version !== 3) {
      return { version: 3, createdAt: new Date().toISOString(), entries, queryEntries: {} };
    }

    const rawQuery = parsed.queryEntries as Record<string, unknown> | undefined;
    const queryEntries: CacheFile["queryEntries"] = {};
    for (const [key, value] of Object.entries(rawQuery ?? {})) {
      if (value && typeof value === "object" && "vulnIds" in value && "cachedAt" in value) {
        queryEntries[key] = value as QueryCacheEntry;
      }
    }

    return {
      version: 3,
      createdAt: String(parsed.createdAt ?? new Date().toISOString()),
      entries,
      queryEntries,
    };
  } catch {
    return createEmptyCache();
  }
}

export function saveCache(cache: CacheFile, cacheDirOverride?: string) {
  const filePath = getCacheFilePath(cacheDirOverride);
  cache.createdAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf8");
}
