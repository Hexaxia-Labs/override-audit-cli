import type { OsvVuln, SeverityLabel } from "../types.js";
import { severityOrder } from "../constants.js";

export function maxSeverity(vulns: OsvVuln[]): SeverityLabel {
  let current: SeverityLabel = "none";

  for (const vuln of vulns) {
    const sev = inferSeverity(vuln);
    if (severityOrder[sev] > severityOrder[current]) {
      current = sev;
    }
  }

  return current;
}

export function inferSeverity(vuln: OsvVuln): SeverityLabel {
  const rawScores = vuln.severity ?? [];
  for (const item of rawScores) {
    const score = item?.score ?? "";
    const label = severityFromScore(score);
    if (label !== "unknown") return label;
  }

  const db = vuln.database_specific as Record<string, any> | undefined;
  const dbSeverity = String(db?.severity ?? "").toLowerCase();
  // OSV uses "MODERATE" where our label is "medium".
  if (dbSeverity === "moderate") return "medium";
  if (["critical", "high", "medium", "low"].includes(dbSeverity)) {
    return dbSeverity as SeverityLabel;
  }

  return "unknown";
}

function severityFromScore(score: string): SeverityLabel {
  // CVSS vector strings (e.g. "CVSS:3.1/AV:N/...") are not numerical scores.
  // Extracting the first number would yield the CVSS version (3.1), not the base
  // score — causing every CVSS_V3 advisory to be misclassified as "low".
  // Return unknown so the caller falls through to database_specific.severity.
  if (String(score).startsWith("CVSS:")) return "unknown";

  const match = String(score).match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return "unknown";
  const value = Number(match[1]);
  if (Number.isNaN(value)) return "unknown";
  if (value >= 9.0) return "critical";
  if (value >= 7.0) return "high";
  if (value >= 4.0) return "medium";
  if (value > 0) return "low";
  return "none";
}

export function normalizeSeverity(input: string): SeverityLabel {
  const normalized = String(input || "").toLowerCase();
  if (["none", "low", "medium", "high", "critical", "unknown"].includes(normalized)) {
    return normalized as SeverityLabel;
  }
  return "critical";
}
