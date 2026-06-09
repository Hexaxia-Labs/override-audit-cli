# Plan 8: 100% end-to-end control coverage

**Status:** Pending
**Branch:** `merge`
**Estimated:** 1-2 days
**Date:** 2026-06-09

## Objective

Every user-facing control of the CLI is exercised at least once through the **real built binary** (`dist/index.js`, spawned via execFileSync) with assertions on exit code, stdout/stderr, written files, and audit-log output. This is the pre-Phase-2 confidence layer: when an OWASP reviewer runs any command or flag, we have proven it works end-to-end.

"100%" here means **every control covered once e2e**, not every combination. The existing 634 in-process tests remain the combinatorial depth (every detector sub-rule, every parser edge). This plan adds the spawned-binary layer that is currently thin (only 6 files spawn the CLI today).

## Coverage model

- A control is "covered" when at least one spawned-CLI test exercises it and asserts a real outcome.
- Detector coverage: each OA001-OA008 is triggered by a synthetic project and observed firing through `cve-lite overrides`. Sub-rule depth stays in the in-process suite.
- The CVE/OSV network path runs `--offline` against a synced advisory DB (CI already syncs it); no live OSV calls in tests.
- The real CVE-side `--fix` (which shells out to npm/pnpm) is NOT spawned for real package installs; it is covered on the override side and via the in-process mocks. A note documents this boundary.

## Shared harness (Task 1)

`tests/e2e/harness.ts`:
- `runCli(args: string[], opts?: { cwd?, env? }): { stdout, stderr, status }` - spawns `process.execPath dist/index.js ...`, captures all streams, never throws on non-zero exit (returns status).
- `mkProject(files: Record<string, string|object>): string` - mkdtemp + write package.json/lockfiles/node_modules manifests; returns dir. Cleans up via the caller's afterEach.
- Fixture builders for each package manager and each detector trigger.
- A `jest.config` globalSetup or a documented `npm run build` precondition so `dist/` exists. Prefer a globalSetup that builds once.

## The control matrix (the 100% checklist)

Each row is one or more e2e tests. A task owns a group.

### Task 2: Commands + meta
- [ ] `cve-lite --version` -> exit 0, prints version
- [ ] `cve-lite --help` / `-h` -> exit 0, prints usage
- [ ] `cve-lite <clean project>` (default scan, --offline) -> exit 0
- [ ] `cve-lite overrides <project>` -> runs, exit per findings
- [ ] `cve-lite overrides --help` -> exit 0
- [ ] `cve-lite advisories sync --help` (and a real sync to a temp --output if feasible offline-safe) -> exit 0
- [ ] `cve-lite install-skill` in a temp dir -> exit 0, writes skill files
- [ ] `cve-lite config show` / `config set ca-cert <pem>` / `config unset ca-cert` -> exit 0 round-trip

### Task 3: Exit codes
- [ ] 0 - clean project scan and overrides
- [ ] 1 - overrides with findings at/above --fail-on
- [ ] 2 - `--fix` applies but post-fix verify fails (construct a scenario; if not constructible e2e, document and cover in-process)
- [ ] 3 - bad args / unknown command / unreadable project

### Task 4: Validation conflicts (each rejected combo, exit nonzero + message)
- [ ] --fix + --json
- [ ] --report + --json
- [ ] --sarif + --report
- [ ] --cdx + --report
- [ ] --offline + --osv-url
- [ ] --no-cache + --offline
- [ ] invalid --osv-url
- [ ] invalid --ca-cert path
- [ ] unknown flag

### Task 5: Output channels (each produces valid, parseable output via the binary)
- [ ] terminal default (human output present)
- [ ] `--json` (scan) -> JSON file written, parses, has expected keys incl. overrideFindings when --check-overrides
- [ ] `overrides --json` -> stdout JSON parses, has findings
- [ ] `--sarif` -> .sarif file written, valid SARIF, OA tool component present when overrides included
- [ ] `--report` -> HTML written, contains Override hygiene section
- [ ] `--cdx` -> CycloneDX file written, valid, CVE-only (no OA per spec)

### Task 6: Detectors via the binary (each OA fires e2e)
- [ ] OA001 orphaned target
- [ ] OA002 floating tag
- [ ] OA003 wrong section
- [ ] OA004 surpassed pin
- [ ] OA005 nested ineffective (one triggering sub-rule, e.g. .b parent-not-in-tree)
- [ ] OA006 coupled platform binary (relocate, proposed)
- [ ] OA007 frozen latest (with `--check-network`; mock or skip if no registry - document)
- [ ] OA008 materialized vulnerable (needs node_modules fixture)

### Task 7: Fix + tiering + verify
- [ ] `overrides --fix` applies a Tier 1 (auto) fix (OA001 remove), override gone, exit 0
- [ ] `overrides --fix` does NOT apply a Tier 2 (proposed) OA006 relocate; override survives
- [ ] `--fix` verify hook exit code path (0 on clean, 2 on verify fail per Task 3)
- [ ] applier chokepoint guard: a constructed finding that would create an override key is rejected (likely in-process given construction difficulty; note it)

### Task 8: Audit log + scan integration
- [ ] `--audit-log <path>` on a scan -> NDJSON with scan.started + scan.finished
- [ ] `overrides --audit-log <path>` -> oa.detected events present
- [ ] `--check-overrides` on a scan -> override findings appear in scan JSON output
- [ ] `CVE_LITE_AUDIT_LOG` env var path works
- [ ] `--check-network` parsed and OA007 path exercised (mock/skip documented)

### Task 9: Package managers (each scanned via the binary)
- [ ] npm (package-lock.json)
- [ ] pnpm (pnpm-lock.yaml)
- [ ] yarn (yarn.lock)
- [ ] bun (bun.lock)

### Task 10: Sanity + gate + completion log
- [ ] Plan 8 sanity test (a thin meta-test asserting the harness builds dist and runCli works)
- [ ] Full suite green, tsc clean, hygiene gate, em-dash sweep
- [ ] Coverage checklist above fully ticked, or each un-ticked item has a documented reason (e.g. live-network-only)
- [ ] Plan 8 completion log

## Acceptance criteria

- Every row above has a spawned-CLI test OR a documented reason it cannot be spawned (live network, real package-manager install).
- `npm test` green; new e2e tests run in CI (build precondition satisfied by globalSetup or the existing CI build step).
- tsc clean, test-hygiene gate passes, no em dashes.
- A coverage summary in the completion log maps each control to its test.

## Out of scope

- Live OSV network calls (use --offline + synced DB).
- Real npm/pnpm/yarn/bun install during CVE --fix (covered in-process/mocked).
- Performance/load testing.
- Combinatorial cross-product (kept in the in-process suite).

## Notes

This plan is independent of the Sonu relocate-design review - it tests the whole product surface, not just the relocate work. It builds on the local Plan 6.5 implementation (held back pending Sonu), so it lands on the same branch after that work. Numbered Plan 8 because Plan 7 (documentation) is already specced for Phase 2.
