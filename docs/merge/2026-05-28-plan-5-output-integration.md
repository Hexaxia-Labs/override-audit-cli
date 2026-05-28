# Plan 5: Output integration + audit-log emission wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `OverrideFinding` through every cve-lite output channel (terminal, JSON, SARIF, HTML), and wire project-wide audit-log emission through scan, fix, and orchestration paths so the audit log is a credible change-control record when enabled. After this plan, every user-visible cve-lite surface is aware of override findings, and a `--audit-log` run captures the full event sequence end-to-end.

**Architecture:** Each output formatter gets a parallel "Override hygiene" rendering alongside the existing CVE rendering. SARIF emits OA findings under a separate `toolComponent` so consumers can scope by ID space. CycloneDX stays CVE-only (spec). HTML report grows a new section that mirrors the CVE section's visual language. The audit-log emission code lives at the boundary of each existing module: `src/index.ts` emits `scan.started` / `scan.finished`, `src/scanner.ts` emits `cve.detected`, `src/remediation/fix-commands.ts` emits `cve.fix.applied` for each command the plan would have the user run. None of these add behavior; they describe behavior.

**Tech Stack:** TypeScript, Jest. No new runtime deps.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Output, Format, Severity", "Audit Log (Cross-Cutting)", "Event vocabulary".

**Prerequisite:** Plans 1-4 complete. CLI works, fix+verify hooks in, but output is rough (the stub renderer from Plan 4) and audit-log only fires from the OA paths so far.

---

## File Structure

Create:
- `src/output/override-findings-terminal.ts` - full terminal renderer (replaces Plan 4 stub)
- `src/output/override-findings-json.ts` - JSON shape
- `src/output/override-findings-sarif.ts` - SARIF tool component for OA rules
- `src/output/override-findings-html.ts` - HTML section partial
- `tests/output/override-findings-terminal.test.ts`
- `tests/output/override-findings-json.test.ts`
- `tests/output/override-findings-sarif.test.ts`
- `tests/audit-log/emission-end-to-end.test.ts` - integration test for the full event stream

Modify:
- `src/output/formatters.ts` - delete the Plan 4 stub; re-export the new terminal renderer
- `src/output/printers.ts` - call the override terminal renderer after the CVE printer
- `src/output/sarif.ts` - include the OA tool component
- `src/output/html-reporter.ts` - render the OA section
- `src/output/write-outputs.ts` - pass override findings through JSON output
- `src/scanner.ts` - emit `cve.detected` per finding
- `src/index.ts` - emit `scan.started`, `scan.finished`, ensure audit-log close in finally
- `src/remediation/fix-commands.ts` - emit `cve.fix.applied` per command in the plan

---

## Task 1: Terminal renderer

**Files:**
- Create: `src/output/override-findings-terminal.ts`
- Test: `tests/output/override-findings-terminal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { renderOverrideFindings } from "../../src/output/override-findings-terminal.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const f = (over: Partial<OverrideFinding> = {}): OverrideFinding => ({
  ruleId: "OA001",
  severity: "high",
  package: { name: "postcss" },
  location: { file: "package.json", jsonPath: "/overrides/postcss" },
  message: "Override target not in resolved tree",
  ...over,
});

describe("renderOverrideFindings (terminal)", () => {
  it("returns a friendly empty message when there are no findings", () => {
    const out = renderOverrideFindings([]);
    expect(out).toMatch(/no override hygiene findings/i);
  });

  it("renders a section header followed by one row per finding", () => {
    const out = renderOverrideFindings([f(), f({ ruleId: "OA003", severity: "high", package: { name: "react" } })]);
    expect(out).toMatch(/Override hygiene/i);
    expect(out).toMatch(/OA001/);
    expect(out).toMatch(/OA003/);
  });

  it("groups findings by severity, critical first", () => {
    const out = renderOverrideFindings([
      f({ ruleId: "OA001", severity: "low" }),
      f({ ruleId: "OA008", severity: "critical", package: { name: "lodash" } }),
    ]);
    const critIdx = out.indexOf("OA008");
    const lowIdx = out.indexOf("OA001");
    expect(critIdx).toBeGreaterThan(-1);
    expect(lowIdx).toBeGreaterThan(-1);
    expect(critIdx).toBeLessThan(lowIdx);
  });

  it("shows the jsonPath in the location column", () => {
    const out = renderOverrideFindings([f({ location: { file: "package.json", jsonPath: "/pnpm/overrides/react" } })]);
    expect(out).toMatch(/\/pnpm\/overrides\/react/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/output/override-findings-terminal.test.ts
```

