# Plan 4.5 - Completion log

**Status:** Complete (local; not yet on origin)
**Branch:** `merge`
**Range:** `895ba65..HEAD` (Plan 4.5 spec + 2 detector fixes + sanity)
**Date:** 2026-06-05

## What Plan 4.5 delivered

Two detector-level fixes surfaced during Sonu's validation review of Plans 3-4 output. Both are trust-contract breaks in the Plan 4 `--fix` surface, hence the 4.5 naming.

| Issue | Concern | Fix |
|---|---|---|
| #25 | OA002 floating-tag catch emits on `npm:` protocol aliases (e.g. `npm:lodash@4.17.21`) | Skip `npm:` prefix packages in floating-tag semver detection |
| #26 | OA005 suggest findings emit empty `patch: []`, pass Plan 4 fix filter, falsely report success | OA005.d/.e now emit `fix: undefined` instead of empty patch |

Plus one sanity test locking in both fixes as regression guards.

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `895ba65` | docs(merge): Plan 4.5 spec - OA002 npm: alias + OA005 empty-patch polish |
| 2 | `e7780f7` | fix(OA002): skip npm: protocol aliases in floating-tag check (closes #25) |
| 3 | `3942ee3` | fix(OA005): suggest findings emit fix: undefined instead of empty patch (closes #26) |
| 4 | `a96028a` | test(sanity): Plan 4.5 detector polish - OA002 npm: alias + OA005 suggest fix |

1 spec commit + 2 detector fixes + 1 sanity commit = 4 total.

## Files added / modified

### Source (2 modified)

| Path | Change |
|---|---|
| `src/overrides/detectors/oa002-floating-tag.ts` | Add `npm:` prefix to skipPrefix list for floating-tag detection (1 line added) |
| `src/overrides/detectors/oa005-nested-ineffective.ts` | OA005 suggest findings (.d, .e) now initialize `fix: undefined` instead of empty patch (17 insertions, 8 deletions in findingBase factory) |

### Tests added (2 files)

| Path | Tests | Coverage |
|---|---|---|
| `tests/overrides/detectors/oa002.test.ts` | 1 | OA002 regression: npm: alias produces zero findings |
| `tests/overrides/detectors/oa005.test.ts` | 2 | OA005 suggest findings (.d, .e) have fix: undefined |
| `tests/sanity/plan-4.5-detector-polish.test.ts` | 6 | OA002 npm: alias integration + OA005.e fix shape + dogfood matrix unchanged (Ghost=5, Prisma=1, Storybook=7, bun-simple=0) |

**Total Plan 4.5 tests added: 9** (1 + 2 assertions in place, 6 new in sanity file)

## Test results (at HEAD)

```
$ npm test
Test Suites: 66 passed, 66 total
Tests:       611 passed, 611 total
```

- 605 cumulative through Plan 5 sanity
- 6 new Plan 4.5 sanity tests = 611 total
- All Plan 1 / Plan 2 / Plan 3 / Plan 3.5 / Plan 3.6 / Plan 4 / Plan 5 tests still pass (regression check)

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Plan 4.5 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - OA002 npm: alias skip | ✅ | 1 line added to skipPrefix list; 1 test case added |
| 2 - OA005 suggest fix shape | ✅ | Detector logic refactored; 2 assertions updated in existing test file |
| 3 - Plan 4.5 sanity test | ✅ | 6 tests in new file; dogfood matrix unchanged |

## Execution method

- Skill: `superpowers:subagent-driven-development`
- Per task: implementer subagent -> spec compliance review -> code quality review -> mark complete
- Model: `haiku` for all implementer and reviewer subagents
- 3 implementer dispatches + task reviews

## What we hit along the way

**Plan 5 sanity test already locked in dogfood counts.** Plan 5's sanity gate fixed the counts at Ghost=5, Prisma=1 OA001, Storybook=7 OA002, bun-simple=0. Plan 4.5 ran the dogfood matrix again to confirm the detector fixes did not perturb those baseline counts. All passed; the underlying detectors are stable.

**Caller safety pattern confirmed.** Code inspection of Plan 4's consuming code paths (`runOverrides`, `runOverridesFixHook`, `applyFix`, `applyComposite`) showed all use the safe optional-chaining pattern `f.fix?.type === "rfc6902"` or similar. When OA005 suggest findings now emit `fix: undefined`, all callers correctly skip them without error. No caller code changes were needed.

**OA005 test file updated in place.** The existing OA005 detector test file gained 2 assertions for the OA005.d/.e fix shape, but the test structure remained unchanged. The net test delta from detector tests was zero (2 assertions added, but test count unchanged). The +6 new test count came entirely from the new sanity file.

## Scope of Plan 4.5 testing - what is and is not covered

### What the 9 net new assertions/tests exercise

- **OA002 npm: alias regression** (1 in `oa002.test.ts`): npm: protocol override produces zero findings
- **OA005 suggest fix shape** (2 in `oa005.test.ts`): OA005.d (leaky) and OA005.e (flattenable) have fix: undefined
- **Dogfood matrix regression** (4 in `plan-4.5-detector-polish.test.ts`): Ghost = 5 OA001, Prisma = 1 OA001, Storybook = 7 OA002, bun-simple = 0 (confirms Plan 5 baseline intact)
- **OA005.e suggest finding integration** (1 in `plan-4.5-detector-polish.test.ts`): full scan produces OA005.e with fix: undefined
- **OA002 npm: alias integration** (1 in `plan-4.5-detector-polish.test.ts`): full scan on npm: alias project produces zero OA002 findings

### What IS verified after Plan 4.5 sanity

- OA002 now correctly skips `npm:` protocol packages in semver floating-tag detection
- OA005 suggest findings (.d, .e) emit `fix: undefined` instead of empty patch
- All Plan 4 callers (runOverrides, runOverridesFixHook, applyFix, applyComposite) correctly handle undefined fix via optional chaining
- Dogfood matrix counts are unchanged; the detector fixes are regression-free against real-world projects

### What is NOT changed by Plan 4.5 (deliberately)

- No behavior change to non-suggest OA005 findings (critical/high/medium .a/.b/.c/.f still emit rfc6902 patches)
- No changes to other detectors (OA001, OA003, OA004, OA006, OA007, OA008 unaffected)
- No new APIs or CLI surfaces (Plan 4 surface unchanged)
- No changes to SARIF/HTML/terminal renderers (output rendering already tested in Plan 5; this plan does not touch formatters)
- No issue closures for #24, #27, #28 (Plan 4.5 scope is strictly #25 and #26)

## Issues closed by Plan 4.5

`closes #N` directives do not auto-fire on tracking PRs (per `feedback-create-prs.md`). After Plan 4.5 pushes, these need manual closure with commit back-references:

| Issue | Commit | Manual closure command |
|---|---|---|
| #25 OA002 npm: alias | `e7780f7` | `gh issue close 25 --comment "Implemented by e7780f7 ..."` |
| #26 OA005 suggest fix | `3942ee3` | `gh issue close 26 --comment "Implemented by 3942ee3 ..."` |

## Ready for Plan 5 push

Plan 4.5 sits chronologically AFTER Plan 5 in local git history (Plan 5 commits appear earlier in `git log`). When pushed, both Plan 5 and Plan 4.5 ship together in one batch. The two detector fixes are regression-tested and safe to land. Dogfood validation confirms no perturbation to real-world detection counts.
