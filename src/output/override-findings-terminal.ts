import type { OverrideFinding } from "../overrides/types.js";

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export function renderOverrideFindings(findings: ReadonlyArray<OverrideFinding>): string {
  if (findings.length === 0) {
    return "No override hygiene findings.";
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("Override hygiene");
  lines.push("================");
  lines.push("");

  const grouped = new Map<typeof SEVERITY_ORDER[number], OverrideFinding[]>();
  for (const sev of SEVERITY_ORDER) grouped.set(sev, []);
  for (const f of findings) {
    grouped.get(f.severity as typeof SEVERITY_ORDER[number])?.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const bucket = grouped.get(sev) ?? [];
    if (bucket.length === 0) continue;
    lines.push(`${sev.toUpperCase()} (${bucket.length})`);
    lines.push("-".repeat(`${sev.toUpperCase()} (${bucket.length})`.length));
    for (const f of bucket) {
      lines.push(`  ${f.ruleId}  ${f.package.name}`);
      lines.push(`    ${f.location.file}${f.location.jsonPath ? `${f.location.jsonPath}` : ""}`);
      lines.push(`    ${f.message}`);
      if (f.fix) {
        lines.push(`    fix: applyable patch (${f.fix.patch.length} op${f.fix.patch.length === 1 ? "" : "s"})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
