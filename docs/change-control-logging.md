# Change-Control Logging

Reference for the NDJSON record stream emitted under `--log-file`. Designed for HexOps and other orchestrators to consume.

## Quick example

```bash
override-audit \
  --fix --with-registry \
  --attempt-id rem_abc-123 \
  --source ci \
  --advisory GHSA-xxxx-yyyy-zzzz \
  --meta repo=myapp --meta runner=gha \
  --log-file /var/log/override-audit.log \
  --log-level info \
  /path/to/project
```

Each line of `/var/log/override-audit.log` is exactly one JSON record (NDJSON / JSON Lines). The file is **append-only**; consecutive runs accumulate. Consumers should parse line-by-line.

## Lifecycle

A single `--fix` run emits records in this order:

```
1× remediation_attempt
  ─ context: attemptId, source, advisory, meta, dryRun, projectPath

0..N× remediation_applied  ─ per successful RFC 6902 patch application
0..N× remediation_failed   ─ per patch error
0..N× remediation_skipped  ─ per finding that didn't qualify (suggest-only, below floor, filtered)
                             (interleaved with applied/failed)

1× remediation_complete
  ─ summary: { applied, skipped, failed, remainingFindings, newFindings }
  ─ exitCode
```

Detect-only runs (no `--fix`) and `--fix` runs **without** `--log-file` emit zero records.

## Record schema

All records share a common envelope:

```jsonc
{
  "type": "remediation_attempt" | "remediation_applied" | ... ,
  "attemptId": "rem_xxx",                      // threads through every record in a run
  "timestamp": "2026-05-27T23:59:24.693Z",     // ISO-8601 with milliseconds
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "debug" | "info" | "warn" | "error"
  // …record-specific fields below…
}
```

### `remediation_attempt`

Emitted once at the start, before any patch is attempted.

```jsonc
{
  "type": "remediation_attempt",
  "attemptId": "rem_abc-123",
  "timestamp": "2026-05-27T23:59:24.693Z",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "info",
  "projectPath": "/path/to/project",
  "source": "ci",                              // from --source; optional
  "advisory": "GHSA-xxxx-yyyy-zzzz",           // from --advisory; optional
  "meta": {                                    // from --meta key=value; optional
    "repo": "myapp",
    "runner": "gha"
  },
  "dryRun": false                              // true under --dry-run
}
```

### `remediation_applied`

Emitted per successful patch application. For multi-op patches (e.g. OA006), `patches` contains all ops as a single record; they're applied atomically.

```jsonc
{
  "type": "remediation_applied",
  "attemptId": "rem_abc-123",
  "timestamp": "2026-05-27T23:59:24.694Z",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "info",
  "ruleId": "OA006-COUPLED-PLATFORM-BINARY",
  "subRuleId": null,                           // present only for OA005 sub-codes
  "package": "postcss",
  "patches": [
    { "op": "remove", "path": "/overrides/postcss" },
    { "op": "add", "path": "/overrides/next", "value": ">=16.2.6" }
  ]
}
```

### `remediation_failed`

Emitted when a patch errors during application. This typically happens because an earlier patch removed or modified the target path.

```jsonc
{
  "type": "remediation_failed",
  "attemptId": "rem_abc-123",
  "timestamp": "2026-05-27T23:59:24.695Z",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "error",
  "ruleId": "OA007-FROZEN-LATEST",
  "package": "@esbuild/linux-x64",
  "error": "Cannot replace missing key \"@esbuild/linux-x64\""
}
```

### `remediation_skipped`

Emitted when a finding doesn't qualify for auto-fix:

- `suggest`-only (no patch): `level: info`
- Below severity floor: `level: debug`
- Filtered by `--rule X=off`: `level: debug`
- `OA005.e-SUSPECT` without `--include-sub-suspect`: `level: debug`

```jsonc
{
  "type": "remediation_skipped",
  "attemptId": "rem_abc-123",
  "timestamp": "2026-05-27T23:59:24.694Z",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "info",                             // info for suggest-only, debug otherwise
  "ruleId": "OA008-VULNERABLE-TWIN",
  "package": "@esbuild/linux-x64",
  "reason": "suggest-only (no automated patch)"
}
```

### `remediation_complete`

Emitted once at the end with totals and the inferred exit code.

```jsonc
{
  "type": "remediation_complete",
  "attemptId": "rem_abc-123",
  "timestamp": "2026-05-27T23:59:24.964Z",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "level": "info",
  "summary": {
    "applied": 3,
    "skipped": 1,
    "failed": 1,
    "remainingFindings": 1,                    // null if --no-post-fix-rescan
    "newFindings": 1                           // findings introduced by the fix
  },
  "exitCode": 1                                // 0 clean, 1 findings remain, 2 internal error
}
```

## Levels

| Level | Used for |
|---|---|
| `debug` | `remediation_skipped` for below-floor / filtered findings |
| `info` | All `remediation_attempt`, `remediation_applied`, `remediation_complete`, and `remediation_skipped` for suggest-only |
| `warn` | (reserved; no records currently emit this) |
| `error` | `remediation_failed` |

`--log-level <level>` drops records below the threshold. Default is `info`; debug-level skips are hidden unless you ask for them.

## Consumer recipes

### Find all advisory-driven runs

```bash
grep -F '"type":"remediation_attempt"' /var/log/override-audit.log | \
  jq -c 'select(.advisory != null) | { attemptId, advisory, repo: .meta.repo }'
```

### Per-attempt outcome

```bash
jq -s 'group_by(.attemptId) | map({
  attemptId: .[0].attemptId,
  source:    (.[] | select(.type == "remediation_attempt") | .source),
  advisory:  (.[] | select(.type == "remediation_attempt") | .advisory),
  applied:   ([.[] | select(.type == "remediation_applied")] | length),
  failed:    ([.[] | select(.type == "remediation_failed")] | length),
  exitCode:  (.[] | select(.type == "remediation_complete") | .exitCode)
})' /var/log/override-audit.log
```

### Stream-process new records as the file grows

```bash
tail -F /var/log/override-audit.log | jq -c 'select(.type == "remediation_failed")'
```

## Guarantees

- **Append-only.** Records are written via `appendFileSync`; the file is never truncated by the tool.
- **One record per line.** No multi-line JSON. Safe to `tail -F` and process line-by-line.
- **Stable schema within a major version.** Field additions are allowed; removals or type changes are breaking and gated on a major bump.
- **No secrets in records.** `--meta` is freeform but the tool itself never reads tokens, credentials, or environment variables into records.

## What's NOT logged

- Findings that don't trigger `--fix` (detect-only runs are silent in the log).
- Pre-fix scan output (the human/JSON renderer handles that; the log is the *fix* trail).
- Filesystem writes other than the change-control file (atomic package.json writes are not logged).
- Network calls (`--with-registry` requests to registry.npmjs.org).

If you need any of these, capture stdout/stderr separately or use `--json` output alongside the log file.
