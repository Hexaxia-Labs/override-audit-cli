import { OsvVuln, PackageRef } from "../types.js";
import { AdvisorySource, AdvisoryResult } from "./advisory-source.js";
import { extractErrorMessage } from "../utils/network.js";

export class OsvAdvisorySource implements AdvisorySource {
  constructor(private readonly baseUrl = "https://api.osv.dev") {}

  async queryBatch(packages: PackageRef[]): Promise<AdvisoryResult[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/querybatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          queries: packages.map(p => ({
            package: {
              ecosystem: p.ecosystem,
              name: p.name,
            },
            version: p.version,
          })),
        }),
      });

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
      const message = extractErrorMessage(error);
      throw new Error(`OSV batch query failed for ${this.baseUrl}: ${message}`);
    }
  }

  async getVuln(id: string): Promise<OsvVuln> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1/vulns/${encodeURIComponent(id)}`,
      );

      if (!response.ok) {
        throw new Error(`OSV vuln fetch failed for ${id}: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<OsvVuln>;
    } catch (error) {
      const message = extractErrorMessage(error);
      throw new Error(`OSV vuln fetch failed for ${id} via ${this.baseUrl}: ${message}`);
    }
  }
}
