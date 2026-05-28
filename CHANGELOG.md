# Changelog

All notable changes to CVE Lite CLI will be documented in this file.

## [Unreleased]

### Docs
- Visual Studio Code case study added with verified baseline scan of a root npm lockfile snapshot (`examples/vscode/`, 1,374 packages, 9 findings at revision `bc678ca`), including CVE Lite CLI vs `npm audit` comparison.
- Examples readme, docs sidebar, and README updated to reference the VS Code fixture and case study.

## [1.18.1] - 2026-05-27

### Added
- Corporate SSL proxy support: `--ca-cert <path>` flag passes a PEM CA certificate for a single scan or advisory sync; `cve-lite config set ca-cert <path>` saves the path persistently in `~/.cve-lite-cli/config.json` so every future invocation uses it automatically; `cve-lite config show` and `cve-lite config unset ca-cert` manage the saved value. Cert is validated as a readable PEM file before saving. GitHub Action gains a matching `ca-cert` input.
- Workspace-scoped direct fix commands for monorepos: when scanning an npm, pnpm, yarn, or bun workspace project, direct dependency upgrade commands now include the appropriate workspace flag (`npm install -w <workspace>`, `pnpm add --filter ./path`, `yarn workspace <name> add`, `bun add --filter <name>`) so the install targets the correct workspace scope rather than the project root.

### Changed
- Extracted all fix execution logic from `src/index.ts` into `src/utils/fix-runner.ts`: `applyFixesIfRequested`, `FixExecutionResult`, `printFixModeSummary` join the previously extracted `buildFixCommandParts`, `runInstallCommand`, and `commandLabelForPackageManager`.
- Extracted `pluralize` utility to `src/utils/string.ts`, eliminating repeated count ternaries across 9 files.

### Docs
- New Corporate SSL Proxy guide covering one-time config setup, per-invocation flag, cert export from IT/keychain/browser, and air-gapped advisory sync fallback.
- CLI reference updated with Network/SSL section and `config` subcommand docs.
- Troubleshooting page updated with SSL certificate errors entry.
- Expanded CONTRIBUTING.md with code quality standards and file-size guidelines.
- Astro pnpm monorepo case study with verified baseline scan and CVE Lite vs pnpm audit comparison.
- Added Medium dedicated review and Hexaxia Labs integration post to press page, README, and homepage.
- Refreshed homepage press bar with new outlets and "View all press coverage" link.
- Turborepo case study added with verified baseline scan of a pnpm lockfile snapshot (`examples/turborepo/`, 1,776 packages, 13 findings at revision `c85d410`), including CVE Lite CLI vs `pnpm audit` comparison.
- Examples readme, docs sidebar, and README updated to reference the Turborepo fixture and case study.

## [1.18.0] - 2026-05-25

### Added
- Show targeted retry and offline hints for OSV 429 rate-limit and 5xx server error responses.
- Emit lockfile-refresh fix commands for pnpm (`pnpm update`), yarn (`yarn upgrade`), and bun (`bun update`) when the parent's declared range already covers the fixed transitive dependency version.

### Fixed
- Added package manager hint to `--fix` command failure errors.

### Changed
- Workspace-scoped lockfile-refresh commands now generated for pnpm, yarn, and bun when the parent's declared range already covers the safe transitive version; lockfile-refresh targets appear in their own fix-plan sections rather than mixed with direct-fix targets; fix coverage count ("Running these commands should fix X of Y findings") added to both terminal and HTML output; "within current range" label renamed to "lockfile refresh" with context strings rewritten to plainly state the parent already permits the safe child version.
- Unified excluded directory list for `--usage` source scanning with the shared `EXCLUDED_DIRS` constant.
- Extracted `formatAdvisoryDbFreshness` and `relativeAge` from `src/index.ts` into `src/utils/time.ts`.
- Extracted CLI flag validation from `src/index.ts` into `src/cli/validate.ts`.
- Extracted `formatAdvisorySourceLine` to `src/output/formatters.ts` and `countBySeverity` to `src/utils/severity.ts`.
- Extracted package.json / workspace reading helpers from `src/index.ts` into `src/utils/package-json.ts`.
- Extracted `DEFAULT_BATCH_SIZE` and `DEFAULT_SEARCH_DEPTH` magic numbers to named constants in `src/constants.ts`.

## [1.17.3] - 2026-05-22

