# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. See the [roadmap in README.md](README.md#roadmap) for what's next.

## [0.2.1] — 2026-05-27

Upgrades OA006 and OA007 from `suggest`-only to genuinely fixable. The `--fix` flow now closes the dogfood loop end-to-end: the tool that *discovered* the parent-override pattern can now *apply* it.

### Added
- **`Remediation.patches?: RFC6902Patch[]`** — additive multi-op patch field. Single-op rules continue to use `patch`; rules whose fix requires multiple ops set `patches` (and leave `patch` null).
- **`AppliedPatch.patches: RFC6902Patch[]`** — the full op list applied for a finding. Single-op fixes have `[patch]`; multi-op fixes have all ops.
- **OA006-COUPLED-PLATFORM-BINARY** now emits a two-op patch:
  1. `remove` the binary override at its container path.
  2. `add` (or `replace`, if a parent override already exists) the parent override at `>=<parent-installed-version>` in the same container.
  Action upgraded from `suggest` to `replace`. pnpm and npm containers both supported.
- **OA007-FROZEN-LATEST** now emits a single-op `replace` patch swapping the floating tag for `>=<registry-latest>`. Action upgraded from `suggest` to `replace`.
- New tests covering: multi-op patch emission, existing-parent-override → replace path, container mirroring (npm vs pnpm.overrides), OA007 replace patch, and end-to-end multi-op fix application in the orchestrator.

### Changed
- The fix orchestrator resolves `patches` first, falling back to `patch` for backward compatibility with v0.2.0 fixtures.

### Dogfood verification
Against a copy of real-world hexmetrics:
```
- "postcss": "8.5.15",                  // OA006 (next pins exact)
- "@esbuild/linux-x64": "latest"        // OA002 + OA006 + OA007
+ "next": ">=16.2.6",                   // OA006 → parent override
+ "esbuild": ">=0.28.0"                 // OA006 → parent override
```
Three patches applied, package.json structurally rewritten exactly as the rule explanations described.

### Notes
- 187 tests across 29 suites, all passing.
- No schema break. v0.2.0 consumers reading `patch` continue to work; new consumers can prefer `patches` when present.
- OA008 stays suggest-only (its fix requires investigation, not a deterministic patch).

## [0.2.0] — 2026-05-27

Ships `--fix`. The tool now rewrites `package.json` in place to apply the RFC 6902 patches detectors emit — moving from detection-only to detect-and-fix in the same flow.

### Added
- **`--fix`** — apply the RFC 6902 patches emitted by detector findings and rewrite `package.json` atomically (tmp file + rename). Preserves the original indent and trailing-newline style.
- **`--dry-run`** — with `--fix`, report what would change without writing to disk. Implies no post-fix rescan.
- **`--no-post-fix-rescan`** — with `--fix`, skip the post-fix verification scan.
- **Post-fix verification** — after applying patches, re-runs the scanner against the modified `package.json` and reports any remaining findings or new findings (regressions).
- **`FixReport`** in `OverrideAuditOutput.fix` — populated when `--fix` is used. Includes `appliedPatches`, `skippedFindings` (suggest-only / below-severity / filtered), `remainingFindings` (post-rescan), and `newFindings` (regressions).
- `src/fixer/apply.ts` — RFC 6902 applier supporting `remove`/`replace`/`move`/`add`. Auto-creates intermediate objects on `add`/`move` so OA003's pnpm.overrides → overrides move works on projects that never had a top-level overrides block.
- `src/fixer/write.ts` — indent detection (2-space / 4-space / tab) and atomic write.
- `src/fixer/fix.ts` — orchestrator: filter findings → apply patches → write → rescan → diff.
- Eight new tests covering apply ops, format-preserving write, and orchestrator-level scenarios (dry-run, severity floor, suggest-only skipping).
- Human renderer now prints a FIX summary section under `--fix` showing applied patches, skipped findings, and rescan outcome.

### Changed
- `--fix`, `--dry-run`, and `--no-post-fix-rescan` are no longer reserved — they work.
- Help text gains a FIX section.
- Reserved-for-future flag set now contains only the v0.3.0 HexOps change-control logging flags (`--attempt-id`, `--source`, `--advisory`, `--meta`, `--log-file`, `--log-level`, `--no-install`).
- Per-rule docs: `--fix` references are now real, not "coming in v0.2.0".

### Notes
- Schema is unchanged. `OverrideAuditOutput.fix` is additive and only populated under `--fix`.
- OA006, OA007, and OA008 stay `suggest`-only — their fixes require multi-op patches (deferred follow-up).
- HexOps change-control logging deferred to v0.3.0.
- 182 tests across 29 suites, all passing.
- Dogfooded on a copy of the hexmetrics-real-world fixture: `"@esbuild/linux-x64": "latest"` → `">=0.25.12"`, post-fix rescan clean, exit 0.

## [0.1.2] — 2026-05-27

