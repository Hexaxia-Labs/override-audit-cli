import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Finding, PackageRef, SeverityLabel } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import { findSuggestedCommandForFinding } from "../remediation/fix-commands.js";
import { getRecommendedAction } from "./formatters.js";
import { getCliVersion } from "../utils/version-info.js";

export type ProjectMeta = { name?: string; version?: string } | null;

type CycloneDxComponent = {
  type: "library" | "application";
  "bom-ref": string;
  name: string;
  version: string;
  purl: string;
};

type CycloneDxVulnerabilityAffects = {
  ref: string;
};

type CycloneDxRating = {
  severity: SeverityLabel;
  method: string;
};

type CycloneDxVulnerability = {
  id: string;
  source: { name: string; url: string };
  ratings: CycloneDxRating[];
  affects: CycloneDxVulnerabilityAffects[];
  recommendation?: string;
};

type CycloneDxMetadataComponent = {
  type: "application";
  name: string;
  version?: string;
};

type CycloneDxMetadata = {
  timestamp: string;
  tools: Array<{ vendor: string; name: string; version: string }>;
  component?: CycloneDxMetadataComponent;
};

type CycloneDxBom = {
  bomFormat: "CycloneDX";
  specVersion: "1.4";
  version: number;
  serialNumber: string;
  metadata: CycloneDxMetadata;
  components: CycloneDxComponent[];
  vulnerabilities: CycloneDxVulnerability[];
};

export function buildPurl(name: string, version: string): string {
  const encodedName = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encodedName}@${version}`;
}

export function buildCycloneDxBom(
  allPackages: PackageRef[],
  findings: Finding[],
  projectMeta: ProjectMeta,
  version: string,
  plan: SuggestedFixCommandPlan | null = null,
): CycloneDxBom {
  const components: CycloneDxComponent[] = allPackages.map(pkg => {
    const purl = buildPurl(pkg.name, pkg.version);
    return {
      type: "library",
      "bom-ref": purl,
      name: pkg.name,
      version: pkg.version,
      purl,
    };
  });

  // Deduplicate vulnerabilities by CVE ID — one entry per CVE with multiple affects
  const vulnMap = new Map<string, { finding: Finding; affects: CycloneDxVulnerabilityAffects[] }>();

  for (const finding of findings) {
    const cveIds = finding.cveAliases.length > 0
      ? finding.cveAliases
      : finding.vulnerabilities.map(v => v.id);

    const purl = buildPurl(finding.pkg.name, finding.pkg.version);

    for (const cveId of cveIds) {
      const existing = vulnMap.get(cveId);
      if (existing) {
        existing.affects.push({ ref: purl });
      } else {
        // severity from first finding wins when the same CVE affects multiple packages
        vulnMap.set(cveId, { finding, affects: [{ ref: purl }] });
      }
    }
  }

  const vulnerabilities: CycloneDxVulnerability[] = [];

  for (const [cveId, { finding, affects }] of vulnMap) {
    const runnableFixCommand = plan ? findSuggestedCommandForFinding(plan, finding) : null;
    const recommendation = runnableFixCommand ?? getRecommendedAction(finding);

    vulnerabilities.push({
      id: cveId,
      source: {
        name: "OSV",
        url: `https://osv.dev/vulnerability/${cveId}`,
      },
      ratings: [{ severity: finding.severity, method: "other" }],
      affects,
      recommendation,
    });
  }

  const metadata: CycloneDxMetadata = {
    timestamp: new Date().toISOString(),
    tools: [
      { vendor: "OWASP", name: "CVE Lite CLI", version },
    ],
  };

  if (projectMeta && projectMeta.name) {
    const metaComponent: CycloneDxMetadataComponent = {
      type: "application",
      name: projectMeta.name,
    };
    if (projectMeta.version) {
      metaComponent.version = projectMeta.version;
    }
    metadata.component = metaComponent;
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.4",
    version: 1,
    serialNumber: `urn:uuid:${randomUUID()}`,
    metadata,
    components,
    vulnerabilities,
  };
}

export function writeCycloneDxReport(
  allPackages: PackageRef[],
  findings: Finding[],
  plan: SuggestedFixCommandPlan | null,
  projectMeta: ProjectMeta,
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `cve-lite-scan-${ts}.cdx.json`;
  const outputPath = path.join(process.cwd(), filename);
  const bom = buildCycloneDxBom(allPackages, findings, projectMeta, getCliVersion(), plan);
  fs.writeFileSync(outputPath, JSON.stringify(bom, null, 2));
  return filename;
}
