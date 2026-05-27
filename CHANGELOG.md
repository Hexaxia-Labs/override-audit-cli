# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. See the [roadmap in README.md](README.md#roadmap) for what's next.

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

[Unreleased]: https://github.com/Hexaxia-Labs/override-audit-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Hexaxia-Labs/override-audit-cli/releases/tag/v0.1.0