Refines OA006 severity per the v0.1.1 dogfood discovery (issue [#8](https://github.com/Hexaxia-Labs/override-audit-cli/issues/8)). v0.1.1 was emitting `high` uniformly even when the override pattern was currently effective; that produced false-urgency on common range-override-vs-exact-pin cases like `postcss: "^8.5.15"` against `next`'s `postcss: "8.4.31"`.

### Changed
- **OA006-COUPLED-PLATFORM-BINARY** severity is now tiered:
  - `high` — target matches a platform-binary pattern (e.g. `@esbuild/<platform>`, `@next/swc-<platform>`, `@img/sharp-<platform>`, `lightningcss-<platform>`). The binary-coupling failure mode is severe.
  - `medium` — non-platform target (e.g. `postcss`, `react`) when the override is currently effective. Pattern is risky but not actively broken.
  - **escalates to `high`** when OA008-VULNERABLE-TWIN also fires for the same target (the risk has materialized on disk).
- Title text reflects the tier: "Override on platform binary fights an exact-pinned parent" vs "currently effective, but fragile" vs "vulnerable copy on disk — OA008 confirms".

### Added
- `src/detectors/platform-binary.ts` — `looksLikePlatformBinary(name)` heuristic. Matches OS segments anchored to slash/hyphen boundaries.
- Scanner-level composite escalation step (OA006 + OA008 → high).
- `tests/scanner-composite.test.ts` for the escalation path.

### Notes
- No new rules. No schema change.
- 160 tests across 26 suites, all passing.

## [0.1.1] — 2026-05-27

Adds three new detectors discovered via dogfooding v0.1.0 against `/home/aaron/Projects/hexmetrics`. The original `"@esbuild/linux-x64": "latest"` override revealed a class of override-hygiene bugs that no static analyser was catching — these three rules close that gap.

### Added
- **`OA006-COUPLED-PLATFORM-BINARY`** (high): override target's installed parent declares it as exact-version. The override is fighting an exact pin and may not apply (or may apply now but break on the next `npm update` of the parent). Suggests overriding the parent instead. Catches the headline `@esbuild/linux-x64` / `esbuild` coupling. Local-only — no network. ([#5](https://github.com/Hexaxia-Labs/override-audit-cli/issues/5))
- **`OA008-VULNERABLE-TWIN`** (critical): override declared a floor but a copy of the target package below that floor is *still on disk*. The override didn't actually apply — the security pin is non-functional and the user is silently vulnerable. Catches the post-install gap that static analysis can't see. ([#7](https://github.com/Hexaxia-Labs/override-audit-cli/issues/7))
- **`OA007-FROZEN-LATEST`** (high): `"latest"` / `"next"` pin resolved long ago and has been frozen by the lockfile; the registry has since advanced. Opt-in network rule, gated by `--with-registry`. ([#6](https://github.com/Hexaxia-Labs/override-audit-cli/issues/6))
- `src/parsers/installed-tree.ts` — recursive `node_modules` walker producing `installedCopies` (all copies of each package) and `parentDeclarations` (which parents declare what, and whether exact-pinned).
- `src/parsers/registry.ts` — opt-in `registry.npmjs.org` client with timeout, per-scan dedup, and graceful null-on-error.
- `--with-registry` and `--registry-timeout <ms>` CLI flags.
- New `Context` fields: `installedCopies`, `parentDeclarations`, `registryDistTags`. Additive; no `OverrideAuditOutput` schema change.
- Per-rule docs `docs/rules/OA006.md`, `OA007.md`, `OA008.md`; updated `docs/rules/README.md` table.

### Changed
- CLI help text lists all eight detectors.
- README rule reference table extended.
- Snapshot test updated to include the new `skippedDetectors` entry when `--with-registry` is not passed and a floating-tag override is present.

## [0.1.0] — 2026-05-27

Initial release. **Detection only**; `--fix` lands in `v0.2.0`.

### Added
- Five rule detectors with stable rule codes:
  - `OA001-ORPHAN-TARGET` — override target not in resolved tree.
  - `OA002-FLOATING-TAG` — pin uses `latest`/`next`/`*`/non-semver.
  - `OA003-WRONG-SECTION` — `pnpm.overrides` in npm project (or vice versa).
  - `OA004-INSTALLED-NEWER` — installed version surpassed concrete pin.
  - `OA005-NESTED-OVERRIDE` — nested-object override, with five sub-codes (`.a-NON-NPM`, `.b-ORPHANED-OUTER`, `.c-ORPHANED-INNER`, `.d-LEAKY`, `.e-SUSPECT`).
- npm and pnpm support. Lockfile parsing handles both pnpm v6 (`/name@ver:`) and v9 (`'@scope/pkg@ver':`, `name@ver:`) formats.
- Hand-rolled CLI (`override-audit`) with exit codes `0` (clean), `1` (findings present), `2` (internal error).
- Plain-text human renderer and `--json` machine-readable output matching the v1 `OverrideAuditOutput` schema (locked via snapshot test).
- Severity filtering (`--severity`), rule filtering (`--rule OA002=off`), and suspect-finding gate (`--include-sub-suspect`).
- Plan-2 flags (`--fix`, `--dry-run`, `--attempt-id`, `--source`, …) reserved at the parser level with a clear "coming in v0.2.0" error.
- Graceful degradation via `skippedDetectors` when the lockfile or `node_modules` is missing.
- CI pipeline on Node 18 / 20 / 22.
- 102 tests across 19 suites, including a JSON-schema snapshot regression test that locks the v1 contract HexOps will consume in Plan 3.
- Per-rule documentation under [`docs/rules/`](docs/rules/).

### Notes
- Same-major safety heuristic for `OA004` (full parent-graph safety check tracked in [#3](https://github.com/Hexaxia-Labs/override-audit-cli/issues/3)).
- No color output yet (tracked in [#4](https://github.com/Hexaxia-Labs/override-audit-cli/issues/4)).
- `OA005.e-SUSPECT` is info-level and filtered from output unless `--include-sub-suspect --severity info`.

[Unreleased]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Hexaxia-Labs/override-audit-cli/releases/tag/v0.1.0
