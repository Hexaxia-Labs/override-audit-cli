import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { LocalAdvisoryDatabase } from "../src/advisory/local-db.js";
import { getDefaultAdvisoryDbPath, syncOsvAdvisories } from "../src/advisory/osv-sync.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-osv-sync-"));
}

function removeDir(dirPath: string): void {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function createZipPayload(files: Record<string, unknown>): Uint8Array {
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        Buffer.from(JSON.stringify(value), "utf8"),
      ]),
    ),
  );
}

describe("syncOsvAdvisories", () => {
  it("downloads the OSV npm dump and populates the local advisory DB", async () => {
    const tempDir = createTempDir();
    const dbPath = path.join(tempDir, "advisories.db");
    const progressEvents: string[] = [];
    const zipPayload = createZipPayload({
      "OSV-1.json": {
        id: "OSV-1",
        aliases: ["CVE-2026-0001"],
        affected: [
          {
            package: { ecosystem: "npm", name: "lodash" },
            ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.21" }] }],
          },
        ],
      },
      "OSV-2.json": {
        id: "OSV-2",
        affected: [
          {
            package: { ecosystem: "npm", name: "minimist" },
            ranges: [{ events: [{ introduced: "0" }, { last_affected: "0.2.3" }] }],
          },
        ],
      },
      "README.txt": "ignored",
    });

    try {
      const result = await syncOsvAdvisories({
        outputPath: dbPath,
        sourceUrl: "https://mirror.example/npm/all.zip",
        onProgress: event => {
          progressEvents.push(`${event.phase}:${event.message}`);
        },
        fetchImpl: async () =>
          ({
            ok: true,
            headers: new Headers({
              "content-length": String(zipPayload.byteLength),
            }),
            arrayBuffer: async () =>
              zipPayload.buffer.slice(
                zipPayload.byteOffset,
                zipPayload.byteOffset + zipPayload.byteLength,
              ),
          }) as Response,
      });

      expect(result).toEqual({
        advisoryCount: 2,
        dbPath,
        sourceUrl: "https://mirror.example/npm/all.zip",
      });
      expect(progressEvents[0]).toContain("init:Sync initiated");
      expect(progressEvents.some(event => event.startsWith("download:Downloading advisory dump:"))).toBe(true);
      expect(progressEvents.some(event => event.startsWith("extract:Archive loaded."))).toBe(true);
      expect(progressEvents.some(event => event.startsWith("ingest:Processing advisory records: 2 / 2"))).toBe(true);
      expect(progressEvents[progressEvents.length - 1]).toContain("complete:Sync complete.");

      const db = new LocalAdvisoryDatabase(dbPath, { readonly: true });
      try {
        expect(db.getMetadata()).toMatchObject({
          lastSyncAt: expect.any(String),
          sourceUrl: "https://mirror.example/npm/all.zip",
        });
        expect(db.getVulnerability("OSV-1")).toMatchObject({ id: "OSV-1" });
        expect(db.findMatchingVulnerabilityIds({ ecosystem: "npm", name: "lodash", version: "4.17.20" })).toEqual(["OSV-1"]);
        expect(db.findMatchingVulnerabilityIds({ ecosystem: "npm", name: "lodash", version: "4.17.21" })).toEqual([]);
        expect(db.findMatchingVulnerabilityIds({ ecosystem: "npm", name: "minimist", version: "0.2.3" })).toEqual(["OSV-2"]);
      } finally {
        db.close();
      }
    } finally {
      removeDir(tempDir);
    }
  });

  it("replaces an existing advisory DB on full refresh", async () => {
    const tempDir = createTempDir();
    const dbPath = path.join(tempDir, "advisories.db");

    fs.writeFileSync(dbPath, "stale-data", "utf8");

    try {
      await syncOsvAdvisories({
        outputPath: dbPath,
        fetchImpl: async () =>
          ({
            ok: true,
            headers: new Headers(),
            arrayBuffer: async () =>
              createZipPayload({
                "OSV-3.json": {
                  id: "OSV-3",
                  affected: [
                    {
                      package: { ecosystem: "npm", name: "debug" },
                      ranges: [{ events: [{ introduced: "0" }, { fixed: "4.3.1" }] }],
                    },
                  ],
                },
              }).buffer,
          }) as Response,
      });

      const db = new LocalAdvisoryDatabase(dbPath, { readonly: true });
      try {
        expect(db.getMetadata().lastSyncAt).toEqual(expect.any(String));
        expect(db.getVulnerability("OSV-3")).toMatchObject({ id: "OSV-3" });
      } finally {
        db.close();
      }
    } finally {
      removeDir(tempDir);
    }
  });

  it("skips withdrawn advisories during ingest so offline scans match OSV's querybatch behavior", async () => {
    const tempDir = createTempDir();
    const dbPath = path.join(tempDir, "advisories.db");
    const zipPayload = createZipPayload({
      "GHSA-active.json": {
        id: "GHSA-active",
        affected: [
          {
            package: { ecosystem: "npm", name: "lodash" },
            ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.21" }] }],
          },
        ],
      },
      "GHSA-withdrawn.json": {
        id: "GHSA-withdrawn",
        withdrawn: "2026-01-15T00:00:00Z",
        summary: "Withdrawn Advisory: false positive that OSV later retracted",
        affected: [
          {
            package: { ecosystem: "npm", name: "lodash" },
            ranges: [{ events: [{ introduced: "0" }, { fixed: "5.0.0" }] }],
          },
        ],
      },
    });

    try {
      const result = await syncOsvAdvisories({
        outputPath: dbPath,
        fetchImpl: async () =>
          ({
            ok: true,
            headers: new Headers(),
            arrayBuffer: async () => zipPayload.buffer,
          }) as Response,
      });

      expect(result.advisoryCount).toBe(1);

      const db = new LocalAdvisoryDatabase(dbPath, { readonly: true });
      try {
        expect(db.getVulnerability("GHSA-active")).toMatchObject({ id: "GHSA-active" });
        expect(db.getVulnerability("GHSA-withdrawn")).toBeNull();
        // The withdrawn record must not match a scan against the same package/version
        // it was previously reported against.
        expect(
          db.findMatchingVulnerabilityIds({ ecosystem: "npm", name: "lodash", version: "4.17.20" }),
        ).toEqual(["GHSA-active"]);
      } finally {
        db.close();
      }
    } finally {
      removeDir(tempDir);
    }
  });

  it("throws a clear error when the dump download fails", async () => {
    await expect(
      syncOsvAdvisories({
        outputPath: path.join(createTempDir(), "advisories.db"),
        fetchImpl: async () =>
          ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            headers: new Headers(),
          }) as Response,
      }),
    ).rejects.toThrow("OSV dump download failed: 502 Bad Gateway");
  });

  it("uses the default user-local advisory DB path when no output path is provided", () => {
    const advisoryPath = getDefaultAdvisoryDbPath();

    if (process.platform === "win32") {
      expect(advisoryPath.toLowerCase()).toContain(path.join("cve-lite", "advisories.db").toLowerCase());
    } else {
      expect(advisoryPath).toBe(path.join(os.homedir(), ".cache", "cve-lite", "advisories.db"));
    }
  });
});
