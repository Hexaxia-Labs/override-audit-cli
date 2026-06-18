import fs from "node:fs";
import path from "node:path";
import type { MultiFolderScanResult } from "../scan/multi-folder-scan.js";
import {
  REPORT_STYLES,
  escapeHtml,
  openInBrowser,
  renderFindingRow,
  renderFixPlan,
  serializeHtmlFinding,
} from "./html-reporter.js";
import type { SerializedFinding } from "./html-reporter.js";
import { LOGO_BASE64 } from "./logo-base64.js";
import { OWASP_LOGO_BASE64 } from "./owasp-logo-base64.js";
import { pluralize } from "../utils/string.js";
import type { SeverityLabel } from "../types.js";

type SevCounts = Record<SeverityLabel, number>;

function summaryCounts(results: MultiFolderScanResult[]): SevCounts {
  const counts: SevCounts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, none: 0 };
  for (const r of results) {
    for (const f of r.sorted) {
      const sev = f.severity as keyof SevCounts;
      if (sev in counts) counts[sev]++;
    }
  }
  return counts;
}

function renderFolderNotices(coverage: string[]): string {
  if (coverage.length === 0) return "";
  const items = coverage.map(n => `<li>${escapeHtml(n)}</li>`).join("\n");
  return `<div class="scan-notes" style="margin:16px 32px 0">
  <button class="scan-notes-toggle" onclick="toggleNotes(this)"><span class="arrow">▶</span> Scan notes (${coverage.length})</button>
  <div class="scan-notes-body"><ul>${items}</ul></div>
</div>`;
}

function renderFolderSection(
  result: MultiFolderScanResult,
  folderIdx: number,
  idxOffset: number,
  serialized: SerializedFinding[],
): string {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const f of result.sorted) {
    const sev = f.severity as keyof typeof counts;
    if (sev in counts) counts[sev]++;
  }

  const severityParts = (["critical", "high", "medium", "low", "unknown"] as const)
    .filter(s => counts[s] > 0)
    .map(s => `${counts[s]} ${s}`)
    .join(", ");
  const summaryText = severityParts || "no findings";
  const isOpen = counts.critical > 0;
  const fi = folderIdx;

  const findingRowsHtml = serialized.map((f, i) => renderFindingRow(f, idxOffset + i)).join("\n");
  const fixPlanHtml = renderFixPlan(result.suggestedFixCommands);
  const noticesHtml = renderFolderNotices(result.coverage);

  const emptyRow = result.sorted.length === 0
    ? `<tr><td colspan="6" style="text-align:center;padding:24px;color:#8b949e">No findings</td></tr>`
    : "";

  return `
<details class="folder-section"${isOpen ? " open" : ""}>
  <summary class="folder-summary">
    <span class="folder-name">${escapeHtml(result.subfolder)}/</span>
    <span class="folder-counts">${escapeHtml(summaryText)}</span>
  </summary>
  <div class="folder-body">
    ${fixPlanHtml}
    ${noticesHtml}
    <div class="findings-section" style="margin:16px 32px 32px">
      <div class="findings-header">
        <h2>Findings</h2>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input class="search-input" type="text" id="findings-search-${fi}" placeholder="Search package, version, CVE…" oninput="applyFilters(${fi})" />
          <div class="filter-bar">
            <button class="filter-btn active" onclick="setFilter('all',this,${fi})">All (${result.sorted.length})</button>
            <button class="filter-btn" onclick="setFilter('critical',this,${fi})">Critical (${counts.critical})</button>
            <button class="filter-btn" onclick="setFilter('high',this,${fi})">High (${counts.high})</button>
            <button class="filter-btn" onclick="setFilter('medium',this,${fi})">Medium (${counts.medium})</button>
            <button class="filter-btn" onclick="setFilter('direct',this,${fi})">Direct only</button>
          </div>
        </div>
      </div>
      <table class="findings-table" id="findings-table-${fi}">
        <thead>
          <tr>
            <th style="width:32px"></th>
            <th onclick="sortBy('package',${fi})">Package <span class="sort-arrow">↕</span></th>
            <th>Fix available</th>
            <th onclick="sortBy('severity',${fi})" class="sorted">Severity <span class="sort-arrow" style="color:#58a6ff">↓</span></th>
            <th onclick="sortBy('relationship',${fi})">Type <span class="sort-arrow">↕</span></th>
            <th>CVE / Advisory</th>
          </tr>
        </thead>
        <tbody id="findings-tbody-${fi}" data-offset="${idxOffset}">
          ${emptyRow}${findingRowsHtml}
          <tr id="no-results-row-${fi}" style="display:none"><td colspan="6" class="no-results">No findings match your search.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</details>`;
}

