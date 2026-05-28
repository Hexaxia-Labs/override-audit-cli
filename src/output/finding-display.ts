import { severityOrder } from "../constants.js";
import { normalizeSeverity } from "../osv/severity.js";
import type { Finding, SeverityLabel } from "../types.js";

export function selectFindingsForTable(findings: Finding[], minSeverity: string): Finding[] {
  const normalized = normalizeSeverity(minSeverity) as SeverityLabel;
  return findings.filter(finding =>
    severityOrder[finding.severity] >= severityOrder[normalized] || finding.severity === "unknown"
  );
}

export function selectFindingsForCompact(
  findings: Finding[],
  options?: { urgentLimit?: number },
): Finding[] {
  const urgentLimit = options?.urgentLimit ?? 3;
  const urgent = findings
    .filter(finding => finding.severity === "critical" || finding.severity === "high")
    .slice(0, urgentLimit);
  const unknownDirect = findings.filter(
    finding => finding.severity === "unknown" && finding.relationship === "direct",
  );

  return mergeUniqueFindings(urgent, unknownDirect);
}

function mergeUniqueFindings(primary: Finding[], extra: Finding[]): Finding[] {
  const result = [...primary];
  const seen = new Set(result.map(findingIdentity));

  for (const finding of extra) {
    const id = findingIdentity(finding);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(finding);
  }

  return result;
}

function findingIdentity(finding: Finding): string {
  const vulnIds = finding.vulnerabilities.map(v => v.id).sort().join(",");
  return `${finding.pkg.name}@${finding.pkg.version}|${finding.relationship}|${finding.severity}|${vulnIds}`;
}
