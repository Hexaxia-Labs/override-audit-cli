# Plan 3: Overrides API (`audit()` and `verify()`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two public entrypoints - `audit()` (full 8-detector run) and `verify()` (post-fix OA001/OA008 subset) - on top of the detector registry from Plan 2. Wire in the composite logic from the original scanner (OA005 vs OA001 dedup, OA006 severity escalation), the OA007 network fetch when opted in, and audit-log emission for `oa.detected`, `verify.passed`, `verify.failed`.

**Architecture:** `src/overrides/api.ts` exposes `audit(ctx, opts)` and `verify(targets, ctx)`. Both are pure over their inputs and side-effecting only through `ctx.auditLog`. The composite layer (`src/overrides/composite.ts`) runs after the detector pass and applies dedup + severity escalation. The runner stays out of detector bodies. The fixer (porting `_preserved-override-audit/src/fixer/`) is also part of this plan - `verify()` does not apply fixes, but the API surface must include the fixer entrypoint for callers (Plan 4 wires it into `--fix`).

**Tech Stack:** TypeScript, Jest. No new runtime deps. Uses `semver` (already added in Plan 2) for OA008 range comparison.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Integration Seams", "Audit Log (Cross-Cutting)".

**Prerequisite:** Plans 1 and 2 complete. `src/overrides/detectors/` and `src/overrides/index.ts` registry exist; tests for each detector pass.

---

## File Structure

Create:
- `src/overrides/api.ts` - `audit()` and `verify()` entrypoints
- `src/overrides/composite.ts` - dedup and severity-escalation passes
- `src/overrides/fixer.ts` - RFC 6902 patch application (port from `_preserved-override-audit/src/fixer/`)
- `tests/overrides/api.test.ts`
- `tests/overrides/composite.test.ts`
- `tests/overrides/fixer.test.ts`

Modify:
- `src/overrides/index.ts` - re-export `audit`, `verify`, `applyFix`
- `src/overrides/context-builder.ts` - actually populate `registryDistTags` when `checkNetwork: true`

---

## Task 1: Composite layer (dedup + severity escalation)

Preserved `scanner.ts` had two composite rules:
1. OA005 fires for a key whose container is non-npm style → suppress OA001 for the same target.
2. OA006 (medium) fires for a target that OA008 also fires for → escalate OA006 to high with a sharper title.

These move to `src/overrides/composite.ts`.

**Files:**
- Create: `src/overrides/composite.ts`
- Test: `tests/overrides/composite.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/overrides/composite.test.ts`:
```ts
import { applyComposite } from "../../src/overrides/composite.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const baseLoc = { file: "package.json", jsonPath: "/overrides/x" };

function make(ruleId: OverrideFinding["ruleId"], pkg: string, sev: OverrideFinding["severity"]): OverrideFinding {
  return { ruleId, severity: sev, package: { name: pkg }, location: baseLoc, message: "x" };
}

describe("applyComposite", () => {
  it("suppresses OA001 when OA005 fires for the same package", () => {
    const findings = [make("OA001", "foo", "high"), make("OA005", "foo", "medium")];
    const out = applyComposite(findings);
    expect(out.map((f) => f.ruleId)).toEqual(["OA005"]);
  });

  it("escalates OA006 to high (with updated message) when OA008 confirms", () => {
    const findings = [make("OA006", "lodash", "medium"), make("OA008", "lodash", "critical")];
    const out = applyComposite(findings);
    const oa6 = out.find((f) => f.ruleId === "OA006")!;
    expect(oa6.severity).toBe("high");
    expect(oa6.message).toMatch(/vulnerable copy on disk|OA008 confirms/i);
  });

  it("leaves unrelated findings alone", () => {
    const findings = [make("OA002", "foo", "medium"), make("OA003", "bar", "high")];
    expect(applyComposite(findings)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
npm test -- tests/overrides/composite.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/overrides/composite.ts`**

