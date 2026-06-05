import type { OverrideFinding } from "../overrides/types.js";

const OA_RULES: Array<{ id: string; name: string; shortDescription: string; helpUri: string }> = [
  { id: "OA001", name: "OrphanedTarget", shortDescription: "Override target not in resolved tree", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA001.md" },
  { id: "OA002", name: "FloatingTag", shortDescription: "Override pins to a moving tag", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA002.md" },
  { id: "OA003", name: "WrongSection", shortDescription: "Override in unrecognised package-manager section", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA003.md" },
  { id: "OA004", name: "SurpassedPin", shortDescription: "Installed version surpasses the override pin", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA004.md" },
  { id: "OA005", name: "NestedIneffective", shortDescription: "Nested override has no effective scope", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA005.md" },
  { id: "OA006", name: "CoupledPlatformBinary", shortDescription: "Override fights exact-pinned parent", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA006.md" },
  { id: "OA007", name: "FrozenLatest", shortDescription: "\"latest\" tag has moved", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA007.md" },
  { id: "OA008", name: "MaterializedVulnerable", shortDescription: "Vulnerable copy still on disk", helpUri: "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA008.md" },
];

const SEVERITY_TO_LEVEL: Record<string, "error" | "warning" | "note"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

export function buildOverrideSarifComponent(): unknown {
  return {
    name: "cve-lite-cli-overrides",
    version: "1.0.0",
    informationUri: "https://github.com/OWASP/cve-lite-cli",
    rules: OA_RULES.map((r) => ({
      id: r.id,
      name: r.name,
      shortDescription: { text: r.shortDescription },
      helpUri: r.helpUri,
    })),
  };
}

export interface OverrideSarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string; uriBaseId: string };
      region: { startLine: number };
    };
  }>;
  properties?: Record<string, unknown>;
}

export function buildOverrideSarifResults(
  findings: ReadonlyArray<OverrideFinding>,
): OverrideSarifResult[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    level: SEVERITY_TO_LEVEL[f.severity] ?? "warning",
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.location.file, uriBaseId: "%SRCROOT%" },
          region: { startLine: f.location.line ?? 1 },
        },
      },
    ],
    properties: {
      package: f.package.name,
      jsonPath: f.location.jsonPath,
      severity: f.severity,
    },
  }));
}
