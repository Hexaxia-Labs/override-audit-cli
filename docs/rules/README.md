# Override hygiene rules

Reference docs for the eight override-hygiene rules (`OA001`..`OA008`) run by `cve-lite overrides`.

| Rule | Severity | Action | Doc |
|---|---|---|---|
| OA001: Orphaned target | high | `remove` | [OA001.md](OA001.md) |
| OA002: Floating tag | medium | `replace` (or `suggest`) | [OA002.md](OA002.md) |
| OA003: Wrong section | high | `move` | [OA003.md](OA003.md) |
| OA004: Surpassed pin | low | `remove` / `suggest` | [OA004.md](OA004.md) |
| OA005: Nested ineffective override | low to critical | varies (`.d`/`.e` suggest-only) | [OA005.md](OA005.md) |
| OA006: Coupled platform binary | high (platform) / medium (other) | `replace` (multi-op) | [OA006.md](OA006.md) |
| OA007: Frozen latest | low | `replace` (needs `--check-network`) | [OA007.md](OA007.md) |
| OA008: Materialized vulnerable copy | critical | `suggest` | [OA008.md](OA008.md) |

OA005 has five sub-codes (`OA005.a`..`OA005.e`). See its doc for details.

## Running the rules

```bash
cve-lite overrides [path]              # audit, severity-grouped terminal output
cve-lite overrides --json             # structured JSON findings
cve-lite overrides --fix              # apply RFC 6902 patches for fixable findings
cve-lite overrides --fix --rule OA003 # scope the fix to one rule
cve-lite overrides --check-network    # enable OA007 registry drift check (opt-in network)
```

## Output channels

Each detector emits a finding containing the rule id, severity, an explanation, and (for fixable findings) an RFC 6902 patch. Findings can be consumed two ways:

- **Human renderer** (`cve-lite overrides`) for severity-grouped plain text suitable for terminals and CI logs.
- **JSON renderer** (`cve-lite overrides --json`) for structured output.

Suggest-only findings (OA004 cross-major, OA005.d, OA005.e, all of OA008) carry no fix patch; `--fix` skips them.

## Severity scale

```
critical > high > medium > low > info
```

`--fail-on <severity>` sets the minimum severity that makes `cve-lite overrides` exit non-zero (default: `critical`).