export async function writeMultiFolderHtmlReport(params: {
  outputDir: string;
  results: MultiFolderScanResult[];
  projectPath: string;
  cliVersion: string;
  autoOpen: boolean;
}): Promise<{ reportPath: string }> {
  fs.mkdirSync(params.outputDir, { recursive: true });

  const projectName = path.basename(params.projectPath);
  const scanDate = new Date().toLocaleString();
  const counts = summaryCounts(params.results);
  const totalFindings = params.results.reduce((sum, r) => sum + r.sorted.length, 0);
  const totalCVEs = params.results.reduce(
    (sum, r) => sum + r.sorted.reduce((s, f) => s + f.cveAliases.length, 0),
    0,
  );
  const folderCount = params.results.length;

  // Pre-serialize findings once per folder for both HTML rendering and JS filter/sort
  const allSerialized: SerializedFinding[][] = params.results.map(r =>
    r.sorted.map(f => serializeHtmlFinding(f, r.suggestedFixCommands)),
  );

  // Compact per-folder findings for JavaScript (only fields needed for filter/sort/search)
  const folderFindingsJson = JSON.stringify(
    allSerialized.map(findings =>
      findings.map(f => ({
        package: f.package,
        version: f.version,
        severity: f.severity,
        relationship: f.relationship,
        cves: f.cves,
        vulnerabilities: f.vulnerabilities.map(v => ({ id: v.id })),
      })),
    ),
  )
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  let idxOffset = 0;
  const folderSectionsHtml = params.results
    .map((r, fi) => {
      const html = renderFolderSection(r, fi, idxOffset, allSerialized[fi]);
      idxOffset += r.sorted.length;
      return html;
    })
    .join("\n");

  // The OWASP SVG inline icon used in the header link
  const owaspSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 261.49332 261.50668" width="16" height="16" style="flex-shrink:0"><g transform="matrix(1.3333333,0,0,-1.3333333,0,261.50667)"><g transform="scale(0.1)"><path fill="#F68B1F" d="M 980.629,0 C 439.043,0 0,439.051 0,980.637 0,1522.22 439.043,1961.27 980.629,1961.27 1522.2,1961.27 1961.25,1522.22 1961.25,980.637 1961.25,439.051 1522.2,0 980.629,0 m -0.008,1810.35 c -458.226,0 -829.707,-371.48 -829.707,-829.705 0,-458.235 371.481,-829.715 829.707,-829.715 458.219,0 829.699,371.48 829.699,829.715 0,458.225 -371.48,829.705 -829.699,829.705"/><path fill="#F68B1F" d="m 1299.1,285.75 c -31.36,0.02 -145.64,203.41 -161,261.398 -32.11,121.411 -25.2,172.704 -23.28,189.102 5.88,50.07 54.46,75.09 57.4,142.801 0.91,20.91 11.47,125.449 19.9,207.109 -20.8,4.07 -41.52,13.45 -59.94,28 55.3,-74.17 -26.09,-163.058 -144.352,-281.332 C 862.305,707.309 583.695,590.809 583.695,590.809 c 0,0 116.508,278.613 242.024,404.132 92.269,92.259 166.636,162.079 230.101,162.079 17.89,0 34.92,-5.55 51.23,-17.7 -14.56,18.41 -23.93,39.12 -28.01,59.92 -81.661,-8.45 -186.208,-18.99 -207.106,-19.91 -67.719,-2.94 -92.743,-51.52 -142.782,-57.39 -5.761,-0.68 -15.828,-1.98 -31.722,-1.98 -29.367,0 -78.629,4.42 -157.387,25.27 -63.07,16.68 -298.078,150.37 -256.512,167.17 21.196,8.58 88.75,14.38 177.715,14.38 85.559,0 190.922,-5.36 293.844,-18.77 128.328,-16.72 246,-37.87 326.19,-53.6 1.3,4.31 2.86,8.5 4.73,12.57 l -81.98,39.29 c 0,0 -65.479,75.14 -58.487,80.32 0.27,0.2 0.613,0.3 1.023,0.3 10.27,0 62.654,-59.89 67.694,-66.71 3.88,-1.29 26.09,-8.7 49.45,-16.47 l -23.19,20.28 c 0,0 -31.74,117.55 -23.47,120.32 0.1,0.03 0.21,0.05 0.33,0.05 8.71,0 37.51,-102.22 39.98,-109.56 5.66,-4.96 24.78,-12.41 48.67,-26.19 l -25.12,64.62 c 0,0 11.37,106.61 19.88,106.61 0.07,0 0.13,-0.01 0.2,-0.02 8.57,-1.71 -1.68,-88.92 -3.85,-99.78 3.11,-4.77 22.38,-34.33 41.7,-63.97 11.89,4.48 24.68,6.69 37.81,6.69 15.07,0 30.57,-2.92 45.61,-8.67 -19.26,41.01 -17.8,83.75 7.74,109.27 8.08,8.1 17.9,13.75 28.84,17.1 1.32,7.46 4.78,14.54 10.45,20.22 7.39,7.38 17.12,11.05 26.97,11.05 10.31,0 20.76,-4.03 28.76,-12.04 7.67,-7.65 11.65,-17.54 11.99,-27.39 12.33,25.41 26.88,59.7 25.86,70.81 -2.37,25.14 -31.53,69.64 -31.8,70.09 -1.9,2.87 -1.11,6.75 1.78,8.66 1.05,0.69 2.24,1.02 3.42,1.02 2.03,0 4.02,-0.99 5.21,-2.82 1.29,-1.92 31.17,-47.54 33.83,-75.79 1.48,-16.16 -17.07,-56.88 -27.18,-77.68 14.2,-7.77 28.04,-18.03 40.68,-30.67 12.63,-12.63 22.89,-26.47 30.67,-40.68 20.01,9.73 58.4,27.26 75.71,27.26 0.69,0 1.35,-0.02 1.97,-0.08 28.24,-2.66 73.87,-32.54 75.78,-33.81 2.88,-1.89 3.68,-5.77 1.78,-8.65 -1.2,-1.82 -3.19,-2.81 -5.22,-2.81 -1.17,0 -2.36,0.33 -3.41,1.03 -0.45,0.29 -44.94,29.44 -70.09,31.79 -0.38,0.04 -0.79,0.05 -1.22,0.05 -12.23,0 -45.07,-13.97 -69.61,-25.89 9.87,-0.33 19.76,-4.33 27.4,-12 15.67,-15.65 16.1,-40.59 0.99,-55.7 -5.67,-5.68 -12.74,-9.17 -20.2,-10.47 -3.37,-10.95 -9.03,-20.77 -17.11,-28.85 -14.08,-14.09 -33.38,-20.84 -54.76,-20.84 -17.38,0 -36.13,4.47 -54.52,13.1 10.77,-28.12 11.59,-57.89 1.99,-83.41 29.62,-19.32 59.22,-38.6 63.96,-41.71 7.78,1.55 54.5,7.22 81.17,7.22 10.66,0 18.13,-0.9 18.61,-3.34 1.73,-8.56 -106.57,-20.12 -106.57,-20.12 l -64.63,25.15 c 13.79,-23.91 21.21,-43.02 26.18,-48.69 7.47,-2.5 112.26,-32.04 109.5,-40.31 -0.31,-0.96 -2.15,-1.37 -5.16,-1.37 -23.1,0 -115.14,24.85 -115.14,24.85 l -20.3,23.19 c 7.79,-23.37 15.18,-45.56 16.49,-49.45 7.1,-5.25 71.57,-61.7 66.4,-68.708 -0.27,-0.363 -0.71,-0.524 -1.32,-0.524 -11.31,0 -78.99,58.992 -78.99,58.992 l -39.3,81.99 c -4.06,-1.88 -8.26,-3.42 -12.58,-4.73 15.73,-80.19 36.89,-197.861 53.63,-326.181 27.34,-209.949 21.19,-429.969 4.39,-471.571 -1.35,-3.347 -3.46,-4.898 -6.2,-4.898"/></g></g></svg>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CVE Lite — ${escapeHtml(projectName)}</title>
<style>
${REPORT_STYLES}
.folder-section{margin:0 32px 16px;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.folder-summary{display:flex;align-items:center;gap:12px;padding:12px 18px;cursor:pointer;user-select:none;list-style:none;background:#1c2128;border-bottom:1px solid #30363d}
.folder-summary::-webkit-details-marker{display:none}
.folder-summary::before{content:"▶";font-size:10px;color:#8b949e;transition:transform .15s;flex-shrink:0}
details[open] .folder-summary::before{transform:rotate(90deg)}
.folder-name{font-size:13px;font-weight:600;color:#e6edf3;font-family:'SF Mono','Cascadia Code','Fira Code',monospace}
.folder-counts{font-size:11px;color:#8b949e;margin-left:auto}
.folder-body{padding:0}
.folder-body .fix-plan{margin:24px 32px 0}
</style>
</head>
<body>

<div class="report-header">
  <div class="header-left">
    <div class="header-logo-pair">
      <img src="${LOGO_BASE64}" alt="CVE Lite" class="header-logo" />
      <span class="header-logo-plus">+</span>
      <a href="https://owasp.org/cve-lite-cli/" target="_blank" rel="noopener" style="display:flex;align-items:center">
        <img src="${OWASP_LOGO_BASE64}" alt="An OWASP Foundation Project" class="header-logo" />
      </a>
    </div>
    <div class="header-divider"></div>
    <div class="header-project">
      <span class="project-name">${escapeHtml(projectName)}</span>
      <span class="project-meta">${folderCount} ${pluralize(folderCount, "folder")} &nbsp;·&nbsp; ${escapeHtml(scanDate)} &nbsp;·&nbsp; CVE Lite ${escapeHtml(params.cliVersion)}</span>
    </div>
  </div>
  <div class="header-right">
    <div class="header-stats">
      <span><strong>${folderCount}</strong> ${pluralize(folderCount, "folder")}</span>
      <span><strong>${totalFindings}</strong> findings</span>
    </div>
    <div class="header-links">
      <a class="header-link owasp-link" href="https://owasp.org/cve-lite-cli/" target="_blank">${owaspSvg} An OWASP Foundation Project</a>
      <a class="header-link" href="https://github.com/OWASP/cve-lite-cli" target="_blank">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
    </div>
  </div>
</div>

<div class="summary-bar">
  <div class="sev-card critical"><span class="count">${counts.critical}</span><span class="label">Critical</span></div>
  <div class="sev-card high"><span class="count">${counts.high}</span><span class="label">High</span></div>
  <div class="sev-card medium"><span class="count">${counts.medium}</span><span class="label">Medium</span></div>
  <div class="sev-card low"><span class="count">${counts.low}</span><span class="label">Low</span></div>
  <div class="sev-card total"><span class="count">${totalFindings}</span><span class="label">Findings</span></div>
  <div class="sev-card total"><span class="count">${totalCVEs}</span><span class="label">CVEs</span></div>
</div>

${folderSectionsHtml}

<div class="report-footer">
  <span>Generated by <strong>cve-lite v${escapeHtml(params.cliVersion)}</strong></span>
  <span>${folderCount} ${pluralize(folderCount, "folder")} &nbsp;·&nbsp; ${totalFindings} findings &nbsp;·&nbsp; ${totalCVEs} CVEs</span>
</div>

<script>
const SEV_ORDER = {critical:5,high:4,medium:3,low:2,unknown:1,none:0};
const folderFindings = ${folderFindingsJson};
const folderState = {};

function getFolderState(fi) {
  if (!folderState[fi]) folderState[fi] = { sortCol: 'severity', sortAsc: false, activeFilter: 'all' };
  return folderState[fi];
}

function toggleRow(idx) {
  const detail = document.getElementById('detail-' + idx);
  const mainRow = document.getElementById('row-' + idx);
  const icon = document.getElementById('icon-' + idx);
  if (!detail) return;
  const isVisible = detail.classList.contains('visible');
  detail.classList.toggle('visible', !isVisible);
  mainRow.classList.toggle('is-expanded', !isVisible);
  icon.textContent = isVisible ? '▶' : '▼';
}

function toggleNotes(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
}

// toggleSkipped is called inline by renderFixPlan; actual work is done via event delegation below
function toggleSkipped() {}

function setFilter(filter, btn, fi) {
  const state = getFolderState(fi);
  state.activeFilter = filter;
  const table = document.getElementById('findings-table-' + fi);
  if (table) table.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters(fi);
}

function applyFilters(fi) {
  const state = getFolderState(fi);
  const searchEl = document.getElementById('findings-search-' + fi);
  const query = searchEl ? (searchEl.value || '').toLowerCase().trim() : '';
  const tbody = document.getElementById('findings-tbody-' + fi);
  if (!tbody) return;
  const offset = parseInt(tbody.dataset.offset || '0', 10);
  const findings = folderFindings[fi] || [];
  let visibleCount = 0;

  findings.forEach((f, i) => {
    const absIdx = offset + i;
    const mainRow = document.getElementById('row-' + absIdx);
    const detailRow = document.getElementById('detail-' + absIdx);
    let visible = true;
    if (state.activeFilter === 'critical') visible = f.severity === 'critical';
    else if (state.activeFilter === 'high') visible = f.severity === 'high';
    else if (state.activeFilter === 'medium') visible = f.severity === 'medium';
    else if (state.activeFilter === 'direct') visible = f.relationship === 'direct';
    if (visible && query) {
      const ids = [...(f.cves || []), ...(f.vulnerabilities || []).map(v => v.id)].join(' ').toLowerCase();
      visible = f.package.toLowerCase().includes(query) || f.version.toLowerCase().includes(query) || ids.includes(query);
    }
    if (mainRow) mainRow.style.display = visible ? '' : 'none';
    if (detailRow && !visible) {
      detailRow.classList.remove('visible');
      if (mainRow) mainRow.classList.remove('is-expanded');
      const icon = document.getElementById('icon-' + absIdx);
      if (icon) icon.textContent = '▶';
    }
    if (visible) visibleCount++;
  });
  const noResults = document.getElementById('no-results-row-' + fi);
  if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
}

function sortBy(col, fi) {
  const state = getFolderState(fi);
  if (state.sortCol === col) { state.sortAsc = !state.sortAsc; } else { state.sortCol = col; state.sortAsc = col === 'package'; }

  const table = document.getElementById('findings-table-' + fi);
  if (table) {
    table.querySelectorAll('thead th').forEach(th => th.classList.remove('sorted'));
    const colIndex = ['', 'package', '', 'severity', 'relationship'].indexOf(col);
    if (colIndex > 0) table.querySelectorAll('thead th')[colIndex].classList.add('sorted');
  }

  const tbody = document.getElementById('findings-tbody-' + fi);
  if (!tbody) return;
  const offset = parseInt(tbody.dataset.offset || '0', 10);
  const findings = folderFindings[fi] || [];
  const indexed = findings.map((f, i) => ({ f, absIdx: offset + i }));
  indexed.sort((a, b) => {
    let cmp = 0;
    if (col === 'package') cmp = a.f.package.localeCompare(b.f.package);
    else if (col === 'severity') cmp = (SEV_ORDER[b.f.severity] || 0) - (SEV_ORDER[a.f.severity] || 0);
    else if (col === 'relationship') cmp = a.f.relationship.localeCompare(b.f.relationship);
    return state.sortAsc ? -cmp : cmp;
  });
  indexed.forEach(({ absIdx }) => {
    const mainRow = document.getElementById('row-' + absIdx);
    const detailRow = document.getElementById('detail-' + absIdx);
    if (mainRow) tbody.appendChild(mainRow);
    if (detailRow) tbody.appendChild(detailRow);
  });
  const noResults = document.getElementById('no-results-row-' + fi);
  if (noResults) tbody.appendChild(noResults);
}

document.addEventListener('click', function(e) {
  // Per-folder skipped section toggle (renderFixPlan uses a shared onclick="toggleSkipped()")
  if (e.target.classList.contains('skipped-toggle')) {
    const fixPlan = e.target.closest('.fix-plan');
    const section = fixPlan ? fixPlan.querySelector('.skipped-section') : null;
    if (!section) return;
    const isOpen = section.classList.toggle('open');
    (fixPlan || document).querySelectorAll('.skipped-toggle').forEach(btn => {
      btn.textContent = (isOpen ? '↑' : '↓') + btn.textContent.slice(1);
    });
    return;
  }
  const btn = e.target.closest('.copy-btn');
  if (btn && btn.dataset.cmd !== undefined) {
    e.stopPropagation();
    navigator.clipboard.writeText(btn.dataset.cmd).catch(() => {});
  }
});
</script>
</body>
</html>`;

  const indexPath = path.join(params.outputDir, "index.html");
  fs.writeFileSync(indexPath, html, "utf8");

  if (params.autoOpen) openInBrowser(indexPath);

  return { reportPath: indexPath };
}
