<p align="center">
  <a href="https://github.com/Hexaxia-Labs"><img alt="Hexaxia Labs" src="https://img.shields.io/badge/Hexaxia%20Labs-A3E635?style=for-the-badge&labelColor=0B0E14&color=A3E635&logoColor=A3E635"></a>
</p>

# override-audit-cli

**Hygiene auditor for npm and pnpm package `overrides`.**

[![CI](https://img.shields.io/github/actions/workflow/status/Hexaxia-Labs/override-audit-cli/ci.yml?branch=main&label=CI&logo=github)](https://github.com/Hexaxia-Labs/override-audit-cli/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/Hexaxia-Labs/override-audit-cli?display_name=tag&color=blue)](https://github.com/Hexaxia-Labs/override-audit-cli/releases)
[![license](https://img.shields.io/github/license/Hexaxia-Labs/override-audit-cli?color=A3E635)](LICENSE)
[![tests](https://img.shields.io/badge/tests-200%20passing-A3E635?logo=jest&logoColor=white)](#)
[![detectors](https://img.shields.io/badge/detectors-8-A3E635)](docs/rules/)
[![node](https://img.shields.io/badge/node-%E2%89%A518-A3E635?logo=node.js&logoColor=white)](https://nodejs.org)
[![typescript](https://img.shields.io/badge/typescript-5.x-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

---

Most override-hygiene tools cover one dimension: do the version strings look right? That misses the actual failure modes. An override can be syntactically perfect and silently non-functional, or it can look risky but actually be working, or it can be frozen by the lockfile while you believe it's tracking latest. `override-audit-cli` covers eight failure modes across two phases (static analysis of `package.json` and post-install verification of what's actually on disk), then offers to fix what it can.

| Dimension | What it answers | How |
|---|---|---|
| **Presence** | Is the override target actually in the resolved tree? | `OA001` against lockfile |
| **Pin shape** | Is the version pin meaningful and durable? | `OA002` (floating tags) / `OA004` (surpassed pins) |
| **Section** | Is the override in the section the package manager actually reads? | `OA003` (npm vs pnpm) |
| **Nested form** | Does the parent-scoped override actually have something to apply to? | `OA005` (five sub-conditions) |
| **Parent coupling** | Is the override fighting an exact-pinned parent? | `OA006` (platform-binary coupling) |
| **Registry drift** | Has `"latest"` quietly resolved to a stale version? | `OA007` (opt-in network) |
| **Materialized risk** | Is a vulnerable copy still on disk despite the override floor? | `OA008` (recursive node_modules walk) |

A scan blends all of these into a single ranked list of findings. `--fix` applies the RFC 6902 patches detectors emit and rewrites `package.json` atomically. Every step can stream NDJSON change-control records for orchestrator audit trails.

## Status

`v0.3.0` ships detect + fix + structured change-control logging. `HexOps ScanSource` integration lands in `v1.0.0`.

## Install

```bash
npm install -g @hexaxia-labs/override-audit-cli
```

Or run without installing:

```bash
npx @hexaxia-labs/override-audit-cli
```

## Quick start

```bash
override-audit                       # audit cwd
override-audit /path/to/project      # audit specific directory
override-audit --json                # JSON output (for CI / orchestrators)
override-audit --severity high       # only high+/critical findings (CI gate friendly)
override-audit --rule OA005.e=off    # silence info-level "suspect" nested findings
override-audit --with-registry       # enable OA007 frozen-latest (needs network)
override-audit --fix --dry-run       # preview what --fix would change
override-audit --fix                 # apply RFC 6902 patches, rewrite package.json, rescan
override-audit --fix --log-file out.log --source ci --advisory GHSA-xxx \
                    --meta repo=myapp --meta runner=local
                                     # emit NDJSON change-control records for HexOps
```

**[See the full Usage Guide](docs/usage.md)** for a task-oriented walkthrough: first run, reading findings, workflows for daily dev / security incident response / CI gate, filtering, network features, troubleshooting, and common pitfalls.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean: no findings at or above `--severity` |
| `1` | Findings present (above threshold) |
| `2` | Internal error (bad input, unknown flag) |

## Rule reference

| Rule | Severity | Catches |
|---|---|---|
| `OA001-ORPHAN-TARGET` | low | Override target not in resolved tree |
| `OA002-FLOATING-TAG` | medium | Pin uses `latest`/`next`/`*`/non-semver |
| `OA003-WRONG-SECTION` | high | `pnpm.overrides` in npm project (or vice versa) |
| `OA004-INSTALLED-NEWER` | low | Installed version surpassed concrete pin |
| `OA005-NESTED-OVERRIDE` | info to critical | Nested-object override (5 sub-codes) |
| `OA006-COUPLED-PLATFORM-BINARY` | high / medium | Override fights an exact-pinned parent. **High** for platform binaries (`@esbuild/<platform>` vs `esbuild`) or when OA008 confirms failure; **medium** for non-platform targets where the override is currently effective. |
| `OA007-FROZEN-LATEST` | high | `"latest"` pin resolved long ago, registry has moved on (`--with-registry`) |
| `OA008-VULNERABLE-TWIN` | critical | Vulnerable copy still on disk despite override floor (post-install verification) |

OA005 sub-codes: `.a-NON-NPM` (critical), `.b-ORPHANED-OUTER` (high), `.c-ORPHANED-INNER` (high), `.d-LEAKY` (medium), `.e-SUSPECT` (info, off by default).

`OA007` requires opt-in network access via `--with-registry`. All other rules run offline.

Per-rule reference docs live in [`docs/rules/`](docs/rules/).

## Change-control logging

Every `--fix` run can stream structured NDJSON records to a log file for orchestrators, audit dashboards, or CI archives to consume. Detect-only runs and `--fix` runs **without** `--log-file` emit nothing.

```bash
override-audit \
  --fix --with-registry \
  --attempt-id rem_abc-123 \
  --source ci \
  --advisory GHSA-xxxx-yyyy-zzzz \
  --meta repo=myapp --meta runner=gha \
  --log-file /var/log/override-audit.log \
  /path/to/project
```

One JSON record per line. A run emits in order: `remediation_attempt` (once, with `attemptId`/`source`/`advisory`/`meta` context) → 0..N of `remediation_applied`/`remediation_failed`/`remediation_skipped` interleaved → `remediation_complete` (once, with summary + `exitCode`).

Sample (truncated):

```jsonl
{"type":"remediation_attempt","attemptId":"rem_abc-123","source":"ci","advisory":"GHSA-xxxx-yyyy-zzzz","meta":{"repo":"myapp","runner":"gha"},"dryRun":false,"projectPath":"/path/to/project",…}
{"type":"remediation_applied","ruleId":"OA006-COUPLED-PLATFORM-BINARY","package":"postcss","patches":[{"op":"remove","path":"/overrides/postcss"},{"op":"add","path":"/overrides/next","value":">=16.2.6"}],…}
{"type":"remediation_complete","summary":{"applied":3,"skipped":1,"failed":1,"remainingFindings":1,"newFindings":1},"exitCode":1,…}
```

### Flags

| Flag | Effect |
|---|---|
| `--log-file <path>` | Append NDJSON records to `<path>`. Off by default. |
| `--log-level <level>` | Threshold: `debug` / `info` / `warn` / `error`. Default `info`. |
| `--attempt-id <id>` | Externally-supplied attempt ID. Threads through every record. Defaults to `rem_<uuid>`. |
| `--source <name>` | What initiated the run (e.g. `ci`, `manual`, `scheduled`). |
| `--advisory <id>` | Link the run to an advisory ID (e.g. `GHSA-xxxx-...`). |
| `--meta <key=value>` | Repeatable freeform metadata. Gathered onto `remediation_attempt`. |

### Full reference

[`docs/change-control-logging.md`](docs/change-control-logging.md) has the field-by-field schema for every record type, level semantics, consumer recipes (`jq` snippets for advisory aggregation, per-attempt outcomes, streaming with `tail -F`), guarantees (append-only, schema stability), and what's explicitly not logged.

## Programmatic usage

Embed the library directly instead of shelling out:

```ts
import { scan, fix } from '@hexaxia-labs/override-audit-cli';
import { FileLogger } from '@hexaxia-labs/override-audit-cli';
import type { FixReport } from '@hexaxia-labs/override-audit-cli';

const result = await scan('/path/to/project', { withRegistry: true });
console.log(`${result.findings.length} findings`);

const logger = new FileLogger('/var/log/override-audit.log');
const report: FixReport = await fix(
  result,
  { dryRun: false, rescan: true, severityFloor: 'low', ruleFilters: new Map(), includeSubSuspect: false },
  'rem_my-attempt-id',
  logger,
  { toolVersion: '0.3.0', source: 'my-orchestrator', advisory: 'GHSA-...', meta: { env: 'prod' } },
);
logger.close();
```

See [`docs/architecture.md`](docs/architecture.md) for the full data-flow + extension recipes.

## Roadmap

- **v0.3.x**: `--install` / `--no-install` (auto-run `npm install` after `--fix`).
- **v1.0.0**: HexOps `OverrideAuditSource` integration (consumed as the fourth `ScanSource` alongside cve-lite, grype, pnpm-audit).
- **v1.1.0**: yarn `resolutions` support; optional GitHub Action wrapper.
- **v2.0**: bun overrides; optional registry-driven deprecated-parent detection.

## Why this exists

Two long-open pnpm issues ([#9852](https://github.com/pnpm/pnpm/issues/9852), [#5949](https://github.com/pnpm/pnpm/issues/5949)) ask for this functionality in `pnpm audit`. It isn't there yet, and the equivalent doesn't exist for npm either. `override-audit-cli` fills the gap as a focused, dependency-light, local-first tool that any project can adopt.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for project layout, the detector contract, how to add a new rule, and release conventions. The full change history lives in [CHANGELOG.md](CHANGELOG.md).

## About Hexaxia Labs

`override-audit-cli` is part of [Hexaxia Labs](https://github.com/Hexaxia-Labs), the open source arm of the [Hexaxia Group](https://www.hexaxia.com). Infrastructure tooling and security baselines from [Hexaxia Technologies](https://www.hexaxia.tech), AI infrastructure work from [Hexaxia AI](https://www.hexaxia.ai), made general enough to be useful elsewhere.

## License

MIT. See [LICENSE](LICENSE).
