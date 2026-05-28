import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { serializeFinding } from "./formatters.js";
import { LOGO_BASE64 } from "./logo-base64.js";
import { OWASP_LOGO_BASE64 } from "./owasp-logo-base64.js";
import { isMajorVersionBump } from "../utils/version.js";
import { pluralize } from "../utils/string.js";
import type { Finding } from "../types.js";
import type { SuggestedFixCommandPlan } from "../remediation/fix-commands.js";

export type SerializedFinding = ReturnType<typeof serializeFinding>;

export type ReportData = {
  projectPath: string;
  scannedAt: string;
  cliVersion: string;
  packageManager: string;
  lockfileSource: string;
  packageCount: number;
  findings: SerializedFinding[];
  suggestedFixCommands: SuggestedFixCommandPlan | null;
  notes: string[];
  warnings: string[];
};

export function buildReportData(params: {
  projectPath: string;
  cliVersion: string;
  packageManager: string;
  lockfileSource: string;
  packageCount: number;
  findings: Finding[];
  suggestedFixCommands: SuggestedFixCommandPlan | null;
  notes: string[];
  warnings: string[];
}): ReportData {
  return {
    projectPath: params.projectPath,
    scannedAt: new Date().toISOString(),
    cliVersion: params.cliVersion,
    packageManager: params.packageManager,
    lockfileSource: params.lockfileSource,
    packageCount: params.packageCount,
    findings: params.findings.map(finding => serializeFinding(finding, params.suggestedFixCommands)),
    suggestedFixCommands: params.suggestedFixCommands,
    notes: params.notes,
    warnings: params.warnings,
  };
}

export function renderHtmlReport(data: ReportData): string {
  const projectName = path.basename(data.projectPath);
  const scanDate = new Date(data.scannedAt).toLocaleString();

  const counts = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0, none: 0 };
  for (const f of data.findings) {
    const sev = f.severity as keyof typeof counts;
    if (sev in counts) counts[sev]++;
  }

  const totalCVEs = new Set(data.findings.flatMap(f => f.vulnerabilities.map(v => v.id))).size;

  const noticesHtml = renderNotices(data.notes, data.warnings);
  const fixPlanHtml = renderFixPlan(data.suggestedFixCommands);
  const findingRowsHtml = data.findings.map(renderFindingRow).join("\n");
  const dataJson = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CVE Lite — ${escapeHtml(projectName)}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.5}