```ts
import type { OverrideFinding } from "./types.js";

/**
 * Post-detection composite passes:
 *   1. OA005 wins over OA001 for the same package (OA005 is the more specific framing).
 *   2. OA006 (medium) escalates to high when OA008 also fires for the same target:
 *      the parent-coupling risk has materialized as a vulnerable copy on disk.
 */
export function applyComposite(findings: OverrideFinding[]): OverrideFinding[] {
  const oa005Packages = new Set(
    findings.filter((f) => f.ruleId === "OA005").map((f) => f.package.name)
  );
  const oa008Packages = new Set(
    findings.filter((f) => f.ruleId === "OA008").map((f) => f.package.name)
  );

  const deduped = findings.filter(
    (f) => !(f.ruleId === "OA001" && oa005Packages.has(f.package.name))
  );

  return deduped.map((f) => {
    if (
      f.ruleId === "OA006" &&
      f.severity === "medium" &&
      oa008Packages.has(f.package.name)
    ) {
      return {
        ...f,
        severity: "high" as const,
        message:
          "Override fights an exact-pinned parent (vulnerable copy on disk; OA008 confirms)",
      };
    }
    return f;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/composite.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/overrides/composite.ts tests/overrides/composite.test.ts
git commit -m "feat(overrides): composite layer (OA005>OA001 dedup, OA006 escalation)"
```

---

## Task 2: Port the fixer

The preserved fixer lives in `_preserved-override-audit/src/fixer/` with three TypeScript files: `apply.ts`, `fix.ts`, `write.ts`. We consolidate into one `src/overrides/fixer.ts` because (a) the file is small, (b) `json-pointer.ts` already moved to `src/overrides/parsing/` in Plan 2, and (c) the fix orchestration (rescan logic, change-control logging) is split: the **application** stays here, the **rescan** logic moves to `api.ts`.

**Files:**
- Create: `src/overrides/fixer.ts`
- Test: `tests/overrides/fixer.test.ts`

- [ ] **Step 1: Read the preserved fixer to understand the shape**

```bash
cat _preserved-override-audit/src/fixer/fix.ts
cat _preserved-override-audit/src/fixer/apply.ts
cat _preserved-override-audit/src/fixer/write.ts
```

- [ ] **Step 2: Write the failing test**

