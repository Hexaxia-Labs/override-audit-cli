import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { OsvVuln, PackageRef } from "../types.js";
import { compareVersions, looksLikeVersion } from "../utils/version.js";

type AdvisoryRangeRow = {
  advisory_id: string;
  introduced: string | null;
  fixed: string | null;
  last_affected: string | null;
};

export type AdvisoryDbMetadata = {
  lastSyncAt: string | null;
  sourceUrl: string | null;
};

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS advisories (
    id TEXT PRIMARY KEY,
    modified_at TEXT,
    aliases_json TEXT NOT NULL,
    summary TEXT,
    osv_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS advisory_packages (
    advisory_id TEXT NOT NULL,
    ecosystem TEXT NOT NULL,
    package_name TEXT NOT NULL,
    introduced TEXT,
    fixed TEXT,
    last_affected TEXT,
    FOREIGN KEY (advisory_id) REFERENCES advisories(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_advisory_packages_lookup
    ON advisory_packages (ecosystem, package_name);

  CREATE INDEX IF NOT EXISTS idx_advisory_packages_advisory
    ON advisory_packages (advisory_id);

  CREATE TABLE IF NOT EXISTS advisory_db_metadata (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_sync_at TEXT,
    source_url TEXT
  );
`;

export class LocalAdvisoryDatabase {
  private readonly db: Database.Database;
  private readonly upsertAdvisoryStatement: Database.Statement;
  private readonly deleteRangesStatement: Database.Statement;
  private readonly insertRangeStatement: Database.Statement;
  private readonly setMetadataStatement: Database.Statement;
  private readonly getMetadataStatement: Database.Statement;
  private readonly getVulnerabilityStatement: Database.Statement;
  private readonly findMatchingIdsStatement: Database.Statement;

  constructor(
    private readonly dbPath: string,
    options?: { readonly?: boolean },
  ) {
    const readonly = !!options?.readonly;

    if (!readonly) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath, readonly ? { readonly: true, fileMustExist: true } : undefined);
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
    this.upsertAdvisoryStatement = this.db.prepare(`
      INSERT INTO advisories (id, modified_at, aliases_json, summary, osv_json)
      VALUES (@id, @modified_at, @aliases_json, @summary, @osv_json)
      ON CONFLICT(id) DO UPDATE SET
        modified_at = excluded.modified_at,
        aliases_json = excluded.aliases_json,
        summary = excluded.summary,
        osv_json = excluded.osv_json
    `);
    this.deleteRangesStatement = this.db.prepare(`
      DELETE FROM advisory_packages
      WHERE advisory_id = ?
    `);
    this.insertRangeStatement = this.db.prepare(`
      INSERT INTO advisory_packages (
        advisory_id,
        ecosystem,
        package_name,
        introduced,
        fixed,
        last_affected
      ) VALUES (
        @advisory_id,
        @ecosystem,
        @package_name,
        @introduced,
        @fixed,
        @last_affected
      )
    `);
    this.setMetadataStatement = this.db.prepare(`
      INSERT INTO advisory_db_metadata (id, last_sync_at, source_url)
      VALUES (1, @last_sync_at, @source_url)
      ON CONFLICT(id) DO UPDATE SET
        last_sync_at = excluded.last_sync_at,
        source_url = excluded.source_url
    `);
    this.getMetadataStatement = this.db.prepare(`
      SELECT last_sync_at, source_url
      FROM advisory_db_metadata
      WHERE id = 1
    `);
    this.getVulnerabilityStatement = this.db.prepare(`
      SELECT osv_json
      FROM advisories
      WHERE id = ?
    `);
    this.findMatchingIdsStatement = this.db.prepare(`
      SELECT advisory_id, introduced, fixed, last_affected
      FROM advisory_packages
      WHERE ecosystem = ? AND package_name = ?
    `);
  }

  close(): void {
    this.db.close();
  }

  setMetadata(metadata: AdvisoryDbMetadata): void {
    this.setMetadataStatement.run({
      last_sync_at: metadata.lastSyncAt,
      source_url: metadata.sourceUrl,
    });
  }

  getMetadata(): AdvisoryDbMetadata {
    const row = this.getMetadataStatement.get() as { last_sync_at: string | null; source_url: string | null } | undefined;

    return {
      lastSyncAt: row?.last_sync_at ?? null,
      sourceUrl: row?.source_url ?? null,
    };
  }

  upsertVulnerability(vuln: OsvVuln): void {
    const transaction = this.db.transaction((item: OsvVuln) => {
      this.upsertVulnerabilityInternal(item);
    });

    transaction(vuln);
  }

  bulkUpsertVulnerabilities(vulns: Iterable<OsvVuln>): void {
    const transaction = this.db.transaction((items: OsvVuln[]) => {
      for (const item of items) {
        this.upsertVulnerabilityInternal(item);
      }
    });

    transaction([...vulns]);
  }

  private upsertVulnerabilityInternal(vuln: OsvVuln): void {
    const advisoryRows = deriveAdvisoryPackageRows(vuln);
    const advisoryJson = JSON.stringify(vuln);
    const aliasesJson = JSON.stringify(vuln.aliases ?? []);

    this.upsertAdvisoryStatement.run({
      id: vuln.id,
      modified_at: null,
      aliases_json: aliasesJson,
      summary: vuln.summary ?? null,
      osv_json: advisoryJson,
    });

    this.deleteRangesStatement.run(vuln.id);
    for (const row of advisoryRows) {
      this.insertRangeStatement.run(row);
    }
  }

  getVulnerability(id: string): OsvVuln | null {
    const row = this.getVulnerabilityStatement.get(id) as { osv_json: string } | undefined;

    if (!row) return null;
    return JSON.parse(row.osv_json) as OsvVuln;
  }

  findMatchingVulnerabilityIds(pkg: PackageRef): string[] {
    if (!looksLikeVersion(pkg.version)) {
      return [];
    }

    const rows = this.findMatchingIdsStatement.all(pkg.ecosystem, pkg.name) as AdvisoryRangeRow[];

    const ids = new Set<string>();
    for (const row of rows) {
      if (versionMatchesRange(pkg.version, row)) {
        ids.add(row.advisory_id);
      }
    }

    return [...ids];
  }
}

function versionMatchesRange(version: string, row: AdvisoryRangeRow): boolean {
  const introduced = row.introduced;
  const fixed = row.fixed;
  const lastAffected = row.last_affected;

  if (introduced && introduced !== "0" && compareVersions(version, introduced) < 0) {
    return false;
  }

  if (fixed && compareVersions(version, fixed) >= 0) {
    return false;
  }

  if (lastAffected && compareVersions(version, lastAffected) > 0) {
    return false;
  }

  return true;
}

type InsertableAdvisoryRange = {
  advisory_id: string;
  ecosystem: string;
  package_name: string;
  introduced: string | null;
  fixed: string | null;
  last_affected: string | null;
};

function deriveAdvisoryPackageRows(vuln: OsvVuln): InsertableAdvisoryRange[] {
  const rows: InsertableAdvisoryRange[] = [];

  for (const affected of vuln.affected ?? []) {
    const ecosystem = affected.package?.ecosystem;
    const packageName = affected.package?.name;

    if (!ecosystem || !packageName) {
      continue;
    }

    for (const range of affected.ranges ?? []) {
      const events = range.events ?? [];
      let introduced: string | null = null;

      for (const event of events) {
        if (event.introduced) {
          introduced = event.introduced;
        }

        if (event.fixed || event.last_affected) {
          rows.push({
            advisory_id: vuln.id,
            ecosystem,
            package_name: packageName,
            introduced,
            fixed: event.fixed ?? null,
            last_affected: event.last_affected ?? null,
          });
          introduced = null;
        }
      }

      if (events.length === 0) {
        rows.push({
          advisory_id: vuln.id,
          ecosystem,
          package_name: packageName,
          introduced: null,
          fixed: null,
          last_affected: null,
        });
      } else if (introduced !== null) {
        rows.push({
          advisory_id: vuln.id,
          ecosystem,
          package_name: packageName,
          introduced,
          fixed: null,
          last_affected: null,
        });
      }
    }
  }

  return rows;
}
