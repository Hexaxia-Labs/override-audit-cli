# Plan 1: Foundation (audit-log + types + overrides skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the cross-cutting infrastructure the override-audit merge depends on: the opt-in project-wide audit-log module, the `OverrideFinding` type, the `src/overrides/` directory scaffold, and the new exit code `2`. After this plan, nothing user-visible changes; the merge has its foundation.

**Architecture:** Two new self-contained modules (`src/audit-log/`, `src/overrides/`) plus additive type extensions in `src/types.ts`. Audit-log uses an opaque `AuditLogHandle` interface with two implementations: `NullAuditLog` (no-op, zero cost when disabled, the default) and `NdjsonAuditLog` (file writer, line-per-event). The new `OverrideFinding` type lives in `src/overrides/types.ts` as a sibling to cve-lite's existing `Finding` (not a replacement).

**Tech Stack:** TypeScript (project uses strict mode), Jest + ts-jest, Node 18+ stdlib only (`fs`, `path`). No new runtime dependencies.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Audit Log (Cross-Cutting)", "Code Organization", and "Output, Format, Severity".

---

## File Structure

Create:
- `src/audit-log/events.ts` - typed event vocabulary
- `src/audit-log/handle.ts` - `AuditLogHandle` interface + `NullAuditLog` no-op
- `src/audit-log/ndjson-writer.ts` - `NdjsonAuditLog` file writer
- `src/audit-log/index.ts` - barrel exports + factory
- `src/overrides/types.ts` - `OverrideFinding`, `OverrideRuleId`, `OverrideSubRuleId`
- `src/overrides/index.ts` - barrel exports
- `tests/audit-log/no-op.test.ts`
- `tests/audit-log/ndjson-writer.test.ts`
- `tests/audit-log/events.test.ts`
- `tests/overrides/types.test.ts`

Modify:
- `src/types.ts` - re-export new types, add `OVERRIDE_VERIFY_FAILED_EXIT_CODE`

---

## Task 1: Create directory scaffold

**Files:**
- Create: `src/audit-log/` (empty directory)
- Create: `src/overrides/` (empty directory)
- Create: `tests/audit-log/` (empty directory)
- Create: `tests/overrides/` (empty directory)

- [ ] **Step 1: Create directories**

```bash
mkdir -p src/audit-log src/overrides tests/audit-log tests/overrides
```

- [ ] **Step 2: Add `.gitkeep` placeholders so the empty dirs survive commits**

```bash
touch src/audit-log/.gitkeep src/overrides/.gitkeep tests/audit-log/.gitkeep tests/overrides/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add src/audit-log/.gitkeep src/overrides/.gitkeep tests/audit-log/.gitkeep tests/overrides/.gitkeep
git commit -m "feat(merge): scaffold src/audit-log/ and src/overrides/ directories"
```

---

## Task 2: Event vocabulary (`src/audit-log/events.ts`)

**Files:**
- Create: `src/audit-log/events.ts`
- Test: `tests/audit-log/events.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audit-log/events.test.ts`:
```ts
import type { AuditEvent } from "../../src/audit-log/events.js";

describe("audit-log event vocabulary", () => {
  it("discriminates events by type", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/tmp/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: { fix: false, json: false },
    };
    expect(e.type).toBe("scan.started");
  });

  it("oa.detected carries ruleId, severity, package", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "oa.detected",
      schemaVersion: 1,
      ruleId: "OA001",
      severity: "high",
      package: "postcss",
      message: "Override target not in resolved tree",
    };
    expect(e.ruleId).toBe("OA001");
  });

  it("verify.failed carries an array of failures", () => {
    const e: AuditEvent = {
      ts: "2026-05-28T00:00:00.000Z",
      type: "verify.failed",
      schemaVersion: 1,
      failures: [{ ruleId: "OA008", package: "lodash", reason: "vulnerable copy at node_modules/foo/node_modules/lodash" }],
    };
    expect(e.failures).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/audit-log/events.test.ts
```
Expected: FAIL with "Cannot find module '.../src/audit-log/events.js'"

- [ ] **Step 3: Implement `src/audit-log/events.ts`**

