import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OsvVuln, PackageRef } from "../src/types.js";
import { LocalAdvisoryDatabase } from "../src/advisory/local-db.js";
import { LocalAdvisorySource } from "../src/advisory/local-advisory-source.js";

function createTempDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cve-lite-local-db-"));
  return path.join(tempDir, "advisories.db");
}

function cleanupDbPath(dbPath: string): void {
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
}

function createPackage(name: string, version: string): PackageRef {
  return {
    name,
    version,
    ecosystem: "npm",
  };
}

function seedVulnerability(db: LocalAdvisoryDatabase, overrides?: Partial<OsvVuln>): OsvVuln {
  const vuln: OsvVuln = {
    id: "OSV-2026-LOCAL-1",
    aliases: ["CVE-2026-1234"],
    summary: "Offline advisory test fixture",
    affected: [
      {
        package: {
          ecosystem: "npm",
          name: "lodash",
        },
        ranges: [
          {
            type: "ECOSYSTEM",
            events: [
              { introduced: "0" },
              { fixed: "4.17.21" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };

  db.upsertVulnerability(vuln);
  return vuln;
}

describe("LocalAdvisorySource", () => {
  it("returns advisory matches for versions inside a stored affected range", async () => {
    const dbPath = createTempDbPath();
    const db = new LocalAdvisoryDatabase(dbPath);
    const source = new LocalAdvisorySource(db);

    try {
      seedVulnerability(db);

      const results = await source.queryBatch([
        createPackage("lodash", "4.17.20"),
        createPackage("lodash", "4.17.21"),
        createPackage("react", "18.2.0"),
      ]);

      expect(results).toEqual([
        {
          package: "lodash",
          version: "4.17.20",
          vulnerabilities: [{ id: "OSV-2026-LOCAL-1" }],
        },
        {
          package: "lodash",
          version: "4.17.21",
          vulnerabilities: [],
        },
        {
          package: "react",
          version: "18.2.0",
          vulnerabilities: [],
        },
      ]);
    } finally {
      db.close();
      cleanupDbPath(dbPath);
    }
  });

  it("treats last_affected as an inclusive upper bound", async () => {
    const dbPath = createTempDbPath();
    const db = new LocalAdvisoryDatabase(dbPath);
    const source = new LocalAdvisorySource(db);

    try {
      seedVulnerability(db, {
        id: "OSV-2026-LAST-AFFECTED",
        affected: [
          {
            package: {
              ecosystem: "npm",
              name: "minimist",
            },
            ranges: [
              {
                type: "ECOSYSTEM",
                events: [
                  { introduced: "0" },
                  { last_affected: "0.2.3" },
                ],
              },
            ],
          },
        ],
      });

      const results = await source.queryBatch([
        createPackage("minimist", "0.2.3"),
        createPackage("minimist", "0.2.4"),
      ]);

      expect(results[0]?.vulnerabilities).toEqual([{ id: "OSV-2026-LAST-AFFECTED" }]);
      expect(results[1]?.vulnerabilities).toEqual([]);
    } finally {
      db.close();
      cleanupDbPath(dbPath);
    }
  });

  it("returns stored vulnerability documents by id", async () => {
    const dbPath = createTempDbPath();
    const db = new LocalAdvisoryDatabase(dbPath);
    const source = new LocalAdvisorySource(db);

    try {
      const vuln = seedVulnerability(db);
      await expect(source.getVuln(vuln.id)).resolves.toMatchObject({
        id: vuln.id,
        aliases: ["CVE-2026-1234"],
      });
    } finally {
      db.close();
      cleanupDbPath(dbPath);
    }
  });

  it("throws a clear error when a vulnerability id is not present in the local DB", async () => {
    const dbPath = createTempDbPath();
    const db = new LocalAdvisoryDatabase(dbPath);
    const source = new LocalAdvisorySource(db);

    try {
      await expect(source.getVuln("OSV-MISSING")).rejects.toThrow(
        "Local advisory database lookup failed for OSV-MISSING",
      );
    } finally {
      db.close();
      cleanupDbPath(dbPath);
    }
  });

  it("stores and returns advisory DB metadata", () => {
    const dbPath = createTempDbPath();
    const db = new LocalAdvisoryDatabase(dbPath);

    try {
      db.setMetadata({
        lastSyncAt: "2026-04-04T00:00:00.000Z",
        sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
      });

      expect(db.getMetadata()).toEqual({
        lastSyncAt: "2026-04-04T00:00:00.000Z",
        sourceUrl: "https://storage.googleapis.com/osv-vulnerabilities/npm/all.zip",
      });
    } finally {
      db.close();
      cleanupDbPath(dbPath);
    }
  });
});
