# override-audit-cli

Hygiene auditor for npm and pnpm package `overrides` blocks. Detects:

- Orphaned override targets (no longer in the resolved tree)
- Floating-tag pins (`latest`, `next`, non-semver)
- Misplaced override sections (`pnpm.overrides` in an npm project, or vice versa)
- Installed versions that have surpassed concrete pins (override is no-op)
- Ineffective nested-object overrides (npm-only syntax with 5 sub-conditions)

**Status:** v0.1.0 — detection only. `--fix` lands in v0.2.0.

## Install

```bash
npm install -g @hexaxia-labs/override-audit-cli
```

## Usage

```bash
override-audit                       # audit cwd
override-audit /path/to/project      # audit specific directory
override-audit --json                # JSON output (for CI / orchestrators)
override-audit --severity high       # only high+ findings
```

## License

MIT
