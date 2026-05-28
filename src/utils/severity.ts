import type { SeverityLabel } from "../types.js";

export function countBySeverity<T extends { severity: SeverityLabel }>(findings: T[]): Record<SeverityLabel, number> {
  const counts: Record<SeverityLabel, number> = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    unknown: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function severityToSarifLevel(severity: SeverityLabel): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}
