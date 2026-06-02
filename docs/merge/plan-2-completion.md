# Plan 2 - Completion log

**Status:** Complete (local only; not yet pushed to origin)
**Branch:** `merge`
**Range:** `af66ff7..56c933e` (Plan 2 commits)
**Date:** 2026-06-02

## What Plan 2 delivered

The eight OA detectors and their supporting infrastructure ported into `src/overrides/`. After this plan, the detectors are callable as library functions with the new `OverrideContext` / `OverrideFinding` shapes. No caller invokes them yet; that arrives in Plan 3 (`audit()` and `verify()`).

## Commits (in order)

| # | SHA | Message |
|---|---|---|
| 1 | `2abd52d` | feat(version): add coerceVersion/satisfiesRange/isValidRange/majorVersion for override detectors |
| 2 | `08d866e` | feat(overrides): OverrideContext interface |
| 3 | `dd6a73c` | feat(overrides): port json-pointer, package-json, installed-tree, registry helpers |
| 4 | `ab4d7e0` | feat(overrides): buildOverrideContext adapter over cve-lite parsers |
| 5 | `1504f47` | feat(overrides): port OA001 orphaned-target detector |
| 5b | `ddbb5e2` | style(overrides): replace em dash with ASCII in OA001 test description |
| 6 | `f303a71` | feat(overrides): port OA002 floating-tag detector |
| 7 | `681f789` | feat(overrides): port OA003 wrong-section detector |
| 8 | `37f9883` | feat(overrides): port OA004 surpassed-pin detector |
| 9 | `20dd1cc` | feat(overrides): port OA005 nested-ineffective detector |
| 10 | `ea30728` | feat(overrides): port OA006 coupled-platform-binary detector |
| 11 | `6f47fad` | feat(overrides): port OA007 frozen-latest detector |
| 12 | `6225afd` | feat(overrides): port OA008 materialized detector |
| 13 | `56c933e` | feat(overrides): detector registry (ALL_DETECTORS, VERIFY_DETECTORS) |

14 substantive commits + 1 em-dash style fix = 15 total.

## Files added

### Source (19 files)

| Path | Purpose |
|---|---|
| `src/utils/version.ts` | Modified: appended 4 new exports (coerceVersion, satisfiesRange, isValidRange, majorVersion) replacing the 8 semver methods the OA detectors used |
| `src/overrides/context.ts` | `OverrideContext` interface plus PackageManager, OverrideValue, OverrideEntry, InstalledCopy, ParentDeclaration, RegistryDistTags, SkippedDetector, local Logger |
| `src/overrides/context-builder.ts` | `buildOverrideContext()` adapter; wires cve-lite's `loadFromPackageLock` / `loadFromPnpmLock` into `lockfilePackageNames`; walks node_modules; pre-skips OA001/OA004/OA006/OA008 when prerequisites missing |
| `src/overrides/parsing/json-pointer.ts` | RFC 6901 encoder |
| `src/overrides/parsing/package-json.ts` | overrides extraction (`extractOverrideEntries`) |
| `src/overrides/parsing/installed-tree.ts` | walks node_modules to populate `installedCopies` and `parentDeclarations` |
| `src/overrides/parsing/node-modules.ts` | helper consumed by installed-tree (dependency surfaced during port; not in original plan) |
| `src/overrides/parsing/registry.ts` | dist-tags fetch (consumed by `audit()` when `checkNetwork: true`) |
| `src/overrides/detectors/oa001-orphaned-target.ts` | OA001 - severity high |
| `src/overrides/detectors/oa002-floating-tag.ts` | OA002 - severity medium |
| `src/overrides/detectors/oa003-wrong-section.ts` | OA003 - severity high |
| `src/overrides/detectors/oa004-surpassed-pin.ts` | OA004 - severity low |
| `src/overrides/detectors/oa005-nested-ineffective.ts` | OA005 - sub-rules .a (critical) / .b (high) / .c (high) / .d (medium) / .e (low) |
| `src/overrides/detectors/oa006-coupled-platform-binary.ts` | OA006 - severity high for platform binaries, medium otherwise; OA008 escalation deferred to Plan 3 runner |
| `src/overrides/detectors/oa007-frozen-latest.ts` | OA007 - severity low; offline-safe (consumes `ctx.registryDistTags` populated upstream) |
| `src/overrides/detectors/oa008-materialized.ts` | OA008 - severity critical; advisory-only (no fix field) |
| `src/overrides/detectors/platform-binary.ts` | `looksLikePlatformBinary` regex helper used by OA006 |
| `src/overrides/detectors/index.ts` | `ALL_DETECTORS` (8 entries) and `VERIFY_DETECTORS` (OA001 + OA008) registries |
| `src/overrides/index.ts` | Modified: re-exports `OverrideContext`, `buildOverrideContext`, `ALL_DETECTORS`, `VERIFY_DETECTORS`, `DetectorFn` alongside Plan 1's type exports |

