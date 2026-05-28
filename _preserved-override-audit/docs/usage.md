# Usage Guide

End-user walkthrough for `override-audit`. Read this once; come back to specific sections as you need them.

If you're embedding the library or building a HexOps-style adapter, see [`docs/architecture.md`](architecture.md) and [`docs/change-control-logging.md`](change-control-logging.md) instead.

## Contents

1. [First run](#first-run)
2. [Reading the output](#reading-the-output)
3. [Severity and how it works](#severity-and-how-it-works)
4. [The eight rules at a glance](#the-eight-rules-at-a-glance)
5. [Fixing findings](#fixing-findings)
6. [Workflows](#workflows)
   - [Daily local development](#daily-local-development)
   - [Security incident response](#security-incident-response)
   - [CI gate](#ci-gate)
7. [Filtering and tuning](#filtering-and-tuning)
8. [Network features (`--with-registry`)](#network-features---with-registry)
9. [JSON output](#json-output)
10. [Change-control logging](#change-control-logging)
11. [Common pitfalls](#common-pitfalls)
12. [Troubleshooting](#troubleshooting)

## First run

Install once:

```bash
npm install -g @hexaxia-labs/override-audit-cli
```

Run against the current directory:

```bash
override-audit
```

Or any directory:

```bash
override-audit /path/to/some/project
```

You'll either see a clean output:

```
override-audit  /path/to/project  (npm)

  No findings.
```

or a list of findings grouped by severity:

```
override-audit  /path/to/project  (npm)

  3 findings:

  [high]
    OA006-COUPLED-PLATFORM-BINARY  @esbuild/linux-x64  latest  → suggest
        @esbuild/linux-x64 is overridden to "latest", but its installed parent
        esbuild@0.28.0 declares it as exact (optionalDependencies: "0.28.0").
        ...

  [medium]
    OA002-FLOATING-TAG  @esbuild/linux-x64  latest  → replace
        @esbuild/linux-x64 is pinned to "latest" - every install may
        re-resolve the version, defeating the override.
```

The exit code tells you the outcome:

| Code | Meaning |
|---|---|
| `0` | Clean (no findings at or above your `--severity` threshold) |
| `1` | Findings present above threshold |
| `2` | Internal error (bad input, unknown flag, etc.) |

That's it for the basic flow. Read on to learn what the findings mean and how to address them.

## Reading the output

Each finding is one line of summary followed by one line of detail:

```
  [<severity>]
    <RULE-ID>  <package>  <pin-value>  → <action>
        <human-readable explanation>
```

| Field | What it tells you |
|---|---|
| **severity** | How urgent. See [Severity and how it works](#severity-and-how-it-works). |
| **RULE-ID** | The rule code (e.g. `OA002-FLOATING-TAG`). Each rule has a dedicated doc at [`docs/rules/`](rules/). |
| **package** | The target package the override applies to. |
| **pin-value** | What's currently in `overrides` (or `pnpm.overrides`). |
| **action** | What `--fix` would do for you: `remove`, `replace`, `move`, or `suggest`. |
| **explanation** | Why the rule fired, in plain language. |

If detectors couldn't run (lockfile missing, `node_modules` missing, etc.), you'll see a footer:

```
  Skipped detectors (incomplete inputs):
    OA001  lockfile missing or empty - orphan check disabled
    OA007  --with-registry not passed - frozen-latest check disabled (offline by default)
```

These are graceful degradations, not errors. Address the missing input (run `npm install`, pass `--with-registry`) to get full coverage.

## Severity and how it works

Five levels:

```
critical > high > medium > low > info
```

Default threshold is `low`: you'll see everything *except* info-level findings. The `info` level is reserved for `OA005.e-SUSPECT` (a stylistic suggestion that the nested override could be flattened to a top-level entry); it's filtered by default and only surfaces if you pass `--include-sub-suspect --severity info`.

Override the threshold with `--severity`:

```bash
override-audit --severity high      # only high+ and critical
override-audit --severity critical  # only critical (CI gate friendly)
override-audit --severity info      # show everything
```

The threshold also affects the exit code: a finding below your threshold counts as "clean" for the exit-code decision, even if the finding still exists in the project.

## The eight rules at a glance

| Rule | Severity | What it catches | Auto-fix? |
|---|---|---|---|
| `OA001-ORPHAN-TARGET` | low | Override target isn't in the resolved dependency tree | yes (`remove`) |
| `OA002-FLOATING-TAG` | medium | Pin uses `latest` / `next` / `*` / non-semver | yes when installed (`replace` with `>=installed`) |
| `OA003-WRONG-SECTION` | high | `pnpm.overrides` in an npm project, or vice versa | yes (`move`) |
| `OA004-INSTALLED-NEWER` | low | Concrete pin already surpassed by installed version | yes for same-major (`remove`) |
| `OA005-NESTED-OVERRIDE` | info to critical | Nested-object override pattern with five sub-cases | depends on sub-case |
| `OA006-COUPLED-PLATFORM-BINARY` | high / medium | Override fights an exact-pinned parent | yes since v0.2.1 (multi-op `replace`) |
| `OA007-FROZEN-LATEST` | high | `"latest"` pin resolved long ago; registry has moved on | yes since v0.2.1 (`replace` with `>=registry-latest`) |
| `OA008-VULNERABLE-TWIN` | critical | Vulnerable copy still on disk despite override floor | no (structural investigation needed) |

Full per-rule reference is in [`docs/rules/`](rules/). Each rule doc has a working example, why it matters, and how to fix.

## Fixing findings

There are three ways to act on a finding.

### 1. Preview the fix (no disk writes)

```bash
override-audit --fix --dry-run
```

Shows what `--fix` *would* do. Nothing is written. The output lists patches that would apply and findings that would be skipped (suggest-only ones, or those filtered by severity/rule).

### 2. Apply the fix

```bash
override-audit --fix
```

This:
1. Filters findings by your `--severity` and `--rule` settings.
2. Applies the RFC 6902 patches detectors emit.
3. Atomically rewrites `package.json` (tmp file + rename; preserves your indent and trailing-newline style).
4. Re-runs the scanner to verify and reports any remaining findings or regressions.
5. Exits 0 if clean, 1 if findings remain.

After `--fix`, you should re-install:

```bash
rm -rf node_modules package-lock.json
npm install                       # or pnpm install
```

The lockfile is what locks the resolved versions. Until you regenerate it, the new override pins are declared but not actually applied to the installed tree. Re-running `override-audit` after install should give you a clean report (or surface any new findings the fresh resolution introduced, like an `OA008-VULNERABLE-TWIN`).

### 3. Handle suggest-only findings manually

Some rules don't have an automated fix:

- **`OA008-VULNERABLE-TWIN`** always stays `suggest`. The fix requires investigation. Run `npm ls <package>` to find which parent is pulling in the vulnerable copy, then override that parent (typically an `OA006` pattern).
- **`OA002-FLOATING-TAG`** stays `suggest` when the package isn't installed under `node_modules`. Install dependencies first, then re-run.
- **`OA004-INSTALLED-NEWER`** stays `suggest` for cross-major cases (e.g. pin `17.0.0`, installed `18.3.1`) because a downgrade could legitimately pull from another dep. Verify manually before removing.
- **`OA005.d-LEAKY`** and **`.e-SUSPECT`** are stylistic; consider flattening the nested override to a top-level one as the finding suggests.

`--fix` lists each skipped finding under `1 skipped (need human review):` with the reason.

## Workflows

### Daily local development

Add to your shell setup or a project-level npm script:

```bash
override-audit                                  # quick sanity check
override-audit --include-sub-suspect            # also see stylistic OA005.e findings
override-audit --fix --dry-run                  # preview what could be cleaned up
```

The tool is fast (one filesystem read, then in-memory analysis). Run it after every dependency change.

### Security incident response

A new CVE drops and you need to confirm whether your override is actually protecting you:

```bash
override-audit --with-registry --severity high <project>
```

This is the highest-signal invocation. It runs all eight rules including `OA007-FROZEN-LATEST` (registry comparison) and uses the recursive node_modules walk that catches `OA006` and `OA008`.

Common outcomes:

- **`OA008-VULNERABLE-TWIN` fires**: your security pin isn't actually applied somewhere in the tree. Look at `npm ls <package>`, find the parent forcing the old version, and override at that level (then reinstall).
- **`OA007-FROZEN-LATEST` fires**: your `"latest"` pin resolved months ago to an outdated version. Replace with `>=<registry-latest>` (the finding tells you the exact value). `--fix` does this for you.
- **`OA006-COUPLED-PLATFORM-BINARY` fires on a platform binary**: you're trying to override a native binary that's exact-pinned by its parent. Override the parent JS package instead. `--fix` (v0.2.1+) handles the structural rewrite.

### CI gate

Add a step that fails the build when findings of a given severity exist:

```yaml
# .github/workflows/audit.yml
- name: Audit overrides
  run: |
    npx @hexaxia-labs/override-audit-cli --severity high --json . > audit.json || exit_code=$?
    cat audit.json | jq .summary
    exit ${exit_code:-0}
```

Use `--json` to get a stable machine-readable output. Pair `--severity high` (or `critical`) with the exit-code-driven gate. Findings below the threshold log but don't fail the build.

For audit-trail integration, add `--log-file` and the change-control flags; see [Change-control logging](#change-control-logging).

## Filtering and tuning

You won't always want every finding firing every run. Three controls:

### Severity floor

```bash
override-audit --severity medium      # hide low/info
override-audit --severity critical    # only critical
```

### Per-rule on/off

```bash
override-audit --rule OA005.e=off                    # silence info-level suspect findings
override-audit --rule OA002=off --rule OA004=off     # repeatable
```

Rule filters accept the base code (`OA002`) or a sub-code (`OA005.e`). Last value wins per rule.

### Sub-suspect explicit inclusion

`OA005.e-SUSPECT` is info-level and filtered by default for two layered reasons: it's below the default `low` severity floor, and there's a hard gate even if you raise the floor. To see it:

```bash
override-audit --severity info --include-sub-suspect
```

You probably won't want this in CI. It's useful when you're doing a deep cleanup pass.

## Network features (`--with-registry`)

`override-audit` is local-first by design: zero network calls unless you explicitly opt in. The single rule that wants network access is **`OA007-FROZEN-LATEST`**, which compares your installed version against the npm registry's current `dist-tags.latest`.

```bash
override-audit --with-registry                              # default 5s timeout per package
override-audit --with-registry --registry-timeout 10000     # 10s timeout for slow networks
```

When you don't pass `--with-registry`, OA007 is silently skipped. You'll see a note in the output:

```
  Skipped detectors (incomplete inputs):
    OA007  --with-registry not passed - frozen-latest check disabled (offline by default)
```

When you do pass it, the tool issues one HTTP GET per override target with a string pin, in parallel, with a per-request timeout. No credentials are sent; no telemetry is collected; the response body is parsed for `dist-tags` only and discarded.

If the registry is unreachable or rate-limited, OA007 fails closed (silently skips that package) rather than emitting false-negative findings.

## JSON output

For programmatic consumption:

```bash
override-audit --json
```

Emits a single `OverrideAuditOutput` JSON document to stdout. The schema is locked by snapshot test, so consumers can rely on shape stability across minor releases.

Shape:

```jsonc
{
  "schemaVersion": "1",
  "tool": "override-audit-cli",
  "toolVersion": "0.3.0",
  "generatedAt": "2026-05-27T23:59:24.693Z",
  "projectPath": "/path/to/project",
  "packageManager": "npm",
  "attemptId": "rem_xxx",
  "summary": {
    "findingCount": 3,
    "bySeverity": { "critical": 0, "high": 1, "medium": 2, "low": 0, "info": 0 },
    "byRule":    { "OA002": 1, "OA006": 2 }
  },
  "findings": [ /* Finding objects */ ],
  "skippedDetectors": [ /* present only when populated */ ],
  "fix": { /* present only under --fix */ }
}
```

The full type is `OverrideAuditOutput`, exported from the library. See [`docs/architecture.md`](architecture.md) for the field-by-field type reference.

Pipe through `jq` for ad-hoc queries:

```bash
override-audit --json | jq '.summary'
override-audit --json | jq '.findings[] | select(.severity == "critical")'
override-audit --json | jq '.findings[] | { rule: .ruleId, pkg: .package, fix: .remediation.action }'
```

## Change-control logging

When you want every `--fix` action recorded for audit purposes (HexOps, internal compliance, security review), use `--log-file`. The tool appends NDJSON records (one JSON object per line) covering every step of the fix lifecycle.

```bash
override-audit \
  --fix --with-registry \
  --attempt-id rem_abc-123 \
  --source ci \
  --advisory GHSA-xxxx-yyyy-zzzz \
  --meta repo=myapp --meta runner=gha \
  --log-file /var/log/override-audit.log \
  /path/to/project
```

Each run emits:

```
1× remediation_attempt    (with source, advisory, meta, dryRun, projectPath)
N× remediation_applied    (per successful patch)
N× remediation_failed     (per patch error)
N× remediation_skipped    (per finding that didn't qualify)
1× remediation_complete   (with summary + exitCode)
```

The full schema is in [`docs/change-control-logging.md`](change-control-logging.md). That doc also has `jq` recipes for advisory aggregation, per-attempt outcomes, and `tail -F` streaming.

## Common pitfalls

### "I ran `--fix` but `npm install` still installs the old version"

The override is now correctly declared in `package.json`, but your lockfile still encodes the old resolution. Run:

```bash
rm -rf node_modules package-lock.json   # or pnpm-lock.yaml
npm install                              # or pnpm install
override-audit                           # confirm clean
```

The lockfile is the source of truth for installed versions; rewriting `package.json` alone is not enough.

### "I overrode `@esbuild/linux-x64` but `esbuild` still installs the old binary"

This is the case `OA006-COUPLED-PLATFORM-BINARY` exists to catch. Platform binaries are declared by their parent JS package as exact-version `optionalDependencies`. Overriding just the binary fights the parent's pin. The fix is to override the parent:

```jsonc
// instead of:
"overrides": { "@esbuild/linux-x64": "0.28.0" }
// do this:
"overrides": { "esbuild": ">=0.28.0" }
```

`--fix` (v0.2.1+) does this rewrite automatically.

### "I keep getting `OA001-ORPHAN-TARGET` on a package I know I depend on"

OA001 reads the lockfile to determine the resolved dependency tree. If your lockfile is out of date (you added a dep but didn't `npm install`, or you're scanning a freshly-cloned project that hasn't been installed yet), the package isn't in the tree from the scanner's perspective.

Fix: `npm install`, then re-run.

### "Tests pass, no findings, but my CVE scanner still flags an old version"

Almost certainly `OA008-VULNERABLE-TWIN`. The override floor is correct in `package.json` and `--with-registry` doesn't show staleness, but a vulnerable copy is still on disk because a parent's exact pin won resolution. The override is non-functional in that subtree.

Run:

```bash
override-audit --with-registry --severity critical    # surface OA008
npm ls <vulnerable-package>                           # find the parent
# override the parent (see OA006 doc)
rm -rf node_modules package-lock.json && npm install
override-audit                                        # confirm
```

### "`--fix` shows a `remediation_failed` for OA007 after OA006 ran"

Expected behaviour, not a bug. OA006 runs before OA007 in the detector order. If OA006 removes the binary-override entry (replacing it with a parent-override), OA007's subsequent attempt to `replace` the same path fails because the path no longer exists. The fix tree is consistent; the `remediation_failed` record exists to give the audit trail full visibility.

## Troubleshooting

### "No supported lockfile found at ..."

The tool needs either `package-lock.json` or `pnpm-lock.yaml` to determine the resolved tree. Run `npm install` (or `pnpm install`) to generate one. Yarn `yarn.lock` is not yet supported (see roadmap in README).

### "Flag --xxxx is reserved for a future release"

Some flags are declared at the parser level but not yet implemented. As of v0.3.0 only `--no-install` is in this state. Don't pass it; it'll error.

### CI failures with exit code 2

Exit code 2 means an internal error (unknown flag, malformed `package.json`, unreadable lockfile). The actual error message goes to stderr; check the CI logs.

### Empty output but no exit code 0

You're probably hitting the case where every finding is below your `--severity` threshold. Re-run with `--severity info` to see everything, or with `--json` and inspect `.summary.findingCount` directly.

### `--with-registry` hangs or times out

The npm registry might be rate-limiting or your network might be slow. Try a longer per-request timeout:

```bash
override-audit --with-registry --registry-timeout 15000   # 15 seconds
```

If you're behind a corporate proxy or air-gapped, skip `--with-registry`. The other seven rules still run offline.

---

That's the end-to-end walkthrough. For deeper reference:

- **Per-rule docs** at [`docs/rules/`](rules/) cover what each rule catches, why it matters, and concrete fix recipes.
- **Architecture** at [`docs/architecture.md`](architecture.md) covers the internals if you're contributing or embedding.
- **Change-control schema** at [`docs/change-control-logging.md`](change-control-logging.md) covers the NDJSON record format for log consumers.