```ts
// Project-wide audit-log event vocabulary. NDJSON stream: one event per line.
// All events share { ts, type, schemaVersion }.

import type { SeverityLabel, ScanSource, ScanMode } from "../types.js";

export const AUDIT_LOG_SCHEMA_VERSION = 1 as const;

export interface AuditEventBase {
  ts: string;                     // ISO-8601
  schemaVersion: typeof AUDIT_LOG_SCHEMA_VERSION;
}

export interface ScanStarted extends AuditEventBase {
  type: "scan.started";
  projectPath: string;
  mode: ScanMode;
  source: ScanSource;
  flags: Record<string, boolean | string>;
}

export interface ScanFinished extends AuditEventBase {
  type: "scan.finished";
  durationMs: number;
  findingsCount: number;
  exitCode: number;
}

export interface CveDetected extends AuditEventBase {
  type: "cve.detected";
  package: { name: string; version: string };
  severity: SeverityLabel;
  cveAliases: string[];
  vulnerabilityIds: string[];
}

export interface CveFixApplied extends AuditEventBase {
  type: "cve.fix.applied";
  package: string;
  fromVersion: string;
  toVersion: string;
  mechanism: string;              // e.g., "direct-upgrade" | "parent-upgrade" | "transitive-resolution"
}

export interface OaDetected extends AuditEventBase {
  type: "oa.detected";
  ruleId: string;                 // OverrideRuleId; widen here to keep audit-log decoupled
  severity: SeverityLabel;
  package: string;
  message: string;
  location?: { file: string; jsonPath?: string };
}

export interface OaFixApplied extends AuditEventBase {
  type: "oa.fix.applied";
  ruleId: string;
  package: string;
  patches: ReadonlyArray<{ op: string; path: string; value?: unknown; from?: string }>;
}

export interface VerifyPassed extends AuditEventBase {
  type: "verify.passed";
  targets: ReadonlyArray<{ name: string; version?: string }>;
}

export interface VerifyFailed extends AuditEventBase {
  type: "verify.failed";
  failures: ReadonlyArray<{
    ruleId: string;
    package: string;
    reason: string;
  }>;
}

export interface ErrorEvent extends AuditEventBase {
  type: "error";
  phase: string;
  message: string;
  stack?: string;
}

export type AuditEvent =
  | ScanStarted
  | ScanFinished
  | CveDetected
  | CveFixApplied
  | OaDetected
  | OaFixApplied
  | VerifyPassed
  | VerifyFailed
  | ErrorEvent;

export type AuditEventType = AuditEvent["type"];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/audit-log/events.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit-log/events.ts tests/audit-log/events.test.ts
git commit -m "feat(audit-log): typed event vocabulary"
```

---

## Task 3: `AuditLogHandle` interface + `NullAuditLog`

**Files:**
- Create: `src/audit-log/handle.ts`
- Test: `tests/audit-log/no-op.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audit-log/no-op.test.ts`:
```ts
import { NullAuditLog } from "../../src/audit-log/handle.js";

describe("NullAuditLog (no-op handle)", () => {
  it("emit is callable and returns undefined", () => {
    const h = new NullAuditLog();
    const result = h.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: {},
    });
    expect(result).toBeUndefined();
  });

  it("close is callable and returns undefined", () => {
    const h = new NullAuditLog();
    expect(h.close()).toBeUndefined();
  });

  it("is recognizably a no-op via isNoOp flag", () => {
    const h = new NullAuditLog();
    expect(h.isNoOp).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/audit-log/no-op.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/audit-log/handle.ts`**

```ts
import type { AuditEvent } from "./events.js";

export interface AuditLogHandle {
  emit(event: AuditEvent): void;
  close(): void;
  readonly isNoOp: boolean;
}

/**
 * Zero-cost no-op handle. The default when audit logging is disabled.
 * Single allocation, single function call per emit, no I/O, no allocation per call.
 */
export class NullAuditLog implements AuditLogHandle {
  readonly isNoOp = true;
  emit(_event: AuditEvent): void { /* noop */ }
  close(): void { /* noop */ }
}

export const NULL_AUDIT_LOG: AuditLogHandle = new NullAuditLog();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/audit-log/no-op.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit-log/handle.ts tests/audit-log/no-op.test.ts
git commit -m "feat(audit-log): AuditLogHandle interface + NullAuditLog no-op"
```

---

## Task 4: `NdjsonAuditLog` writer