.report-header{background:#161b22;border-bottom:1px solid #30363d;padding:14px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.header-left{display:flex;align-items:center;gap:20px}
.header-logo-pair{display:flex;align-items:center;gap:8px;background:#fff;border-radius:7px;padding:6px 12px}
.header-logo{height:26px;width:auto;display:block}
.header-logo-plus{font-size:15px;font-weight:700;color:#94a3b8;line-height:1;user-select:none}
.header-divider{width:1px;height:28px;background:#30363d}
.header-project .project-name{font-size:14px;font-weight:600;color:#e6edf3}
.header-project .project-meta{font-size:11px;color:#8b949e}
.header-right{display:flex;align-items:center;gap:20px}
.header-stats{display:flex;gap:16px;font-size:12px;color:#8b949e}
.header-stats span strong{color:#e6edf3}
.header-links{display:flex;gap:8px}
.header-link{display:flex;align-items:center;gap:5px;font-size:12px;color:#8b949e;text-decoration:none;background:#21262d;border:1px solid #30363d;border-radius:6px;padding:5px 10px}
.header-link:hover{color:#58a6ff;border-color:#58a6ff}
button.header-link{cursor:pointer;border:1px solid #30363d;font:inherit;background:#21262d;color:#8b949e}
button.header-link:hover{color:#58a6ff;border-color:#58a6ff}
.header-link.owasp-link{color:#F68B1F;border-color:#F68B1F44}.header-link.owasp-link:hover{color:#F68B1F;border-color:#F68B1F;background:#F68B1F11}
.summary-bar{padding:20px 32px;display:flex;gap:12px;border-bottom:1px solid #21262d}
.sev-card{flex:1;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.sev-card .count{font-size:28px;font-weight:700;line-height:1}
.sev-card .label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#8b949e}
.sev-card.critical{border-top:3px solid #f85149}.sev-card.critical .count{color:#f85149}
.sev-card.high{border-top:3px solid #fb8500}.sev-card.high .count{color:#fb8500}
.sev-card.medium{border-top:3px solid #e3b341}.sev-card.medium .count{color:#e3b341}
.sev-card.low{border-top:3px solid #388bfd}.sev-card.low .count{color:#388bfd}
.sev-card.total{border-top:3px solid #30363d}.sev-card.total .count{color:#e6edf3}
.fix-plan{margin:24px 32px;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
.fix-plan-header{padding:14px 18px;background:#1c2128;border-bottom:1px solid #30363d;display:flex;align-items:center;justify-content:space-between}
.fix-plan-header h2{font-size:13px;font-weight:600;color:#e6edf3;display:flex;align-items:center;gap:8px}
.fix-plan-header h2 .icon{color:#3fb950}
.fix-plan-header .badge{font-size:11px;background:#1f6feb33;color:#58a6ff;border:1px solid #1f6feb66;border-radius:12px;padding:2px 8px}
.fix-commands{padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.skipped-toggle{font-size:11px;background:none;border:none;color:#58a6ff;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:2px}
.skipped-toggle:hover{color:#79c0ff}
.skipped-section{display:none;border-top:1px solid #21262d;padding:12px 18px;flex-direction:column;gap:6px}
.skipped-section.open{display:flex}
.skipped-row{display:grid;grid-template-columns:180px 80px 1fr;gap:8px;font-size:11px;padding:5px 8px;border-radius:4px;background:#0d1117;border:1px solid #21262d}
.skipped-pkg{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;color:#8b949e}
.skipped-rel{color:#8b949e}
.skipped-rel.direct{color:#3fb950}
.skipped-rel.transitive{color:#e3b341}
.skipped-reason{color:#6b7280}
.fix-cmd{display:flex;align-items:center;gap:12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 14px}
.fix-cmd .cmd-text{flex:1;font-family:'SF Mono','Cascadia Code','Fira Code',monospace;font-size:12px;color:#3fb950}
.fix-cmd .cmd-meta{font-size:11px;color:#8b949e;white-space:nowrap}
.fix-cmd .copy-btn{font-size:11px;color:#8b949e;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:3px 8px;cursor:pointer}
.fix-cmd .copy-btn:hover{color:#e6edf3;background:#30363d}
.findings-section{margin:0 32px 32px}
.findings-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.findings-header h2{font-size:13px;font-weight:600;color:#e6edf3}
.filter-bar{display:flex;gap:6px}
.filter-btn{font-size:11px;border-radius:20px;padding:4px 12px;border:1px solid #30363d;background:transparent;color:#8b949e;cursor:pointer}
.filter-btn:hover{border-color:#58a6ff;color:#58a6ff}
.filter-btn.active{background:#1f6feb22;border-color:#58a6ff;color:#58a6ff}
.search-input{font-size:12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:4px 10px;width:200px;outline:none}
.search-input::placeholder{color:#6b7280}
.search-input:focus{border-color:#58a6ff}
.no-results{text-align:center;padding:32px;color:#8b949e;font-size:13px;display:none}
.findings-table{width:100%;border-collapse:collapse}
.findings-table thead th{text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#8b949e;padding:10px 14px;border-bottom:1px solid #21262d;background:#161b22;cursor:pointer;white-space:nowrap;user-select:none}
.findings-table thead th:hover{color:#e6edf3}
.findings-table thead th.sorted .sort-arrow{color:#58a6ff}
.findings-table thead th .sort-arrow{color:#30363d;margin-left:4px}
.findings-table tbody tr{border-bottom:1px solid #21262d;cursor:pointer}
.findings-table tbody tr:hover{background:#161b22}
.findings-table tbody tr.is-expanded{background:#161b22}
.findings-table tbody td{padding:11px 14px;vertical-align:middle}
.pkg-name{font-weight:500;color:#58a6ff;font-size:13px}
.pkg-version{font-size:11px;color:#8b949e}
.sev-badge{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;padding:2px 7px;border-radius:4px}
.sev-badge.critical{background:#f8514922;color:#f85149;border:1px solid #f8514966}
.sev-badge.high{background:#fb850022;color:#fb8500;border:1px solid #fb850066}
.sev-badge.medium{background:#e3b34122;color:#e3b341;border:1px solid #e3b34166}
.sev-badge.low{background:#388bfd22;color:#388bfd;border:1px solid #388bfd66}
.sev-badge.unknown{background:#8b949e22;color:#8b949e;border:1px solid #8b949e66}
.rel-badge{font-size:11px;padding:2px 7px;border-radius:4px}
.rel-badge.direct{color:#3fb950;background:#3fb95022}
.rel-badge.transitive{color:#e3b341;background:#e3b34122}
.rel-badge.unknown{color:#8b949e;background:#8b949e22}
.cve-link{font-size:11px;color:#58a6ff;font-family:monospace;text-decoration:none;border-bottom:1px dotted #58a6ff66}
.cve-link:hover{color:#79c0ff}
.fix-hint{font-size:11px;color:#3fb950;font-family:monospace}
.fix-hint.none{color:#e3b341}
.expand-icon{color:#8b949e;font-size:10px}
.detail-row{background:#0d1117;border-top:1px solid #21262d;display:none}
.detail-row.visible{display:table-row}
.detail-row td{padding:0!important}
.expanded-inner{padding:16px 20px 20px 48px;display:flex;gap:32px}
.detail-col{flex:1}
.detail-col h4{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#8b949e;margin-bottom:8px}
.detail-col p{font-size:12px;color:#8b949e;line-height:1.6}
.dep-path{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dep-node{font-size:11px;font-family:monospace;background:#161b22;border:1px solid #30363d;border-radius:4px;padding:2px 8px;color:#e6edf3}
.dep-node.vulnerable{border-color:#f85149;color:#f85149}
.dep-arrow{color:#8b949e;font-size:11px}
.fix-cmd-inline{display:flex;align-items:center;gap:8px;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:8px 12px;margin-top:4px}
.fix-cmd-inline code{flex:1;font-family:monospace;font-size:12px;color:#3fb950}
.fix-cmd-inline .copy-btn{font-size:11px;color:#8b949e;background:#21262d;border:1px solid #30363d;border-radius:4px;padding:3px 8px;cursor:pointer}
.fix-cmd-note{margin:4px 0 0;font-size:12px;color:#8b949e;font-style:italic;line-height:1.5}
.report-footer{margin:0 32px 32px;padding:12px 0;border-top:1px solid #21262d;display:flex;justify-content:space-between;font-size:11px;color:#8b949e}
.scan-notes{margin:0 32px 16px}
.scan-notes-toggle{display:flex;align-items:center;gap:6px;font-size:11px;color:#8b949e;background:none;border:none;cursor:pointer;padding:0}
.scan-notes-toggle:hover{color:#e6edf3}
.scan-notes-toggle .arrow{font-size:9px;transition:transform .15s}
.scan-notes-toggle.open .arrow{transform:rotate(90deg)}
.scan-notes-body{display:none;margin-top:6px;padding:10px 14px;background:#161b22;border:1px solid #21262d;border-radius:6px}
.scan-notes-body.open{display:block}
.scan-notes-body ul{margin:0;padding:0 0 0 16px;display:flex;flex-direction:column;gap:3px}
.scan-notes-body li{font-size:11px;color:#8b949e;line-height:1.5}
.scan-notes-body li.warning{color:#e6b84a}
.fix-targets-list{display:flex;flex-direction:column;gap:4px;margin-top:6px;padding:8px 10px;background:#161b22;border:1px solid #21262d;border-radius:5px}
.fix-target-row{display:flex;align-items:center;gap:8px;font-size:11px;flex-wrap:wrap}
.fix-target-pkg{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;color:#8b949e}
.fix-target-arrow{color:#8b949e}
.fix-target-to{font-family:'SF Mono','Cascadia Code','Fira Code',monospace;color:#3fb950}
.fix-target-stats{color:#6b7280;font-size:10px}
.fix-target-note{color:#6b7280;font-style:italic;font-size:10px}
.fix-target-coverage{flex-basis:100%;color:#6b7280;font-size:10px;line-height:1.45}
.break-badge{font-size:10px;font-weight:700;background:#fb850022;color:#fb8500;border:1px solid #fb850066;border-radius:4px;padding:1px 5px}
.tier-ok{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:4px;background:#3fb95022;color:#3fb950;border:1px solid #3fb95033;margin-bottom:6px}
.tier-warn{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:4px;background:#e3b34122;color:#e3b341;border:1px solid #e3b34133;margin-bottom:6px}
.tier-err{display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:4px;background:#ff000011;color:#ff7b72;border:1px solid #ff7b7222;margin-bottom:6px}
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
      <span class="project-meta">${escapeHtml(data.packageManager)} &nbsp;·&nbsp; ${escapeHtml(data.lockfileSource)} &nbsp;·&nbsp; ${escapeHtml(scanDate)}</span>
    </div>
  </div>
  <div class="header-right">
    <div class="header-stats">
      <span><strong>${data.packageCount}</strong> packages</span>
      <span><strong>${data.findings.length}</strong> findings</span>
    </div>
    <div class="header-links">
      <a class="header-link owasp-link" href="https://owasp.org/cve-lite-cli/" target="_blank"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 261.49332 261.50668" width="16" height="16" style="flex-shrink:0"><g transform="matrix(1.3333333,0,0,-1.3333333,0,261.50667)"><g transform="scale(0.1)"><path fill="#F68B1F" d="M 980.629,0 C 439.043,0 0,439.051 0,980.637 0,1522.22 439.043,1961.27 980.629,1961.27 1522.2,1961.27 1961.25,1522.22 1961.25,980.637 1961.25,439.051 1522.2,0 980.629,0 m -0.008,1810.35 c -458.226,0 -829.707,-371.48 -829.707,-829.705 0,-458.235 371.481,-829.715 829.707,-829.715 458.219,0 829.699,371.48 829.699,829.715 0,458.225 -371.48,829.705 -829.699,829.705"/><path fill="#F68B1F" d="m 1299.1,285.75 c -31.36,0.02 -145.64,203.41 -161,261.398 -32.11,121.411 -25.2,172.704 -23.28,189.102 5.88,50.07 54.46,75.09 57.4,142.801 0.91,20.91 11.47,125.449 19.9,207.109 -20.8,4.07 -41.52,13.45 -59.94,28 55.3,-74.17 -26.09,-163.058 -144.352,-281.332 C 862.305,707.309 583.695,590.809 583.695,590.809 c 0,0 116.508,278.613 242.024,404.132 92.269,92.259 166.636,162.079 230.101,162.079 17.89,0 34.92,-5.55 51.23,-17.7 -14.56,18.41 -23.93,39.12 -28.01,59.92 -81.661,-8.45 -186.208,-18.99 -207.106,-19.91 -67.719,-2.94 -92.743,-51.52 -142.782,-57.39 -5.761,-0.68 -15.828,-1.98 -31.722,-1.98 -29.367,0 -78.629,4.42 -157.387,25.27 -63.07,16.68 -298.078,150.37 -256.512,167.17 21.196,8.58 88.75,14.38 177.715,14.38 85.559,0 190.922,-5.36 293.844,-18.77 128.328,-16.72 246,-37.87 326.19,-53.6 1.3,4.31 2.86,8.5 4.73,12.57 l -81.98,39.29 c 0,0 -65.479,75.14 -58.487,80.32 0.27,0.2 0.613,0.3 1.023,0.3 10.27,0 62.654,-59.89 67.694,-66.71 3.88,-1.29 26.09,-8.7 49.45,-16.47 l -23.19,20.28 c 0,0 -31.74,117.55 -23.47,120.32 0.1,0.03 0.21,0.05 0.33,0.05 8.71,0 37.51,-102.22 39.98,-109.56 5.66,-4.96 24.78,-12.41 48.67,-26.19 l -25.12,64.62 c 0,0 11.37,106.61 19.88,106.61 0.07,0 0.13,-0.01 0.2,-0.02 8.57,-1.71 -1.68,-88.92 -3.85,-99.78 3.11,-4.77 22.38,-34.33 41.7,-63.97 11.89,4.48 24.68,6.69 37.81,6.69 15.07,0 30.57,-2.92 45.61,-8.67 -19.26,41.01 -17.8,83.75 7.74,109.27 8.08,8.1 17.9,13.75 28.84,17.1 1.32,7.46 4.78,14.54 10.45,20.22 7.39,7.38 17.12,11.05 26.97,11.05 10.31,0 20.76,-4.03 28.76,-12.04 7.67,-7.65 11.65,-17.54 11.99,-27.39 12.33,25.41 26.88,59.7 25.86,70.81 -2.37,25.14 -31.53,69.64 -31.8,70.09 -1.9,2.87 -1.11,6.75 1.78,8.66 1.05,0.69 2.24,1.02 3.42,1.02 2.03,0 4.02,-0.99 5.21,-2.82 1.29,-1.92 31.17,-47.54 33.83,-75.79 1.48,-16.16 -17.07,-56.88 -27.18,-77.68 14.2,-7.77 28.04,-18.03 40.68,-30.67 12.63,-12.63 22.89,-26.47 30.67,-40.68 20.01,9.73 58.4,27.26 75.71,27.26 0.69,0 1.35,-0.02 1.97,-0.08 28.24,-2.66 73.87,-32.54 75.78,-33.81 2.88,-1.89 3.68,-5.77 1.78,-8.65 -1.2,-1.82 -3.19,-2.81 -5.22,-2.81 -1.17,0 -2.36,0.33 -3.41,1.03 -0.45,0.29 -44.94,29.44 -70.09,31.79 -0.38,0.04 -0.79,0.05 -1.22,0.05 -12.23,0 -45.07,-13.97 -69.61,-25.89 9.87,-0.33 19.76,-4.33 27.4,-12 15.67,-15.65 16.1,-40.59 0.99,-55.7 -5.67,-5.68 -12.74,-9.17 -20.2,-10.47 -3.37,-10.95 -9.03,-20.77 -17.11,-28.85 -14.08,-14.09 -33.38,-20.84 -54.76,-20.84 -17.38,0 -36.13,4.47 -54.52,13.1 10.77,-28.12 11.59,-57.89 1.99,-83.41 29.62,-19.32 59.22,-38.6 63.96,-41.71 7.78,1.55 54.5,7.22 81.17,7.22 10.66,0 18.13,-0.9 18.61,-3.34 1.73,-8.56 -106.57,-20.12 -106.57,-20.12 l -64.63,25.15 c 13.79,-23.91 21.21,-43.02 26.18,-48.69 7.47,-2.5 112.26,-32.04 109.5,-40.31 -0.31,-0.96 -2.15,-1.37 -5.16,-1.37 -23.1,0 -115.14,24.85 -115.14,24.85 l -20.3,23.19 c 7.79,-23.37 15.18,-45.56 16.49,-49.45 7.1,-5.25 71.57,-61.7 66.4,-68.708 -0.27,-0.363 -0.71,-0.524 -1.32,-0.524 -11.31,0 -78.99,58.992 -78.99,58.992 l -39.3,81.99 c -4.06,-1.88 -8.26,-3.42 -12.58,-4.73 15.73,-80.19 36.89,-197.861 53.63,-326.181 27.34,-209.949 21.19,-429.969 4.39,-471.571 -1.35,-3.347 -3.46,-4.898 -6.2,-4.898"/></g></g></svg> An OWASP Foundation Project</a>
      <button class="header-link" type="button" onclick="downloadReportJson()" aria-label="Download JSON report">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 1 0-1.06-1.06L8.75 8.44V1.75a.75.75 0 1 0-1.5 0v6.69L4.78 5.97a.75.75 0 1 0-1.06 1.06l3.75 3.75ZM3.75 13a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z"/></svg>
        Download JSON
      </button>
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
  <div class="sev-card total"><span class="count">${data.findings.length}</span><span class="label">Packages</span></div>
  <div class="sev-card total"><span class="count">${totalCVEs}</span><span class="label">CVEs</span></div>
</div>

${fixPlanHtml}
${noticesHtml}

<div class="findings-section">
  <div class="findings-header">
    <h2>Findings</h2>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <input class="search-input" type="text" id="findings-search" placeholder="Search package, version, CVE…" oninput="applyFilters()" />
      <div class="filter-bar">
        <button class="filter-btn active" onclick="setFilter('all',this)">All (${data.findings.length})</button>
        <button class="filter-btn" onclick="setFilter('critical',this)">Critical (${counts.critical})</button>
        <button class="filter-btn" onclick="setFilter('high',this)">High (${counts.high})</button>
        <button class="filter-btn" onclick="setFilter('medium',this)">Medium (${counts.medium})</button>
        <button class="filter-btn" onclick="setFilter('direct',this)">Direct only</button>
      </div>
    </div>
  </div>
  <table class="findings-table" id="findings-table">
    <thead>
      <tr>
        <th style="width:32px"></th>
        <th onclick="sortBy('package')">Package <span class="sort-arrow">↕</span></th>
        <th>Fix available</th>
        <th onclick="sortBy('severity')" class="sorted">Severity <span class="sort-arrow" style="color:#58a6ff">↓</span></th>
        <th onclick="sortBy('relationship')">Type <span class="sort-arrow">↕</span></th>
        <th>CVE / Advisory</th>
      </tr>
    </thead>
    <tbody id="findings-tbody">
${findingRowsHtml}
      <tr id="no-results-row" style="display:none"><td colspan="6" class="no-results">No findings match your search.</td></tr>
    </tbody>
  </table>
</div>

<div class="report-footer">
  <span>Generated by <strong>cve-lite v${escapeHtml(data.cliVersion)}</strong></span>
  <span>${escapeHtml(data.lockfileSource)} &nbsp;·&nbsp; ${data.findings.length} findings &nbsp;·&nbsp; ${data.packageCount} packages</span>
</div>

<script>
const reportData = ${dataJson};
const SEV_ORDER = {critical:5,high:4,medium:3,low:2,unknown:1,none:0};
let sortCol = 'severity';
let sortAsc = false;
let activeFilter = 'all';

function downloadReportJson() {
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cve-lite-report.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function applyFilters() {
  const query = (document.getElementById('findings-search').value || '').toLowerCase().trim();
  let visibleCount = 0;
  reportData.findings.forEach((f, i) => {
    const mainRow = document.getElementById('row-' + i);
    const detailRow = document.getElementById('detail-' + i);
    let visible = true;
    if (activeFilter === 'critical') visible = f.severity === 'critical';
    else if (activeFilter === 'high') visible = f.severity === 'high';
    else if (activeFilter === 'medium') visible = f.severity === 'medium';
    else if (activeFilter === 'direct') visible = f.relationship === 'direct';
    if (visible && query) {
      const ids = [...(f.cves || []), ...(f.vulnerabilities || []).map(v => v.id)].join(' ').toLowerCase();
      visible = f.package.toLowerCase().includes(query) || f.version.toLowerCase().includes(query) || ids.includes(query);
    }
    if (mainRow) mainRow.style.display = visible ? '' : 'none';
    if (detailRow && !visible) {
      detailRow.classList.remove('visible');
      if (mainRow) mainRow.classList.remove('is-expanded');
      const icon = document.getElementById('icon-' + i);
      if (icon) icon.textContent = '▶';
    }
    if (visible) visibleCount++;
  });
  const noResults = document.getElementById('no-results-row');
  if (noResults) noResults.style.display = visibleCount === 0 ? '' : 'none';
}

function sortBy(col) {
  if (sortCol === col) { sortAsc = !sortAsc; } else { sortCol = col; sortAsc = col === 'package'; }
  document.querySelectorAll('.findings-table thead th').forEach(th => th.classList.remove('sorted'));
  const colIndex = ['', 'package', '', 'severity', 'relationship'].indexOf(col);
  if (colIndex > 0) document.querySelectorAll('.findings-table thead th')[colIndex].classList.add('sorted');

  const tbody = document.getElementById('findings-tbody');
  const indexedFindings = reportData.findings.map((f, i) => ({ f, i }));
  indexedFindings.sort((a, b) => {
    let cmp = 0;
    if (col === 'package') cmp = a.f.package.localeCompare(b.f.package);
    else if (col === 'severity') cmp = (SEV_ORDER[b.f.severity] || 0) - (SEV_ORDER[a.f.severity] || 0);
    else if (col === 'relationship') cmp = a.f.relationship.localeCompare(b.f.relationship);
    return sortAsc ? -cmp : cmp;
  });
  indexedFindings.forEach(({ i }) => {
    const mainRow = document.getElementById('row-' + i);
    const detailRow = document.getElementById('detail-' + i);
    if (mainRow) tbody.appendChild(mainRow);
    if (detailRow) tbody.appendChild(detailRow);
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function toggleSkipped() {
  const section = document.getElementById('skipped-section');
  if (!section) return;
  const isOpen = section.classList.toggle('open');
  document.querySelectorAll('.skipped-toggle').forEach(btn => {
    btn.textContent = (isOpen ? '↑' : '↓') + btn.textContent.slice(1);
  });
}

function toggleNotes(btn) {
  btn.classList.toggle('open');
  btn.nextElementSibling.classList.toggle('open');
}

document.addEventListener('click', function(e) {
  const btn = e.target.closest('.copy-btn');
  if (btn && btn.dataset.cmd !== undefined) {
    e.stopPropagation();
    copyText(btn.dataset.cmd);
  }
});
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function advisoryLink(id: string): string {
  if (id.startsWith("GHSA-")) {
    return `<a class="cve-link" href="https://github.com/advisories/${escapeHtml(id)}" target="_blank">${escapeHtml(id)}</a>`;
  }
  return `<a class="cve-link" href="https://osv.dev/vulnerability/${escapeHtml(id)}" target="_blank">${escapeHtml(id)}</a>`;
}

function renderFindingRow(finding: SerializedFinding, idx: number): string {
  const cveLinks = finding.cves.length > 0
    ? finding.cves.map(advisoryLink).join(", ")
    : finding.vulnerabilities.map(v => advisoryLink(v.id)).join(", ");

  const isMalicious = finding.vulnerabilities.some(v => v.id.startsWith("MAL-"));
  const fixHtml = finding.validatedFirstFixedVersion
    ? `<span class="fix-hint">${escapeHtml(finding.validatedFirstFixedVersion)}</span>`
    : finding.firstFixedVersion
    ? `<span class="fix-hint">${escapeHtml(finding.firstFixedVersion)}</span>`
    : isMalicious
    ? `<span class="fix-hint none" title="Malicious code advisory — remove this package">⚠ Malicious</span>`
    : `<span class="fix-hint none" title="No known fix — consider replacing this package">⚠ No fix</span>`;

  const depPathHtml = finding.dependencyPaths.length > 0
    ? finding.dependencyPaths[0].map((node, i, arr) => {
        const isLast = i === arr.length - 1;
        return `<span class="dep-node${isLast ? " vulnerable" : ""}">${escapeHtml(node)}</span>${isLast ? "" : '<span class="dep-arrow">→</span>'}`;
      }).join("")
    : `<span class="dep-node">${escapeHtml(finding.package)}</span>`;

  const description = finding.vulnerabilities[0]?.summary ?? "";
  const runnable = finding.runnableFixCommand ?? null;
  const recommendedActionHtml = runnable
    ? `<div class="fix-cmd-inline">
                <code>${escapeHtml(runnable)}</code>
                <button class="copy-btn" data-cmd="${escapeHtml(runnable)}">Copy</button>
              </div>`
    : `<p class="fix-cmd-note">${escapeHtml(finding.recommendedAction ?? "")}</p>`;

  const contextColHtml = finding.relationship === "transitive"
    ? renderTransitiveContextCol(finding)
    : "";

  return `      <tr id="row-${idx}" onclick="toggleRow(${idx})">
        <td><span class="expand-icon" id="icon-${idx}">▶</span></td>
        <td><div class="pkg-name">${escapeHtml(finding.package)}</div><div class="pkg-version">${escapeHtml(finding.version)}</div></td>
        <td>${fixHtml}</td>
        <td><span class="sev-badge ${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span></td>
        <td><span class="rel-badge ${escapeHtml(finding.relationship)}">${escapeHtml(finding.relationship)}</span></td>
        <td>${cveLinks}</td>
      </tr>
      <tr id="detail-${idx}" class="detail-row">
        <td colspan="6">
          <div class="expanded-inner">
            <div class="detail-col" style="max-width:320px">
              <h4>Description</h4>
              <p>${escapeHtml(description)}</p>
            </div>
            <div class="detail-col" style="max-width:320px">
              <h4>Dependency path</h4>
              <div class="dep-path">${depPathHtml}</div>
            </div>
            ${contextColHtml}
            <div class="detail-col">
              <h4>Recommended action</h4>
              ${recommendedActionHtml}
            </div>
          </div>
        </td>
      </tr>`;
}

function renderTransitiveContextCol(finding: SerializedFinding): string {
  const hasFixAvailable =
    finding.runnableFixCommand != null ||
    finding.recommendedNpmTransitiveRemediation != null ||
    finding.recommendedParentUpgrade != null;

  if (hasFixAvailable) {
    const parentLine = finding.primaryParent
      ? `<p style="font-size:12px;color:#8b949e;margin-top:4px">Parent: ${escapeHtml(finding.primaryParent)}</p>`
      : "";
    return `<div class="detail-col" style="max-width:200px">
              <h4>Context</h4>
              <span class="tier-ok">✓ Fix available</span>
              ${parentLine}
            </div>`;
  }

  if (finding.primaryParent) {
    return `<div class="detail-col" style="max-width:200px">
              <h4>Context</h4>
              <span class="tier-warn">⚠ No safe version identified</span>
              <p style="font-size:12px;color:#8b949e;margin-top:4px">Parent: ${escapeHtml(finding.primaryParent)}</p>
            </div>`;
  }

  return `<div class="detail-col" style="max-width:200px">
            <h4>Context</h4>
            <span class="tier-err">✕ No parent identified</span>
            <p style="font-size:12px;color:#8b949e;margin-top:4px">Run <code>npm ls ${escapeHtml(finding.package)}</code> to find which package pulls it in.</p>
          </div>`;
}

function renderNotices(notes: string[], warnings: string[]): string {
  if (notes.length === 0 && warnings.length === 0) return "";
  const total = notes.length + warnings.length;
  const items = [
    ...warnings.map(w => `<li class="warning">${escapeHtml(w)}</li>`),
    ...notes.map(n => `<li>${escapeHtml(n)}</li>`),
  ].join("\n");
  return `<div class="scan-notes">
  <button class="scan-notes-toggle" onclick="toggleNotes(this)"><span class="arrow">▶</span> Scan notes (${total})</button>
  <div class="scan-notes-body"><ul>${items}</ul></div>
</div>`;
}

function renderFixPlan(plan: SuggestedFixCommandPlan | null): string {
  if (!plan || plan.sections.length === 0) return "";

  const directCount = plan.targets.filter(t => t.kind === "direct").length;
  const skippedCount = plan.skipped.length;

  const commandRows = plan.sections.map(section => {
    const targetRows = section.targets.map(t => {
      const displayVersion = t.displayTargetVersion ?? t.targetVersion;
      const isMajor = t.currentVersion ? isMajorVersionBump(t.currentVersion, t.targetVersion) : false;
      const breakBadge = isMajor ? ` <span class="break-badge">⚠ breaking</span>` : "";
      const versionHtml = t.currentVersion
        ? `<span class="fix-target-pkg">${escapeHtml(t.package)}@${escapeHtml(t.currentVersion)}</span><span class="fix-target-arrow">→</span><span class="fix-target-to">${escapeHtml(displayVersion)}</span>`
        : `<span class="fix-target-pkg">${escapeHtml(t.package)}</span><span class="fix-target-arrow">→</span><span class="fix-target-to">${escapeHtml(displayVersion)}</span>`;
      const statsHtml = t.scannedVersions != null
        ? ` <span class="fix-target-stats">${t.scannedVersions} scanned${t.knownVulnerableVersions != null ? ` · ${t.knownVulnerableVersions} still vulnerable` : ""}</span>`
        : "";
      const noteHtml = t.adjusted && t.adjustmentNote
        ? ` <span class="fix-target-note">${escapeHtml(t.adjustmentNote)}</span>`
        : "";
      const coverageHtml = t.coverage === "partial"
        ? ` <span class="fix-target-coverage">Path-specific remediation. Run this command, then rescan; ${t.remainingPaths?.length ?? 0} other known ${pluralize(t.remainingPaths?.length ?? 0, "path")} may still need separate parent upgrades.</span>`
        : "";
      return `<div class="fix-target-row">${versionHtml}${breakBadge}${statsHtml}${noteHtml}${coverageHtml}</div>`;
    }).join("\n");

    const targetsHtml = section.targets.length > 0
      ? `<div class="fix-targets-list">${targetRows}</div>`
      : "";

    return `
    <div class="fix-cmd">
      <span class="cmd-text">${escapeHtml(section.command)}</span>
      <span class="cmd-meta">${escapeHtml(section.title)}</span>
      <button class="copy-btn" data-cmd="${escapeHtml(section.command)}">Copy</button>
    </div>${targetsHtml}`;
  }).join("\n");

  const skippedRows = plan.skipped.map(s => `
    <div class="skipped-row">
      <span class="skipped-pkg">${escapeHtml(s.package)}@${escapeHtml(s.version)}</span>
      <span class="skipped-rel ${escapeHtml(s.relationship)}">${escapeHtml(s.relationship)}</span>
      <span class="skipped-reason">${escapeHtml(s.reason)}</span>
    </div>`).join("\n");

  const skippedSection = skippedCount > 0 ? `
  <div class="skipped-section" id="skipped-section">
    <div style="font-size:11px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Why were these skipped?</div>
    ${skippedRows}
  </div>` : "";

  const skippedBadgePart = skippedCount > 0
    ? ` · <button class="skipped-toggle" onclick="toggleSkipped()">↓ ${skippedCount} skipped</button>`
    : "";

  const coverageText = plan.coveredFindingCount === plan.totalFindingCount
    ? `Running all commands should fix all ${plan.totalFindingCount} findings.`
    : `Running all commands should fix <strong>${plan.coveredFindingCount}</strong> of <strong>${plan.totalFindingCount}</strong> findings.`;

  return `<div class="fix-plan">
  <div class="fix-plan-header">
    <h2><span class="icon">✦</span> Suggested Fix Plan</h2>
    <span class="badge">${directCount} direct ${pluralize(directCount, "fix", "fixes")}${skippedBadgePart}</span>
  </div>
  <div class="fix-commands">${commandRows}
  </div>${skippedSection}
  <div style="padding:10px 18px;border-top:1px solid #21262d;font-size:11px;color:#8b949e">${coverageText}</div>
</div>`;
}

export async function writeHtmlReport(params: {
  outputDir: string;
  data: ReportData;
  autoOpen: boolean;
}): Promise<{ reportPath: string }> {
  fs.mkdirSync(params.outputDir, { recursive: true });

  const indexPath = path.join(params.outputDir, "index.html");
  const jsonPath = path.join(params.outputDir, "report.json");

  fs.writeFileSync(jsonPath, JSON.stringify(params.data, null, 2), "utf8");
  fs.writeFileSync(indexPath, renderHtmlReport(params.data), "utf8");

  if (params.autoOpen) {
    openInBrowser(indexPath);
  }

  return { reportPath: indexPath };
}

function openInBrowser(filePath: string): void {
  if (!path.isAbsolute(filePath)) return;

  const cmd = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
    ? "cmd"
    : "xdg-open";

  const args = process.platform === "win32"
    ? ["/c", "start", "", filePath]
    : [filePath];

  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true, shell: false });
    child.unref();
  } catch {
    // Best-effort only: report creation should not fail if the OS open command is unavailable.
  }
}
