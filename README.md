# override-audit-cli

[![CI](https://img.shields.io/github/actions/workflow/status/Hexaxia-Labs/override-audit-cli/ci.yml?branch=main&label=CI)](https://github.com/Hexaxia-Labs/override-audit-cli/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Hexaxia-Labs/override-audit-cli?include_prereleases&sort=semver&display_name=tag)](https://github.com/Hexaxia-Labs/override-audit-cli/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-43853d?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/github/license/Hexaxia-Labs/override-audit-cli)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fa6673?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org)

Hygiene auditor for npm and pnpm package `overrides` blocks.

`override-audit` catches override hygiene problems that no other tool currently surfaces:

- **Orphaned override targets** — the package you're pinning isn't in the resolved tree.
- **Floating-tag pins** — `"latest"` / `"next"` / non-semver pins that defeat the override on every install.
- **Misplaced sections** — `pnpm.overrides` in an npm project (silently ignored), or vice versa.
- **Surpassed pins** — the installed version is already newer than your concrete pin.
- **Ineffective nested overrides** — the npm-only `{ parent: { inner: ver } }` shape, with five sub-conditions covering non-npm, orphaned outer, orphaned inner, leaky, and stylistic-suspect cases.

**Status:** `v0.1.0` — detection only. `--fix` lands in `v0.2.0`. HexOps `ScanSource` integration lands in `v1.0.0`.

## Install

```bash
npm install -g @hexaxia-labs/override-audit-cli
```

Or run without installing:

```bash
npx @hexaxia-labs/override-audit-cli
```

## Usage

```bash
override-audit                       # audit cwd
override-audit /path/to/project      # audit specific directory
override-audit --json                # JSON output (for CI / orchestrators)
override-audit --severity high       # only high+/critical findings (CI gate friendly)
override-audit --rule OA005.e=off    # silence info-level "suspect" nested findings
override-audit --with-registry       # enable OA007 frozen-latest (needs network)
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no findings at or above `--severity` |
| `1` | Findings present (above threshold) |
| `2` | Internal error (bad input, unknown flag) |

## Rule reference

| Rule | Severity | Catches |
|---|---|---|
| `OA001-ORPHAN-TARGET` | low | Override target not in resolved tree |
| `OA002-FLOATING-TAG` | medium | Pin uses `latest`/`next`/`*`/non-semver |
| `OA003-WRONG-SECTION` | high | `pnpm.overrides` in npm project (or vice versa) |
| `OA004-INSTALLED-NEWER` | low | Installed version surpassed concrete pin |
| `OA005-NESTED-OVERRIDE` | info–critical | Nested-object override (5 sub-codes) |
| `OA006-COUPLED-PLATFORM-BINARY` | high / medium | Override fights an exact-pinned parent. **High** for platform binaries (`@esbuild/<platform>` vs `esbuild`) or when OA008 confirms failure; **medium** for non-platform targets where the override is currently effective. |
| `OA007-FROZEN-LATEST` | high | `"latest"` pin resolved long ago, registry has moved on (`--with-registry`) |
| `OA008-VULNERABLE-TWIN` | critical | Vulnerable copy still on disk despite override floor — post-install verification |

OA005 sub-codes: `.a-NON-NPM` (critical), `.b-ORPHANED-OUTER` (high), `.c-ORPHANED-INNER` (high), `.d-LEAKY` (medium), `.e-SUSPECT` (info, off by default).

`OA007` requires opt-in network access via `--with-registry`. All other rules run offline.

Per-rule reference docs live in [`docs/rules/`](docs/rules/).

## Roadmap

- **v0.2.0** — `--fix` with RFC 6902 patches, post-fix re-detection, HexOps `remediation_*` change-control logging.
- **v1.0.0** — HexOps `OverrideAuditSource` integration (consumed as the fourth `ScanSource` alongside cve-lite, grype, pnpm-audit).
- **v1.1.0** — yarn `resolutions` support; optional GitHub Action wrapper.
- **v2.0** — bun overrides; optional `--with-registry` for deprecated-parent detection.

## Why this exists

Two long-open pnpm issues ([#9852](https://github.com/pnpm/pnpm/issues/9852), [#5949](https://github.com/pnpm/pnpm/issues/5949)) ask for this functionality in `pnpm audit`. It isn't there yet, and the equivalent doesn't exist for npm either. `override-audit-cli` fills the gap as a focused, dependency-light, local-first tool that any project can adopt.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for project layout, the detector contract, how to add a new rule, and release conventions. The full change history lives in [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