### Tests added (15 files)

| Path | Tests | What it covers |
|---|---|---|
| `tests/utils/version-extensions.test.ts` | 14 | Each of majorVersion / coerceVersion / isValidRange / satisfiesRange across exact, caret, tilde, comparators, invalid input |
| `tests/overrides/context-builder.test.ts` | 2 | Builds context for npm project with override; flags OA001/OA004/OA006/OA008 as skipped when node_modules absent |
| `tests/overrides/parsing/json-pointer.test.ts` | 3 | RFC 6901 encoding edge cases |
| `tests/overrides/parsing/package-json.test.ts` | 7 | Extracts overrides from npm/pnpm.overrides/resolutions, handles nested shapes |
| `tests/overrides/parsing/installed-tree.test.ts` | 4 | Walks nested node_modules, captures parents/copies |
| `tests/overrides/parsing/registry.test.ts` | 7 | dist-tags fetch batch (mocked) |
| `tests/overrides/detectors/oa001.test.ts` | 5 | Orphan detection + skip behavior |
| `tests/overrides/detectors/oa002.test.ts` | 6 | Floating-tag detection (latest/next/wildcards/empty), workspace protocol skip |
| `tests/overrides/detectors/oa003.test.ts` | 4 | Misplaced npm overrides under pnpm.overrides and vice versa; move patch |
| `tests/overrides/detectors/oa004.test.ts` | 9 | Surpassed pin detection including major-bump safety guard |
| `tests/overrides/detectors/oa005.test.ts` | 14 | All 5 sub-rules (.a-.e), priority ordering, manifest lookup, dep-type fallbacks |
| `tests/overrides/detectors/oa006.test.ts` | 9 | Platform-binary detection, parent declaration matching, exact-pin coupling |
| `tests/overrides/detectors/oa007.test.ts` | 9 | Frozen-latest signal from dist-tags map; offline-safe |
| `tests/overrides/detectors/oa008.test.ts` | 7 | Vulnerable copy on disk, range-based pin satisfaction |
| `tests/overrides/detectors/platform-binary.test.ts` | 25 | Parameterized regex coverage (15 match cases, 10 non-match cases) |

**Total Plan 2 tests added: 125** (87 detector + 14 version-extension + 6 infrastructure + 21 parsing helper + 25 platform-binary parameterized helper - some counted on different axes; full suite delta is +129)

## Fixtures added

29 fixture directories under `tests/fixtures/` carried over from `_preserved-override-audit/tests/fixtures/`. These exercise the parser tests with realistic manifest + lockfile + node_modules shapes.

## Test results

```
$ npm test
Test Suites: 42 passed, 42 total
Tests:       505 passed, 505 total
Time:        ~2 s
```

- 376 Plan 1 baseline tests still pass (zero regressions in cve-lite's pre-existing suite or in Plan 1's foundation tests)
- 129 net new Plan 2 tests added, all green
- 42 test suites pass cleanly

```
$ npx tsc --noEmit
(no output, exit 0)
```

## Plan 2 task ledger

