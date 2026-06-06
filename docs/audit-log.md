# Audit log

CVE Lite CLI can stream a structured, append-only record of everything it does during a scan, fix, and verify run. The audit log is opt-in change-control evidence covering the whole tool, not just override flows. It is designed for orchestrators, CI pipelines, and compliance tooling to consume.

## Enabling it

Pass `--audit-log <path>`:

```bash
cve-lite /path/to/project --audit-log /var/log/cve-lite/audit.ndjson
cve-lite overrides /path/to/project --audit-log ./audit.ndjson
cve-lite /path/to/project --fix --audit-log ./audit.ndjson
```

Or set the environment variable (the flag wins if both are present):

```bash
export CVE_LITE_AUDIT_LOG=/var/log/cve-lite/audit.ndjson
cve-lite /path/to/project
```

The log is **off by default**. A run with neither the flag nor the env var emits zero records and pays zero cost. The file is **append-only**: consecutive runs accumulate, so consumers parse line by line and should not assume one run per file.

## Format

The stream is NDJSON (JSON Lines): each line is exactly one JSON object. Every event shares a common envelope:

```jsonc
{
  "ts": "2026-06-06T20:01:20.615Z",   // ISO-8601 with milliseconds
  "type": "scan.started",              // one of the nine event types below
  "schemaVersion": 1                   // bump signals a vocabulary change
  // ...type-specific fields...
}
```

`schemaVersion` is currently `1`. New event types may be added under the same version; a breaking change to existing event shapes would bump it.

## Lifecycle

A typical `cve-lite [path] --fix --audit-log` run emits, in order:

```
1x  scan.started
0..Nx  cve.detected        one per CVE finding
0..Nx  oa.detected         one per override-hygiene finding (when --check-overrides or the overrides subcommand is used)
0..Nx  cve.fix.applied     one per planned remediation
0..Nx  oa.fix.applied      one per override fix the hook applies
0..1x  verify.passed | verify.failed   the post-fix verification result
1x  scan.finished
```

`error` can appear at any point if the run throws. `scan.finished` is emitted on every exit path, including early exits and errors, so a consumer can always pair it with `scan.started`.

## Event vocabulary

Nine event types, defined canonically in `src/audit-log/events.ts`.

### `scan.started`

Emitted once at the top of a scan.

| Field | Type | Notes |
|---|---|---|
| `projectPath` | string | resolved absolute path |
| `mode` | string | scan mode (e.g. resolved-lockfile) |
| `source` | string | lockfile source (e.g. package-lock) |
| `flags` | object | the boolean/string flags the run was invoked with |

### `scan.finished`

Emitted once before exit, on every path.

| Field | Type | Notes |
|---|---|---|
| `durationMs` | number | wall-clock since scan.started |
| `findingsCount` | number | total CVE + override findings |
| `exitCode` | number | the process exit code (0 ok, 1 findings, 2 verify failed, 3 error) |

### `cve.detected`

One per CVE finding.

| Field | Type | Notes |
|---|---|---|
| `package` | { name, version } | the vulnerable package |
| `severity` | string | severity label |
| `cveAliases` | string[] | CVE identifiers |
| `vulnerabilityIds` | string[] | source advisory ids (e.g. GHSA) |

### `cve.fix.applied`

One per planned remediation. CVE Lite emits a fix plan rather than applying upgrades itself, so this records "the plan recommended this upgrade."

| Field | Type | Notes |
|---|---|---|
| `package` | string | package to upgrade |
| `fromVersion` | string | current version, or "unknown" |
| `toVersion` | string | recommended target |
| `mechanism` | string | direct-upgrade, parent-upgrade, transitive-resolution |

### `oa.detected`

One per override-hygiene finding.

| Field | Type | Notes |
|---|---|---|
| `ruleId` | string | OA001 through OA008 |
| `severity` | string | severity label |
| `package` | string | the override target |
| `message` | string | human-readable finding |
| `location` | { file, jsonPath? } | optional source location |

### `oa.fix.applied`

One per override fix the `--fix` hook applies.

| Field | Type | Notes |
|---|---|---|
| `ruleId` | string | the rule whose fix was applied |
| `package` | string | the override target |
| `patches` | array | RFC 6902 ops applied ({ op, path, value?, from? }) |

### `verify.passed`

The post-fix verification cleared.

| Field | Type | Notes |
|---|---|---|
| `targets` | array | the { name, version? } targets that were re-checked |

### `verify.failed`

The post-fix verification found the fix did not take. The run exits `2`.

| Field | Type | Notes |
|---|---|---|
| `failures` | array | { ruleId, package, reason } per failed target |

### `error`

Emitted if the run throws.

| Field | Type | Notes |
|---|---|---|
| `phase` | string | where it happened (e.g. scan) |
| `message` | string | error message |
| `stack` | string? | stack trace when available |

## Why it exists

CVE Lite CLI is an OWASP Incubator project, and the audit log is part of making remediation auditable. A single NDJSON stream captures the full scan, fix, and verify lifecycle as change-control evidence: what was scanned, what was found, what fix was recommended or applied, and whether the post-fix verification confirmed the fix took. It is decoupled from any single feature, so the same stream documents CVE remediation and override hygiene side by side.

## Debug log vs audit log

These are separate concerns and can be enabled together:

- `--debug` writes an unstructured, human-readable diagnostic log (network requests, cache hits, runtime events) gated by `--debug`.
- `--audit-log` writes structured NDJSON change-control events gated by `--audit-log`.

A run with both flags writes two files. Do not route one through the other.
