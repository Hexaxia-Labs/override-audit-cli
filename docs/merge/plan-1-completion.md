# Plan 1 - Completion log

**Status:** Complete
**Branch:** `merge`
**Range:** `7a928a0..405c040` (Plan 1 commits only: `0da28d6..405c040`)
**Date:** 2026-06-01

## What Plan 1 delivered

The opt-in project-wide audit-log module, the `OverrideFinding` type, and the scaffolded `src/overrides/` directory. No user-visible behavior changes; the merge has its foundation. All subsequent plans build on these primitives.

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `0da28d6` | feat(merge): scaffold src/audit-log/ and src/overrides/ directories |
| 2 | `882526e` | feat(audit-log): typed event vocabulary |
| 3 | `89fe8ce` | feat(audit-log): AuditLogHandle interface + NullAuditLog no-op |
| 4 | `0d39106` | feat(audit-log): NdjsonAuditLog file writer |
| 5 | `fbedf9c` | feat(audit-log): barrel + createAuditLog factory |
| 6 | `0082820` | feat(overrides): OverrideRuleId and OverrideSubRuleId types |
| 7 | `722288d` | feat(overrides): OverrideFinding shape with optional RFC 6902 fix |
| 8 | `ce134a2` | feat(overrides): barrel exports |
| 9 | `5be41e3` | feat(types): exit-code constants + re-export override and audit-log types |
| 10 | `100a070` | test(audit-log): factory + NDJSON round-trip integration |
| 11 | `405c040` | chore(merge): remove .gitkeep from directories now populated by Plan 1 |

10 substantive commits + 1 cleanup.

## Files added

### Source

| Path | Lines | Purpose |
|---|---|---|
| `src/audit-log/events.ts` | 92 | Typed event vocabulary (9 events) + `AUDIT_LOG_SCHEMA_VERSION` |
| `src/audit-log/handle.ts` | ~30 | `AuditLogHandle` interface + `NullAuditLog` no-op + `NULL_AUDIT_LOG` singleton |
| `src/audit-log/ndjson-writer.ts` | 32 | `NdjsonAuditLog` append-only writer |
| `src/audit-log/index.ts` | 21 | Barrel + `createAuditLog(path)` factory |
| `src/overrides/types.ts` | 51 | `OverrideRuleId`, `OverrideSubRuleId`, `RFC6902Op`, `OverrideFix`, `OverrideFinding` |
| `src/overrides/index.ts` | 7 | Barrel re-exports |

### Source modified

| Path | Change |
|---|---|
| `src/types.ts` | Appended 31 lines: exit-code constants (`EXIT_OK`, `EXIT_FINDINGS`, `EXIT_VERIFY_FAILED`, `EXIT_ERROR`), `ExitCode` union, re-exports from `./overrides/index.js` and `./audit-log/index.js`. Original 184 lines unchanged. |

### Tests added

| Path | Tests | Coverage |
|---|---|---|
| `tests/audit-log/events.test.ts` | 3 | Type discrimination on `scan.started`, payload shape on `oa.detected`, payload shape on `verify.failed` |
| `tests/audit-log/no-op.test.ts` | 3 | `emit()` returns undefined, `close()` returns undefined, `isNoOp` is true |
| `tests/audit-log/ndjson-writer.test.ts` | 4 | One JSON object per line, `isNoOp` is false, append semantics (does not truncate), emit-after-close throws |
| `tests/audit-log/integration.test.ts` | 2 | `createAuditLog(undefined)` returns no-op, `createAuditLog(path)` round-trips events through the writer |
| `tests/overrides/types.test.ts` | 4 | 8 top-level rule IDs, 5 OA005 sub-rules, `OverrideFinding` with required fields, `OverrideFinding` with optional RFC 6902 fix patch |

**Total Plan 1 tests added: 16**

## Test results

```
$ npm test
Test Suites: 27 passed, 27 total
Tests:       376 passed, 376 total
Time:        1.827 s
```

- 360 pre-existing cve-lite tests still pass (zero regressions)
- 16 new Plan 1 tests added, all green
- 27 test suites pass cleanly

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Scope of Plan 1 testing - what is and is not covered

**Be explicit:** Plan 1's tests cover the foundation primitives only. The override-audit behavior the merge is bringing across has not been exercised in this branch yet.

### What the 16 Plan 1 tests actually exercise

| Test file | Tests | Real behavior under test |
|---|---|---|
| `tests/audit-log/events.test.ts` | 3 | Discriminated-union shapes - compile-time type checking only |
| `tests/audit-log/no-op.test.ts` | 3 | Trivial runtime: `emit()` returns undefined, `close()` returns undefined, `isNoOp === true` |
| `tests/audit-log/ndjson-writer.test.ts` | 4 | Real filesystem I/O: writes one JSON object per line, appends without truncating, throws on emit-after-close |
| `tests/audit-log/integration.test.ts` | 2 | Real round-trip: `createAuditLog(path)` factory writes events to disk and they parse back equal |
| `tests/overrides/types.test.ts` | 4 | Discriminated-union shapes - compile-time type checking only |

In total, six of the sixteen tests do meaningful runtime work (filesystem writes + round-trip); ten verify type shapes that TypeScript enforces at compile time.

### What the 360 pre-existing tests cover

cve-lite's own test suite, exercising its existing scan, parsers, OSV pipeline, output formatters, and remediation logic. They confirm Plan 1's changes did not regress cve-lite's pre-existing behavior. **None of them touch override-audit logic** because cve-lite does not have any override-audit logic yet.

### What is NOT tested in this branch