- [ ] **Step 3: Implement the renderer**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/output/override-findings-terminal.test.ts
```

- [ ] **Step 5: Replace the Plan 4 stub in `src/output/formatters.ts`**

Remove the stub `renderOverrideFindings` from `src/output/formatters.ts` (Plan 4 left it there as a placeholder). Replace with a re-export:

```ts
export { renderOverrideFindings } from "./override-findings-terminal.js";
```

- [ ] **Step 6: Commit**

```bash
git add src/output/override-findings-terminal.ts src/output/formatters.ts tests/output/override-findings-terminal.test.ts
git commit -m "feat(output): terminal renderer for OverrideFinding grouped by severity"
```

---

## Task 2: JSON output

**Files:**
- Create: `src/output/override-findings-json.ts`
- Modify: `src/output/write-outputs.ts`
- Test: `tests/output/override-findings-json.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { overrideFindingsToJson } from "../../src/output/override-findings-json.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

describe("overrideFindingsToJson", () => {
  it("returns the findings as a plain array under overrideFindings key", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
    };
    const json = overrideFindingsToJson([f]);
    expect(json).toEqual({ overrideFindings: [f] });
  });

  it("returns empty array on no findings", () => {
    expect(overrideFindingsToJson([])).toEqual({ overrideFindings: [] });
  });
});
```

- [ ] **Step 2: Implement `src/output/override-findings-json.ts`**

```ts
import type { OverrideFinding } from "../overrides/types.js";

export interface OverrideFindingsJson {
  overrideFindings: OverrideFinding[];
}

export function overrideFindingsToJson(
  findings: ReadonlyArray<OverrideFinding>
): OverrideFindingsJson {
  return { overrideFindings: [...findings] };
}
```

- [ ] **Step 3: Wire it into `src/output/write-outputs.ts`**

Find where `write-outputs.ts` builds the JSON payload for `--json`. Add the override findings to the payload (additive - preserve all existing keys):

```ts
import { overrideFindingsToJson } from "./override-findings-json.js";

// Inside the JSON output builder, after building the existing payload:
const overridePayload = overrideFindingsToJson(overrideFindings ?? []);
const combined = { ...existingPayload, ...overridePayload };
```

This requires `write-outputs.ts` to accept `overrideFindings` as input. Add it to the input shape:

```ts
export interface WriteOutputsInput {
  // ... existing fields
  overrideFindings?: ReadonlyArray<OverrideFinding>;
}
```

Callers (`src/index.ts` and `src/cli/commands/overrides.ts`) pass the override findings through.

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/output/override-findings-json.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/output/override-findings-json.ts src/output/write-outputs.ts tests/output/override-findings-json.test.ts
git commit -m "feat(output): JSON output includes overrideFindings key"
```

---

## Task 3: SARIF output

**Files:**
- Create: `src/output/override-findings-sarif.ts`
- Modify: `src/output/sarif.ts`
- Test: `tests/output/override-findings-sarif.test.ts`

SARIF supports multiple tool components. cve-lite's CVE findings live under one component; OA findings live under a sibling component with a separate rule namespace. Consumers (GitHub Advanced Security, etc.) treat them as related but distinct rule sets.

- [ ] **Step 1: Read the existing SARIF builder to understand the shape**

```bash
head -80 src/output/sarif.ts
```

- [ ] **Step 2: Write the failing test**

