# Plan 6.5 - Completion log

**Status:** Complete (local; not yet on origin)
**Branch:** `merge`
**Range:** `06fd8e7..HEAD` (Plan 6.5 spec + relocate-op design + 3 fixes + relocate feature + sanity)
**Date:** 2026-06-08

Plan 6.5 is a half-plan between Plan 6 (cleanup) and Phase 2. It clears the backlog correctness blockers an OWASP reviewer would hit on a pnpm project and lands the Sonu-approved relocate design that makes the override boundary load-bearing in code. The naming follows the 4.5 precedent: it is a correctness/polish interleave, not new scope.

## What Plan 6.5 delivered

Three backlog fixes, the pnpm `parent>child` correctness partition, and the relocate op that enforces the product boundary in the applier. Concretely:

- Dropped the unparsed `--target` flag from 6 detectors' `runnableCommand` (#32).
- Made lockfile parse failures visible: `readLockfileNames` now distinguishes parsed-ok / no-lockfile / parse-error and surfaces the parse error instead of a silent empty Set (#16).
- Partitioned pnpm `parent>child` selective overrides: OA001 skips them, OA005 owns them, and OA005 stays SILENT on a valid-or-unevaluable selective override rather than calling it flattenable noise (#14, #15). This is the big correctness fix.
- Added the `relocate` override-fix op, an applier chokepoint guard that rejects any fix that would invent an override key, and tiered auto-fix (`--fix` applies `auto` only; `proposed` is surfaced not applied). OA006's no-existing-parent path now emits a single relocate (retire the binary override, write a parent dependency floor) instead of a remove + bare add of a NEW override.

The relocate work changes OA006's remediation from "another override" to "a parent dependency floor," which is both correct and aligns the tool with its own product boundary: a CVE-style upgrade, not a new override.

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `76b8512` | docs(merge): Plan 6.5 spec - pnpm parent>child correctness + detector polish |
| 2 | `e51f44e` | docs(merge): relocate-op design + fold into Plan 6.5 as Task 4 (Sonu-approved) |
| 3 | `ab87bfa` | fix(overrides): drop unparsed --target from detector runnableCommand (closes #32) |
| 4 | `e4fc474` | fix(context): surface lockfile parse errors instead of silent empty skip (closes #16) |
| 5 | `9b7c0bc` | fix(detectors): partition pnpm parent>child overrides - OA001 skips, OA005 owns (closes #14, #15) |
| 6 | `1246f78` | feat(overrides): relocate op, applier chokepoint guard, tiered auto-fix (Sonu-approved) |
| 7 | `3b5342f` | test(sanity): Plan 6.5 correctness + boundary invariants |

2 doc commits + 3 fix commits + 1 feature commit + 1 sanity commit = 7 total. This completion log is the 8th.

## Files added / modified

### Source

| Path | Change |
|---|---|
| 6 detectors' `runnableCommand` | Drop the unparsed `--target` flag (#32). Side effect: `shellQuote` is now orphaned dead code, filed as #33. |
| `src/overrides/context` (`readLockfileNames` / context-builder) | Distinguish parsed-ok / no-lockfile / parse-error; surface parse errors (OA001 skip reason "lockfile failed to parse" + `logger.warn`) instead of a silent empty Set (#16). |
| `src/overrides/detectors/oa001-*.ts` | Skip pnpm `parent>child` selective override keys (no longer false-positive on the composite key). |
| `src/overrides/detectors/oa005-*.ts` | Own selective overrides: parse `parent>child` into child target + parentScope; fire `.b` only when a parent is genuinely missing from the tree; stay SILENT on a valid-or-unevaluable selective override; `.e` flatten suggestion now applies to npm object-form only. |
| `src/overrides/detectors/oa006-*.ts` | No-existing-parent path emits a single `relocate` (retire override, write parent dependency floor) marked tier `proposed`, instead of remove + bare add of a new parent override. |
| override-fix types | Rename `RFC6902Op` -> `OverrideFixOp`; drop bare `add`/`copy`/`test`; add `relocate{fromChild,toParent,floor}` and `OverrideFix.tier`. |
| `src/overrides/fixer.ts` (applier) | Chokepoint guard: the override-container key set must not grow across a fix; any fix that would invent an override key is rejected, commits nothing, and logs a `fix-guard` error event. Tiered auto-fix: apply `auto` only by default; `proposed` is surfaced not applied. |

### Tests added / updated

| Path | Tests | Coverage |
|---|---|---|
| context-builder tests | +4 | parsed-ok / no-lockfile / parse-error branches + parse-error surfacing |
| parent>child partition tests | +6 | OA001 skip; OA005 `.b` (parent missing) vs silent (valid/unevaluable); composite-key parsing |
| fixer tests | +3 | applier chokepoint guard (rejection + `fix-guard` event); tiered auto-fix (proposed not applied) |
| OA006 tests | updated in place | remediation asserts the relocate shape |
| #32 detector tests | updated in place | no `--target` in `runnableCommand` |
| `tests/sanity/plan-6.5-correctness.test.ts` | +3 | no bare add/copy/test in any fix; OA006 relocate at `proposed` tier; applier guard rejects override-key creation; no `runnableCommand` has `--target` |
| 5 sanity baseline files | updated | Ghost 5 -> 1, Prisma 1 -> 0; Storybook unchanged at 7 |

**Total net new tests: +16** (+4 context-builder, +6 partition, +3 fixer, +3 sanity; #32 and OA006 assertions updated in place).

## Test results (at HEAD)

```
$ npm test
Test Suites: 69 passed, 69 total
Tests:       634 passed, 634 total
```

- 618 cumulative through Plan 6 + 16 net new Plan 6.5 tests = 634 total
- No regressions; port-equivalence and the (rewritten) plan-3-pipeline guard still pass
- Test hygiene gate passes (no Mocha-isms, no focused tests); no em dashes

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Plan 6.5 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - Drop `--target` from `runnableCommand` (#32) | ✅ (`ab87bfa`) | 6 detectors updated. Orphaned `shellQuote` filed as #33. Implementer + review subagents (haiku). |
| 2 - Surface lockfile parse errors (#16) | ✅ (`e4fc474`) | `readLockfileNames` now three-state; parse errors surfaced via OA001 skip reason + `logger.warn`. +4 context-builder tests. Implementer + review subagents (haiku). |
| 3 - pnpm `parent>child` partition (#14, #15) | ✅ (`9b7c0bc`) | OA001 skips selective keys; OA005 owns them. Option A: OA005 SILENT on valid-or-unevaluable selective overrides (after confirming Ghost/Prisma are lockfile-only snapshots so the `.c`/`.d` checks cannot run). `.e` flatten now npm object-form only. Dogfood baselines corrected: Ghost 5 -> 1, Prisma 1 -> 0. Revealed the Plan 6 `--fix` dogfood was destructively removing Prisma's legitimate `@azure/msal-node>uuid` override; the plan-3-pipeline equivalence test (which caught this as #14) was rewritten as an intentional-divergence guard. +6 partition tests; 5 baseline files updated. Subagent died mid-run (socket); finished hands-on. |
| 4 - relocate op + applier guard + tiered fix | ✅ (`1246f78`) | Sonu-approved design (`docs/merge/2026-06-08-relocate-op-design.md`). `OverrideFixOp` rename, bare add/copy/test dropped, `relocate` + `OverrideFix.tier` added. OA006 no-existing-parent emits one `relocate` at `proposed`. Applier chokepoint guard rejects any override-key-growing fix and logs `fix-guard`. `--fix` applies `auto` only; `proposed` surfaced not applied. Verified on hexmetrics: OA006 relocate is proposed and the override survives `--fix`. +3 fixer tests; OA006 tests updated. Done entirely hands-on. |
| 5 - Plan 6.5 sanity (`3b5342f`) | ✅ | `tests/sanity/plan-6.5-correctness.test.ts`: no bare add/copy/test; OA006 relocate at proposed tier; applier guard rejects override-key creation; no `--target` in `runnableCommand`. +3 tests. |

## Execution method

Mixed, not the uniform subagent ceremony.

- Tasks 1 and 2 ran via implementer + review subagents (haiku), the standard per-task loop.
- Task 3 was started via a subagent that died on a socket error roughly 3 hours in. Its uncommitted working-tree changes were recovered and finished hands-on. They were the right foundation. The hands-on portion included the OA005 silent-on-valid product decision, which required first verifying the Ghost/Prisma evaluability question.
- Task 4 was done entirely hands-on in controlled, verified steps because it is cross-cutting (the `OverrideFixOp` type rename ripples through the detectors and applier) and safety-critical (the applier guard). That is the same class of work the prior subagent died on, so it was not delegated.

## What we hit along the way

**The Task 3 subagent died (socket error, ~3h in).** Its working-tree changes were recovered and were the correct foundation; the remaining work was completed hands-on.

**Task 3's OA005 routing needed a real product decision.** The subagent routed all valid selective overrides to OA005.e ("could be flattened"), which is noise and semantically wrong for deliberately-scoped overrides: scoping is the feature, "could be flattened" is bad advice. Resolved as Option A (silent on valid) after confirming Ghost and Prisma are lockfile-only snapshots, so the `.c`/`.d` evaluation cannot run and `.e` was a fallback, not a determination. OA005 now fires `.b` only when a parent is genuinely missing from the tree.

**Task 3 revealed a destructive Plan 6 dogfood.** The pre-fix routing meant the Plan 6 `--fix` dogfood was destructively removing Prisma's legitimate `@azure/msal-node>uuid` override. The plan-3-pipeline equivalence test caught this divergence as #14; it was rewritten from an equivalence assertion into an intentional-divergence guard so the corrected behavior is locked rather than flagged as a regression.

**Task 4 surfaced a genuine boundary violation in OA006.** Its no-existing-parent path emitted a bare add of a NEW parent override, which is the tool inventing an override key, the exact thing the product boundary forbids. The relocate fix changes the remediation to retire the binary override and write a parent dependency floor (upgrade the parent), aligning the tool with its own boundary. The applier chokepoint guard now enforces this structurally: no fix may grow the override-container key set.

## Scope of testing - what is and is not covered

### What IS verified after Plan 6.5

- The pnpm `parent>child` partition: OA001 skips selective keys; OA005 fires `.b` only when a parent is missing, silent otherwise.
- The no-bare-add vocabulary invariant: no fix emits a bare add/copy/test.
- The applier chokepoint guard: an override-key-growing fix is rejected and emits a `fix-guard` event.
- Tiered auto-fix: `proposed` fixes (relocate, inferred floor) are surfaced not applied; `--fix` applies `auto` only.
- Lockfile parse errors are surfaced (OA001 skip reason + `logger.warn`), not silently swallowed.
- No `runnableCommand` emits `--target`.
- Dogfood baselines at the corrected counts (Ghost 1, Prisma 0, Storybook 7).
- tsc clean, test hygiene gate green, no em dashes.

### What is NOT covered (deliberately or deferred)

- **Applying a Tier 2 relocate end-to-end.** No opt-in flag exists yet; proposed-not-applied is the shipped default and the opt-in is deferred.
- **The relocate floor's correctness.** It is an inferred minimum, which is exactly why it ships proposed-not-applied rather than auto-applied.
- **README / CHANGELOG doc updates** (#19, #20) - deferred to Phase 2.
- **OA003 Yarn case** - still awaiting a repro.

## Issues

**Closed by Plan 6.5 commits** (`closes #N` does not auto-fire on the tracking PR; manual closure needed after push):

| Issue | Commit |
|---|---|
| #32 `--target` in `runnableCommand` | `ab87bfa` |
| #16 silent lockfile parse failure | `e4fc474` |
| #14 pnpm parent>child / destructive fix | `9b7c0bc` |
| #15 pnpm parent>child mis-detection | `9b7c0bc` |

**Closed during the backlog triage that opened Plan 6.5** (already done in earlier plans, confirmed stale):

- **#18** - CI fixture, fixed back in Plan 3.6.
- **#24** - CONTRIBUTING override subsystem, done in Plan 6.
- **#22** - public rule reference, `docs/rules/` exists.

**Filed during Plan 6.5:**

- **#33** - `shellQuote` is dead code after the `--target` removal (cleanup follow-up).

**Open follow-ups carried to Phase 2 / post-merge (not blockers):**

- **#19** (README override-hygiene + `--audit-log` section), **#20** (CHANGELOG entries), **#21** (action.yml controls).
- **#23** (programmatic API reference doc).
- **#33** (`shellQuote` cleanup).
- **OA003 Yarn case** (awaiting repro).

## Ready for Phase 2

The backlog correctness blockers an OWASP reviewer would hit on a pnpm project are fixed, and the override boundary is now enforced in code by the applier chokepoint guard. The `docs/merge/handoff-checklist.md` and `docs/merge/handoff-release-notes.md` from Plan 6 should be refreshed to mention the relocate op and the corrected dogfood counts (Ghost 1, Prisma 0) as part of Phase 2 prep, but that is a doc pass, not a blocker.