### Fixed
- SSL certificate errors from corporate proxy inspection now reliably show actionable `NODE_EXTRA_CA_CERTS` and `NODE_TLS_REJECT_UNAUTHORIZED=0` guidance by checking Node.js error codes and walking the error cause chain, rather than string matching on the top-level message.

## [1.17.2] - 2026-05-22

### Fixed
- SSL certificate errors from corporate proxy inspection now show a clear, actionable message with `NODE_EXTRA_CA_CERTS` and `NODE_TLS_REJECT_UNAUTHORIZED=0` workarounds instead of a raw Node.js TLS error.

## [1.17.1] - 2026-05-22

### Fixed
- Validated fix version now shown in the finding line and verbose table instead of the raw OSV hint, preventing confusing downgrade suggestions.
- Malicious advisory findings (`MAL-*`) now surface a clear removal message across all output modes: inline hint in compact, `⚠ Malicious` badge and removal legend in verbose, and `⚠ Malicious` badge with tooltip in the HTML report.

## [1.17.0] - 2026-05-20

### Added
- CVE count now shown alongside package count in all output modes: terminal summary reads `✗ Found 26 packages (35 CVEs)`, compact output reads `26 packages · 35 CVEs`, verbose quick-take reads `35 CVEs matched overall`, and the HTML report gains a dedicated CVEs severity card alongside the Packages card.
- npm-shrinkwrap.json support: the scanner now detects and parses `npm-shrinkwrap.json` with correct precedence over `package-lock.json` when both are present.

### Fixed
- `security-events: write` permission added to the self-scan CI job so SARIF uploads succeed.

### Docs
- Getting Started page title shortened and added to top nav.
- Ghost CMS case study added with full Before/After fix journey.
- Socket CLI comparison expanded with structured sections.
- README: strengthened hero differentiators, unique combination claim, and OWASP threading; added package manager logos section; added Press section with Help Net Security and Development Curated coverage.
- Website homepage: added "As seen in" press bar with Help Net Security and Development Curated logos.
- How It Works: added Vulnerability Data Sources section; removed redundant network-privacy doc.

## [1.16.0] - 2026-05-13

### Added
- `--cdx` flag writes a CycloneDX 1.4 JSON SBOM (`cve-lite-scan-<timestamp>.cdx.json`) to the current directory. The SBOM includes all lockfile packages as components — not just vulnerable ones — making it suitable as a compliance artifact even on a clean scan. Vulnerability data is attached for any CVE findings, deduplicated by CVE ID with multiple `affects` references when the same CVE affects more than one package. Runnable fix commands are included as recommendations when available.
- GitHub Action gains a `cdx` input (default `"false"`) to enable CycloneDX SBOM output from the Action.
- Self-scan CI workflow now generates a SARIF file and uploads findings to GitHub Code Scanning via `github/codeql-action/upload-sarif`.

### Fixed
- `--sarif` and `--cdx` now suppress terminal table output, matching the behaviour of `--json`. Running any export flag shows only the spinner progress and the saved file path. Use `--verbose` alongside an export flag to restore full terminal output.

### Changed
- Output file writing (JSON, SARIF, CycloneDX) extracted from `index.ts` into a dedicated `write-outputs.ts` dispatcher module, keeping `index.ts` lean as new export formats are added.

## [1.15.1] - 2026-05-12

### Added
- GitHub Action now exposes `--usage`, `--only-used`, `--sarif`, and `--no-cache` inputs. The `no-cache` input defaults to `true` in CI since runners are ephemeral.
- `--sarif` flag writes a SARIF 2.1.0 file to the current directory for upload to GitHub Code Scanning. One result per CVE, rules deduplicated, severity mapped to SARIF levels.

## [1.15.0] - 2026-05-11

### Added
- `--json` output is now saved to a timestamped file (`cve-lite-scan-YYYY-MM-DDTHH-MM-SS.json`) in the current directory, keeping stdout free for human-readable messages. The banner and spinner are no longer suppressed in `--json` mode. Advisory source and offline mode lines no longer appear in `--json` stdout.
- New `install-skill` subcommand writes AI assistant skill files for Claude Code, Codex CLI, Gemini CLI, Cursor, and GitHub Copilot into the current project directory. Append-style files (`AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`) are created if missing, appended to if no CVE Lite section exists, or replaced in place if a section already exists — running the command twice is safe. Commit the generated files to share the context with your team.

