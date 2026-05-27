export const HELP_TEXT = `
override-audit  —  hygiene auditor for npm/pnpm package overrides

Usage:
  override-audit [path] [flags]

  path                          Project directory to audit (default: cwd)

DETECTION
  --severity <level>            Minimum severity to report (critical|high|medium|low|info)
                                Default: low.
  --rule <code>[=on|off]        Enable/disable specific rules. Repeatable.
                                Examples:  --rule OA002=off
                                           --rule OA005.e=off
  --include-sub-suspect         Include OA005.e-SUSPECT (info-level) findings in output.
  --with-registry               Opt in to network calls (registry.npmjs.org) for OA007.
                                Off by default — runs are local-only.
  --registry-timeout <ms>       Per-request timeout for registry calls. Default 5000.

OUTPUT
  --json                        Emit JSON OverrideAuditOutput to stdout.
  --no-color                    Reserved for future color support.

  -h, --help                    Show this help.
  -V, --version                 Print version.

DETECTORS
  OA001-ORPHAN-TARGET           Override target not in resolved tree
  OA002-FLOATING-TAG            Pin uses 'latest'/'next'/'*'/non-semver
  OA003-WRONG-SECTION           pnpm.overrides in npm project (or vice versa)
  OA004-INSTALLED-NEWER         Installed version surpassed concrete pin
  OA005-NESTED-OVERRIDE         Nested-object override (5 sub-conditions)
  OA006-COUPLED-PLATFORM-BINARY Override fights an exact-pinned parent
  OA007-FROZEN-LATEST           'latest' pin frozen behind registry (--with-registry)
  OA008-VULNERABLE-TWIN         Vulnerable copy still on disk despite override floor

EXIT CODES
  0   no findings at or above --severity
  1   findings present (CI gating)
  2   internal error (bad input, unreadable file, unknown flag)

Coming in v0.2.0: --fix, --dry-run, --attempt-id, --source, --log-file
                  (auto-rewrite of package.json + change-control logging)

Repo: https://github.com/Hexaxia-Labs/override-audit-cli
`.trim();
