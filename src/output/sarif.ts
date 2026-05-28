import fs from "node:fs";
import path from "node:path";
import type { Finding, ScanSource } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import { findSuggestedCommandForFinding } from "../remediation/fix-commands.js";
import { getRecommendedAction } from "./formatters.js";
import { getCliVersion } from "../utils/version-info.js";
import { severityToSarifLevel } from "../utils/severity.js";

type SarifLog = {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
};

type SarifRun = {
  tool: { driver: SarifDriver };
  results: SarifResult[];
  artifacts: SarifArtifact[];
};

type SarifDriver = {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
};

type SarifRule = {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  helpUri: string;
  defaultConfiguration: { level: "error" | "warning" | "note" };
  properties: { tags: string[] };
};

type SarifResult = {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: SarifLocation[];
  fixes?: SarifFix[];
};

type SarifLocation = {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId: string };
    region: { startLine: number };
  };
};

type SarifArtifactChange = Record<string, never>;

type SarifFix = {
  description: { text: string };
  artifactChanges: SarifArtifactChange[];
};

type SarifArtifact = {
  location: { uri: string; uriBaseId: string };
};

const SARIF_RULE_NAME = "VulnerableDependency";

const LOCKFILE_NAMES: Record<ScanSource, string> = {
  "package-lock": "package-lock.json",
  "npm-shrinkwrap": "npm-shrinkwrap.json",
  "pnpm-lock": "pnpm-lock.yaml",
  "yarn-lock": "yarn.lock",
  "bun-lock": "bun.lockb",
  "package-json": "package.json",
  "unknown": "lockfile",
};

export function deriveLockfileUri(scanInput: { filePath: string | null; source: ScanSource }): string {
  if (scanInput.filePath) return path.basename(scanInput.filePath);
  return LOCKFILE_NAMES[scanInput.source] ?? "lockfile";
}

export function buildSarifOutput(
  findings: Finding[],
  lockfileUri: string,
  version: string,
  plan: SuggestedFixCommandPlan | null,
): SarifLog {
  const ruleMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const finding of findings) {
    const level = severityToSarifLevel(finding.severity);
    const action = getRecommendedAction(finding);
    const runnableFixCommand = plan ? findSuggestedCommandForFinding(plan, finding) : null;

    const location: SarifLocation = {
      physicalLocation: {
        artifactLocation: { uri: lockfileUri, uriBaseId: "%SRCROOT%" },
        region: { startLine: 1 },
      },
    };

    const ruleIds = finding.cveAliases.length > 0
      ? finding.cveAliases
      : finding.vulnerabilities.map(v => v.id);

    for (const ruleId of ruleIds) {
      if (!ruleMap.has(ruleId)) {
        ruleMap.set(ruleId, {
          id: ruleId,
          name: SARIF_RULE_NAME,
          shortDescription: { text: ruleId },
          fullDescription: { text: `Vulnerable dependency: ${ruleId}` },
          helpUri: `https://osv.dev/vulnerability/${ruleId}`,
          defaultConfiguration: { level },
          properties: { tags: ["security", "dependency"] },
        });
      }

      const result: SarifResult = {
        ruleId,
        level,
        message: {
          text: `${finding.pkg.name}@${finding.pkg.version} is vulnerable (${finding.severity}). ${action}`,
        },
        locations: [location],
      };

      if (runnableFixCommand) {
        result.fixes = [{ description: { text: runnableFixCommand }, artifactChanges: [] }];
      }

      results.push(result);
    }
  }

  return {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "CVE Lite CLI",
            version,
            informationUri: "https://owasp.org/cve-lite-cli/",
            rules: Array.from(ruleMap.values()),
          },
        },
        results,
        artifacts: [
          { location: { uri: lockfileUri, uriBaseId: "%SRCROOT%" } },
        ],
      },
    ],
  };
}

export function writeSarifReport(
  findings: Finding[],
  lockfileUri: string,
  plan: SuggestedFixCommandPlan | null,
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `cve-lite-scan-${ts}.sarif`;
  const outputPath = path.join(process.cwd(), filename);
  const sarif = buildSarifOutput(findings, lockfileUri, getCliVersion(), plan);
  fs.writeFileSync(outputPath, JSON.stringify(sarif, null, 2));
  return filename;
}