```ts
import { buildOverrideSarifComponent, buildOverrideSarifResults } from "../../src/output/override-findings-sarif.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

describe("override-findings-sarif", () => {
  it("buildOverrideSarifComponent registers OA001..OA008 rules", () => {
    const c = buildOverrideSarifComponent();
    const ruleIds = c.rules?.map((r: any) => r.id);
    expect(ruleIds).toEqual(
      expect.arrayContaining(["OA001", "OA002", "OA003", "OA004", "OA005", "OA006", "OA007", "OA008"])
    );
  });

  it("buildOverrideSarifResults emits one result per finding with ruleId set", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
    };
    const results = buildOverrideSarifResults([f]);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("OA001");
    expect(results[0].level).toMatch(/error|warning|note/);
  });
});
```

- [ ] **Step 3: Implement `src/output/override-findings-sarif.ts`**

```ts
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
  locations?: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: { startLine?: number };
    };
  }>;
  properties?: Record<string, unknown>;
}

export function buildOverrideSarifResults(
  findings: ReadonlyArray<OverrideFinding>
): OverrideSarifResult[] {
  return findings.map((f) => ({
    ruleId: f.ruleId,
    level: SEVERITY_TO_LEVEL[f.severity] ?? "warning",
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.location.file },
          region: f.location.line ? { startLine: f.location.line } : undefined,
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
```

- [ ] **Step 4: Hook into `src/output/sarif.ts`**

In `src/output/sarif.ts`, where the SARIF document is assembled, extend the `runs[0].tool.extensions` (or equivalent) with the override component, and concat the override results into `runs[0].results`. Pattern:

```ts
import { buildOverrideSarifComponent, buildOverrideSarifResults } from "./override-findings-sarif.js";

// When building the SARIF object:
const sarif = {
  // ... existing
  runs: [
    {
      tool: {
        driver: existingDriverComponent,
        extensions: [...(existingExtensions ?? []), buildOverrideSarifComponent()],
      },
      results: [
        ...existingCveResults,
        ...buildOverrideSarifResults(overrideFindings ?? []),
      ],
    },
  ],
};
```

The exact field names should match cve-lite's existing SARIF shape. Read `src/output/sarif.ts` carefully and integrate accordingly.

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/output/override-findings-sarif.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/output/override-findings-sarif.ts src/output/sarif.ts tests/output/override-findings-sarif.test.ts
git commit -m "feat(output): SARIF tool component for OA001..OA008"
```

---

## Task 4: HTML report

**Files:**
- Create: `src/output/override-findings-html.ts`
- Modify: `src/output/html-reporter.ts`
- Test: `tests/output/override-findings-html.test.ts`

- [ ] **Step 1: Read the existing HTML reporter to mirror its visual language**

```bash
grep -n "section\|<h2\|<table\|<style" src/output/html-reporter.ts | head -20
```

Note the structure cve-lite uses (sections, tables, styles). Mirror it for the Overrides section.

- [ ] **Step 2: Write a smoke test**

`tests/output/override-findings-html.test.ts`:
```ts
import { renderOverrideFindingsHtml } from "../../src/output/override-findings-html.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const f = (over: Partial<OverrideFinding> = {}): OverrideFinding => ({
  ruleId: "OA001",
  severity: "high",
  package: { name: "postcss" },
  location: { file: "package.json", jsonPath: "/overrides/postcss" },
  message: "Override target not in resolved tree",
  ...over,
});