**Files:**
- Create: `src/audit-log/ndjson-writer.ts`
- Test: `tests/audit-log/ndjson-writer.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audit-log/ndjson-writer.test.ts`:
```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NdjsonAuditLog } from "../../src/audit-log/ndjson-writer.js";

describe("NdjsonAuditLog", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-test-"));
    path = join(dir, "audit.ndjson");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes one JSON object per line", () => {
    const log = new NdjsonAuditLog(path);
    log.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "scan.started",
      schemaVersion: 1,
      projectPath: "/x",
      mode: "resolved-lockfile",
      source: "package-lock",
      flags: { fix: false },
    });
    log.emit({
      ts: "2026-05-28T00:00:01.000Z",
      type: "scan.finished",
      schemaVersion: 1,
      durationMs: 100,
      findingsCount: 0,
      exitCode: 0,
    });
    log.close();

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).type).toBe("scan.started");
    expect(JSON.parse(lines[1]).type).toBe("scan.finished");
  });

  it("isNoOp is false for the real writer", () => {
    const log = new NdjsonAuditLog(path);
    expect(log.isNoOp).toBe(false);
    log.close();
  });

  it("appends to existing file (does not truncate)", () => {
    const a = new NdjsonAuditLog(path);
    a.emit({
      ts: "2026-05-28T00:00:00.000Z",
      type: "error",
      schemaVersion: 1,
      phase: "first",
      message: "x",
    });
    a.close();
    const b = new NdjsonAuditLog(path);
    b.emit({
      ts: "2026-05-28T00:00:01.000Z",
      type: "error",
      schemaVersion: 1,
      phase: "second",
      message: "y",
    });
    b.close();

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).phase).toBe("first");
    expect(JSON.parse(lines[1]).phase).toBe("second");
  });

  it("emit after close throws", () => {
    const log = new NdjsonAuditLog(path);
    log.close();
    expect(() =>
      log.emit({
        ts: "2026-05-28T00:00:00.000Z",
        type: "error",
        schemaVersion: 1,
        phase: "p",
        message: "m",
      })
    ).toThrow(/closed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/audit-log/ndjson-writer.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/audit-log/ndjson-writer.ts`**

```ts
import { appendFileSync, closeSync, openSync } from "node:fs";
import type { AuditEvent } from "./events.js";
import type { AuditLogHandle } from "./handle.js";

/**
 * Append-only NDJSON writer. Opens the file once, appends one JSON object
 * per line per emit, closes on demand.
 */
export class NdjsonAuditLog implements AuditLogHandle {
  readonly isNoOp = false;
  private fd: number | null;

  constructor(path: string) {
    this.fd = openSync(path, "a");
  }

  emit(event: AuditEvent): void {
    if (this.fd === null) {
      throw new Error("NdjsonAuditLog: emit called on a closed handle");
    }
    appendFileSync(this.fd, JSON.stringify(event) + "\n");
  }

  close(): void {
    if (this.fd === null) return;
    try {
      closeSync(this.fd);
    } finally {
      this.fd = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/audit-log/ndjson-writer.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/audit-log/ndjson-writer.ts tests/audit-log/ndjson-writer.test.ts
git commit -m "feat(audit-log): NdjsonAuditLog file writer"
```

---

## Task 5: Audit-log barrel + factory

**Files:**
- Create: `src/audit-log/index.ts`

- [ ] **Step 1: Implement `src/audit-log/index.ts`**

```ts
export type { AuditEvent, AuditEventType } from "./events.js";
export { AUDIT_LOG_SCHEMA_VERSION } from "./events.js";
export type { AuditLogHandle } from "./handle.js";
export { NullAuditLog, NULL_AUDIT_LOG } from "./handle.js";
export { NdjsonAuditLog } from "./ndjson-writer.js";

import type { AuditLogHandle } from "./handle.js";
import { NULL_AUDIT_LOG } from "./handle.js";
import { NdjsonAuditLog } from "./ndjson-writer.js";

/**
 * Build an audit-log handle from CLI options.
 *
 * `path` from `--audit-log <path>` or `CVE_LITE_AUDIT_LOG=<path>`. When undefined,
 * returns the shared no-op handle.
 */
export function createAuditLog(path: string | undefined): AuditLogHandle {
  if (!path) return NULL_AUDIT_LOG;
  return new NdjsonAuditLog(path);
}
```

- [ ] **Step 2: Verify the barrel compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/audit-log/index.ts
git commit -m "feat(audit-log): barrel + createAuditLog factory"
```

---

## Task 6: `OverrideRuleId` and `OverrideSubRuleId`

**Files:**
- Create: `src/overrides/types.ts` (partial - rule IDs only in this task)
- Test: `tests/overrides/types.test.ts` (partial)

- [ ] **Step 1: Write the failing test**

`tests/overrides/types.test.ts`:
```ts
import type { OverrideRuleId, OverrideSubRuleId } from "../../src/overrides/types.js";

