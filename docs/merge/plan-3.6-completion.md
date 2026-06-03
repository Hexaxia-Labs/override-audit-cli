# Plan 3.6 - Completion log

**Status:** Complete (local; not yet on origin)
**Branch:** `merge`
**Range:** `64fac73..HEAD` (Plan 3.6 substantive + 1 CI fix + 1 style cleanup + sanity)
**Date:** 2026-06-03

## What Plan 3.6 delivered

Four code-quality polish items found during the cve-lite merge review, all marked `closes #N`:

| Issue | Concern | Fix |
|---|---|---|
| #10 | Inline `import("./types.js")` self-reference in `OverrideFinding` | Direct type references |
| #11 | Stale "lazy; OA006/OA008 fill this" comment on `installedCopies` | Comment now reflects eager population by `walkInstalledTree` |
| #12 | `shellQuote` duplicated in 5 detectors | Extracted to `src/utils/string.ts` |
| #13 | Bare `'fs'`/`'path'` imports in 3 parsing files | `node:` prefix throughout |

Plus one bug surfaced and fixed mid-plan:

| Issue | Concern | Fix |
|---|---|---|
| #18 | Fixture `node_modules/` dirs missing on CI - tests pass locally, fail on clean checkout | `.gitignore` exception + 14 tracked synthetic `package.json` files |

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `aca2450` | refactor(types): drop inline import self-reference in OverrideFinding (closes #10) |
| 2 | `e9f60f0` | fix(ci): track fixture node_modules to unbreak parser tests on CI (closes #18) |
| 3 | `c9e5bf3` | docs(context): correct stale comment on installedCopies population (closes #11) |
| 4 | `5037f55` | refactor: extract shellQuote helper to src/utils/string.ts (closes #12) |
| 5 | `ce68241` | chore(parsing): use node: prefix for fs/path imports (closes #13) |
| 6 | `b33060f` | style(parsing): replace pre-existing em dashes in installed-tree.ts |
| 7 | `e3d6c39` | test(sanity): Plan 3.6 refactor regression - shellQuote integration + dogfood matrix unchanged |

5 substantive Plan 3.6 commits + 1 CI fix surfaced mid-plan + 1 style cleanup + 1 sanity commit = 8 total since the Plan 3.5 completion logs landed.

## Files added / modified

### Source (5 modified)

| Path | Change |
|---|---|
| `src/overrides/types.ts` | Drop 2 inline `import("./types.js")` references; use direct `OverrideRuleId` / `OverrideSubRuleId` |
| `src/overrides/context.ts` | Update JSDoc on `installedCopies`: now reflects eager population by `walkInstalledTree` |
| `src/utils/string.ts` | Append `shellQuote` export alongside existing `pluralize` |
| `src/overrides/parsing/package-json.ts` | Bare `'fs'` / `'path'` -> `'node:fs'` / `'node:path'` |
| `src/overrides/parsing/installed-tree.ts` | Same node: prefix change; plus pre-existing em dashes replaced with ASCII |
| `src/overrides/parsing/node-modules.ts` | Same node: prefix change |

### Detectors (5 modified to consume shared shellQuote)

- `oa001-orphaned-target.ts`
- `oa002-floating-tag.ts`
- `oa004-surpassed-pin.ts`
- `oa005-nested-ineffective.ts`
- `oa006-coupled-platform-binary.ts`

Each: local `function shellQuote(...)` removed; `import { shellQuote } from "../../utils/string.js"` added. Call sites unchanged.

### CI / infrastructure

- `.gitignore` - add `!tests/fixtures/**/node_modules` and `!tests/fixtures/**/node_modules/**` to permit fixture `node_modules/` tracking
- 14 fixture `package.json` files newly tracked under `tests/fixtures/{tree-walker,scanner-hexmetrics,hexmetrics-real-world,nm-basic,scanner-clean}/node_modules/` (~165 KB total)

### Tests added (2 files)

| Path | Tests | Coverage |
|---|---|---|
| `tests/utils/string.test.ts` | 5 | `shellQuote` correctness (plain, special chars, embedded quote escape) + `pluralize` regression check |
| `tests/sanity/plan-3.6-refactor-regression.test.ts` | 6 | `shellQuote` wired into OA001 `runnableCommand` correctly + Plan 3 / 3.5 dogfood counts unchanged |

**Total Plan 3.6 tests added: 11**

## Test results (at HEAD)

```
$ npm test
Test Suites: 54 passed, 54 total
Tests:       565 passed, 565 total
```

- 554 cumulative through Plan 3.5 sanity + 5 new utility tests + 6 new sanity tests = 565 ✓
- All Plan 3 / Plan 3.5 sanity tests still pass (regression check in the new file is the explicit proof)
- No regressions in cve-lite's pre-existing suite

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Plan 3.6 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - Drop inline self-import | ✅ | 2 lines changed in types.ts; types behave identically |
| 2 - Correct stale comment | ✅ | Comment-only edit in context.ts |
| 3 - Extract shellQuote | ✅ | New shared helper + 5 detector imports rewired; 5 detector files cleaned |
| 4 - node: prefix | ✅ | 3 parsing files; preserved existing single-quote style |
| 5 - Plan 3.6 gate | ✅ | 559 at gate; sanity added 6 more for 565 final |

## Execution method

- Skill: `superpowers:subagent-driven-development`
- Per task: implementer subagent -> spec compliance review -> code quality review -> mark complete
- Model: `haiku` for all implementer and reviewer subagents
- 4 implementer dispatches + 4 review subagents

## What we hit along the way

**CI failed mid-plan on the previous push.** Right after Plan 3.5 + completion logs pushed, the next CI run on PR #17 surfaced 3 failures in `tests/overrides/parsing/installed-tree.test.ts`. Root cause: the cve-lite v1.18.2 rebase silently dropped fixture `node_modules/` tracking by replacing the override-audit `.gitignore` (which had `!tests/fixtures/**/node_modules`) with cve-lite's stricter version. Local builds passed because the directories were on disk from earlier `cp` operations; CI saw a clean checkout and the fixtures were missing.

Filed as #18, fixed inline before continuing Plan 3.6 substantive work. The fix tracks 14 synthetic `package.json` files (~165 KB total) across 5 fixture trees. CI went green after the push.

**Pre-existing em dashes in `installed-tree.ts`.** Caught during Task 4's em-dash sweep on the touched file. The em dashes were carried over from `_preserved-override-audit/` and survived the Plan 2 port without being noticed (Plan 2 sweeps were per-detector, not per-helper-file). Cleaned up in a separate style commit (`b33060f`) so the polish is distinct from the `node:` prefix refactor.

**Task 1 commit landed despite an interrupt notification.** The first dispatch to implement Task 1 returned a tool-rejection notification, but the implementer agent had already completed and committed before the interrupt fired. The second dispatch detected the existing commit and reported it as already done. Confirmed by inspecting the commit content (`aca2450` exactly matches the spec) and proceeded.

## Scope of Plan 3.6 testing - what is and is not covered

### What the 11 net new tests exercise

- **shellQuote unit behavior** (3 in `string.test.ts`): plain pass-through, special-char quoting, embedded-quote escape
- **pluralize regression** (2 in `string.test.ts`): singular at 1, plural at 0 and 2 (confirms the existing helper still works after appending to the file)
- **shellQuote end-to-end via runnableCommand** (2 in `plan-3.6-refactor-regression.test.ts`): OA001 runnableCommand contains the package name; scoped names with safe characters pass through unchanged. Proves the call sites in detectors didn't break.
- **Dogfood matrix regression** (4 in `plan-3.6-refactor-regression.test.ts`): Ghost = 5, Prisma = 1 OA001, Storybook = 7 OA002, bun-simple = 0. Locks in counts so any future detector regression is caught here.

### What IS verified after Plan 3.6 sanity

- All four polish refactors are byte-equivalent at the runtime detection level
- No new em dashes, no new bare imports, no new shellQuote duplicates, no new inline self-imports
- CI now passes on a clean checkout (fixture `node_modules/` content is tracked)
- The full Plan 1 -> 3.5 sanity matrix continues to produce identical findings

### What is NOT changed by Plan 3.6 (deliberately)

- No behavior change: same findings, same fix patches, same audit-log events
- No new APIs or detector additions
- No issue closures for #14, #15, #16 (the unplanned follow-ups from Plan 3 sanity work)

## Issues closed by Plan 3.6

`closes #N` directives do not auto-fire on tracking PRs (per `feedback-create-prs.md`). After Plan 3.6 pushes, these need manual closure with commit back-references:

| Issue | Commit | Manual closure command |
|---|---|---|
| #10 self-import in types.ts | `aca2450` | `gh issue close 10 --comment "Implemented by aca2450 ..."` |
| #11 stale comment | `c9e5bf3` | `gh issue close 11 --comment "Implemented by c9e5bf3 ..."` |
| #12 shellQuote duplication | `5037f55` | `gh issue close 12 --comment "Implemented by 5037f55 ..."` |
| #13 bare fs/path imports | `ce68241` | `gh issue close 13 --comment "Implemented by ce68241 ..."` |

#18 (CI fixture) was already closed earlier in the inline fix.

## Ready for Plan 4

Plan 4 (`cve-lite overrides` CLI subcommand + verify hook into `--fix` + exit code `2`) is unblocked. Plan 3.5 added yarn / bun pipeline coverage; Plan 3.6 cleaned up the code-quality items found during review. Plan 4 consumes the Plan 3 public API and integrates it into cve-lite's CLI surface.
