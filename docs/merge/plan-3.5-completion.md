# Plan 3.5 - Completion log

**Status:** Complete (local; not yet on origin)
**Branch:** `merge`
**Range:** `07a4d24..e4c5c2c` (Plan 3.5 + sanity)
**Date:** 2026-06-03

## What Plan 3.5 delivered

Yarn (classic) and bun support for the override-audit subsystem. After this plan, all 8 OA detectors produce meaningful findings on yarn and bun projects in addition to npm and pnpm. The pipeline:

- Extracts `resolutions` entries from `package.json` for yarn projects
- Reads `yarn.lock` and `bun.lock` via cve-lite's existing parsers
- OA003 wrong-section recognises misplaced overrides on all 4 package managers

Closes issue #9.

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `bc63be8` | feat(overrides): extract yarn resolutions container (closes #9) |
| 2 | `57fe1f6` | feat(overrides): wire yarn-lock and bun-lock into readLockfileNames |
| 3 | `6e1b283` | test(fixtures): yarn-classic and bun fixture projects for Plan 3.5 |
| 4 | `87249b1` | feat(overrides): OA003 generalises to a 4-way pm container check (yarn + bun) |
| 5 | `7be4470` | test(overrides): yarn and bun integration tests for Plan 3.5 |
| 6 | `e4c5c2c` | test(sanity): Plan 3.5 yarn + bun dogfood against Storybook/Strapi/bun-simple + Plan 3 regression check |

5 substantive commits + 1 sanity commit.

## Files added / modified

### Source (2 modified, 0 created)

| Path | Change |
|---|---|
| `src/overrides/parsing/package-json.ts` | Append a `resolutions` extraction block alongside the existing `overrides` and `pnpm.overrides` blocks; update JSDoc to mention all three containers |
| `src/overrides/context-builder.ts` | Add yarn and bun branches to `readLockfileNames`, calling cve-lite's `loadFromYarnLock(path)` and `loadFromBunLock(path, false)` |
| `src/overrides/detectors/oa003-wrong-section.ts` | Replace the 2-case npm-vs-pnpm logic with a table-driven 4-way pm check (EXPECTED_CONTAINER + EXPECTED_PATH_PREFIX); empty findings for unknown pm |

### Test fixtures (4 files)

| Path | Purpose |
|---|---|
| `tests/fixtures/manifest-resolutions/package.json` | Yarn-style resolutions container with 2 entries (lodash + scoped) |
| `tests/fixtures/manifest-all-three-containers/package.json` | One entry per container (overrides / pnpm.overrides / resolutions) for the multi-container test |
| `tests/fixtures/yarn-classic-with-resolutions/package.json` + `yarn.lock` | Realistic yarn v1 project with deps + resolutions; `completely-unused-pkg` resolution is the OA001 bait |
| `tests/fixtures/bun-with-overrides/package.json` + `bun.lock` | Bun project with overrides; `completely-unused-pkg` is the OA001 bait |

### Tests added (3 files modified, 2 created)

| Path | Tests | Coverage |
|---|---|---|
| `tests/overrides/parsing/package-json.test.ts` | +2 | resolutions extraction (2 entries with `container: "resolutions"`); all-three-containers (3 entries) |
| `tests/overrides/context-builder.test.ts` | +2 | yarn.lock package names readable; bun packageManager detection |
| `tests/overrides/detectors/oa003.test.ts` | +5 | npm+resolutions, yarn+overrides, yarn+resolutions ok, bun+overrides ok, unknown pm |
| `tests/overrides/yarn-bun-integration.test.ts` | 2 (new file) | audit() against the yarn fixture (OA001 fires on `completely-unused-pkg`); audit() against the bun fixture (OA001 fires) |
| `tests/sanity/plan-3.5-yarn-bun.test.ts` | 5 (new file) | Real-project dogfood (Storybook / Strapi / bun-simple) + Plan 3 sanity regression check (Ghost / Prisma counts unchanged) |

**Total Plan 3.5 tests added: 16**

## Test results (at commit `e4c5c2c`)

```
$ npm test
Test Suites: 52 passed, 52 total
Tests:       554 passed, 554 total
```

- 538 cumulative through Plan 3 sanity + 16 new = 554 ✓
- All Plan 3 sanity tests (Ghost / Prisma / hexmetrics / preserved-vs-new) unchanged
- No regressions in cve-lite's pre-existing suite

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Plan 3.5 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - Extract resolutions container | ✅ | Closes #9; pattern matches existing pnpm.overrides extraction |
| 2 - Wire yarn + bun lockfile readers | ✅ | Found `loadFromYarnLock(path)` (single arg) and `loadFromBunLock(path, prodOnly)`; signatures adapted correctly |
| 3 - Add yarn + bun fixtures | ✅ | Yarn v1 format hand-written; bun.lock authored minimally to parse cleanly |
| 4 - OA003 4-way generalisation | ✅ | Table-driven (EXPECTED_CONTAINER + EXPECTED_PATH_PREFIX); ctxOf helper takes packageManager arg now |
| 5 - Integration tests | ✅ | 2 tests: yarn + bun fixtures each produce expected OA001 finding via audit() |
| 6 - Plan 3.5 gate | ✅ | 549/549 tests at gate; sanity added 5 more for 554/554 final |

## Execution method

- Skill: `superpowers:subagent-driven-development`
- Per task: implementer subagent -> spec compliance review -> code quality review -> mark complete
- Model: `haiku` for all implementer and reviewer subagents
- 5 implementer dispatches + 5 review subagents

## Real-project sanity results

`tests/sanity/plan-3.5-yarn-bun.test.ts` ran `audit()` against three real cve-lite example projects:

| Project | PM | Overrides | Findings | Notable |
|---|---|---|---|---|
| `cve-lite-ref/examples/storybook` | yarn | 18 resolutions | 7 | OA002 x7 (floating `"latest"` on `@babel/runtime`, `@babel/traverse`, `@playwright/test`, etc.) |
| `cve-lite-ref/examples/strapi` | yarn | 4 resolutions | 1 | OA001 x1 (orphaned resolution) |
| `cve-lite-ref/examples/bun-simple` | bun | 0 | 0 | Clean run, exits cleanly |

The Storybook finding set is the most useful confirmation: yarn's `"latest"` resolution values fire OA002 as designed, and the audit-log captures one `oa.detected` event per finding.

### Plan 3 sanity regression check

The sanity test also re-runs the Plan 3 matrix against pnpm projects to confirm Plan 3.5 introduced no regressions:

- Ghost (pnpm): 5 findings (unchanged from Plan 3 baseline)
- Prisma (pnpm): 1 OA001 finding (unchanged)

Plan 3.5 additions are purely additive on the parsing side; the npm and pnpm pipelines stay the same.

## Out of scope (carried over from the plan)

- **Yarn Berry PnP** (no `node_modules`). OA004/OA006/OA008 pre-skip when node_modules is missing. Acceptable matches existing behavior for npm/pnpm projects without node_modules.
- **Yarn glob keys** (`**/lodash` style). Not observed in real fixtures; OA002 only checks values, not keys. Will file if real-world false positives appear.
- **OA005 sub-rule tuning for yarn**. Yarn doesn't use pnpm's `parent>child` syntax. Nested object form falls under OA005's existing logic.

## Issues closed by Plan 3.5

- #9 yarn resolutions container not extracted - closes via commit `bc63be8` once pushed

## Ready for Plan 4

Plan 4 (`cve-lite overrides` CLI subcommand + verify hook into `--fix` + exit code `2`) is unblocked. The CLI integration consumes the Plan 3 public API; Plan 3.5 added yarn / bun coverage to the same pipeline. Plan 3.6 (code-quality follow-ups for #10/#11/#12/#13) can run in parallel with Plan 4; no conflicts.