describe("override rule IDs", () => {
  it("has eight top-level rules OA001 through OA008", () => {
    const ids: OverrideRuleId[] = [
      "OA001", "OA002", "OA003", "OA004",
      "OA005", "OA006", "OA007", "OA008",
    ];
    expect(ids).toHaveLength(8);
  });

  it("has the five OA005 sub-rules", () => {
    const subs: OverrideSubRuleId[] = [
      "OA005.a", "OA005.b", "OA005.c", "OA005.d", "OA005.e",
    ];
    expect(subs).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/overrides/types.test.ts
```
Expected: FAIL (module not found)

- [ ] **Step 3: Create `src/overrides/types.ts` with rule IDs**

```ts
// Override-audit rule identifiers. Spec: docs/merge/2026-05-28-cve-lite-merge-design.md

export type OverrideRuleId =
  | "OA001"   // orphaned target
  | "OA002"   // floating tag
  | "OA003"   // misplaced section
  | "OA004"   // surpassed pin
  | "OA005"   // ineffective nested
  | "OA006"   // parent coupling
  | "OA007"   // registry drift
  | "OA008"   // materialized vulnerable

  ;

export type OverrideSubRuleId =
  | "OA005.a"   // non-npm container
  | "OA005.b"   // orphaned outer
  | "OA005.c"   // orphaned inner
  | "OA005.d"   // leaky
  | "OA005.e"   // suspect

  ;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/types.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/overrides/types.ts tests/overrides/types.test.ts
git commit -m "feat(overrides): OverrideRuleId and OverrideSubRuleId types"
```

---

## Task 7: `OverrideFinding` shape

**Files:**
- Modify: `src/overrides/types.ts`
- Modify: `tests/overrides/types.test.ts`

- [ ] **Step 1: Extend the test**

Append to `tests/overrides/types.test.ts`:
```ts
import type { OverrideFinding } from "../../src/overrides/types.js";

describe("OverrideFinding shape", () => {
  it("carries ruleId, severity, package, location, message", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "Override target not in resolved tree",
    };
    expect(f.ruleId).toBe("OA001");
    expect(f.location.file).toBe("package.json");
  });

  it("optionally carries an RFC 6902 patch fix", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
      fix: {
        type: "rfc6902",
        patch: [{ op: "remove", path: "/overrides/postcss" }],
      },
    };
    expect(f.fix?.type).toBe("rfc6902");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/overrides/types.test.ts
```
Expected: FAIL (`OverrideFinding` not exported)

- [ ] **Step 3: Extend `src/overrides/types.ts`**

Append:
```ts
import type { SeverityLabel } from "../types.js";

export type RFC6902Op =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };

export interface OverrideFix {
  type: "rfc6902";
  patch: RFC6902Op[];
  /** Optional runnable command equivalent (e.g., `cve-lite overrides --fix ...`). */
  runnableCommand?: string;
}

export interface OverrideFinding {
  ruleId: import("./types.js").OverrideRuleId;
  subRuleId?: import("./types.js").OverrideSubRuleId;
  severity: SeverityLabel;
  package: { name: string; version?: string };
  location: { file: string; jsonPath?: string; line?: number };
  message: string;
  details?: string;
  fix?: OverrideFix;
  references?: string[];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/types.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/overrides/types.ts tests/overrides/types.test.ts
git commit -m "feat(overrides): OverrideFinding shape with optional RFC 6902 fix"
```

---

## Task 8: Overrides barrel

**Files:**
- Create: `src/overrides/index.ts`

- [ ] **Step 1: Implement the barrel**

```ts
export type {
  OverrideRuleId,
  OverrideSubRuleId,
  OverrideFinding,
  OverrideFix,
  RFC6902Op,
} from "./types.js";
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/overrides/index.ts
git commit -m "feat(overrides): barrel exports"
```

---

## Task 9: Extend `src/types.ts` with exit-code constant and re-exports

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Read the current file**

```bash
sed -n '1,10p' src/types.ts
```

- [ ] **Step 2: Append exit-code constants and re-exports at the end of `src/types.ts`**

Append:
```ts
/**
 * Exit codes used by the CLI.
 *
 * 0 - no findings above --fail-on threshold
 * 1 - findings present (CVE or override) above threshold
 * 2 - --fix applied but verify() detected the fix did not take
 *     (operationally distinct from 1: "fix ran but did not work")
 * 3 - tool error (unhandled exception, unreadable lockfile, etc.)
 */
export const EXIT_OK = 0 as const;
export const EXIT_FINDINGS = 1 as const;
export const EXIT_VERIFY_FAILED = 2 as const;
export const EXIT_ERROR = 3 as const;

export type ExitCode =
  | typeof EXIT_OK
  | typeof EXIT_FINDINGS
  | typeof EXIT_VERIFY_FAILED
  | typeof EXIT_ERROR;

// Re-export override and audit-log surface for consumers that import from src/types.
export type {
  OverrideFinding,
  OverrideRuleId,
  OverrideSubRuleId,
  OverrideFix,
  RFC6902Op,
} from "./overrides/index.js";

export type { AuditEvent, AuditLogHandle } from "./audit-log/index.js";
```

- [ ] **Step 3: Verify the project still compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): exit-code constants + re-export override and audit-log types"
```

---

## Task 10: Integration test - round-trip through NDJSON writer

**Files:**
- Create: `tests/audit-log/integration.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuditLog, type AuditEvent } from "../../src/audit-log/index.js";

describe("audit-log integration (factory + round trip)", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-log-itest-"));
    path = join(dir, "audit.ndjson");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("createAuditLog(undefined) returns a no-op handle", () => {
    const h = createAuditLog(undefined);
    expect(h.isNoOp).toBe(true);
  });

  it("createAuditLog(path) returns a real writer that round-trips events", () => {
    const h = createAuditLog(path);
    expect(h.isNoOp).toBe(false);

    const events: AuditEvent[] = [
      {
        ts: "2026-05-28T00:00:00.000Z",
        type: "scan.started",
        schemaVersion: 1,
        projectPath: dir,
        mode: "resolved-lockfile",
        source: "package-lock",
        flags: { fix: true, json: false },
      },
      {
        ts: "2026-05-28T00:00:00.500Z",
        type: "cve.detected",
        schemaVersion: 1,
        package: { name: "lodash", version: "4.17.20" },
        severity: "high",
        cveAliases: ["CVE-2021-23337"],
        vulnerabilityIds: ["GHSA-35jh-r3h4-6jhm"],
      },
      {
        ts: "2026-05-28T00:00:01.000Z",
        type: "scan.finished",
        schemaVersion: 1,
        durationMs: 1000,
        findingsCount: 1,
        exitCode: 1,
      },
    ];
    for (const e of events) h.emit(e);
    h.close();

    const parsed = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as AuditEvent);
    expect(parsed).toEqual(events);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm test -- tests/audit-log/integration.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/audit-log/integration.test.ts
git commit -m "test(audit-log): factory + NDJSON round-trip integration"
```

---

## Task 11: Final foundation gate - full test suite

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: all existing cve-lite tests still pass + all new foundation tests pass. If any pre-existing test fails because of the new re-exports in `src/types.ts`, that is a regression - fix it before continuing.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Confirm directory tree**

```bash
ls src/audit-log src/overrides tests/audit-log tests/overrides
```
Expected:
- `src/audit-log/`: events.ts, handle.ts, index.ts, ndjson-writer.ts
- `src/overrides/`: index.ts, types.ts
- `tests/audit-log/`: events.test.ts, integration.test.ts, ndjson-writer.test.ts, no-op.test.ts
- `tests/overrides/`: types.test.ts

- [ ] **Step 4: Final commit if any cleanup**

```bash
git status
git log --oneline -15
```

Plan 1 complete when:
- Eleven commits land on `merge` for Plan 1.
- `npm test` is green.
- `npx tsc --noEmit` is clean.
- No file outside `src/audit-log/`, `src/overrides/`, `src/types.ts`, `tests/audit-log/`, `tests/overrides/` was modified.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `src/audit-log/` module exists | Task 1, 2, 3, 4, 5 |
| Opt-in audit-log (no-op when disabled) | Task 3 (`NullAuditLog`), Task 5 (`createAuditLog` factory) |
| Typed event vocabulary covering full project | Task 2 (9 event types) |
| `schemaVersion: 1` on every event | Task 2 |
| Zero-cost emit when disabled | Task 3 (no-op is one function call) |
| `OverrideFinding` shape | Task 7 |
| `OverrideRuleId` discriminated union | Task 6 |
| OA005 sub-rules represented | Task 6 |
| Exit code `2` constant defined | Task 9 |
| Surface re-exported via `src/types.ts` | Task 9 |
| Full test suite stays green | Task 11 |

## Next plan

Plan 2 (`docs/merge/2026-05-28-plan-2-detector-migration.md`) layers the 8 OA detectors from `_preserved-override-audit/src/detectors/` into `src/overrides/detectors/`, wiring each to consume cve-lite's existing parsers and emit `OverrideFinding[]`.
