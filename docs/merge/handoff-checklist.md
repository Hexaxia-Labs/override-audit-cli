# Dev-to-test handoff checklist

Aaron and Sonu both confirm before pushing this branch's content to a
`feat/override-audit-merge` branch on `OWASP/cve-lite-cli`.

Status as of Plan 6 (2026-06-06): all automated items below pass on `merge`.
Human sign-off (the bottom two lines) is the remaining gate.

## Code

- [x] Plans 1-6 commits landed on `merge`.
- [x] `_preserved-override-audit/` trimmed to a frozen `src/` snapshot (kept as the port-equivalence baseline; delete it on the OWASP side once those tests are retired).
- [x] `npm test` green (612 tests, 66 suites).
- [x] `npx tsc --noEmit` clean.
- [x] `npm run build` succeeds.
- [x] Test hygiene gate passes (no Mocha-isms, no focused tests).

## CLI surfaces

- [x] `cve-lite overrides [path]` runs end-to-end.
- [x] `cve-lite [path] --fix` applies OA fixes and runs verify.
- [x] Exit code 2 fires when verify fails.
- [x] `--audit-log <path>` writes a complete NDJSON stream (and `CVE_LITE_AUDIT_LOG` env).
- [x] `--check-overrides` runs OA hygiene during a regular scan and threads findings to output.
- [x] `--check-network` enables OA007.

## Output

- [x] Terminal output renders an "Override hygiene" section.
- [x] `--json` includes `overrideFindings` (scan path) / `findings` (overrides subcommand).
- [x] `--sarif` includes the OA tool component with OA001-OA008 rules.
- [x] `--report` HTML includes an Overrides section (HTML-escaped).
- [x] CycloneDX is unchanged (CVE-only).

## Dogfood (2026-06-06)

- [x] `cve-lite overrides examples/ghost` -> 4x OA001 + 1x OA002 (matches Sonu's nested-Cheerio findings and the locked sanity baseline of 5).
- [x] `cve-lite overrides examples/prisma` -> 1x OA001 (matches Sonu's finding and baseline).
- [x] `cve-lite overrides ~/Projects/hexmetrics` -> 1x OA006 (npm-side; independently validates the OA006 detector that Sonu saw on Analog).
- [x] `overrides --fix` on a throwaway Prisma copy removes the orphan and verifies clean, exit 0.
- [x] Audit log captures scan.started / oa.detected / scan.finished cleanly.
- [ ] **Deferred: `examples/analog`** is not vendored in this repo (3,367-package monorepo, too large). Sonu's OA006 analog finding is covered indirectly by hexmetrics; re-run analog on the OWASP side where the example lives.
- [x] No P1 surprises across the validated projects.

## Docs

- [x] Rule docs OA001-OA008 live in `docs/rules/` (matching the detector `references:` URLs).
- [x] `docs/audit-log.md` reference doc written for the 9-event vocabulary.
- [x] CONTRIBUTING.md has an "Override hygiene subsystem" section.
- [x] Lesson retrospectives migrated to `docs/lessons/`.
- [ ] README override-hygiene + `--audit-log` section (tracked as issue #19, deferred to a focused README pass).
- [ ] CHANGELOG `[Unreleased]` Plan-work entries (tracked as issue #20).

## Open follow-ups (carry to OWASP side, not blockers)

- #19 README override section, #20 CHANGELOG, #21 action.yml controls.
- #22 public rule-reference index, #23 programmatic API reference (partially addressed by docs/rules/ + CONTRIBUTING).
- #32 detector `runnableCommand` emits `--target` which the CLI does not parse (cosmetic; docs already use the correct `--rule` form).
- OA003 Yarn case: awaiting a repro from review.

## Handoff artifact

- [x] `docs/merge/handoff-release-notes.md` drafted.
- [ ] List of touched files compared against `cve-lite-cli@main` (the diff that becomes the cve-lite PR) - generated at push time.

Sign-off:
- Aaron: ____________ Date: ____________
- Sonu:  ____________ Date: ____________
