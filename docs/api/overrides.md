# Override audit programmatic API

The override-hygiene subsystem that powers `cve-lite overrides` is also a public
programmatic API. This reference covers the exported surface from
`src/overrides/index.ts` and `src/audit-log/index.ts` so external consumers
(cve-lite's own callers, IDE plugins, CI glue) can drive the auditor directly.

For the per-rule catalog (`OA001`-`OA008`) see [`docs/rules/`](../rules/README.md).

## Quick start

```ts
import {
  buildOverrideContext,
  audit,
  applyFix,
} from "cve-lite-cli/overrides";
import { createAuditLog } from "cve-lite-cli/audit-log";

const projectPath = "/path/to/project";
const auditLog = createAuditLog(undefined); // no-op handle; pass a path to record NDJSON
const logger = { info: console.log, warn: console.warn, error: console.error, debug: () => {} };

// 1. Build the context once (parses package.json, lockfile, node_modules).
const ctx = buildOverrideContext(projectPath, { auditLog, logger, checkNetwork: false });

// 2. Run all eight detectors.
const { findings } = await audit(ctx, { checkNetwork: false });
for (const f of findings) {
  console.log(`${f.ruleId} ${f.severity} ${f.package.name}: ${f.message}`);
}

// 3. Apply the fixable findings (RFC 6902 patches written to package.json).
const fixable = findings.filter((f) => f.fix?.type === "rfc6902" && f.fix.tier !== "proposed");
const report = applyFix({ projectPath, findings: fixable, auditLog, dryRun: false });
console.log(`applied ${report.appliedPatches.length}, skipped ${report.skipped.length}`);

auditLog.close();
```

## `buildOverrideContext(projectPath, opts)`

```ts
function buildOverrideContext(projectPath: string, opts: BuildOptions): OverrideContext;

interface BuildOptions {
  auditLog: AuditLogHandle;
  logger: Logger;
  /** True when --check-network is set (gates the OA007 registry fetch). */
  checkNetwork: boolean;
}
```

Constructs the single context object every detector reads. It runs the parser
pipeline synchronously: reads `package.json`, flattens overrides across the
`overrides` / `pnpm.overrides` / `resolutions` containers, parses the lockfile
(npm, pnpm, yarn, or bun), and eagerly walks `node_modules` when present to
populate installed copies and parent declarations.

When inputs are missing (no lockfile, no `node_modules`), the detectors that
depend on them are pre-skipped rather than throwing; each skip is recorded on
`ctx.skippedDetectors` with a reason. `checkNetwork` only declares intent here;
the actual OA007 registry fetch happens inside `audit()`.

Key `OverrideContext` fields a consumer reads:

| Field | Meaning |
|---|---|
| `overrideEntries` | Flattened override entries (key, bare package name, container, path) |
| `lockfilePackageNames` | Every bare package name present in the resolved lockfile |
| `installedVersions` / `installedCopies` | Top-level and every-copy `node_modules` state |
| `parentDeclarations` | Parents that declare each package (OA006) |
| `registryDistTags` | Populated only after a `checkNetwork` audit (OA007) |
| `skippedDetectors` | Detectors pre-skipped, with reasons |

## `audit(ctx, opts)`

```ts
function audit(ctx: OverrideContext, opts: AuditOptions): Promise<AuditResult>;

interface AuditOptions {
  /** When true, fetch registry dist-tags so OA007 can run. */
  checkNetwork: boolean;
  /** Registry client options. Only used when checkNetwork=true. */
  registry?: RegistryClientOptions;
}

interface AuditResult {
  findings: OverrideFinding[];
}
```

Runs all eight detectors over the context and returns their findings. When
`opts.checkNetwork` is true it first fetches registry dist-tags for string-valued
overrides so OA007 can evaluate drift; a fetch failure is non-fatal and is
recorded on `ctx.skippedDetectors` (OA007) instead of throwing. The composite
pass (see below) is applied before returning. Each finding emits an `oa.detected`
event to the audit log.

Note: `skippedDetectors` lives on the **context** (`ctx.skippedDetectors`), not
on `AuditResult`. Read it from the context after the audit returns.

## `verify(targets, ctx)`

```ts
function verify(targets: ReadonlyArray<VerifyTarget>, ctx: OverrideContext): Promise<VerifyResult>;

interface VerifyTarget { name: string; version?: string }
interface VerifyResult { ok: boolean; findings: OverrideFinding[] }
```

Post-fix verification. Runs only the verify detectors (OA001 and OA008), then
scopes the findings to `targets` by package name. This is the cheap re-check used
after a fix applies: it confirms the just-touched packages did not leave an
orphaned override (OA001) or a vulnerable copy still nested on disk (OA008).
Returns `{ ok: true, findings: [] }` when nothing scoped fired, otherwise
`{ ok: false, findings }`. Emits `verify.passed` or `verify.failed`.

Argument order is `(targets, ctx)` - targets first. Rebuild the context from disk
(`buildOverrideContext`) before verifying, since the fix mutated `package.json`.

## `applyFix(opts)`

```ts
function applyFix(opts: FixOptions): FixReport;

interface FixOptions {
  projectPath: string;
  findings: ReadonlyArray<OverrideFinding>;
  auditLog: AuditLogHandle;
  dryRun: boolean;
}

interface FixReport {
  appliedAt: string;
  dryRun: boolean;
  appliedPatches: AppliedPatch[];   // { ruleId, package, patches }
  skipped: SkippedForFix[];         // { ruleId, package, reason }
}
```

Synchronous. Applies the RFC 6902 patch attached to each finding's `fix` field,
in order, to a single `package.json` at `projectPath`. Findings without an
`rfc6902` fix are skipped with a reason rather than failing the batch. Indentation
of the original file is preserved.

**Chokepoint guard.** Override hygiene must never invent a new override key. After
applying a finding's patch, `applyFix` compares the override key set before and
after; if the patch would create a new key under any override container it is
rejected (logged as a `fix-guard` error and added to `skipped`), and nothing is
committed for that finding. The only sanctioned way to introduce a key is the
`relocate` op, which retires a child override and writes a parent dependency floor
under `/dependencies` (an upgrade, not a new override).

With `dryRun: true` the report is computed but `package.json` is not written.
Pass only the findings you intend to apply - typically
`findings.filter(f => f.fix?.type === "rfc6902" && f.fix.tier !== "proposed")`,
since `tier: "proposed"` fixes (the OA006 relocate floor) write an inferred value
and are meant to be surfaced as recommendations, not applied silently.

## `applyComposite(findings)`

```ts
function applyComposite(findings: OverrideFinding[]): OverrideFinding[];
```

A post-**detection** pass, not a fix applier. Given the raw union of all detector
findings it: (1) drops OA001 for a package when OA005 also fired (OA005 is the
more specific framing), and (2) escalates OA006 from medium to high when OA008
fired for the same target (the coupling risk has materialized as a vulnerable copy
on disk). `audit()` already calls this internally, so most consumers never call it
directly; it is exported for callers that assemble findings from detectors by hand.

## Audit log handles

```ts
import {
  createAuditLog,
  MemoryAuditLog,
  NullAuditLog,
  NULL_AUDIT_LOG,
  NdjsonAuditLog,
} from "cve-lite-cli/audit-log";
```

Every `audit` / `verify` / `applyFix` call takes an `AuditLogHandle` and emits
change-control events to it (`oa.detected`, `oa.fix.applied`, `verify.passed`,
`verify.failed`, `error`). Pick a handle by where the events should go:

| Handle | Use when |
|---|---|
| `NullAuditLog` / `NULL_AUDIT_LOG` | You do not want a record. `NULL_AUDIT_LOG` is a shared no-op singleton. |
| `MemoryAuditLog` | You want to inspect emitted events in-process (tests, programmatic consumers). |
| `NdjsonAuditLog` | You want a durable newline-delimited JSON change-control stream on disk. |

`createAuditLog(path)` is the convenience the CLI uses: it returns
`NULL_AUDIT_LOG` when `path` is undefined, otherwise an `NdjsonAuditLog` writing
to `path`. Always `close()` the handle when done so the NDJSON stream flushes.

## Logger contract

```ts
interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}
```

`buildOverrideContext` requires a logger with all four methods. Adapt your own
logging however you like - the CLI routes these to its debug-log stream. Use a
no-op (`() => {}`) for any level you want to discard.
