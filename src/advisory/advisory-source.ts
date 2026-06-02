import { OsvVuln, PackageRef } from "../types.js";

export interface AdvisoryResult {
  package: string;
  version: string;
  vulnerabilities: any[]; // refine later
}

export interface AdvisorySource {
  queryBatch(packages: PackageRef[], meta?: { batchId?: string }): Promise<AdvisoryResult[]>;
  getVuln(id: string): Promise<OsvVuln>;
}