describe("renderOverrideFindingsHtml", () => {
  it("returns a section header even with no findings", () => {
    const html = renderOverrideFindingsHtml([]);
    expect(html).toMatch(/Override hygiene/i);
    expect(html).toMatch(/no override hygiene findings/i);
  });

  it("renders rows for each finding", () => {
    const html = renderOverrideFindingsHtml([f(), f({ ruleId: "OA008", severity: "critical", package: { name: "lodash" } })]);
    expect(html).toMatch(/OA001/);
    expect(html).toMatch(/OA008/);
  });

  it("escapes HTML in message", () => {
    const html = renderOverrideFindingsHtml([f({ message: "<script>" })]);
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
});
```

- [ ] **Step 3: Implement the renderer**

```ts
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
```

- [ ] **Step 4: Hook into `src/output/html-reporter.ts`**

Find where the existing CVE section is appended to the report body. Add the override section after it:
```ts
import { renderOverrideFindingsHtml } from "./override-findings-html.js";

// After the CVE section is emitted:
htmlBody += renderOverrideFindingsHtml(overrideFindings ?? []);
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/output/override-findings-html.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/output/override-findings-html.ts src/output/html-reporter.ts tests/output/override-findings-html.test.ts
git commit -m "feat(output): HTML report Overrides section"
```

---

## Task 5: Wire audit-log emission into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Read the current scan flow in `src/index.ts`**

```bash
grep -n "command === \"scan\"\|const scanResult\|process.exit" src/index.ts
```

- [ ] **Step 2: Add scan.started / scan.finished emission**

At the top of the scan branch (where the project path resolves and the audit log is created - added in Plan 4 Task 5):
```ts
const scanStartedAt = Date.now();
auditLog.emit({
  ts: new Date().toISOString(),
  type: "scan.started",
  schemaVersion: 1,
  projectPath: projectPathResolved,
  mode: scanInput.mode,
  source: scanInput.source,
  flags: {
    fix: options.fix === true,
    json: options.json === true,
    prodOnly: options.prodOnly === true,
    offline: options.offline === true,
    checkOverrides: options.checkOverrides === true,
  },
});
```

Right before `process.exit(exitCode)`:
```ts
auditLog.emit({
  ts: new Date().toISOString(),
  type: "scan.finished",
  schemaVersion: 1,
  durationMs: Date.now() - scanStartedAt,
  findingsCount: scanResult.findings.length + (overrideFindings?.length ?? 0),
  exitCode,
});
auditLog.close();
```

(Use whatever variable name the scan result actually has in `src/index.ts` - adjust accordingly.)

- [ ] **Step 3: Emit `error` on caught exceptions**

If `src/index.ts` has a top-level try/catch around the scan path, add inside the catch:
```ts
auditLog.emit({
  ts: new Date().toISOString(),
  type: "error",
  schemaVersion: 1,
  phase: "scan",
  message: err instanceof Error ? err.message : String(err),
  stack: err instanceof Error ? err.stack : undefined,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(audit-log): emit scan.started / scan.finished / error from src/index.ts"
```

---

## Task 6: Wire `cve.detected` from `src/scanner.ts`

**Files:**
- Modify: `src/scanner.ts`

- [ ] **Step 1: Read where findings are produced**

```bash
grep -n "findings.push\|return.*finding\|Finding\[\]" src/scanner.ts | head -20
```

- [ ] **Step 2: Thread the audit-log handle through scanner**

`scanner.ts` currently does not receive an audit-log handle. Two options:
  (a) Add `auditLog: AuditLogHandle` as a new parameter to the scanner's entrypoint function.
  (b) Have the caller (`src/index.ts`) emit `cve.detected` events after the scan returns by iterating over `scanResult.findings`.

Prefer (b) - it keeps `scanner.ts` un-touched-by-this-change. The emission code lives in `src/index.ts` after the scan completes:

```ts
for (const f of scanResult.findings) {
  auditLog.emit({
    ts: new Date().toISOString(),
    type: "cve.detected",
    schemaVersion: 1,
    package: { name: f.pkg.name, version: f.pkg.version },
    severity: f.severity,
    cveAliases: f.cveAliases,
    vulnerabilityIds: f.vulnerabilities.map((v) => v.id),
  });
}
```

- [ ] **Step 3: Add the loop to `src/index.ts` immediately after `scanResult` is returned and before output rendering**

(Code added to `src/index.ts` - `src/scanner.ts` itself stays unmodified.)

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(audit-log): emit cve.detected from src/index.ts after scan"
```

---

## Task 7: Wire `cve.fix.applied` from `src/remediation/fix-commands.ts`

**Files:**
- Modify: `src/remediation/fix-commands.ts` OR `src/index.ts` (preferred)

cve-lite's `--fix` does not apply CVE fixes - it emits a plan of commands. So `cve.fix.applied` here means "the plan recommended this command" (the user runs it separately). Documenting it in the audit log gives the change-control trail "we suggested upgrading X from a to b at this time."

- [ ] **Step 1: Emit `cve.fix.applied` per command in the plan**

After the fix-commands plan is built in `src/index.ts`, iterate:

```ts
for (const target of fixPlan.targets ?? []) {
  auditLog.emit({
    ts: new Date().toISOString(),
    type: "cve.fix.applied",
    schemaVersion: 1,
    package: target.package,
    fromVersion: target.currentVersion ?? "unknown",
    toVersion: target.targetVersion,
    mechanism: target.kind,
  });
}
```

Field names should match cve-lite's `SuggestedFixTarget` (defined in `src/remediation/fix-commands.ts`). Audit-log payload field naming stays the same.

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat(audit-log): emit cve.fix.applied per planned remediation"
```

---

## Task 8: End-to-end emission test

**Files:**
- Create: `tests/audit-log/emission-end-to-end.test.ts`

Verify the full event sequence on a real scan:

- [ ] **Step 1: Write the test**

```ts
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const CLI = join(__dirname, "../../dist/index.js");

describe("audit-log full event sequence", () => {
  let dir: string;
  let logPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-e2e-"));
    logPath = join(dir, "audit.ndjson");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("captures scan.started, scan.finished on a clean scan", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    try {
      execFileSync(process.execPath, [CLI, dir, "--audit-log", logPath, "--offline"]);
    } catch { /* exit code irrelevant for this test */ }

    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    const types = lines.map((l) => JSON.parse(l).type as string);
    expect(types).toContain("scan.started");
    expect(types).toContain("scan.finished");
  });

  it("captures oa.detected on a project with an orphan override", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    try {
      execFileSync(process.execPath, [CLI, "overrides", dir, "--audit-log", logPath]);
    } catch { /* exit code irrelevant */ }

    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    const events = lines.map((l) => JSON.parse(l));
    expect(events.find((e) => e.type === "oa.detected" && e.ruleId === "OA001")).toBeDefined();
  });
});
```

- [ ] **Step 2: Build and run**

```bash
npm run build
npm test -- tests/audit-log/emission-end-to-end.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/audit-log/emission-end-to-end.test.ts
git commit -m "test(audit-log): end-to-end event sequence on real scans"
```

---

## Task 9: Full-suite gate

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all green.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Visual review the HTML report**

```bash
npm run build
node dist/index.js _preserved-override-audit/tests/fixtures/<one> --report /tmp/x.html --no-open
```
Open `/tmp/x.html` in a browser. Confirm the Overrides section renders, severities color-code correctly, and layout matches the existing CVE section.

- [ ] **Step 4: Visual review SARIF**

```bash
node dist/index.js _preserved-override-audit/tests/fixtures/<one> --sarif > /tmp/x.sarif
node -e "const s = require('/tmp/x.sarif'); console.log('components:', s.runs[0].tool.extensions?.length ?? 0); console.log('OA results:', s.runs[0].results.filter(r => r.ruleId.startsWith('OA')).length);"
```
Expected: at least one extension component (the OA component), and OA results present.

Plan 5 complete when:
- Terminal, JSON, SARIF, HTML outputs all render OA findings.
- Audit-log emission covers `scan.started`, `scan.finished`, `cve.detected`, `cve.fix.applied`, `oa.detected`, `oa.fix.applied`, `verify.passed`, `verify.failed`, `error`.
- End-to-end emission test passes.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| Terminal "Override hygiene" section | Task 1 |
| `--json` includes `overrideFindings` (additive) | Task 2 |
| SARIF with OA rule namespace | Task 3 |
| HTML report Overrides section | Task 4 |
| `scan.started` / `scan.finished` events | Task 5 |
| `cve.detected` events | Task 6 |
| `cve.fix.applied` events | Task 7 |
| `oa.detected` events | Plan 3 |
| `oa.fix.applied` events | Plan 3 |
| `verify.passed` / `verify.failed` events | Plan 3 |
| `error` events | Task 5 |
| End-to-end emission verifiable | Task 8 |
| CycloneDX unchanged (CVE-only per spec) | Confirmed by not touching `src/output/cyclonedx.ts` |

## Next plan

Plan 6 (`docs/merge/2026-05-28-plan-6-cleanup-e2e.md`) deletes `_preserved-override-audit/`, dogfoods cve-lite against hexmetrics and hexops, and produces the dev-to-test handoff artifact for Phase 2.
