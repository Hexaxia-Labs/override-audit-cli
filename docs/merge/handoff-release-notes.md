# cve-lite-cli vNext - release notes (draft)

## Highlights

- **Override hygiene built in.** `cve-lite overrides [path]` runs eight detectors (OA001-OA008) over your project's `overrides` / `pnpm.overrides` / `resolutions`. It catches orphaned targets, floating tags, misplaced sections, surpassed pins, ineffective nested overrides, parent-binary coupling, registry drift, and on-disk materialized vulnerable copies. Override findings also render in a regular scan via `--check-overrides`.
- **`--fix` closes the loop with verify.** When `cve-lite [path] --fix` applies an override fix, it automatically re-runs OA001 + OA008 against the just-patched targets to confirm the fix actually took. A new exit code `2` distinguishes "fix applied but did not take" from regular findings.
- **Project-wide audit log (opt-in).** Pass `--audit-log <path>` (or set `CVE_LITE_AUDIT_LOG`) to stream NDJSON change-control events across the full scan/fix/verify lifecycle: `scan.started`, `cve.detected`, `cve.fix.applied`, `oa.detected`, `oa.fix.applied`, `verify.passed`, `verify.failed`, `scan.finished`, `error`. Off by default; zero cost when unused. See `docs/audit-log.md`.

## What override hygiene is (and is not)

CVE Lite remediates vulnerabilities by upgrading along the dependency graph (`npm install`, `npm update`, parent upgrades). Override hygiene is a parallel surface: it keeps the `overrides` a project already has healthy. The fix hook never creates new overrides; it removes, repins, or moves existing ones, and verifies the result.

## Output coverage

Override findings render in every existing cve-lite output channel:

- Terminal: a severity-grouped "Override hygiene" section.
- `--json`: an `overrideFindings` array on the scan payload (the `overrides` subcommand emits `findings`).
- `--sarif`: a sibling `toolComponent` registering OA001-OA008, with one result per finding.
- `--report`: an Overrides section in the HTML report (HTML-escaped).
- CycloneDX is unchanged (CVE-only by spec).

## Breaking changes

- New exit code `2` on `--fix` verify failure. CI flows that special-cased `1` may want to handle `2` distinctly (0 ok, 1 findings, 2 verify failed, 3 error).
- SARIF output now includes a sibling `toolComponent` for OA rules. Consumers that assumed a single component should iterate `runs[0].tool.driver` and `runs[0].tool.extensions`. The CVE component and results are unchanged when no override findings are present.

## Validation

Dogfooded against cve-lite's own example projects and a real npm project:

- Ghost (pnpm): 4 orphaned overrides + 1 floating tag.
- Prisma (pnpm): 1 orphaned override.
- hexmetrics (npm): 1 coupled-platform-binary finding.

Full suite: 612 tests. The Analog monorepo (Sonu's original OA006 case) validates on the OWASP side where the example lives.

## Acknowledgements

- Override-audit IP merged from `@hexaxia-labs/override-audit-cli` (Aaron Lamb).
- Co-developed with Sonu Kapoor.

See `docs/merge/` for the design spec and per-plan implementation history.
