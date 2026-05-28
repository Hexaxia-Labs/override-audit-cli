import type { OsvVuln, PackageRef } from "../types.js";
import type { AdvisoryResult, AdvisorySource } from "./advisory-source.js";
import { LocalAdvisoryDatabase } from "./local-db.js";

export class LocalAdvisorySource implements AdvisorySource {
  constructor(private readonly db: LocalAdvisoryDatabase) {}

  queryBatch(packages: PackageRef[]): Promise<AdvisoryResult[]> {
    const results = packages.map(pkg => ({
      package: pkg.name,
      version: pkg.version,
      vulnerabilities: this.db.findMatchingVulnerabilityIds(pkg).map(id => ({ id })),
    }));

    return Promise.resolve(results);
  }

  getVuln(id: string): Promise<OsvVuln> {
    const vuln = this.db.getVulnerability(id);
    if (!vuln) {
      return Promise.reject(new Error(`Local advisory database lookup failed for ${id}`));
    }

    return Promise.resolve(vuln);
  }
}
