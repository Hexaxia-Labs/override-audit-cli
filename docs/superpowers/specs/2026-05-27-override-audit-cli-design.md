# override-audit-cli — Design Spec

**Status:** Proposed
**Date:** 2026-05-27
**Author:** Aaron Lamb (alamb-hex), Claude Opus 4.7
**Repo (planned):** `Hexaxia-Labs/override-audit-cli` (private initially; public when proven)
**npm (planned):** `@hexaxia-labs/override-audit-cli` (binary: `override-audit`)
**License (planned):** MIT (when public)

---

## 1. Overview

`override-audit-cli` is a standalone CLI tool that audits package-manager override declarations (`overrides` / `pnpm.overrides`) in npm and pnpm projects for hygiene problems that no existing tool catches: orphaned targets, floating-tag pins, misplaced sections, surpassed pins, and the ineffective-nested-override class.

The tool is a sibling to [`cve-lite-cli`](https://github.com/OWASP/cve-lite-cli) and [`supply-sentinel`](https://github.com/Hexaxia-Labs/supply-sentinel) in the Hexaxia-Labs OSS security CLI family. Like them, it is local-first, terminal-friendly, emits structured JSON for orchestrators, and will be embedded into HexOps as a `ScanSource` plugin after standalone validation.

### 1.1 Problem statement

The npm/pnpm ecosystem has no purpose-built tool for override hygiene. Confirmed gaps (May 2026):

| Tool | Coverage gap |
|---|---|
| `pnpm audit --fix=update` | Forward-only — no cleanup of stale/dead overrides. |
| `npm audit fix` | Same direction problem. |
| `knip` / `depcheck` | Out of scope — they check unused imports vs declared deps; don't touch overrides. |
| Snyk / Socket / Renovate | Open PRs but don't audit existing override blocks. |

Two long-open pnpm issues explicitly ask for this feature:
- [pnpm#9852](https://github.com/pnpm/pnpm/issues/9852) — "pnpm audit, add override no longer needed check"
- [pnpm#5949](https://github.com/pnpm/pnpm/issues/5949) — "pnpm audit command should detect which overrides can be removed after CVE was fixed"

HexOps already implements partial detection in `cleanStaleOverrides` (`src/lib/updaters/override.ts:62`) and `readActiveOverrides` (`src/lib/patch-scanner.ts:81`), but with known gaps documented in the brainstorming transcript: nested-object overrides are silently skipped by both, floating-tag pins are silently no-op'd by `cleanStaleOverrides` (NaN-compare bug), and PM-section mismatches (the recurring hexcms/hexcms-studio footgun) are not detected at all.

### 1.2 Concrete motivating example

The `hexmetrics` project (`/home/aaron/Projects/hexmetrics`, npm) carries:

```json
"overrides": {
  "postcss": "8.5.15",
  "@esbuild-kit/core-utils": { "esbuild": "^0.25.0" },
  "@esbuild/linux-x64": "latest"
}
```

The first entry is fine. The second is a nested-object override against a deprecated parent — silently skipped by HexOps' active-overrides panel and stale-cleanup logic. The third pins to `latest`, which defeats the override (every install re-resolves) and silently no-ops `cleanStaleOverrides`. `cve-lite-cli` correctly reports zero CVE findings for the project — vulnerability scanning is not the right surface for these problems.

---

## 2. Goals & Non-Goals

### 2.1 Goals (v1)

- Detect five classes of override hygiene problems in npm and pnpm projects (Section 4).
- Emit structured JSON output (Section 6) that maps 1:1 onto HexOps' `Finding` interface.
- Support `--fix` with safe, predictable, indent-preserving rewrites of `package.json` (Section 8).
- Adopt HexOps' change-control logging methodology verbatim (Section 5) so the CLI's log trail joins HexOps' server-side trail when embedded.
- Mirror the architectural shape of `cve-lite-cli` and `supply-sentinel` (Section 3) so the three Hexaxia-Labs security CLIs share patterns.
- Ship purely static — no network calls, no remote data, no sync DB. Vulnerability awareness is explicitly deferred.

### 2.2 Non-goals (v1)

- **Yarn `resolutions` support** — deferred to v1.1.
- **Bun overrides support** — deferred to v2.
- **CVE/advisory awareness** ("this override was added for CVE-X, now fixed at version Y") — belongs in `cve-lite-cli` or a future `override-audit-vuln` module; requires OSV.
- **Deprecated-parent detection** — requires `npm view` network calls; violates static-only constraint. Deferred.
- **GitHub Action** — deferred to v1.1; ships as CLI only at v1.0.
- **Custom rule plugins / config file** (ESLint-style rule engine) — YAGNI for v1's fixed detector set. Approach B from the brainstorming, deliberately not chosen.
- **Hosted dashboard / SaaS UI** — out of scope forever; HexOps is the dashboard.
- **Workspace/monorepo iteration** — v1 audits one project at a time. Multi-project orchestration is HexOps' job.

---

## 3. Architecture

### 3.1 Approach

**Approach A from the brainstorming:** mirror `cve-lite-cli` and `supply-sentinel`. Single binary with flags, detectors as pure-function modules in `src/detectors/`. Justification: both sibling tools use this shape, making it a Hexaxia-Labs convention. HexOps gets a uniform `ScanSource` wrapper pattern across three security CLIs. No rule-engine machinery, no config file, no plugin loader — all YAGNI for v1.

### 3.2 Repository layout

```
override-audit-cli/
├── src/
│   ├── cli/
│   │   ├── index.ts              # bin entrypoint
│   │   ├── args.ts               # hand-rolled arg parser (matches cve-lite-cli)
│   │   ├── flags.ts              # flag definitions, defaults
│   │   └── help.ts               # help text
│   ├── parsers/
│   │   ├── package-manager.ts    # detect npm | pnpm by lockfile
│   │   ├── package-json.ts       # read manifest, extract override blocks
│   │   ├── lockfile.ts           # "is package X resolved anywhere?"
│   │   └── node-modules.ts       # installed-version reader
│   ├── detectors/
│   │   ├── orphan.ts             # OA001
│   │   ├── floating-tag.ts       # OA002
│   │   ├── wrong-section.ts      # OA003
│   │   ├── installed-newer.ts    # OA004
│   │   └── nested-override.ts    # OA005 (with 5 sub-codes)
│   ├── fixer/
│   │   ├── plan.ts               # finding → RFC 6902 patch
│   │   └── apply.ts              # indent-preserving package.json writer
│   ├── output/
│   │   ├── human.ts              # TTY renderer with chalk
│   │   └── json.ts               # JSON output to stdout
│   ├── log/
│   │   └── change-control.ts     # NDJSON emitter, attemptId management
│   ├── scanner.ts                # orchestrator: parse → detect → assemble
│   ├── types.ts                  # public types: Finding, Patch, OverrideAuditOutput
│   └── index.ts                  # library entry (for future hexops library mode)
├── tests/
│   ├── fixtures/                 # npm + pnpm project skeletons per detector case
│   └── *.test.ts
├── package.json
├── tsconfig.json
├── jest.config.mjs
├── .github/workflows/ci.yml
└── README.md
```

### 3.3 Tech stack

- TypeScript ESM, target ES2022.
- Node ≥ 18 (matches cve-lite-cli).
- Test framework: Jest with ts-jest (matches cve-lite-cli / supply-sentinel).
- Runtime dependencies: **`semver` only** (used by OA002 range validation and OA004 version comparison). Everything else uses Node stdlib.
- No `commander` / `yargs` — hand-rolled arg parser matches sibling tools.
- License: MIT (when public).

### 3.4 Data flow

```
cli/index.ts
  → parse args (cli/args.ts)
  → scanner.scan(projectPath, options)
      → parsers/* build Context
          { pkgJson, pkgManager, lockfileIndex, nodeModulesVersionMap }
      → run each enabled detector against Context
      → assemble Finding[] (dedup overlapping OA001/OA005)
      → if --fix:
          → fixer/plan.ts → RFC 6902 patches
          → fixer/apply.ts → write package.json atomically
          → if not --no-install: run npm/pnpm install
          → re-run scanner.scan() for outcome diff
      → output/json.ts or output/human.ts → stdout
      → log/change-control.ts → stderr NDJSON + optional file
```

---

## 4. Detector Set (v1)

Five detector modules. Each is a pure function `(ctx: Context) => Finding[]`. Stable rule codes enable `--rule` filtering and rule-specific documentation pages.

### 4.1 OA001-ORPHAN-TARGET

**Catches:** Override declared for a package not in the resolved dependency tree. Dead weight; deletion changes nothing.

| | |
|---|---|
| **Severity** | low |
| **Signal** | Override key (after stripping pnpm's `@>=range` specifier) does not appear in `package-lock.json` `packages` map or `pnpm-lock.yaml` `importers`+`packages`. |
| **Fix action** | `remove` |
| **False-positive risk** | Low. Platform-specific optional dependencies handled by checking lockfile-declared deps, not just installed-on-disk presence. |
| **Nested-aware** | When walking the override block, recurses into nested-object values and checks outer parents the same way. Overlap with OA005.b is deduped at the assembler stage (OA005 wins for more specific framing). |

### 4.2 OA002-FLOATING-TAG

**Catches:** Override pinned to a non-semver tag (`latest`, `next`, `*`, `x`, or empty string).

| | |
|---|---|
| **Severity** | medium |
| **Signal** | Pin value matches `/^(latest|next|\*|x|"")$/i` OR fails `semver.validRange`. |
| **Fix action** | `replace` — propose currently-resolved version as concrete `>=X.Y.Z` floor (per the override-floor convention: security pins are floors, not exact). Requires reading `node_modules/<pkg>/package.json` for resolved version. |
| **False-positive risk** | Low. Workspace-protocol pins (`workspace:*`) and `link:` / `file:` paths explicitly skipped. |
| **Why it matters** | Defeats override semantics (every install may re-resolve). HexOps' existing `cleanStaleOverrides` silently no-ops on `"latest"` due to NaN-compare in version parser. |

### 4.3 OA003-WRONG-SECTION

**Catches:** Override block in wrong field for project's package manager.

| | |
|---|---|
| **Severity** | **high** (security pins genuinely non-functional) |
| **Signal** | Detected PM is `npm` AND `pnpm.overrides` present, OR detected PM is `pnpm` AND top-level `overrides` present. |
| **Fix action** | `move` — relocate entries to correct section, preserving values. On per-key value conflict, refuse the move per Section 8 conflict matrix. |
| **False-positive risk** | Very low. Lockfile is authoritative for PM detection. |
| **Why it matters** | Recurring hexcms / hexcms-studio footgun documented in [[managed-projects-reference]]. |

### 4.4 OA004-INSTALLED-NEWER

**Catches:** Installed version has surpassed concrete pin; override no longer load-bearing.

| | |
|---|---|
| **Severity** | low |
| **Signal** | Pin is a concrete version (not a range, not a floating tag); `semver.gt(installed, pin) === true`. |
| **Fix action** | `remove` if **safe**, `suggest` otherwise. Safety requires: resolved parent of the override target depends on `>= pin` natively — i.e. the dep graph would land at-or-above the pin without the override. When safety can't be determined cleanly, downgrade to `info` severity, action becomes `suggest`. |
| **False-positive risk** | Medium without the parent-graph safety check. Mitigated by the action-downgrade rule. |
| **Why it matters** | Equivalent to HexOps' existing `cleanStaleOverrides` but corrects the NaN-compare bug and adds the safety-aware action selection. |

### 4.5 OA005-NESTED-OVERRIDE

**Catches:** Nested-object override entry `{ parent: { inner: ver } }`. npm-only syntax that is silently skipped by every existing tool surface. Single detector with five sub-codes; severity varies by sub-condition.

| Sub-code | Condition | Severity | Fix |
|---|---|---|---|
| `OA005.a-NON-NPM` | Project is not npm (PM is pnpm / yarn). Nested form is npm-only — silently ignored entirely by the package manager. | **critical** | `remove`; emits companion OA003 finding suggesting where the intent should go. |
| `OA005.b-ORPHANED-OUTER` | Outer parent package not in resolved tree (extends OA001 into nested case). | **high** | `remove` — outer parent gone, nested override unreachable. |
| `OA005.c-ORPHANED-INNER` | Outer parent IS in tree, but `inner` is not declared in the parent's own `package.json` deps. Override has no install path to apply to. | **high** | `remove` — parent never installs inner, override never fires. |
| `OA005.d-LEAKY` | Override is effective for the matched parent path, but the same inner dep is installed elsewhere at a version that does not satisfy the pin. Nested form gave only partial coverage. | medium | `suggest` flattening to top-level `overrides.{inner}` for tree-wide effect. |
| `OA005.e-SUSPECT` | Nested form is valid and effective, but a flat top-level override would cover the same case more durably. | info | `suggest` flattening. Excluded from default output (off by default, `--include-sub-suspect` to enable). |

**Why a single detector with sub-codes vs five separate detectors:** All five share the same parsing entry point (walk the override block, find object values). Splitting duplicates traversal code and dilutes the rule namespace. Users learn one finding kind with a precise sub-code for the actual problem. `--rule OA005=off` or `--rule OA005.e=off` both work for filtering.

### 4.6 Detector applicability matrix

| Detector | Needs lockfile | Needs node_modules | Graceful without |
|---|---|---|---|
| OA001 | Yes | No | Skipped + info-level warning when lockfile missing |
| OA002 | No | Yes (for replace-value derivation) | Detected without node_modules; fix action downgraded to `suggest` |
| OA003 | Yes (for PM detection) | No | Detected (PM also derivable from `pnpm-workspace.yaml`, `.npmrc`, `packageManager` field) |
| OA004 | No | Yes | Skipped + info-level warning when node_modules missing |
| OA005 | Yes | Yes | Partial: .a/.b detectable without node_modules; .c/.d/.e require both |

### 4.7 Deliberately excluded from v1

- **Nested-object stylistic warning when valid AND effective** — covered by OA005.e but off by default to avoid noise.
- **Deprecated parent package detection** — requires `npm view` (network). Belongs in future `--with-registry` opt-in or separate tool.
- **CVE-no-longer-exists** (pnpm#5949 case) — requires OSV. Belongs in `cve-lite-cli` or future `override-audit-vuln` module.
- **Yarn `resolutions`** — v1.1.
- **Bun overrides** — v2.

---

## 5. Change-Control Logging

The CLI adopts HexOps' change-control logging methodology (from commits `02b82a1` and `1ab55ed`) **verbatim**. When HexOps embeds the CLI as a plugin, no event translation is required — the CLI's NDJSON events join HexOps' server-side trail directly via `logger.info('security', evt.event, evt.message, { meta: evt.meta })`.

### 5.1 Event vocabulary

Identical to HexOps' `src/app/api/projects/[id]/update/route.ts:90,387,404` and the `remediation/[attemptId]/complete` endpoint:

| Event | Count per `--fix` run | Meta payload |
|---|---|---|
| `remediation_initiated` | 1 (at start, before any write) | `attemptId`, `source`, `parameters: { packages, advisoryIds, severity, lockfileResolution }` — for override-audit, `packages` is the list of override keys being patched and `advisoryIds` is the OA0xx rule codes (override-audit's "advisory" analog). |
| `remediation_install_complete` | 1 (on success) | `attemptId`, `source`, `advisories`, `severity`, `packages` (override keys successfully patched), `installGate` (always `undefined`; CLI does not gate installs). |
| `remediation_install_failed` | 1 (on failure) | `attemptId`, `source`, `advisories`, `severity`, `attemptedPackages`. |
| `remediation_completed` | 1 (at end, after post-fix re-detection) | `attemptId`, `outcome: { status, previousFindingCount, currentFindingCount, findingsCovered, findingsResolved, findingsRemaining }`. |

Field names verbatim from HexOps commits — `findingsCovered/Resolved/Remaining`, `previousFindingCount/currentFindingCount`, `installGate`, `attemptedPackages`. No renames.

### 5.2 Detect-only runs

Detect-only runs (no `--fix`) emit **no** `remediation_*` events. Detection is a read; pretending it's a remediation would muddy semantics. Detect-only progress goes to stderr as plain log lines (or `--log-level debug` for NDJSON form), not into the change-control trail.

### 5.3 Outcome computation

`remediation_completed.outcome` is populated by the post-fix re-detection pass:

- `findingsCovered` — rule codes that the patch plan targeted (always computable).
- `findingsResolved` — rule codes present in initial detection AND absent from post-fix re-detection.
- `findingsRemaining` — rule codes still present after re-detection.
- `previousFindingCount` / `currentFindingCount` — total counts pre and post.
- `status`:
  - `resolved` — `currentFindingCount === 0` OR `findingsRemaining` is empty within the original-finding set.
  - `partial` — some originally-covered findings resolved, some remain.
  - `unresolved` — none of the originally-covered findings were resolved.
  - `error` — install or rewrite failed; outcome diff incomplete.
  - `unverified` — set when `--no-install` was passed and lockfile-aware detectors can't be re-run accurately.

### 5.4 attemptId handling

- Auto-generated `rem_<uuid>` per `--fix` run by default (matches HexOps' format).
- Overridable via `--attempt-id <id>` for orchestrator integration. When HexOps embeds the CLI, HexOps generates the id and passes it through, so the CLI's events join the existing trail rather than starting a fresh one.

### 5.5 Origin context

- `--source <name>` — defaults to `override-audit-cli` for direct use; HexOps passes `hexops`.
- `--advisory <id>` — repeatable; threads upstream advisory context (or OA-rule codes when there's no upstream advisory).
- `--severity <level>` — also serves as severity floor for detection output.
- `--meta <k=v>` — repeatable; free-form tags under `meta.tags`.

### 5.6 Transport

- **stderr** — default NDJSON destination. Keeps stdout clean for `--json` consumption.
- **`--log-file <path>`** — writes full NDJSON to file (in addition to stderr).
- **`--log-level silent`** — disables stderr; file output continues if `--log-file` set.
- **`--log-level error|info|debug`** — standard levels; `info` is default.

---

## 6. JSON Output Schema (stdout)

`--json` emits a single JSON object to stdout. Schema versioned via `schemaVersion` field. NDJSON change-control events go to stderr — the two streams are independent.

### 6.1 Top-level

```ts
{
  schemaVersion: "1",
  tool: "override-audit-cli",
  toolVersion: "0.1.0",
  generatedAt: "2026-05-27T15:30:00.000Z",
  projectPath: "/absolute/path/to/project",
  packageManager: "npm" | "pnpm",
  attemptId: "rem_<uuid>",                  // always present; threads with change-control log

  summary: {
    findingCount: number,
    bySeverity: { critical, high, medium, low, info },   // counts
    byRule:     { "OA001": n, "OA002": n, "OA005.b": n, ... },
  },

  findings: Finding[],

  // Present only when --fix ran. Populated from post-fix re-detection diff.
  fix?: {
    attempted: number,
    applied:   number,
    failed:    number,
    skipped:   number,    // suggest-only findings (no auto-fix)
    outcome: {
      status: "resolved" | "partial" | "unresolved" | "error" | "unverified",
      previousFindingCount: number,
      currentFindingCount:  number | null,    // null when status="unverified"
      findingsCovered:   string[],
      findingsResolved:  string[],
      findingsRemaining: string[],
    },
    patches: PatchResult[],
  }
}
```

### 6.2 Finding shape

```ts
{
  ruleId:    "OA001-ORPHAN-TARGET",
  subRuleId?: "OA005.b-ORPHANED-OUTER",            // present only for OA005 sub-conditions
  severity:  "critical" | "high" | "medium" | "low" | "info",

  title:  "Override target not in resolved tree",
  detail: "@esbuild-kit/core-utils is declared in overrides but no package depends on it. The override has no effect.",

  package:      "@esbuild-kit/core-utils",         // override key (logical name)
  overridePath: ["overrides", "@esbuild-kit/core-utils"],   // path through package.json
  pinValue:     "^0.25.0" | { esbuild: "^0.25.0" },          // raw value at that path
  installedVersion?: "3.3.2",                        // if target is in node_modules

  packageManager: "npm" | "pnpm",

  remediation: {
    action:  "remove" | "replace" | "move" | "suggest",
    patch:   RFC6902Patch | null,                    // null when action="suggest"
    runnableFixCommand?: "override-audit --fix --rule OA001 --target '@esbuild-kit/core-utils'",
    explanation: "Removing this override is safe: no package depends on @esbuild-kit/core-utils.",
  },

  references: ["https://github.com/Hexaxia-Labs/override-audit-cli/blob/main/docs/rules/OA001.md"],
}
```

### 6.3 RFC 6902 JSON Patch ops

```ts
// Remove a dead override entry
{ op: "remove", path: "/overrides/@esbuild-kit~1core-utils" }

// Replace a floating-tag pin with a concrete floor
{ op: "replace", path: "/overrides/@esbuild~1linux-x64", value: ">=0.25.12" }

// Move misplaced pnpm.overrides into npm's top-level overrides
{ op: "move", from: "/pnpm/overrides/postcss", path: "/overrides/postcss" }
```

`~1` is JSON Pointer's escape for `/` in keys (required for scoped package names).

### 6.4 PatchResult shape

```ts
{
  findingRef: { ruleId, package, overridePath },   // back-ref to the Finding
  patch:      RFC6902Patch,
  status:     "applied" | "failed" | "skipped" | "planned",   // "planned" only in --dry-run
  error?:     string,                               // present when status="failed"
}
```

### 6.5 Mapping to HexOps `Finding`

Adapter is ~15 lines. The full mapping:

| HexOps `Finding` field | From override-audit | Notes |
|---|---|---|
| `type` | `'config'` (constant) | Already in HexOps' `FindingType` union — no schema change. |
| `dedupKey` | `${ruleId}::${package}::${overridePath.join('.')}` | Stable across runs for same finding. |
| `sources` | `['override-audit']` | New source id. |
| `title` / `detail` | direct copy | |
| `package` / `version` | `package` / `installedVersion` | |
| `severity` | direct copy | HexOps already uses identical 5-level scale. |
| `advisoryIds` | `[ruleId]` (plus `subRuleId` if present) | OA-codes as advisory ids. |
| `rawBySource` | `{ 'override-audit': <full Finding> }` | Preserves all raw fields. |
| `fixedIn` | `undefined` | N/A for config findings. |
| `remediation` | mapped from `remediation` field | Same shape; HexOps already supports `source: 'cve-lite'`; adds `source: 'override-audit'`. |

OA005 sub-codes (`.a` through `.e`) preserved in `subRuleId` and surfaced in UI via the `rawBySource` blob — no HexOps type changes needed.

---

## 7. CLI Surface

Single command with flags (Approach A). Hand-rolled arg parser matches `cve-lite-cli` `src/cli/args.ts`.

### 7.1 Usage

```
override-audit [path] [flags]

  path                          Project directory to audit (default: cwd)

DETECTION
  --severity <level>            Minimum severity to report (critical|high|medium|low|info)
                                Default: low.
  --rule <code>[=on|off]        Enable/disable specific rules. Repeatable.
                                Examples:  --rule OA002=off
                                           --rule OA005.e=off
                                           --rule OA001
  --include-sub-suspect         Include OA005.e-SUSPECT (info-level) in default output.
                                Off by default to avoid noise.

FIX
  --fix                         Apply patches automatically. Runs detection → applies
                                patches → re-runs detection → emits remediation_completed
                                with the diff.
  --dry-run                     Print the patches that --fix WOULD apply, then exit.
                                Mutually exclusive with --fix.
  --no-install                  Skip the post-write `npm install` / `pnpm install`
                                reconciliation. Post-fix re-detection runs in
                                manifest-only mode; outcome status set to "unverified".
                                For orchestrators that control their own install lifecycle.
  --no-post-fix-rescan          Skip the post-fix re-detection pass entirely.
                                remediation_completed still fires but with
                                currentFindingCount=null, status="unverified". For CI speed.

OUTPUT
  --json                        Emit JSON findings object to stdout. (Default: human TTY.)
  --no-color                    Disable ANSI colors in human output.

CHANGE-CONTROL
  --attempt-id <id>             Use this attemptId instead of generating one.
  --source <name>               Origin tag (default: override-audit-cli).
  --advisory <id>               Upstream advisory id to thread through logs. Repeatable.
  --meta <k=v>                  Free-form tag for change-control meta.tags. Repeatable.

LOGGING
  --log-file <path>             Write change-control NDJSON to file (in addition to stderr).
  --log-level <level>           silent | error | info (default) | debug

  -h, --help                    Show this help.
  -V, --version                 Print version.
```

### 7.2 Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no findings at or above `--severity` threshold. |
| `1` | Findings present (above threshold). For CI gating. |
| `2` | Internal error (parse failure, unreadable lockfile, file write error, conflicting flags). |
| `3` | `--fix` ran but `remediation_completed.status` is `partial`, `unresolved`, or `error`. |
| `130` | SIGINT (standard convention). |

### 7.3 Flag interactions

- `--fix` + `--dry-run` → exit 2 with usage error.
- `--no-post-fix-rescan` + no `--fix` → silently ignored (no-op).
- `--no-install` + no `--fix` → silently ignored (no-op).
- `--rule X=on` after `--rule X=off` (or vice versa) → last-wins (cve-lite-cli convention).

### 7.4 Example invocations

```bash
# Human audit of cwd, default severity floor (low)
override-audit

# JSON audit for CI gating, only high+ severity
override-audit --json --severity high
# → exit 1 if any high+/critical findings; pipe stdout to jq for processing

# HexOps invocation (Section 9 covers end-to-end)
override-audit /home/aaron/Projects/hexmetrics --fix \
  --json \
  --no-install \
  --attempt-id rem_8f3a-... \
  --source hexops \
  --log-file /tmp/oa-rem_8f3a-....log
```

---

## 8. Fixer Behavior

The fixer writes to user's `package.json`. Spec'd tightly for predictability.

### 8.1 Apply pipeline

All patches applied to in-memory copy in single deterministic pass, written once. Order matters because some patches restructure blocks that subsequent patches target:

1. **`move` patches first** (OA003) — relocate misplaced override blocks; create destination if absent.
2. **`remove` patches next** (OA001, OA004, OA005.a/b/c) — delete dead entries from now-correct blocks.
3. **`replace` patches last** (OA002, OA005.d optional) — concrete-floor replacements.
4. **Block pruning** — any override container that became empty (`{}`) is deleted: `pkg.overrides = {}` → `delete pkg.overrides`. Same for `pnpm.overrides` (and the `pnpm` parent if it becomes `{}`).

### 8.2 Indent preservation

Port HexOps' `pkgJsonIndent()` algorithm (`src/lib/updaters/override.ts:55`):

```ts
function pkgJsonIndent(raw: string): string | number {
  const m = raw.match(/^\{\n(\s+)/);
  if (!m) return 2;
  return m[1].startsWith('\t') ? '\t' : m[1].length;
}
```

Output: `JSON.stringify(pkg, null, indent) + '\n'`. Tabs vs 2-space vs 4-space round-trip cleanly. Trailing newline always present.

### 8.3 Atomicity

Write to `package.json.tmp.<pid>`, then `rename()`. If any patch throws (malformed pointer, type mismatch, conflict), entire batch aborted, no rename, `remediation_install_failed` fires with per-patch errors.

### 8.4 Conflict resolution

The fixer refuses to silently mutate user state in surprising ways.

| Conflict | Detection | Behavior |
|---|---|---|
| OA003 move; destination has same key with **different** value | Compare `pnpm.overrides[k]` vs `overrides[k]` | **Refuse the move.** Emit `fix_failed` (per-patch) with `reason: 'conflict-destination-exists'`. Both copies left in place. |
| OA003 move; destination has same key with **identical** value | identical strings | **Apply** — delete source, leave destination. |
| Override target also exists as `devDependency` with conflicting pin (the EOVERRIDE crash class) | After patch plan, scan `devDependencies` for any name in remaining overrides | **Refuse the patch.** Emit `fix_failed` with `reason: 'devdep-eoverride-risk'`. Port HexOps' `removeOverrideConflicts` logic. |
| Multiple findings on same key | Group by `overridePath` | Highest-severity patch wins; others logged as `skipped`. (Rare — OA001/OA005 already dedup at assembler stage.) |

### 8.5 Lockfile reconciliation

`remediation_completed` outcome requires re-detection. Re-detection accuracy requires reconciled lockfile + `node_modules` (OA001 reads lockfile, OA004/OA005 read `node_modules`). Default `--fix` behavior:

1. Write patched `package.json`.
2. Run PM reconciliation:
   - npm: `npm install --legacy-peer-deps` (matches HexOps' `override.ts:167`)
   - pnpm: `pnpm install --no-frozen-lockfile` (matches `override.ts:165`)
3. Re-run detection → compute outcome diff → emit `remediation_completed`.

**Opt-out:** `--no-install` skips the install AND limits the post-fix pass to manifest-only detectors (OA002, OA003). `remediation_completed.outcome.status` becomes `unverified`.

### 8.6 Install failure handling

`npm install` / `pnpm install` exits non-zero. Patches stay written (not reverted). Matches HexOps philosophy: the patch was the intent; install reconciliation is a separate step the user can retry. `remediation_install_failed` emitted with install stderr captured in `meta.error`.

### 8.7 Backup

No automatic backup — matches cve-lite-cli. Git is the assumed safety net. `--dry-run` is the in-tool safety net.

---

## 9. HexOps Integration

After standalone validation, the CLI is embedded as the fourth `ScanSource` alongside `CveLiteSource`, `PnpmAuditSource`, `GrypeSource`.

### 9.1 Source registration

New file `src/lib/security/sources/override-audit.ts`, ~15 lines:

```ts
export const OverrideAuditSource: ScanSource = {
  id: 'override-audit',
  displayName: 'Override Audit',
  findingTypes: ['config'],          // already in FindingType union
  timeoutMs: 60_000,
  isAvailable: () =>
    Promise.resolve(existsSync(join(process.cwd(), 'node_modules/.bin/override-audit'))),
  async scan(project: ProjectConfig): Promise<Finding[]> {
    const report = await runOverrideAudit(project);
    return mapToFindings(report);
  },
};
```

Registered in `src/lib/security/sources/index.ts`.

### 9.2 Subprocess invocation

Same pattern as `cve-lite.ts:178-191`:

```ts
async function runOverrideAudit(project: ProjectConfig): Promise<OverrideAuditOutput> {
  const bin = join(process.cwd(), 'node_modules/.bin/override-audit');
  const cmd = `${JSON.stringify(bin)} --json ${JSON.stringify(project.path)}`;
  try {
    const { stdout } = await execAsync(cmd, { timeout: 55_000, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout) as OverrideAuditOutput;
  } catch (err) {
    // Exit code 1 expected when findings exist; stdout is still valid JSON.
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return JSON.parse(stdout) as OverrideAuditOutput;
    throw err;
  }
}
```

### 9.3 Apply path

HexOps invokes the CLI for `--fix` from the Apply lifecycle:

```ts
const attemptId = `rem_${crypto.randomUUID()}`;
const logFile = join(tmpdir(), `oa-${attemptId}.log`);

// 1. HexOps logs intent BEFORE invoking the CLI
logger.info('security', 'remediation_initiated', `Apply attempt ${attemptId} initiated for ${project.id}`, {
  projectId: project.id,
  meta: { attemptId, source: 'hexops:override-audit', parameters: { ruleFilters } },
});

// 2. Invoke CLI with same attemptId; it emits its own remediation_* events under that id
const cmd = `${bin} --fix --json --no-install --attempt-id ${attemptId} --source hexops --log-file ${logFile} ${project.path}`;
const { stdout } = await execAsync(cmd, { ... });
const report = JSON.parse(stdout);

// 3. Re-emit CLI's NDJSON events through HexOps' logger (joins the trail)
for (const line of readFileSync(logFile, 'utf-8').split('\n').filter(Boolean)) {
  const evt = JSON.parse(line);
  logger.info('security', evt.event, evt.message, { projectId: project.id, meta: evt.meta });
}

// 4. HexOps owns install step itself (CLI ran with --no-install) and runs its own audit re-verify.
//    Matches existing cve-lite Apply pattern from commit 1ab55ed.
```

The `--no-install` flag is critical: HexOps already has reconciliation, dev-server guards, and `auditSummary` verification in `update/route.ts`. The CLI patches `package.json`; HexOps drives the rest. One install per Apply.

### 9.4 UI surface

Zero new HexOps UI required for v1:

- Security page accordion already renders `Finding[]` from all registered sources — `OverrideAuditSource` appears with new source badge automatically.
- `'config'` FindingType already in union.
- `RemediationPanel` already renders `Finding.remediation` blocks; override-audit `remediation` shape maps cleanly.

Optional polish (separate commit, not blocking): dedicated badge styling for `config` findings vs `vulnerability` findings.

---

## 10. Error Handling

### 10.1 Error matrix (CLI behavior)

| Condition | Exit | Behavior |
|---|---|---|
| Missing `package.json` at `path` | 2 | `error: no package.json found at <path>` to stderr. |
| Malformed `package.json` (parse error) | 2 | `error: package.json parse failed at <line:col>: <msg>`. |
| Missing lockfile | 0/1 | **Graceful degradation.** OA002/OA003 still run; OA001/OA004/OA005 emit info-level warning about reduced confidence and produce no findings rather than wrong ones. |
| Missing `node_modules/` | 0/1 | Same — OA004 skipped, OA005.c/d limited to manifest-derivable cases. Findings still produced for what CAN be determined. |
| Unsupported PM (yarn/bun/none) | 2 (default), 0 with `--ignore-unsupported-pm` | Yarn is v1.1; bun is v2. Clean error tells user what's coming. |
| Patch application failure (any single patch) | 3 | Batch aborted per Section 8.3; `remediation_install_failed` with per-patch errors. |
| `npm install` / `pnpm install` failure during reconciliation | 3 | Patches stayed written; outcome `partial` or `error`; install stderr in `meta.error`. |
| SIGINT mid-fix | 130 | Tmp file deleted via signal handler; `package.json` untouched (rename hadn't happened). |
| JSON output buffer overflow | 2 | Error to stderr, exit 2. |
| Conflicting flags (`--fix` + `--dry-run`) | 2 | Usage error to stderr. |

### 10.2 Graceful degradation guarantees

The CLI **never** silently produces wrong findings due to missing data. When a detector cannot run accurately, it is skipped with an info-level warning (visible in human output, recorded under `summary.skipped_detectors` in JSON output, NOT counted in `summary.findingCount`).

---

## 11. Testing Strategy

Matches cve-lite-cli's Jest setup.

### 11.1 Test layout

```
tests/
├── fixtures/
│   ├── npm-orphan/                    # OA001
│   ├── npm-floating-tag/              # OA002
│   ├── npm-on-pnpm-wrong-section/     # OA003
│   ├── pnpm-on-npm-wrong-section/     # OA003 (recurring hexcms footgun)
│   ├── installed-newer/               # OA004
│   ├── nested-non-npm/                # OA005.a
│   ├── nested-orphaned-outer/         # OA005.b
│   ├── nested-orphaned-inner/         # OA005.c
│   ├── nested-leaky/                  # OA005.d
│   ├── nested-suspect/                # OA005.e
│   ├── clean-project/                 # negative test, 0 findings
│   ├── missing-lockfile/              # graceful-degradation case
│   ├── missing-node-modules/          # graceful-degradation case
│   └── hexmetrics-real-world/         # copy of actual hexmetrics overrides
└── *.test.ts
```

### 11.2 Coverage matrix

| Test type | Location | Purpose |
|---|---|---|
| Detector unit tests | `tests/detectors/*.test.ts` | Pure-function tests over hand-crafted `Context` objects. Fast, no fs. |
| Parser tests | `tests/parsers/*.test.ts` | PM detection, override extraction, lockfile resolution, node_modules version reads. Use fixtures. |
| Scanner integration | `tests/scanner.test.ts` | Full parse → detect → assemble pipeline against each fixture. |
| Fixer tests | `tests/fixer.test.ts` | Apply patches to fixture `package.json`, assert exact resulting text (indent + trailing newline preservation). Snapshot tests for JSON Patch op shape per finding. |
| CLI integration | `tests/cli-integration.test.ts` | Spawn `node dist/index.js <fixture>` as child process, assert stdout JSON parses against schema, stderr contains expected NDJSON, exit code correct. |
| Schema snapshot | `tests/output.test.ts` | Snapshot full JSON output for `hexmetrics-real-world` fixture. Locks in `schemaVersion: "1"` contract for HexOps consumers. |
| Change-control log | `tests/change-control.test.ts` | Assert four-event lifecycle fires in order with same `attemptId` for `--fix` run. |

### 11.3 CI

`.github/workflows/ci.yml` runs `npm test` against Node 18, 20, 22 (matches cve-lite-cli matrix).

---

## 12. Open Questions / Future Work

### 12.1 Open questions (for review)

- **OA004 safety check granularity** — Section 4.4 specifies a "resolved parent depends on `>= pin` natively" safety check. The exact lockfile traversal algorithm needs spec'ing during implementation. Worst case: downgrade all OA004 findings to `suggest` if safety can't be cleanly determined in v1.0.
- **`OA005.e-SUSPECT` enablement default** — currently off by default (`--include-sub-suspect`). Reconsider after dogfooding on the 24 HexOps projects: if it produces actionable signal, flip on by default in v1.1.
- **JSON schema versioning policy** — `schemaVersion: "1"` is the contract for HexOps consumers. Need a written policy on what triggers a v2 (any breaking change to top-level shape? any breaking change to Finding shape? additive-only changes safe?).

### 12.2 Future work (deferred, not v1)

| Item | Target version | Notes |
|---|---|---|
| Yarn `resolutions` support | v1.1 | Yarn-berry `.yarnrc.yml` adds wrinkles vs classic. |
| GitHub Action wrapper | v1.1 | Modeled on cve-lite-cli's `action.yml`. |
| Bun overrides support | v2 | Bun overrides syntax is npm-compatible; mostly a parser+detection extension. |
| Deprecated-parent detection | v1.x (opt-in) | `--with-registry` flag; uses `npm view` network calls. Breaks pure-static guarantee, hence opt-in. |
| CVE-no-longer-exists detection | v2 or separate tool | Requires OSV. Could live in `cve-lite-cli` directly, or as `override-audit-vuln` companion. |
| OWASP Incubator submission | Post-1.0, after fleet dogfooding | Same arc as cve-lite-cli. Repo transfer from `Hexaxia-Labs/` to `OWASP/`; GitHub keeps redirects. |
| Rule plugin system (Approach B) | v2 if community contributions warrant | Currently YAGNI. |

---

## 13. References

### 13.1 Sibling tools

- [cve-lite-cli](https://github.com/OWASP/cve-lite-cli) — OWASP Incubator, vulnerability scanning. The primary architectural and stylistic reference. Local at `/home/aaron/Projects/cve-lite-cli`.
- [supply-sentinel](https://github.com/Hexaxia-Labs/supply-sentinel) — Hexaxia-Labs, supply-chain attack detection. Confirms `src/detectors/` pattern is now a Hexaxia-Labs convention. Local at `/home/aaron/Projects/supply-sentinel`.

### 13.2 HexOps code referenced

- `src/lib/updaters/override.ts:62-109` (`cleanStaleOverrides`) — partial overlap with OA004; NaN-compare bug on `"latest"`.
- `src/lib/updaters/override.ts:55` (`pkgJsonIndent`) — indent-preservation algorithm to port.
- `src/lib/updaters/override.ts:111-160` (`applyOverrides`, `removeOverrideConflicts`) — EOVERRIDE handling to port.
- `src/lib/patch-scanner.ts:81-123` (`readActiveOverrides`) — partial overlap; nested-object overrides silently skipped at `:115`.
- `src/lib/security/types.ts:70-77` (`ScanSource` interface) — integration target.
- `src/lib/security/types.ts:3-9` (`FindingType` union) — `'config'` slot for override-hygiene findings.
- `src/lib/security/sources/cve-lite.ts:178-191` — subprocess invocation pattern to mirror.
- `src/app/api/projects/[id]/update/route.ts:62-108,384-414` — change-control logging methodology source.
- Commits `02b82a1`, `1ab55ed` — change-control logging origin.

### 13.3 Upstream ecosystem issues this addresses

- [pnpm#9852](https://github.com/pnpm/pnpm/issues/9852) — "pnpm audit, add override no longer needed check"
- [pnpm#5949](https://github.com/pnpm/pnpm/issues/5949) — "pnpm audit command should detect which overrides can be removed after CVE was fixed"
- [pnpm#10472](https://github.com/pnpm/pnpm/issues/10472) — "pnpm audit --fix writes overrides to pnpm-workspace instead of package.json" (OA003-family footgun)
- [pnpm#11163](https://github.com/pnpm/pnpm/issues/11163) — "pnpm audit --fix ignores auditLevel"

### 13.4 Related governance

- `Hexaxia-Group/00-Admin/repo-classification-260522.md` — repo classification, open-core principle.
- HexOps' open-core boundary: `docs/superpowers/` gitignored; design specs are internal planning artifacts.

---

## 14. Decision Log (from brainstorming session)

| Question | Decision | Rationale |
|---|---|---|
| Data scope (static vs vuln-aware) | Purely static | Ships fast, no OSV/network dependency, no sync DB. Vuln-awareness deferred or delegated to cve-lite-cli. |
| Tool name | `override-audit-cli` (binary: `override-audit`) | Clearer than `override-lite-cli`; aligns with `npm audit` / `pnpm audit` vocabulary. |
| Fix scope | Detect + autofix (`--fix`) | Matches cve-lite-cli's remediation-first stance; HexOps can wrap without re-implementing writer logic. |
| Package manager coverage v1 | npm + pnpm | Covers entire HexOps managed-project fleet. Yarn deferred to v1.1, Bun to v2. |
| Repo placement | `Hexaxia-Labs/override-audit-cli`, private initially | Same arc as cve-lite-cli. Public when proven via fleet dogfooding. |
| Architectural approach | Approach A — mirror cve-lite-cli + supply-sentinel | Hexaxia-Labs convention; uniform HexOps wrapper pattern; YAGNI vs rule-engine. |
| Nested-override handling | Dedicated detector OA005 with 5 sub-codes | Single parsing entry point; one finding kind users learn; precise sub-codes for actual problems. |
| Logging methodology | HexOps `remediation_*` vocabulary verbatim | Symmetry — no event translation when embedded as plugin. |
