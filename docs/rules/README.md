# Rules

Reference docs for the eight rules shipping in v0.3.0.

| Rule | Severity | Action | Doc |
|---|---|---|---|
| `OA001-ORPHAN-TARGET` | low | `remove` | [OA001.md](OA001.md) |
| `OA002-FLOATING-TAG` | medium | `replace` (or `suggest`) | [OA002.md](OA002.md) |
| `OA003-WRONG-SECTION` | high | `move` | [OA003.md](OA003.md) |
| `OA004-INSTALLED-NEWER` | low | `remove` / `suggest` | [OA004.md](OA004.md) |
| `OA005-NESTED-OVERRIDE` | info–critical | varies | [OA005.md](OA005.md) |
| `OA006-COUPLED-PLATFORM-BINARY` | high (platform) / medium (other) | `suggest` | [OA006.md](OA006.md) |
| `OA007-FROZEN-LATEST` | high | `suggest` (`--with-registry`) | [OA007.md](OA007.md) |
| `OA008-VULNERABLE-TWIN` | critical | `suggest` | [OA008.md](OA008.md) |

OA005 has five sub-codes — see its doc for details.

## Output channels

Each detector emits a `Finding` object containing the rule id, severity, an explanation, and an RFC 6902 patch (or null, for `suggest`-only findings). Findings can be consumed two ways:

- **Human renderer** (`override-audit`) — severity-grouped plain text suitable for terminals and CI logs.
- **JSON renderer** (`override-audit --json`) — full structured output matching the v1 schema (locked via `tests/__snapshots__/output-snapshot.test.ts.snap`). Designed to be consumed by HexOps' `OverrideAuditSource` wrapper in v1.0.0.

## Severity scale

```
critical > high > medium > low > info
```

The `--severity <level>` CLI flag sets the **minimum** severity reported. `--severity high` shows only `high` and `critical` findings.
