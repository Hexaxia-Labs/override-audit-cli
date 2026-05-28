import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { chalk, stripAnsi } from "./chalk.js";
import { getCliVersion } from "./version-info.js";

const NPM_REGISTRY_URL = "https://registry.npmjs.org/cve-lite-cli/latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BOX_INNER_WIDTH = 50;

export type UpdateCheckOptions = {
  json?: boolean;
  offline?: boolean;
  offlineDb?: string;
  cacheDir?: string;
};

type UpdateCache = {
  latestVersion: string;
  checkedAt: string;
};

export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] => {
    const parts = v.replace(/^v/, "").split(".").map(Number);
    return parts.length === 3 && parts.every(n => !isNaN(n)) ? parts : [];
  };
  const l = parse(latest);
  const c = parse(current);
  if (l.length === 0 || c.length === 0) return false;
  if (l[0] !== c[0]) return l[0] > c[0];
  if (l[1] !== c[1]) return l[1] > c[1];
  return l[2] > c[2];
}

function getCacheFilePath(cacheDir?: string): string {
  const dir = cacheDir ? path.resolve(cacheDir) : path.join(os.homedir(), ".cache", "cve-lite");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "update-check.json");
}

export function readCache(cacheDir?: string): UpdateCache | null {
  try {
    const raw = fs.readFileSync(getCacheFilePath(cacheDir), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.latestVersion === "string" && typeof parsed.checkedAt === "string") {
      return { latestVersion: parsed.latestVersion, checkedAt: parsed.checkedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCache(latestVersion: string, cacheDir?: string): void {
  try {
    fs.writeFileSync(
      getCacheFilePath(cacheDir),
      JSON.stringify({ latestVersion, checkedAt: new Date().toISOString() }),
      "utf8"
    );
  } catch {
    // silently ignore write failures
  }
}

export function isCacheStale(cache: UpdateCache): boolean {
  return Date.now() - new Date(cache.checkedAt).getTime() > CACHE_TTL_MS;
}

function fetchAndUpdateCache(cacheDir?: string): void {
  void fetch(NPM_REGISTRY_URL)
    .then(res => {
      if (!res.ok) return undefined;
      return res.json() as Promise<unknown>;
    })
    .then((data: unknown) => {
      if (data === undefined) return;
      if (
        data !== null &&
        typeof data === "object" &&
        "version" in data &&
        typeof (data as Record<string, unknown>).version === "string"
      ) {
        writeCache((data as { version: string }).version, cacheDir);
      }
    })
    .catch(() => {});
}

function renderBox(current: string, latest: string): string {
  const top = chalk.yellow("╭" + "─".repeat(BOX_INNER_WIDTH) + "╮");
  const empty = chalk.yellow("│") + " ".repeat(BOX_INNER_WIDTH) + chalk.yellow("│");
  const bottom = chalk.yellow("╰" + "─".repeat(BOX_INNER_WIDTH) + "╯");

  const line1 = `   ${chalk.bold.yellow("Update available!")} ${chalk.gray(current)} ${chalk.yellow("→")} ${chalk.green(latest)}`;
  const line2 = `   ${chalk.white("Run: npm install -g cve-lite-cli")}`;

  const padLine = (content: string): string => {
    const visual = stripAnsi(content).length;
    return chalk.yellow("│") + content + " ".repeat(Math.max(0, BOX_INNER_WIDTH - visual)) + chalk.yellow("│");
  };

  return [top, empty, padLine(line1), padLine(line2), empty, bottom].join("\n");
}

export function checkForUpdate(options?: UpdateCheckOptions): void {
  if (options?.json) return;
  if (options?.offline || options?.offlineDb) return;
  if (process.env["CI"]) return;
  if (process.env["NO_UPDATE_NOTIFIER"]) return;

  const cache = readCache(options?.cacheDir);
  const current = getCliVersion();

  if (cache !== null && isNewer(cache.latestVersion, current)) {
    console.log(renderBox(current, cache.latestVersion));
    console.log("");
  }

  if (cache === null || isCacheStale(cache)) {
    fetchAndUpdateCache(options?.cacheDir);
  }
}
