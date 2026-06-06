# Plan 6 - Completion log

**Status:** Complete (local; not yet on origin)
**Branch:** `merge`
**Range:** `3bb4222..HEAD` (6 Plan 6 commits: rule docs, audit-log doc, CONTRIBUTING, preserved trim, handoff artifacts, sanity)
**Date:** 2026-06-06

Plan 6 is the final plan of the cve-lite + override-audit merge. With it, Phase 1 (development) is done; Phase 2 (dev-to-test handoff to `OWASP/cve-lite-cli`) is the next step and is summarized at the end of this log.

## What Plan 6 delivered

Cleanup, end-to-end validation, and the artifact set Phase 2 needs. Concretely:

- Migrated the OA001-OA008 rule docs into `docs/rules/` and reconciled them against the current detectors (severity corrections, rule renames, suggest-only sub-rules documented).
- Rewrote the old override-audit change-control doc as `docs/audit-log.md`, a reference for the merged tool's 9-event audit-log vocabulary.
- Added an "Override hygiene subsystem" section to `CONTRIBUTING.md` covering the detector/Context architecture and the OA001/OA008 verification framing.
- Trimmed `_preserved-override-audit/` from a 5188-file / 68M working tree to a frozen 29-file `src/`-only snapshot kept as the port-equivalence baseline, with a do-not-ship README.
- Dogfooded the merged CLI against Ghost, Prisma, and hexmetrics; reproduced Sonu's findings and the locked sanity baseline; ran `--fix` and audit-log capture clean.
- Produced the dev-to-test handoff checklist and a cve-lite vNext release-notes draft.

