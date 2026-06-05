import type { OverrideFinding } from "../overrides/types.js";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export function renderOverrideFindingsHtml(
  findings: ReadonlyArray<OverrideFinding>
): string {
  if (findings.length === 0) {
    return `
<section class="override-hygiene">
  <h2>Override hygiene</h2>
  <p>No override hygiene findings.</p>
</section>
`;
  }

  const grouped = new Map<typeof SEVERITY_ORDER[number], OverrideFinding[]>();
  for (const sev of SEVERITY_ORDER) grouped.set(sev, []);
  for (const f of findings) grouped.get(f.severity as typeof SEVERITY_ORDER[number])?.push(f);

  const rows: string[] = [];
  for (const sev of SEVERITY_ORDER) {
    const bucket = grouped.get(sev) ?? [];
    if (bucket.length === 0) continue;
    rows.push(`  <tr class="severity-group"><th colspan="4">${esc(sev.toUpperCase())} (${bucket.length})</th></tr>`);
    for (const f of bucket) {
      rows.push(
        `  <tr class="finding ${esc(f.severity)}">` +
          `<td>${esc(f.ruleId)}</td>` +
          `<td>${esc(f.package.name)}</td>` +
          `<td>${esc(f.location.file)}${f.location.jsonPath ? esc(f.location.jsonPath) : ""}</td>` +
          `<td>${esc(f.message)}</td>` +
        `</tr>`
      );
    }
  }

  return `
<section class="override-hygiene">
  <h2>Override hygiene</h2>
  <table>
    <thead>
      <tr><th>Rule</th><th>Package</th><th>Location</th><th>Message</th></tr>
    </thead>
    <tbody>
${rows.join("\n")}
    </tbody>
  </table>
</section>
`;
}