- **None of the eight OA detectors** (OA001 - OA008). Their source still lives in `_preserved-override-audit/src/detectors/`; it has not been ported into `src/overrides/detectors/` yet.
- **No `buildOverrideContext()` behavior.** The context-builder adapter does not exist yet.
- **No `audit()` or `verify()` entrypoints.** The public API surface from spec section "Integration Seams" is not built.
- **No end-to-end finding production.** A real `package.json` with an orphaned override would not produce a finding in this branch.
- **No regression coverage against Sonu's known-positive fixtures** (Analog OA006, Ghost two-orphan, Prisma OA001). Those are dogfood targets defined in Plan 6; we cannot run them until Plan 2 finishes the detector port and Plan 3 wires up `audit()`.

### Where the behavioral coverage comes from

The preserved tree contains the original behavioral coverage:

- `_preserved-override-audit/tests/detectors/*.test.ts` - per-detector behavioral tests
- `_preserved-override-audit/tests/scanner.test.ts` - composite scan tests
- `_preserved-override-audit/tests/scanner-composite.test.ts` - OA005-vs-OA001 dedup and OA006/OA008 escalation tests
- `_preserved-override-audit/tests/fix.test.ts` - fixer tests
- `_preserved-override-audit/tests/fixer/*.test.ts` - per-fix-component tests
- `_preserved-override-audit/tests/fixtures/` - the project-shaped inputs the detectors are exercised against

These tests are not currently runnable in the repo root - they reference `_preserved-override-audit/src/types.ts`, `_preserved-override-audit/src/scanner.ts`, etc., not the new shapes Plan 1 introduced. Plan 2 Tasks 5-12 migrate each test alongside its detector, rewriting imports and assertion shapes so they exercise the new `OverrideContext` and `OverrideFinding`. Plan 2's full-suite gate (Task 14) is the first commit where any OA detector behavior is verified in this branch.

### Plain summary

Plan 1 confirms the foundation primitives behave correctly and the type system is wired right. It does **not** confirm override-audit's detection logic survived the move - that confirmation lands progressively across Plans 2, 3, and 6.

## Plan 1 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - Directory scaffold | ✅ | `mkdir` + `.gitkeep` placeholders; removed in Task 11 cleanup once dirs were populated |
| 2 - Event vocabulary | ✅ | 9 typed events, `schemaVersion: 1` enforced at type level |
| 3 - `AuditLogHandle` + `NullAuditLog` | ✅ | Zero-cost no-op; `NULL_AUDIT_LOG` singleton typed as the interface |
| 4 - `NdjsonAuditLog` writer | ✅ | Append-only, fd cleared on close, throws on emit-after-close |
| 5 - Barrel + factory | ✅ | `createAuditLog(undefined)` returns the shared no-op |
| 6 - `OverrideRuleId` + `OverrideSubRuleId` | ✅ | OA001-OA008 plus OA005.a-OA005.e |
| 7 - `OverrideFinding` shape | ✅ | Required/optional fields per spec; uses inline `import("./types.js").OverrideRuleId` for self-reference |
| 8 - Overrides barrel | ✅ | Type-only re-exports; ready for later API additions |
| 9 - Exit codes + re-exports in `src/types.ts` | ✅ | `as const` literal types preserved; pure append |
| 10 - Audit-log integration test | ✅ | Factory + round-trip; deep equality on parsed events |
| 11 - Foundation gate | ✅ | 376/376 tests, tsc clean, dirs populated, `.gitkeep` cleanup commit |

## Execution method

- Skill: `superpowers:subagent-driven-development`
- Per task: implementer subagent → spec compliance review → code quality review → mark complete
- Model: `haiku` for all implementer and reviewer subagents (mechanical tasks with complete specs)
- 11 implementer dispatches, ~11 review subagents (some combined spec + quality for trivial barrel files)

## What we hit along the way

**`npm install` needed after the cve-lite v1.18.2 rebase.** The first `npm test` run reported 37 failures across 9 suites, all from `Cannot find module 'yaml'` style errors. Root cause: the rebase brought in cve-lite's new runtime deps (`better-sqlite3`, `fflate`, `yaml`) but `node_modules/` was stale from override-audit's older install. One `npm install` fixed everything. The implementer subagent doing the foundation gate misclassified these as "pre-existing failures." Verified directly and re-ran tests to confirm the actual 376/376 state.

**Type-only tests don't fail loudly.** Several Plan 1 test files use `import type { X }` and assert on type shape via TypeScript. When the type doesn't exist yet, Jest passes the test (TypeScript would error at compile time but Jest's ts-jest transformer surfaced it differently than expected). This muddied the "test fails first" step of TDD on Tasks 2, 6, and 7. The tests are still correct and exercise the types meaningfully once the implementation lands; just noting the limitation for future type-heavy work.

**Tooling drift on plan-versus-phase vocabulary.** I treated the user's "start phase 1 execution" as the spec's Phase 1 (Plans 1-6) and continuously dispatched into Plan 2 Task 1 before being stopped. The user expected "phase" to map to "Plan 1 only." Saved as memory: stop between plans by default. The accidental Plan 2 Task 1 commit (`b68a89c`) was reverted so the branch is strictly Plan 1.

## What does NOT change for users yet

- No new CLI flags, subcommands, or output behavior
- No new dependencies (Plan 2 will replace `semver` with `src/utils/version.ts` extensions)
- Existing cve-lite behavior identical
- The audit log, overrides module, and verify-failed exit code 2 are all wired in but no caller invokes them until Plan 3 + Plan 4

## Ready for Plan 2

The detector migration plan picks up next: porting 8 OA detectors from `_preserved-override-audit/src/detectors/` into `src/overrides/detectors/`, with the `semver` calls replaced by the cve-lite version utilities Plan 2 Task 1 will add. After Plan 2 the detectors are callable as library functions; CLI and verify integration arrive in Plans 3 and 4.

Plan 2 will not start without an explicit go-ahead.