### Fixed
- Transitive parent-upgrade guidance now marks commands as path-specific when they only cover a subset of a vulnerable package's dependency paths. Covered and remaining paths are exposed in JSON; terminal output and HTML report show the same partial-path note.
- pnpm lockfile traversal now preserves multiple dependency paths for repeated package versions instead of stopping after the first matching key. Path count and depth caps bound the traversal to avoid runaway graph walks.

### Changed
- Dedicated caching guide added covering the 30-minute TTL, false negative risk window, and `--no-cache` flag behavior.

## [1.14.0] - 2026-05-06

### Added
- `--no-cache` flag forces a fresh OSV query for all packages in a single scan, bypassing the `queryEntries` cache while still writing results back so subsequent runs benefit from caching as normal. Mutually exclusive with `--offline` and `--offline-db`.
- Transitive context column added to the HTML report findings table, showing the dependency path from each vulnerable transitive package back to a direct dependency.
- Transitive findings in terminal output now show a ⚠ no-fix indicator when no safe upgrade is available, distinguishing unfixable transitive issues from ones that can be resolved.

### Fixed
- `queryEntries` cache now expires after 30 minutes. Previously, a clean result (no vulnerabilities) was cached indefinitely, meaning a package that acquired a new CVE after the initial scan would be silently missed on all subsequent scans until the cache was manually deleted. All entries — both clean and non-empty — are now re-queried after 30 minutes. Existing v2 cache files are migrated automatically and treated as stale on first run.

### Changed
- OSV batch queries now run in parallel with a concurrency cap of 5, reducing cold scan time from ~14s to ~7.5s on large lockfiles (~1700 packages).
- Cache file format bumped from v2 to v3. `queryEntries` values now store `{ vulnIds, cachedAt }` instead of a bare `string[]`. v2 files are migrated transparently on load.

## [1.13.0] - 2026-05-06

### Added
- Yarn Berry (v2+) lockfile support. The parser now detects the `__metadata:` block and routes to a dedicated Berry parser that extracts packages from `resolution:` fields. Non-npm resolutions (workspace, patch, file) are skipped automatically. Yarn 1 behavior is unchanged.
- Curated in-repo vulnerable example fixtures under `examples/` for contributor testing, covering direct-fixable, transitive-path-high, transitive-only, direct-and-transitive, npm workspace, yarn-berry, and a documentation-site project. A readme documents each fixture's purpose, package manager, and scan command.
- New CLI Reference documentation page listing every flag with defaults, descriptions, examples, and mutual-exclusion notes.

### Fixed
- BFS path-expansion loop in npm lockfile graph traversal no longer hangs on lockfiles with cyclic or fan-in dependency graphs. Added `MAX_PATH_DEPTH = 10` to cap path length and replaced `O(n)` `queue.shift()` with an index-based `O(1)` dequeue, eliminating unbounded array allocation and GC pressure that caused 100% CPU hangs on moderately sized lockfiles.
- npm transitive parent chain reconstruction now correctly resolves hoisted packages back to their logical parent using the lockfile dependency declarations.
- Yarn Berry lockfiles no longer throw "Unknown token" on the `__metadata:` block.

### Changed
- Output summary now renders severity counts as a box-drawing table (`Critical`, `High`, `Medium`, `Low`, `Unknown`) instead of inline text, making severity distribution visible at a glance.
- `--all` flag now appends the full findings table in compact (default) mode, not only in `--verbose` mode. The "Tip: use --all…" message is suppressed when `--all` is already active.
- Coverage notes now appear after the findings table in verbose output.
- Documentation sidebar restructured into four labeled groups (Get Running, Fix Issues, Integrate, Reference) with Get Running expanded by default.
- Output guide renamed from "How to Read Verbose Output" to "Reading the Output" and rewritten to cover both compact and verbose output.

## [1.12.1] - 2026-05-02

### Added
- Release tarballs attached to each GitHub release are now cryptographically signed using GitHub's Sigstore-backed Artifact Attestations. The signing keys are ephemeral OIDC-issued keys generated per build, so no long-lived private signing key exists on either GitHub or the npm registry. Verification is documented in the README under "Security and verification" using `gh attestation verify cve-lite-cli-X.Y.Z.tgz --repo OWASP/cve-lite-cli`.
- New `## Governance` section in the README documenting the project's governance model, key roles, decision-making process, and dispute-resolution path.
- New `## Security and verification` section in the README explaining how to verify a downloaded release tarball and how to verify the npm-installed copy via `npm audit signatures`.
- New `## Coding standards` section in the contributor guide describing the TypeScript style baseline, naming conventions, comment policy, and the categories of change that get pushed back during review.

