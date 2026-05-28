# override-audit-cli — Plan 2: Fix (v0.2.0)

**Scope (per user decision in conversation):** minimal `--fix`. Applies the RFC 6902 patches detectors already emit (OA001/002/003/004 + OA005.a/b/c). Adds `--dry-run` and `--no-post-fix-rescan`. Post-fix re-scan confirms cleanliness. OA006/007/008 stay `suggest`-only — their fixes require schema-breaking multi-op patches, deferred to a follow-up. HexOps change-control logging deferred to v0.3.0.

**No schema break.** Adds `FixReport` as an optional field on `OverrideAuditOutput`; everything in v0.1.x stays interpretable.

## Architecture

```
src/fixer/
  apply.ts          RFC 6902 ops: remove/replace/move/add. Pure function.
  write.ts          Indent + trailing-newline detection, stringify, write to disk.
  fix.ts            Orchestrator: filter applicable findings, apply, write, rescan.
src/cli/
  args.ts           Move --fix/--dry-run/--no-post-fix-rescan out of RESERVED_PLAN2.
  index.ts          Branch on args.fix to call the fixer instead of just rendering.
src/types.ts        Add FixReport, FixOptions; OverrideAuditOutput.fix?: FixReport.
```

## Tasks

### T1 — RFC 6902 applier (`src/fixer/apply.ts`)
- Pure function `applyPatches(doc, patches[])` returning a new doc.
- Implements `remove`, `replace`, `move`, `add` per spec subset in `types.ts`.
- Uses `escapeSegment`/`jsonPointer` already in `src/fixer/json-pointer.ts`.
- Tests: each op individually; nested paths; scoped names; missing-path error.

### T2 — Writer (`src/fixer/write.ts`)
- `detectIndent(raw)` — extracts the indent unit (2 spaces, 4 spaces, tab) from a JSON string. Defaults to `"  "`.
- `hasTrailingNewline(raw)` — boolean.
- `writePackageJson(projectPath, parsed, raw)` — stringify with detected indent, preserve trailing newline, write atomically (tmp file + rename) to `package.json`.
- Tests: indent detection variants; format preservation round-trip.

### T3 — Orchestrator (`src/fixer/fix.ts`)
- Input: `ScanResult`, `FixOptions { dryRun, rescan, severityFloor, ruleFilters }`.
- Filters findings: must have non-null patch, must meet severity floor, must not be rule-filtered.
- Applies patches in stable order (preserves array order).
- Writes file unless `dryRun`.
- Runs `scan()` again (unless `!rescan`) to verify; collects:
  - `appliedPatches: { ruleId, package, patch }[]`
  - `skippedFindings: { ruleId, reason }[]` (suggest-only, below severity, etc.)
  - `remainingFindings: Finding[]` (post-fix scan output)
- Returns `FixReport`.

### T4 — Types
```ts
interface FixOptions {
  dryRun: boolean;
  rescan: boolean;
  severityFloor: Severity;
  ruleFilters: Map<string, boolean>;
}
interface FixReport {
  attemptId: string;
  appliedAt: string;
  dryRun: boolean;
  appliedPatches: { ruleId: RuleId; package: string; patch: RFC6902Patch }[];
  skippedFindings: { ruleId: RuleId; package: string; reason: string }[];
  remainingFindings: Finding[] | null;   // null when --no-post-fix-rescan
  newFindings: Finding[];                // findings the fix introduced (regressions)
}
interface OverrideAuditOutput {
  // existing fields...
  fix?: FixReport;
}
```

### T5 — CLI integration
- `args.ts`: remove `--fix`, `--dry-run`, `--no-post-fix-rescan` from RESERVED_PLAN2; add to ParsedArgs.
- `help.ts`: document them under a FIX section.
- `index.ts`: when `args.fix`, run scan → apply → optional rescan → render output (human or JSON with FixReport).
- Exit codes: 0 if all findings cleared, 1 if any remain, 2 on error.

### T6 — Tests
- `tests/fixer/apply.test.ts` — all four ops + edge cases.
- `tests/fixer/write.test.ts` — indent detection + write preservation.
- `tests/fix.test.ts` — orchestrator on a fixture; verify file modified + rescan clean.
- `tests/cli-fix.test.ts` — CLI integration: `--fix --dry-run` doesn't modify; `--fix` does; exit codes correct.
- Update CLI test that previously checked `--fix` errors with `v0.2.0` reserved message.
- Update snapshot if needed (FixReport only present when --fix passed; existing snapshot fixture doesn't pass --fix).

### T7 — Docs
- `CHANGELOG.md` — v0.2.0 entry.
- `README.md` — `--fix` and `--dry-run` in usage examples; update version badge to v0.1.2 → v0.2.0.
- `docs/rules/` — each rule's "How to fix" section references the now-real `--fix` flag instead of "coming in v0.2.0".

### T8 — Dogfood + release
- Copy hexmetrics → `/tmp/hexmetrics-fix-dogfood`, run `--fix --dry-run` first, then `--fix`. Verify package.json is correctly modified.
- Bump version to 0.2.0, build, full test, commit, tag, push, create release.

## What's explicitly OUT of scope for v0.2.0

- OA006 patch emission (multi-op: remove + add).
- OA007 patch emission (replace floating tag with registry latest).
- OA008 fix (requires investigation; structural).
- HexOps change-control logging (`remediation_attempt/applied/failed` records, log-file output, --attempt-id/--source/--advisory/--meta flags).
- Multi-package.json (workspaces) support.

These will be follow-ups.