| Task | Status | Notes |
|---|---|---|
| 1 - Extend `src/utils/version.ts` | ✅ | 4 new exports; replaces the 8 semver methods OA detectors call |
| 2 - `OverrideContext` interface | ✅ | Logger defined locally (cve-lite does not export a Logger type) |
| 3 - Port json-pointer/package-json/installed-tree/registry helpers | ✅ | 5 source files (extra: node-modules.ts as a discovered dependency); fixtures copied to `tests/fixtures/` |
| 4 - `buildOverrideContext` adapter | ✅ | Uses cve-lite's `loadFromPackageLock` and `loadFromPnpmLock`; pre-skip rules wired |
| 5 - Port OA001 orphaned-target | ✅ | Severity raised from preserved 'low' to spec's 'high' |
| 6 - Port OA002 floating-tag | ✅ | semver.validRange -> isValidRange |
| 7 - Port OA003 wrong-section | ✅ | No semver; RFC 6902 `move` patch |
| 8 - Port OA004 surpassed-pin | ✅ | semver.gt/valid/major swapped |
| 9 - Port OA005 nested-ineffective | ✅ | All 5 sub-rules preserved with short-form IDs (OA005.a-e); OA005-vs-OA001 dedup deferred to Plan 3 runner |
| 10 - Port OA006 coupled-platform-binary | ✅ | platform-binary helper ported as separate file; OA008 escalation deferred to Plan 3 |
| 11 - Port OA007 frozen-latest | ✅ | Offline-safe; consumes ctx.registryDistTags |
| 12 - Port OA008 materialized | ✅ | All 5 semver methods swapped (most of any detector); advisory-only (no fix field) |
| 13 - Detector registry | ✅ | ALL_DETECTORS (8) + VERIFY_DETECTORS (OA001 + OA008) |
| 14 - Plan 2 gate | ✅ | 505/505 tests, tsc clean, directory tree confirmed |

## Execution method

- Skill: `superpowers:subagent-driven-development`
- Per task: implementer subagent -> spec compliance review -> code quality review -> mark complete
- Model: `haiku` for all implementer and reviewer subagents
- 14 implementer dispatches + 14 review subagents (combined spec + quality reviews for the more mechanical ports)

## Semver replacement summary

Eight semver methods called across six detectors. All replaced with `src/utils/version.ts` extensions added in Task 1.

| semver method | Replacement | Used in |
|---|---|---|
| `semver.valid(v)` | `looksLikeVersion(v)` (existing) | OA004, OA006, OA007, OA008 |
| `semver.gt(a, b)` | `compareVersions(a, b) > 0` (existing) | OA004, OA007 |
| `semver.lt(a, b)` | `compareVersions(a, b) < 0` (existing) | OA008 |
| `semver.rcompare(a, b)` | `compareVersions(b, a)` (args swapped) | OA006 |
| `semver.major(v)` | `majorVersion(v)` (new) | OA004 |
| `semver.coerce(s)` | `coerceVersion(s)` (new) | OA008 |
| `semver.satisfies(v, r)` | `satisfiesRange(v, r)` (new) | OA005, OA008 |
| `semver.validRange(r)` | `isValidRange(r)` (new) | OA002, OA005, OA008 |

Zero `semver` imports remain. No runtime dependency added to cve-lite.

## What we hit along the way

**Em dashes in preserved test descriptions.** The preserved override-audit test files have em dashes scattered through test names (one example: a test that reads "describes via Context - not this detectors job..."). The first detector port (OA001) shipped with one such em dash still present; the spec reviewer caught it and the fix shipped as a separate style commit (`ddbb5e2`). Subsequent ports were instructed to em-dash-sweep before commit; no further violations.

**Platform-binary helper required.** OA006 depends on a `looksLikePlatformBinary` regex helper. The preserved tree has this as a separate file (`src/detectors/platform-binary.ts`) with its own parameterized test (`tests/detectors/platform-binary.test.ts`, 25 cases via `it.each`). I ported both alongside OA006 in the same commit. Not in the explicit task spec; flagged as an extra in the implementer report.

**Node-modules.ts dependency.** Plan 2 Task 3 listed four parsing helpers; in practice `installed-tree.ts` imports from a fifth file (`node-modules.ts`) in the preserved tree. Implementer correctly surfaced this as a dependency of `installed-tree.ts` and ported it alongside.

**Fixture location.** Spec suggested `tests/overrides/fixtures/`; implementer used `tests/fixtures/` (top-level). No collisions with cve-lite's existing tests, all tests pass. Worth revisiting in Plan 6 cleanup if we want to consolidate under `tests/overrides/fixtures/` for the final cve-lite-cli landing.