### Changed
- The Code of Conduct has moved from `src/docs/CODE_OF_CONDUCT.md` to `CODE_OF_CONDUCT.md` at the repository root so GitHub auto-detects it on the Community Standards page. The CoC text itself is unchanged, and a link was added to the Community section of the README.
- The contributor guide's testing expectations are now an explicit policy rather than a soft suggestion: any new feature, behavior change, or bug fix that affects scan logic, parsing, output, or remediation must be covered by automated unit tests in the same pull request, with practical exceptions called out for documentation-only and genuinely untestable changes.

## [1.12.0] - 2026-05-02

### Added
- HTML report findings now show the actual fix command (e.g. `npm install <package>@<version>`) with a Copy button when one is available, instead of always showing a descriptive prose recommendation. Findings without a runnable command show the recommendation as plain text without a misleading Copy button.
- Serialized findings now expose a `runnableFixCommand: string | null` field for programmatic consumers of the JSON output.
- New "Offline vs Online Results" documentation page explaining the two advisory sources, what stays the same across modes, the intentional behavior differences (registry-validated fix versions, parent-version upgrades), and freshness considerations on both sides.

### Fixed
- Offline scans now produce a Suggested Fix Plan that matches online scans for direct upgrades and in-range parent updates. Previously the fix plan was empty in offline mode because the validation gate treated an unset `validatedFirstFixedVersion` as "validation failed" rather than "validation did not run".
- Offline transitive remediation is now resolved against the lockfile graph, with safe-child candidates synthesized from the advisory's `firstFixedVersion` when the npm registry is not available. The "update parent within current range" path now works offline; the "upgrade parent to a newer version" path remains online-only because it requires the parent's published manifests.
- Withdrawn OSV advisories are now skipped during local advisory database sync, mirroring OSV's `/v1/querybatch` behavior. Offline scans no longer surface findings from advisories that have been retracted.

### Changed
- The repository's user-facing documentation now lives exclusively under `website/docs`, which backs the published site at `https://owasp.org/cve-lite-cli/`. Documentation links in the README point at the published guides rather than at Markdown source files. The previous `/docs` directory has been removed.
- GitHub Actions workflows updated to current versions.
- Public site homepage layout polished for better readability across viewport sizes.

## [1.11.0] - 2026-04-30

### Added
- npm transitive remediation now builds a logical dependency graph from `package-lock.json` so hoisted packages can be mapped back to their actual parent chain.
- npm transitive findings can now recommend `npm update <parent>` when a safe child version is reachable within the current parent dependency range.
- The CLI now shows progress while analyzing vulnerability findings after advisory details are loaded, avoiding a silent pause during fix-target validation and transitive remediation analysis.

### Fixed
- npm workspace scans now preserve workspace-local package path context for dependency paths and remediation resolution.
- npm transitive parent upgrade recommendations now respect parent dependency ranges before suggesting a target.
- npm alias nodes in package locks now keep their alias identity when building the remediation graph.

## [1.10.0] - 2026-04-28

### Added
- HTML report now includes breaking change indicators, validation statistics, scan notes, and a search/filter control in the findings table.

### Fixed
- Transitive vulnerability findings now display tier-aware, actionable guidance instead of the generic "Upgrade the parent dependency chain" message. When a primary parent package is identified, it is named explicitly. When no dependency path data is available, the output honestly says so and directs developers to inspect their lockfile.
- Fix plan skip reasons now distinguish between findings where a parent is known but no safe upgrade version was identified (Tier 2) and findings with no dependency path data at all (Tier 3).
- Urgent fix plan table now renders parent-upgrade targets in their own table with a Context column showing which vulnerable package each parent upgrade resolves.

### Changed
- CI integration docs updated to reference the `OWASP/cve-lite-cli` GitHub Action and include the `--all` flag in example commands.
- Comparison docs expanded with a dedicated GitHub Dependabot section covering advisory database differences, methodology, and where CVE Lite CLI provides more actionable output.

## [1.9.0] - 2026-04-25

### Added
- `--report [dir]` flag generates a self-contained HTML vulnerability dashboard written to a local directory (default: `./cve-report/`). The report opens automatically in the browser on completion.
- `--no-open` flag suppresses the automatic browser launch when used with `--report`.
- HTML report includes severity summary cards, an interactive findings table with filter controls, copy-ready fix commands, expandable dependency paths, and CVE/GHSA links to osv.dev and GitHub Security Advisories.
- Report output includes `index.html` (self-contained, no CDN required) and `report.json` (machine-readable scan data).
- CVE Lite CLI is now an OWASP Incubator Project. OWASP Foundation affiliation reflected in the report header and README.