This plan was mostly file-moves, doc reconciliation, and validation rather than new code. Zero detector source edits were required.

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `690675e` | docs(rules): migrate OA001-OA008 rule docs to docs/rules/ and reconcile with current detectors |
| 2 | `60a8fea` | docs(audit-log): rewrite change-control doc as audit-log reference for the 9-event vocabulary |
| 3 | `07d7dc1` | docs(contributing): add override hygiene subsystem section (substantially addresses #24) |
| 4 | `669eb60` | chore(merge): trim _preserved-override-audit to frozen src/ snapshot |
| 5 | `7f3c12c` | docs(merge): dev-to-test handoff checklist and cve-lite vNext release notes draft |
| 6 | `19371e3` | test(sanity): Plan 6 doc-URL contract + frozen snapshot integrity |

6 Plan 6 commits. This completion log is the 7th.

## Files added / modified / deleted

### Added

| Path | Change |
|---|---|
| `docs/rules/OA001.md` ... `OA008.md` | Rule docs relocated from `_preserved-override-audit/docs/rules/` and reconciled with detectors |
| `docs/rules/README.md` | New index for the rule-doc set |
| `docs/audit-log.md` | Fresh audit-log reference for the 9-event vocabulary (rewrite, not a move) |
| `docs/merge/handoff-checklist.md` | Dev-to-test sign-off checklist |
| `docs/merge/handoff-release-notes.md` | cve-lite vNext release-notes draft |
| `docs/lessons/2026-05-27-build.md`, `docs/lessons/2026-05-27-design.md`, `docs/lessons/README.md` | Durable lesson retrospectives migrated out of the preserved tree before the trim (standing rule: lessons stay tracked) |
| `_preserved-override-audit/README.md` | "Frozen snapshot - DO NOT EDIT, DO NOT SHIP" marker explaining why `src/` survives |
| `tests/sanity/plan-6-docs-and-snapshot.test.ts` | 6 sanity tests: doc-URL contract + frozen snapshot integrity |

### Modified

| Path | Change |
|---|---|
| `CONTRIBUTING.md` | Add "Override hygiene subsystem" section (substantially addresses #24) |

### Deleted (the big one)

`_preserved-override-audit/` trimmed from 5188 files / 68M to 29 tracked files. Removed: `node_modules`, `dist`, the directory's own `tests/`, `.github/`, `docs/`, and config. Kept: `src/` (28 files: the original detectors, scanner, parsers, types) plus the do-not-ship README. The net diff for the range is `94 files changed, 657 insertions(+), 12253 deletions(-)`.

The frozen `src/` snapshot is retained on purpose: `tests/sanity/port-equivalence.test.ts` and `tests/sanity/plan-3-pipeline.test.ts` import the old detectors and scanner from it and assert the merged `src/overrides/` produces equivalent findings. That proof only holds while the old implementation is importable.

## Test results (at HEAD)

```
$ npm test
Test Suites: 67 passed, 67 total
Tests:       618 passed, 618 total
```

- 612 cumulative through Plan 5 follow-on work + 6 new Plan 6 sanity tests = 618 total
- No regressions; the port-equivalence and plan-3-pipeline suites still pass against the frozen snapshot
- Test hygiene gate passes (no Mocha-isms, no focused tests)

```
$ npx tsc --noEmit
(no output, exit 0)

$ npm run build
(ok)
```

## Plan 6 task ledger

The spec listed 10 tasks. Several merged or shifted destination during execution; the mapping below is what actually happened.

| Task | Status | Notes |
|---|---|---|
| 1 - Confirm cve-lite docs layout | ✅ (folded into Task 3) | Destination resolved to `docs/rules/`, not the spec's `src/docs/overrides/`, because the detector `references:` URLs already point at `docs/rules/`. No detector edits needed. |
| 2 - Migrate test fixtures | n/a | Fixtures were already in place under `tests/` from earlier plans; no move required this plan. |
| 3 - Migrate rule docs | ✅ (`690675e`) | OA001-OA008 relocated to `docs/rules/` and reconciled with the live detectors (see "what we hit"). |
| 4 - Migrate audit-log reference doc | ✅ (`60a8fea`) | Rewritten fresh, not moved: the old doc described a different event system. New doc tracks `src/audit-log/events.ts` (9 events, `--audit-log`). |
| 5 - Merge architecture / usage notes | ✅ (`07d7dc1`) | Landed as the CONTRIBUTING "Override hygiene subsystem" section; substantially addresses #24. |
| 6 - Delete `_preserved-override-audit/` | ✅ (modified) (`669eb60`) | Trimmed to a frozen `src/` snapshot instead of deleted outright, per user decision, because two sanity suites import the old code. |
| 7 - Dogfood against example projects | ✅ | Ghost, Prisma, hexmetrics reproduced; analog deferred (not vendored here). See dogfood section. |
| 8 - Handoff checklist | ✅ (`7f3c12c`) | `docs/merge/handoff-checklist.md`; automated items ticked, human sign-off pending. |
| 9 - Draft release notes | ✅ (`7f3c12c`) | `docs/merge/handoff-release-notes.md`; committed together with the checklist. |
| 10 - Final gate + sanity | ✅ (`19371e3`) | 618 tests, tsc clean, build ok. 6 sanity tests lock the doc-URL contract and snapshot integrity. |

## Execution method

Unlike Plans 3.5 through 5, this plan was driven directly with inline verification rather than the full subagent-per-task ceremony. Plan 6 was almost entirely file-moves, doc reconciliation, and read-only validation, where the per-task implementer/spec-review/quality-review loop adds overhead without catching much. One subagent was used: the OA001-OA008 rule-doc reconciliation against the live detectors (Task 3), where line-by-line fact-checking against detector source benefits from a focused pass. Everything else was done directly with `git mv`, edits, and command-line verification of each claim before committing.

## What we hit along the way

**The clean delete the spec assumed would leave tests green did not.** Task 6 specced `git rm -rf _preserved-override-audit` followed by a green `npm test`. Reality: `tests/sanity/port-equivalence.test.ts` and `tests/sanity/plan-3-pipeline.test.ts` import the OLD detectors and scanner from that directory's `src/` and assert equivalence with the merged implementation. Deleting it outright breaks those suites. Per user decision we kept a frozen `src/`-only snapshot (28 files) with a do-not-ship README, and removed the bulk (node_modules, dist, tests, .github, docs, config). The directory went from 5188 files / 68M to 29 tracked files. The OWASP side can delete it once the port-equivalence tests are retired.

**Rule docs went to `docs/rules/`, not the spec's `src/docs/overrides/`.** Task 1 was a planning step to pick a destination. The detector `references:` URLs already point at `https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA00X.md`, so honoring that location meant zero detector edits. We also reconciled the docs against the current detectors during the move: OA001 severity corrected low -> high, OA007 corrected high -> low, OA004 renamed INSTALLED-NEWER -> "Surpassed pin", and OA005.d / OA005.e documented as suggest-only (per the #26 fix from Plan 4.5).

**The audit-log doc was a rewrite, not a move.** The old `change-control-logging.md` documented a completely different event system (`remediation_*` events, a `--log-file` flag) that predates the merged tool. The merged system has 9 event types and `--audit-log` (plus the `CVE_LITE_AUDIT_LOG` env var). The new `docs/audit-log.md` was written fresh against `src/audit-log/events.ts` rather than edited from the old text.

**`examples/analog` is not vendored in this repo.** It is a 3,367-package monorepo and is too large to carry here. Sonu's OA006 analog finding is covered indirectly by hexmetrics, which independently fires OA006 on the npm side. Analog re-validation is deferred to the OWASP side, where the example actually lives.

**Two durable lesson retrospectives were migrated before the trim.** The standing rule is that lessons stay in tracked `docs/lessons/`. They were lifted out of the preserved tree into `docs/lessons/` (folded into the trim commit `669eb60`) before the bulk removal, so they survive the cleanup.

## Dogfood results (Task 7, 2026-06-06)

Built `dist/` and ran the merged CLI against three real projects:

| Project | Manager | Findings | Cross-check |
|---|---|---|---|
| Ghost | pnpm | 4x OA001 + 1x OA002 = 5 | Matches the locked sanity baseline and Sonu's nested-Cheerio findings |
| Prisma | pnpm | 1x OA001 | Matches Sonu's finding and baseline |
| hexmetrics | npm | 1x OA006 | Independently validates the OA006 detector (the rule Sonu saw on analog) |

Additional checks:

- `overrides --fix` on a throwaway copy of Prisma removed the orphan; re-scan returned empty findings; exit 0.
- The audit log captured `scan.started`, `oa.detected`, and `scan.finished` cleanly on a `--check-overrides --audit-log` run.
- No P1 surprises across the validated projects; no false-positive-looking findings.

## Scope of testing - what is and is not covered

### What IS verified after Plan 6

- Rule docs OA001-OA008 live at the location the detector `references:` URLs point to, and the doc-URL contract is locked by sanity tests.
- The frozen snapshot's integrity (only `src/` plus the README; the do-not-ship marker present) is locked by sanity tests.
- The full Plan 1 -> Plan 5 suite still passes against the trimmed snapshot (port-equivalence and plan-3-pipeline included).
- Ghost / Prisma / hexmetrics findings reproduce against the locked baselines and Sonu's prior validation.
- `--fix` + verify closes the loop on a real (throwaway) project, exit 0.
- Audit-log emission is clean on a real scan.
- tsc clean, build ok, test hygiene gate green.

### What is NOT covered (deliberately or deferred)

- **`examples/analog`** is not re-validated here (not vendored; 3,367-package monorepo). OA006 is covered indirectly by hexmetrics; analog re-run is a Phase 2 item on the OWASP side.
- **OA003 Yarn case** is awaiting a repro from review; not exercised this plan.
- **Human sign-off** on `docs/merge/handoff-checklist.md` (Aaron + Sonu signature lines) is the remaining manual gate. All automated checklist items pass; the two signature lines are pending.
- **The final touched-file diff against `cve-lite-cli@main`** (the diff that becomes the cve-lite PR) is generated at push time, not in this plan.

## Issues

**Filed during Plan 6:**

- **#32** - the detector `runnableCommand` emits `--target` which the CLI does not parse. Cosmetic only; the docs already use the correct `--rule` form. Left open as a real follow-up; carried to the OWASP side.

**Substantially addressed (tracked, not auto-closed):**

- **#22** (public rule-reference index) - `docs/rules/` with a README index now exists.
- **#23** (programmatic API reference) - partially addressed by the CONTRIBUTING override-subsystem section.
- **#24** (CONTRIBUTING override subsystem) - the section was added (`07d7dc1`).

**Open follow-ups carried to the OWASP side (not blockers):**

- **#19** (README override-hygiene + `--audit-log` section), **#20** (CHANGELOG `[Unreleased]` entries), **#21** (action.yml controls).
- **#32** (`--target` parsing).
- **OA003 Yarn case** (awaiting repro).

## What happens next: Phase 2

Phase 1 (development on `merge`) is complete. Phase 2 is the dev-to-test handoff to `OWASP/cve-lite-cli`. From the spec's "What happens next" section:

1. Open `feat/override-audit-merge` on `OWASP/cve-lite-cli`.
2. Apply the content of `merge`'s post-baseline commits to that branch. Two candidate mechanisms:
   - **Content rsync + focused commits**: rsync the tree across (excluding `.git`, `_preserved-override-audit`, `cve-lite-ref`, `docs/merge`, `docs/superpowers`), then commit the diff as one or a few focused commits.
   - **format-patch + am**: `git format-patch` each `merge` commit and `git am` on the cve-lite branch - preserves attribution but is sensitive to baseline drift.
3. Group testing: OWASP reviewers, Sonu, Aaron, early users (this is where the deferred analog re-validation and the open follow-ups land).
4. PR merges to `OWASP/cve-lite-cli` `main`.
5. Cut the cve-lite major release (the vNext release-notes draft is the starting point).
6. Archive `Hexaxia-Labs/override-audit-cli`.

Aaron's attribution carries over via the merge commit history, AUTHORS, the README contributor section, and the OWASP project page.

The gate before any of this: human sign-off on `docs/merge/handoff-checklist.md`. All automated items pass on `merge`; the two signature lines are the remaining step.
