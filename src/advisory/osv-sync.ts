import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import type { OsvVuln } from "../types.js";
import { LocalAdvisoryDatabase } from "./local-db.js";
import { pluralize } from "../utils/string.js";

const DEFAULT_OSV_NPM_DUMP_URL = "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip";
export const ADVISORY_DB_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type SyncOsvAdvisoriesOptions = {
  outputPath?: string;
  sourceUrl?: string;
  fetchImpl?: typeof fetch;
  onProgress?: (event: SyncProgressEvent) => void;
};

export type SyncOsvAdvisoriesResult = {
  advisoryCount: number;
  dbPath: string;
  sourceUrl: string;
};

export type SyncProgressEvent =
  | {
      phase: "init";
      message: string;
      sourceUrl: string;
      dbPath: string;
    }
  | {
      phase: "download";
      bytesReceived: number;
      totalBytes: number | null;
      message: string;
    }
  | {
      phase: "download-complete";
      bytesReceived: number;
      totalBytes: number | null;
      message: string;
    }
  | {
      phase: "extract";
      totalEntries: number;
      advisoryEntries: number;
      message: string;
    }
  | {
      phase: "ingest";
      processedAdvisories: number;
      totalAdvisories: number;
      message: string;
    }
  | {
      phase: "complete";
      advisoryCount: number;
      dbPath: string;
      message: string;
    };

export function getDefaultAdvisoryDbPath(outputPath?: string): string {
  if (outputPath) {
    return path.resolve(outputPath);
  }

  if (process.platform === "win32") {
    const appData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(appData, "cve-lite", "advisories.db");
  }

  return path.join(os.homedir(), ".cache", "cve-lite", "advisories.db");
}

export async function syncOsvAdvisories(
  options: SyncOsvAdvisoriesOptions = {},
): Promise<SyncOsvAdvisoriesResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const onProgress = options.onProgress;
  const sourceUrl = options.sourceUrl ?? DEFAULT_OSV_NPM_DUMP_URL;
  const dbPath = getDefaultAdvisoryDbPath(options.outputPath);

  onProgress?.({
    phase: "init",
    sourceUrl,
    dbPath,
    message: `Sync initiated. Downloading advisory dump from ${sourceUrl}`,
  });

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }

  const response = await fetchImpl(sourceUrl);
  if (!response.ok) {
    throw new Error(`OSV dump download failed: ${response.status} ${response.statusText}`);
  }

  const totalBytesHeader = response.headers.get("content-length");
  const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
  const zippedBytes = await readResponseBytes(response, (bytesReceived) => {
    onProgress?.({
      phase: "download",
      bytesReceived,
      totalBytes,
      message:
        totalBytes && totalBytes > 0
          ? `Downloading advisory dump: ${formatBytes(bytesReceived)} / ${formatBytes(totalBytes)}`
          : `Downloading advisory dump: ${formatBytes(bytesReceived)}`,
    });
  });

  onProgress?.({
    phase: "download-complete",
    bytesReceived: zippedBytes.byteLength,
    totalBytes,
    message:
      totalBytes && totalBytes > 0
        ? `Download complete: ${formatBytes(zippedBytes.byteLength)} / ${formatBytes(totalBytes)}`
        : `Download complete: ${formatBytes(zippedBytes.byteLength)}`,
  });
  await yieldToEventLoop();

  const archiveEntries = unzipSync(zippedBytes);
  const advisoryEntries = Object.entries(archiveEntries).filter(([entryName]) => entryName.endsWith(".json"));
  onProgress?.({
    phase: "extract",
    totalEntries: Object.keys(archiveEntries).length,
    advisoryEntries: advisoryEntries.length,
    message: `Archive loaded. Processing ${advisoryEntries.length} advisory ${pluralize(advisoryEntries.length, "record")}`,
  });
  await yieldToEventLoop();
  const db = new LocalAdvisoryDatabase(dbPath);

  try {
    const parsedVulns: OsvVuln[] = [];
    let advisoryCount = 0;
    const progressInterval = 250;

    for (const [, bytes] of advisoryEntries) {
      const text = Buffer.from(bytes).toString("utf8");
      const vuln = JSON.parse(text) as OsvVuln;
      if (!vuln.id) {
        continue;
      }

      // OSV's /v1/querybatch endpoint excludes withdrawn advisories at query
      // time; mirror that here so offline scans don't surface false positives
      // from advisories that have been retracted.
      if (vuln.withdrawn) {
        continue;
      }

      parsedVulns.push(vuln);
      advisoryCount += 1;

      if (
        advisoryCount === 1 ||
        advisoryCount % progressInterval === 0 ||
        advisoryCount === advisoryEntries.length
      ) {
        onProgress?.({
          phase: "ingest",
          processedAdvisories: advisoryCount,
          totalAdvisories: advisoryEntries.length,
          message: `Processing advisory records: ${advisoryCount} / ${advisoryEntries.length}`,
        });
        await yieldToEventLoop();
      }
    }

    db.bulkUpsertVulnerabilities(parsedVulns);

    db.setMetadata({
      lastSyncAt: new Date().toISOString(),
      sourceUrl,
    });

    onProgress?.({
      phase: "complete",
      advisoryCount,
      dbPath,
      message: `Sync complete. Stored ${advisoryCount} advisory ${pluralize(advisoryCount, "record")} in ${dbPath}`,
    });

    return { advisoryCount, dbPath, sourceUrl };
  } catch (error) {
    try {
      db.close();
    } finally {
      if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath, { force: true });
      }
    }
    throw error;
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors during sync cleanup
    }
  }
}

async function readResponseBytes(
  response: Response,
  onChunk: (bytesReceived: number) => void,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onChunk(bytes.byteLength);
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesReceived = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (value) {
      chunks.push(value);
      bytesReceived += value.byteLength;
      onChunk(bytesReceived);
    }
  }

  const combined = new Uint8Array(bytesReceived);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>(resolve => {
    setImmediate(resolve);
  });
}
