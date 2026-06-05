import fs from "node:fs";
import path from "node:path";
import type { Finding, ScanSource } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";
import type { OverrideFinding } from "../overrides/types.js";
import { getRecommendedAction } from "./formatters.js";
import { getCliVersion } from "../utils/version-info.js";
import { severityToSarifLevel } from "../utils/severity.js";
import { buildOverrideSarifComponent, buildOverrideSarifResults } from "./override-findings-sarif.js";

type SarifLog = {
  $schema: string;
  version: "2.1.0";
  runs: SarifRun[];
};

type SarifRun = {
  tool: { driver: SarifDriver; extensions?: unknown[] };
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
};

type SarifLocation = {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId: string };
    region: { startLine: number };
  };
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
  _plan: SuggestedFixCommandPlan | null,
  overrideFindings?: ReadonlyArray<OverrideFinding>,
): SarifLog {
  const ruleMap = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const finding of findings) {
    const level = severityToSarifLevel(finding.severity);
    const action = getRecommendedAction(finding);

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

      results.push({
        ruleId,
        level,
        message: {
          text: `${finding.pkg.name}@${finding.pkg.version} is vulnerable (${finding.severity}). ${action}`,
        },
        locations: [location],
      });
    }
  }

  const extensions = overrideFindings && overrideFindings.length > 0
    ? [buildOverrideSarifComponent()]
    : undefined;

  const allResults = [
    ...results,
    ...(overrideFindings ? (buildOverrideSarifResults(overrideFindings) as SarifResult[]) : []),
  ];

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
          ...(extensions ? { extensions } : {}),
        },
        results: allResults,
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
  overrideFindings?: ReadonlyArray<OverrideFinding>,
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `cve-lite-scan-${ts}.sarif`;
  const outputPath = path.join(process.cwd(), filename);
  const sarif = buildSarifOutput(findings, lockfileUri, getCliVersion(), plan, overrideFindings);
  fs.writeFileSync(outputPath, JSON.stringify(sarif, null, 2));
  return filename;
}