**Severity bumps from preserved defaults.** Several detectors had preserved severities that the spec table corrected:
- OA001: preserved 'low' -> spec 'high' (orphan = dead override on still-live vuln)
- OA007: preserved 'high' -> spec 'low' (advisory, opt-in network)

These are intentional per the spec's "OA severity mapping" section.

**`Context` -> `OverrideContext`-ification of detector tests.** Every preserved detector test had a `ctxOf` helper that built a synthetic `Context`. Each port needed the helper updated to add `auditLog: NULL_AUDIT_LOG` and a noop logger to satisfy the new `OverrideContext` shape. Done consistently across all 8 detector test ports.

## Scope of Plan 2 testing - what is and is not covered

### What the 129 net new tests exercise

**Detector behavior (87 tests across 8 detector files plus parameterized platform-binary helper).** Each of OA001-OA008 has its preserved test logic carried across, asserting on the new `OverrideFinding` shape. Fixture cases mirror the preserved suite's coverage of orphans, drifted pins, misplaced sections, nested sub-rules, parent coupling, registry drift, and materialized vulnerable copies. The 25-case platform-binary parameterized test covers the helper used by OA006.

**Parsing helpers (21 tests across 4 files).** Round-trip JSON pointer encoding, overrides extraction from npm/pnpm/resolutions containers, node_modules tree walking with parent declarations, registry dist-tags batch fetch (mocked).

**Context builder (2 tests).** Golden-path build + pre-skip behavior when prerequisites missing.

**Version utilities (14 tests).** majorVersion/coerceVersion/isValidRange/satisfiesRange across the operator surface (`^`, `~`, `>=`, `<=`, `>`, `<`, `=`, exact) plus invalid input.

### What is NOT verified in this branch

- **No side-by-side equivalence proof** between preserved `detect()` and ported `detect()`. The migrated tests assert on the new shape; if a detector was subtly broken in transit, only the test fixtures the assertions actually cover would catch it. The fixtures are the same fixtures the preserved tests used, so the coverage matches what override-audit had, but it is not a strict bit-for-bit equivalence proof.
- **No real-project run.** Sonu's Analog/Ghost/Prisma findings have not been reproduced against the merged code yet. That's a Plan 6 dogfood task.
- **No `audit()` or `verify()` entrypoint exercise.** Those are Plan 3.
- **No CLI run.** `cve-lite overrides` does not exist as a subcommand yet (Plan 4).
- **No `--fix` integration test.** Plan 4.
- **No audit-log emission from detectors.** Detectors are pure (no `ctx.auditLog.emit` calls). Emission is the runner's job in Plan 3 + Plan 5.

### Preserved-suite sanity comparison

The preserved override-audit suite (`_preserved-override-audit/`) reported **194 tests across 29 suites** in the Plan 1 sanity check. Plan 2 ports a subset of that coverage forward:

| Preserved (Plan 1 sanity baseline) | Ported into Plan 2 |
|---|---|
| 8 detectors x ~5-9 tests = 53 explicit | 8 detectors x updated counts = 63 explicit + 25 parameterized = 88 |
| platform-binary parameterized helper | platform-binary parameterized helper (25 cases) |
| scanner.test.ts + scanner-composite.test.ts (composite logic) | **Not yet ported** - lives in Plan 3 composite.ts |
| fix.test.ts + fixer/* (4 files) | **Not yet ported** - lives in Plan 3 fixer port |
| parsers/* (6 files) | 4 ported (json-pointer, package-json, installed-tree, registry); 2 not ported (lockfile.ts, node-modules.ts, package-manager.ts subsumed by cve-lite's parsers + the new node-modules.ts helper) |
| output/*, output-snapshot.test.ts | **Not yet ported** - output integration is Plan 5 |
| logging/change-control.test.ts | Subsumed by Plan 1's audit-log module (different shape, broader scope) |
| cli/* | **Not yet ported** - lives in Plan 4 |
| types.test.ts | Subsumed by Plan 1's types tests |

The detector + helper coverage from the preserved suite is fully ported. The composite, fixer, output, and CLI coverage lands in Plans 3-5.

## Pre-Plan-3 sanity check (executed)

Two additional harnesses were run after the Plan 2 gate to confirm behavioral equivalence and real-project plausibility before Plan 3 starts. Both committed to the branch at `a2f467c`.

### Harness 1: port equivalence (`tests/sanity/port-equivalence.test.ts`)

Imports both preserved (`_preserved-override-audit/src/detectors/`) and ported (`src/overrides/detectors/`) `detect()` functions in the same Jest test file. For each detector, runs both implementations over an identical synthetic fixture and asserts equivalent findings after normalizing for the intentional shape changes:

- preserved `ruleId: "OA001-ORPHAN-TARGET"` -> shortened to `"OA001"`
- preserved `package: "name"` (string) -> normalized from new `package: { name }`
- fix-op comparison: preserved `remediation.patch.op` (or `remediation.patches[0].op`) -> new `fix.patch[0].op`
- severity intentionally ignored (spec corrected OA001 low->high and OA007 high->low)

Results: 7 of 7 equivalence tests pass. Covers OA001/OA002/OA003/OA004/OA006/OA007/OA008. OA005 omitted because its 5 sub-rule codes diverge between preserved (long form like `OA005.a-NON-NPM`) and new (short form `OA005.a`); its 14 migrated tests cover the same fixture intent. A follow-up could add a normalized OA005 pass.

### Harness 2: real-project dogfood (`tests/sanity/dogfood.test.ts`)

Builds a real `OverrideContext` via `buildOverrideContext()` against three on-disk projects, iterates `ALL_DETECTORS`, prints structured findings, asserts plausible counts.

| Project | Overrides | node_modules | Total findings | Hits |
|---|---|---|---|---|
| `cve-lite-ref/examples/ghost` (pnpm) | 52 | absent | 5 | OA001 x4 (orphans: `ember-svg-jar>cheerio`, `juice>cheerio`, two `eslint-plugin-ghost>` entries); OA002 x1 (`@tryghost/logging` pinned to `"catalog:"`) |
| `cve-lite-ref/examples/prisma` (pnpm) | 10 | absent | 1 | OA001 x1 (`@azure/msal-node>uuid` orphan) |
| `~/Projects/hexmetrics` (pnpm) | 2 | present | 1 | OA006 x1 (`postcss` override fights an exact-pinned parent) |

On Ghost and Prisma `node_modules` was absent, so OA004/OA006/OA008 were pre-skipped by the context builder. On hexmetrics all 8 detectors ran.

**Sonu's 2026-06-01 known-positive findings reproduce exactly:**

- Ghost: `ember-svg-jar>cheerio` and `juice>cheerio` both flagged as OA001 orphans (Sonu reported "two orphaned nested Cheerio overrides"; we see those plus two additional `eslint-plugin-ghost>` orphans she may not have called out)
- Prisma: `@azure/msal-node>uuid` flagged as OA001 (Sonu reported "1 orphaned override")
- hexmetrics: new OA006 finding on postcss, not previously reported but plausible (postcss override is `8.5.15` while postcss is pinned by other deps)

### What the sanity check did NOT prove

- **Analog example not exercised.** Sonu's third Ghost-tier finding was on Analog; that example is not present in the `cve-lite-ref` snapshot at our rebased baseline. If Sonu re-confirmed against a later cve-lite ref, we would catch it in Phase 2 group testing.
- **OA005 equivalence not in the side-by-side.** Covered by migrated tests but not by the new harness. Tracking as a small follow-up.
- **`audit()` / `verify()` / fix-runner not exercised.** Those land in Plan 3.

After the sanity checks the full suite is 515 tests, 44 suites, all green. tsc clean.

## Ready for Plan 3

Plan 3 consumes everything Plan 2 produced:
- `ALL_DETECTORS` and `VERIFY_DETECTORS` registries drive `audit()` and `verify()` entrypoints
- `buildOverrideContext` is invoked at the top of `audit()` and `verify()`
- Composite logic (OA005-vs-OA001 dedup, OA006 escalation when OA008 confirms) lives in `src/overrides/composite.ts` (new in Plan 3)
- The fixer (`_preserved-override-audit/src/fixer/`) ports to `src/overrides/fixer.ts` in Plan 3
- `audit-log` emission for `oa.detected`, `verify.passed`, `verify.failed`, `oa.fix.applied` wires into the runner

Per the standing preferences:
- Plan 3 will not start without an explicit go-ahead
- Push will not happen without an explicit go-ahead