## [1.8.0] - 2026-04-21

### Added
- Usage-aware dependency analysis phase 1: The CLI now statically analyzes project source code to detect if vulnerable dependencies are actually imported and reachable.
- Added `--usage` and `--only-used` flags. `Used` findings bubble to the top, and `--only-used` aggressively filters out unreachable/unused dependencies to eliminate noise.
- CLI tables now feature a dedicated `Usage` column indicating import counts or `unused` status, color-coded red and green.
- Migrated the breaking change annotation into its own dedicated `Breaking?` column with a `⚠` symbol in the fix plan tables.

## [1.7.1] - 2026-04-18

### Fixed
- Pre-release versions (e.g. `-next.*`, `-beta.*`, `-alpha.*`, `-rc.*`) are now suppressed as fix targets across all three resolution paths: OSV advisory data, parent upgrade resolution, and direct fix validation. When the only available fixed version is a pre-release, the fix hint shows `—` and no fix command is generated.

## [1.7.0] - 2026-04-17

### Added
- pnpm lockfile v9 support — the v9 format (default in current pnpm installations) uses `name@version` keys and a `snapshots` section instead of the legacy `/name/version` and `packages` layout; the parser now branches on `lockfileVersion` and routes v9+ lockfiles through a dedicated path, eliminating false negatives on modern pnpm projects
- Analog case study — full scan-fix workflow on a real pnpm v9 Angular monorepo (3,367 packages), including a comparison table against `pnpm audit`, fix journey, and baseline findings table
- Baseline findings tables backported to NestJS and Juice Shop case studies for structural consistency across all studies

