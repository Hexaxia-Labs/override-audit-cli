import { OsvVuln, PackageRef } from "../types.js";
import { AdvisorySource, AdvisoryResult } from "./advisory-source.js";
import { extractErrorMessage } from "../utils/network.js";
import type { DebugLogger } from "../output/debug.js";

export class OsvAdvisorySource implements AdvisorySource {
  constructor(
    private readonly baseUrl = "https://api.osv.dev",
    private readonly debugLog?: DebugLogger,
  ) {}

  async queryBatch(packages: PackageRef[], meta?: { batchId?: string }): Promise<AdvisoryResult[]> {
    const requestUrl = `${this.baseUrl}/v1/querybatch`;
    const payload = {
      queries: packages.map(p => ({
        package: {
          ecosystem: p.ecosystem,
          name: p.name,
        },
        version: p.version,
      })),
    };
    const startedAt = this.debugLog ? Date.now() : 0;

    try {
      if (this.debugLog) {
        this.debugLog("OSV request", {
          batchId: meta?.batchId ?? null,
          method: "POST",
          url: requestUrl,
          headers: {
            "Content-Type": "application/json",
          },
          queryCount: packages.length,
          sample: packages.slice(0, 3).map(p => ({
            ecosystem: p.ecosystem,
            name: p.name,
            version: p.version,
          })),
        });
      }

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (this.debugLog) {
        this.debugLog("OSV response", {
          batchId: meta?.batchId ?? null,
          method: "POST",
          url: requestUrl,
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startedAt,
        });
      }

      if (!response.ok) {
        throw new Error(`OSV batch query failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return data.results.map((r: any, i: number) => ({
        package: packages[i].name,
        version: packages[i].version,
        vulnerabilities: r.vulns || [],
      }));
    } catch (error) {
      if (this.debugLog) {
        this.debugLog("OSV request failed", {
          batchId: meta?.batchId ?? null,
          method: "POST",
          url: requestUrl,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error),
        });
      }
      const message = extractErrorMessage(error);
      throw new Error(`OSV batch query failed for ${this.baseUrl}: ${message}`);
    }
  }

  async getVuln(id: string): Promise<OsvVuln> {
    const requestUrl = `${this.baseUrl}/v1/vulns/${encodeURIComponent(id)}`;
    const startedAt = this.debugLog ? Date.now() : 0;

    try {
      if (this.debugLog) {
        this.debugLog("OSV request", {
          method: "GET",
          url: requestUrl,
          headers: {},
        });
      }
      const response = await fetch(requestUrl);
      if (this.debugLog) {
        this.debugLog("OSV response", {
          method: "GET",
          url: requestUrl,
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startedAt,
        });
      }

      if (!response.ok) {
        throw new Error(`OSV vuln fetch failed for ${id}: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<OsvVuln>;
    } catch (error) {
      if (this.debugLog) {
        this.debugLog("OSV request failed", {
          method: "GET",
          url: requestUrl,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error),
        });
      }
      const message = extractErrorMessage(error);
      throw new Error(`OSV vuln fetch failed for ${id} via ${this.baseUrl}: ${message}`);
    }
  }
}
