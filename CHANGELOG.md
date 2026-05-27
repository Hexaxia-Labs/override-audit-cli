# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. See the [roadmap in README.md](README.md#roadmap) for what's next.

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

[Unreleased]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Hexaxia-Labs/override-audit-cli/releases/tag/v0.1.0