### Fixed
- BFS path-tracking in the pnpm parser replaced path-fingerprint `seenPaths` with a visited-key `seenKeys` set, eliminating exponential queue growth through circular dependency chains in large lockfiles (e.g. Analog's 15 circular deps)

## [1.6.0] - 2026-04-16

### Added
- `bun.lock` parser — resolves package names and versions from Bun's JSONC lockfile format (v1.1.38+), with dev-only detection via workspace dependency manifests and `--prod-only` support
- `bun add` fix commands — fix command output now detects Bun projects and emits `bun add <package>@<version>` alongside the existing npm/pnpm/yarn equivalents
- Breaking change labels — fix command tables now flag major-version upgrade targets (e.g. `8.5.1 → 9.0.0`) with a `(breaking change)` annotation so developers know before running the command

## [1.5.4] - 2026-04-16

### Fixed
- OSV `MODERATE` severity label now correctly maps to `medium` — packages like `got` and `micromatch` were previously classified as `unknown` and excluded from the default medium+ findings table
- Validation table (Package / Current / Recommended target / Versions scanned / Still known vulnerable) now renders for urgent (high/critical) direct fix sections; it was missing after packages were reclassified from low to high by the CVSS vector fix in v1.5.3
- Transitive findings without a parent upgrade path no longer appear in the no-auto-fix section; they are already covered by fix plan step 2, so the duplication was confusing

### Changed
- Renamed "Not included automatically" to "No auto-fix command available for these direct dependencies" to accurately describe what is shown

## [1.5.3] - 2026-04-16

### Fixed
- CVSS vector strings (e.g. `CVSS:3.1/AV:N/...`) were misclassified as low severity because the version number in the prefix (`3.1`) was extracted by the score parser and treated as a base score. All CVSS_V3-backed advisories now fall through to `database_specific.severity` and report the correct label. Packages like `crypto-js` (critical) and `braces` (high) were previously silently under-reported.

### Changed
- condensed README and extracted detailed content into standalone docs: offline advisory DB guide, CI integration guide, architecture overview, comparison guide, roadmap, troubleshooting, and parser coverage matrix
- docs site updated with SEO meta tags, Open Graph, Twitter Card, JSON-LD structured data, Free/Local/Fast hero pillars, badge section, and GitHub icon nav link
- screenshots shown side-by-side with click-to-enlarge
- removed unimplemented SARIF claims from all docs and comparison tables

## [1.5.2] - 2026-04-10

### Added
- scoped `--fix` mode for validated direct dependency remediation with package-manager-native apply behavior
- automatic rescan after successful `--fix` apply and concise fix summary output (applied fixes, skipped findings, remaining severity mix)
- dedicated `--fix` documentation guide and refreshed website/README guidance
- Juice Shop case-study evidence for `--fix` workflow output

### Changed
- CLI now includes explicit `--fix` help output and improved fix-phase progress messaging
- README comparison table now includes an explicit auto-fix support column with caveated tool-by-tool notes

## [1.5.1] - 2026-04-10

### Changed
- direct vs transitive relationship classification now treats only root manifest-declared dependencies as direct, reducing misleading root-level remediation commands in monorepo/tooling-heavy scans
- verbose fix-command output now renders parent-upgrade sections in a structured table with package, current version, recommended target, and context columns
- README, website copy, and NestJS case study wording now align with direct/transitive remediation actionability expectations and refreshed screenshot evidence

## [1.5.0] - 2026-04-09

### Added
- lowest known non-vulnerable direct remediation target selection based on advisory-range validation across published versions
- version-scan metrics for validated remediation targeting (scanned versions and still-vulnerable exclusions)
- new automated tests for multi-step upgrade chains, overlapping advisories, and fallback behavior when advisory coverage is incomplete
- richer NestJS case-study evidence with remediation table metrics and screenshot-backed command snapshots

### Changed
- direct remediation output now uses structured table rendering with package, current version, recommended target, scanned versions, and still known vulnerable columns
- direct remediation tables now include a total row for consistent section-level summary in verbose output
- compact output now includes validation-summary context when scanned-version metrics are available
- README guidance now explains the lowest-known-non-vulnerable targeting flow and references the NestJS remediation evidence

## [1.4.0] - 2026-04-06

### Added
- npm registry validation for direct fixed-version hints before surfacing copy-and-run commands
- nearest-published fallback handling for unpublished npm fixed-version hints, with a dedicated registry-adjusted command section
- explicit warning output for unpublishable fixed-version hints that cannot be turned into runnable commands
- new NestJS case study documenting the local scan-fix-rescan workflow on a mainstream framework repository

### Changed
- Suggested fix commands now cover more than the urgent path, including additional direct fixes when confident targets are available
- Verbose and compact output now highlight copy-and-run remediation commands more prominently and explain when the top-priority issue has no confident automatic command yet
- README now positions the local remediation loop more clearly against slower pipeline-only scanning workflows
- Case study and README content now emphasize how local caching keeps consecutive rescans fast during iterative remediation

## [1.2.0] - 2026-04-04

### Added
- Reusable first-party GitHub Action via `action.yml` for simple GitHub Actions adoption
- Official workflow integration guidance for package scripts, opt-in `postinstall`, git hooks, CI, and scheduled advisory DB refreshes
- Multi-column README table of contents for easier navigation

### Changed
- Simplified the reusable GitHub Action by removing built-in npm cache setup, improving reliability in external repositories
- README now includes GitHub Action usage examples and clearer top-level navigation
- Network and privacy documentation now reflects the current offline workflow and advisory DB operational model

## [1.1.1] - 2026-04-04

### Added
- Advisory DB freshness reporting during offline scans, including warnings when the local DB appears stale or is missing sync metadata

### Changed
- Advisory sync ingestion is now significantly faster through bulk SQLite transactions and prepared statement reuse
- README now documents the measured advisory sync benchmark and keeps the offline freshness guidance aligned with the shipped behavior

## [1.1.0] - 2026-04-04

### Added
- Local SQLite advisory database foundation for offline advisory lookups
- `cve-lite advisories sync` command to download the official OSV npm dump and build the local advisory DB
- Offline scanning with `--offline` using the default local advisory DB
- Explicit local DB selection with `--offline-db <path>`
- Progress reporting during advisory DB sync, including download and ingest progress

### Changed
- CLI output now reports when offline mode is enabled and when the local advisory DB is being used as the advisory source
- README now highlights offline advisory DB support, offline workflows, and scheduled DB refresh guidance more prominently
- Coverage notes now clarify that offline scans do not make outbound advisory API calls

## [1.0.6] - 2026-04-02

### Added
- Best-effort parent upgrade guidance for transitive vulnerabilities
- Verbose output now shows recommended parent upgrades when available while preserving full dependency paths

### Changed
- Compact output now surfaces more actionable remediation guidance for transitive issues
- README updated to reflect the new remediation behavior

## [1.0.5] - 2026-04-01

### Added
- Configurable OSV endpoint support

### Changed
- README updates and documentation fixes