`tests/overrides/fixer.test.ts`:
```ts
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFix } from "../../src/overrides/fixer.js";
import type { OverrideFinding } from "../../src/overrides/types.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function findingOf(ruleId: OverrideFinding["ruleId"], pkg: string, patch: OverrideFinding["fix"]["patch"]): OverrideFinding {
  return {
    ruleId,
    severity: "high",
    package: { name: pkg },
    location: { file: "package.json", jsonPath: `/overrides/${pkg}` },
    message: "x",
    fix: { type: "rfc6902", patch },
  };
}

describe("applyFix (RFC 6902 to package.json)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fixer-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies a remove patch to package.json", () => {
    const pkgPath = join(dir, "package.json");
    writeFileSync(pkgPath, JSON.stringify({ name: "x", overrides: { gone: "1.0.0" } }, null, 2));

    const finding = findingOf("OA001", "gone", [{ op: "remove", path: "/overrides/gone" }]);

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: false,
    });

    expect(report.appliedPatches).toHaveLength(1);
    const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(updated.overrides?.gone).toBeUndefined();
  });

  it("dryRun does not modify the file", () => {
    const pkgPath = join(dir, "package.json");
    const before = JSON.stringify({ name: "x", overrides: { gone: "1.0.0" } }, null, 2);
    writeFileSync(pkgPath, before);

    const finding = findingOf("OA001", "gone", [{ op: "remove", path: "/overrides/gone" }]);

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: true,
    });

    expect(report.appliedPatches).toHaveLength(1);
    expect(report.dryRun).toBe(true);
    expect(readFileSync(pkgPath, "utf8")).toBe(before);
  });

  it("skips findings without a fix and reports them", () => {
    const pkgPath = join(dir, "package.json");
    writeFileSync(pkgPath, JSON.stringify({ name: "x" }, null, 2));

    const finding: OverrideFinding = {
      ruleId: "OA002",
      severity: "medium",
      package: { name: "react" },
      location: { file: "package.json", jsonPath: "/overrides/react" },
      message: "tag pin",
    };

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: false,
    });
    expect(report.appliedPatches).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toMatch(/no fix/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/overrides/fixer.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement `src/overrides/fixer.ts`**

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OverrideFinding, RFC6902Op } from "./types.js";
import type { AuditLogHandle } from "../audit-log/index.js";

export interface FixOptions {
  projectPath: string;
  findings: ReadonlyArray<OverrideFinding>;
  auditLog: AuditLogHandle;
  dryRun: boolean;
}

export interface AppliedPatch {
  ruleId: OverrideFinding["ruleId"];
  package: string;
  patches: RFC6902Op[];
}

export interface SkippedForFix {
  ruleId: OverrideFinding["ruleId"];
  package: string;
  reason: string;
}

export interface FixReport {
  appliedAt: string;
  dryRun: boolean;
  appliedPatches: AppliedPatch[];
  skipped: SkippedForFix[];
}

export function applyFix(opts: FixOptions): FixReport {
  const { projectPath, findings, auditLog, dryRun } = opts;
  const applied: AppliedPatch[] = [];
  const skipped: SkippedForFix[] = [];
  const pkgPath = join(projectPath, "package.json");
  const original = readFileSync(pkgPath, "utf8");
  let state = JSON.parse(original) as Record<string, unknown>;

  for (const finding of findings) {
    if (!finding.fix || finding.fix.type !== "rfc6902") {
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: "no fix patch attached",
      });
      continue;
    }
    try {
      for (const op of finding.fix.patch) {
        state = applyOp(state, op);
      }
      applied.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        patches: finding.fix.patch.slice(),
      });
      auditLog.emit({
        ts: new Date().toISOString(),
        type: "oa.fix.applied",
        schemaVersion: 1,
        ruleId: finding.ruleId,
        package: finding.package.name,
        patches: finding.fix.patch,
      });
    } catch (err) {
      skipped.push({
        ruleId: finding.ruleId,
        package: finding.package.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!dryRun && applied.length > 0) {
    const indent = detectIndent(original);
    writeFileSync(pkgPath, JSON.stringify(state, null, indent) + "\n");
  }

  return {
    appliedAt: new Date().toISOString(),
    dryRun,
    appliedPatches: applied,
    skipped,
  };
}

function detectIndent(raw: string): number {
  const m = raw.match(/^\{\n([ \t]+)/);
  if (!m) return 2;
  return m[1].length;
}

function applyOp(doc: Record<string, unknown>, op: RFC6902Op): Record<string, unknown> {
  switch (op.op) {
    case "remove":
      return mutate(doc, op.path, () => undefined);
    case "replace":
      return mutate(doc, op.path, () => op.value);
    case "add":
      return mutate(doc, op.path, () => op.value);
    case "move":
      // Read source, remove source, set destination.
      {
        const value = read(doc, op.from);
        doc = mutate(doc, op.from, () => undefined);
        return mutate(doc, op.path, () => value);
      }
    case "copy": {
      const value = read(doc, op.from);
      return mutate(doc, op.path, () => value);
    }
    case "test": {
      const value = read(doc, op.path);
      if (JSON.stringify(value) !== JSON.stringify(op.value)) {
        throw new Error(`test failed at ${op.path}`);
      }
      return doc;
    }
  }
}

function read(doc: unknown, pointer: string): unknown {
  const parts = splitPointer(pointer);
  let cur: any = doc;
  for (const p of parts) cur = cur?.[p];
  return cur;
}

function mutate(
  doc: Record<string, unknown>,
  pointer: string,
  fn: (prev: unknown) => unknown
): Record<string, unknown> {
  const parts = splitPointer(pointer);
  if (parts.length === 0) {
    throw new Error("cannot mutate root pointer");
  }
  // Walk down, copying objects along the way (immutable-ish).
  const root: any = Array.isArray(doc) ? [...doc] : { ...doc };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (next === undefined || next === null) {
      cur[p] = {};
      cur = cur[p];
    } else if (Array.isArray(next)) {
      cur[p] = [...next];
      cur = cur[p];
    } else if (typeof next === "object") {
      cur[p] = { ...next };
      cur = cur[p];
    } else {
      throw new Error(`cannot descend into non-object at ${parts.slice(0, i + 1).join("/")}`);
    }
  }
  const last = parts[parts.length - 1];
  const newValue = fn(cur[last]);
  if (newValue === undefined) {
    delete cur[last];
  } else {
    cur[last] = newValue;
  }
  return root;
}

function splitPointer(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`bad RFC6902 pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/overrides/fixer.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/overrides/fixer.ts tests/overrides/fixer.test.ts
git commit -m "feat(overrides): fixer (applyFix with RFC 6902 patches)"
```

---

## Task 3: `audit()` entrypoint

**Files:**
- Create: `src/overrides/api.ts`
- Test: `tests/overrides/api.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/overrides/api.test.ts`:
```ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, verify } from "../../src/overrides/api.js";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function noopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
}

describe("audit()", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "audit-api-test-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns findings for a project with an orphan override (OA001)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { "not-in-tree": "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/other": { version: "1.0.0" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.some((f) => f.ruleId === "OA001")).toBe(true);
  });

  it("returns empty findings for a clean project", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings).toHaveLength(0);
  });
});

describe("verify()", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "verify-test-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("passes when targets are clean", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { lodash: "4.17.21" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/lodash": { version: "4.17.21" } },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await verify([{ name: "lodash", version: "4.17.21" }], ctx);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("fails when target is orphan (OA001 fires)", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { lodash: "4.17.21" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },     // empty - no lodash
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG, logger: noopLogger(), checkNetwork: false,
    });
    const result = await verify([{ name: "lodash" }], ctx);
    expect(result.ok).toBe(false);
    expect(result.findings.find((f) => f.ruleId === "OA001")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/overrides/api.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/overrides/api.ts`**

```ts
import type { OverrideContext } from "./context.js";
import type { OverrideFinding } from "./types.js";
import { ALL_DETECTORS, VERIFY_DETECTORS } from "./detectors/index.js";
import { applyComposite } from "./composite.js";
import { fetchDistTagsBatch, type RegistryClientOptions } from "./parsing/registry.js";

export interface AuditOptions {
  /** When true, fetch registry dist-tags so OA007 can run. */
  checkNetwork: boolean;
  /** Registry client options (baseUrl, timeoutMs, fetchImpl). Only used when checkNetwork=true. */
  registry?: RegistryClientOptions;
}

export interface AuditResult {
  findings: OverrideFinding[];
}

export interface VerifyTarget {
  name: string;
  version?: string;
}

export interface VerifyResult {
  ok: boolean;
  findings: OverrideFinding[];
}

/**
 * Full audit: run all 8 detectors over the project, apply composite passes,
 * emit oa.detected per finding.
 */
export async function audit(ctx: OverrideContext, opts: AuditOptions): Promise<AuditResult> {
  // OA007 network fetch - only when opted in.
  if (opts.checkNetwork) {
    const stringOverrideNames = ctx.overrideEntries
      .filter((e) => typeof e.value === "string")
      .map((e) => e.packageName);
    if (stringOverrideNames.length > 0) {
      try {
        const fetched = await fetchDistTagsBatch(stringOverrideNames, opts.registry ?? {});
        // Mutate the map cve-lite-style; ctx.registryDistTags is the same reference.
        for (const [name, tags] of fetched) {
          ctx.registryDistTags.set(name, tags);
        }
      } catch (err) {
        ctx.skippedDetectors.push({
          ruleId: "OA007",
          reason: `registry calls failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  const raw: OverrideFinding[] = [];
  for (const { detect } of ALL_DETECTORS) {
    raw.push(...detect(ctx));
  }
  const findings = applyComposite(raw);

  for (const f of findings) {
    ctx.auditLog.emit({
      ts: new Date().toISOString(),
      type: "oa.detected",
      schemaVersion: 1,
      ruleId: f.ruleId,
      severity: f.severity,
      package: f.package.name,
      message: f.message,
      location: { file: f.location.file, jsonPath: f.location.jsonPath },
    });
  }

  return { findings };
}

/**
 * Post-fix verification: run OA001 and OA008 only, scoped to the just-touched
 * packages. Cheaper than audit() because it skips the other detectors and any
 * walk those detectors trigger.
 */
export async function verify(
  targets: ReadonlyArray<VerifyTarget>,
  ctx: OverrideContext
): Promise<VerifyResult> {
  const targetNames = new Set(targets.map((t) => t.name));

  const raw: OverrideFinding[] = [];
  for (const { detect } of VERIFY_DETECTORS) {
    raw.push(...detect(ctx));
  }
  const scoped = raw.filter((f) => targetNames.has(f.package.name));

  if (scoped.length === 0) {
    ctx.auditLog.emit({
      ts: new Date().toISOString(),
      type: "verify.passed",
      schemaVersion: 1,
      targets: targets.map((t) => ({ name: t.name, version: t.version })),
    });
    return { ok: true, findings: [] };
  }

  ctx.auditLog.emit({
    ts: new Date().toISOString(),
    type: "verify.failed",
    schemaVersion: 1,
    failures: scoped.map((f) => ({
      ruleId: f.ruleId,
      package: f.package.name,
      reason: f.message,
    })),
  });
  return { ok: false, findings: scoped };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/api.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/overrides/api.ts tests/overrides/api.test.ts
git commit -m "feat(overrides): audit() and verify() entrypoints"
```

---

## Task 4: Audit-log emission verification

The API must emit the right audit-log events. Verify with `MemoryAuditLog` (a third handle implementation for tests).

**Files:**
- Modify: `src/audit-log/handle.ts` - add `MemoryAuditLog` test helper
- Modify: `src/audit-log/index.ts` - export it
- Create: `tests/overrides/api-audit-log.test.ts`

- [ ] **Step 1: Add `MemoryAuditLog` to `src/audit-log/handle.ts`**

Append:
```ts
/**
 * In-memory audit log used by tests to assert event sequences. Captures every
 * emit; close is a no-op.
 */
export class MemoryAuditLog implements AuditLogHandle {
  readonly isNoOp = false;
  readonly events: AuditEvent[] = [];
  emit(event: AuditEvent): void { this.events.push(event); }
  close(): void { /* noop */ }
}
```

- [ ] **Step 2: Re-export from `src/audit-log/index.ts`**

```ts
export { MemoryAuditLog } from "./handle.js";
```

- [ ] **Step 3: Write the test**

`tests/overrides/api-audit-log.test.ts`:
```ts
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, verify } from "../../src/overrides/api.js";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

function noop() { return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any; }

describe("api emits expected audit-log events", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "api-log-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("audit() emits one oa.detected per finding", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noop(), checkNetwork: false });
    await audit(ctx, { checkNetwork: false });

    const detected = log.events.filter((e) => e.type === "oa.detected");
    expect(detected.length).toBeGreaterThan(0);
    expect(detected[0]).toMatchObject({ schemaVersion: 1, ruleId: "OA001", package: "gone" });
  });

  it("verify() emits verify.passed on clean targets", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { ok: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" }, "node_modules/ok": { version: "1.0.0" } },
    }));

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noop(), checkNetwork: false });
    await verify([{ name: "ok" }], ctx);

    const passed = log.events.find((e) => e.type === "verify.passed");
    expect(passed).toBeDefined();
  });

  it("verify() emits verify.failed when a target is orphan", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(dir, { auditLog: log, logger: noop(), checkNetwork: false });
    await verify([{ name: "gone" }], ctx);

    const failed = log.events.find((e) => e.type === "verify.failed") as any;
    expect(failed).toBeDefined();
    expect(failed.failures[0]).toMatchObject({ ruleId: "OA001", package: "gone" });
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/api-audit-log.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit-log/handle.ts src/audit-log/index.ts tests/overrides/api-audit-log.test.ts
git commit -m "feat(overrides): emit oa.detected, verify.passed, verify.failed; add MemoryAuditLog test helper"
```

---

## Task 5: Update `src/overrides/index.ts` barrel

**Files:**
- Modify: `src/overrides/index.ts`

- [ ] **Step 1: Append the new exports**

```ts
export { audit, verify, type AuditOptions, type AuditResult, type VerifyTarget, type VerifyResult } from "./api.js";
export { applyFix, type FixOptions, type FixReport, type AppliedPatch, type SkippedForFix } from "./fixer.js";
export { applyComposite } from "./composite.js";
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/overrides/index.ts
git commit -m "feat(overrides): export audit, verify, applyFix from the barrel"
```

---

## Task 6: Full-suite gate

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: green. New tests: composite, fixer, api, api-audit-log. No regressions in Plan 1 or Plan 2 tests.

- [ ] **Step 2: Run TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: API smoke test**

```bash
node -e "
  const { buildOverrideContext } = require('./dist/overrides/context-builder.js');
  const { audit } = require('./dist/overrides/api.js');
  const { NULL_AUDIT_LOG } = require('./dist/audit-log/index.js');
  (async () => {
    // Build against the project at a real path (use _preserved-override-audit/tests/fixtures/<one> or the current cwd).
    const ctx = buildOverrideContext(process.cwd(), { auditLog: NULL_AUDIT_LOG, logger: console, checkNetwork: false });
    const result = await audit(ctx, { checkNetwork: false });
    console.log('findings:', result.findings.length);
  })();
"
```

Build first if necessary:
```bash
npm run build
```

Plan 3 complete when:
- `composite`, `fixer`, `api`, `api-audit-log` tests pass.
- Smoke test runs end-to-end against a real project.
- API surface (`audit`, `verify`, `applyFix`) exported from `src/overrides/index.ts`.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `verify(targets, ctx)` entrypoint | Task 3 |
| `audit(ctx, opts)` entrypoint | Task 3 |
| `verify()` runs only OA001 and OA008 | Task 3 (`VERIFY_DETECTORS` from Plan 2) |
| `verify()` scopes to `targets` | Task 3 |
| Composite logic (OA005 > OA001, OA006 escalation) | Task 1 |
| `applyFix()` accepts findings and applies RFC 6902 patches | Task 2 |
| `applyFix()` dry-run mode | Task 2 |
| Emits `oa.detected` per finding from `audit()` | Tasks 3, 4 |
| Emits `verify.passed` / `verify.failed` | Tasks 3, 4 |
| Emits `oa.fix.applied` from `applyFix()` | Task 2 |
| OA007 network fetch (opt-in) | Task 3 |
| `MemoryAuditLog` test helper | Task 4 |

## Next plan

Plan 4 (`docs/merge/2026-05-28-plan-4-cli-fix-integration.md`) adds the `cve-lite overrides` subcommand to `src/cli/args.ts` and `src/index.ts`, hooks `verify()` into the existing `--fix` path in `src/remediation/`, and wires exit code `2` for verification failures.
