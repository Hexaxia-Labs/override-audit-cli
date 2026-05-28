# Visual Studio Code Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-28

<p align="center">
  <img src="/cve-lite-cli/img/vscode-logo.png" alt="Visual Studio Code logo" width="260"/>
</p>

## Summary

- **Project:** [Visual Studio Code](https://github.com/microsoft/vscode) — open-source code editor maintained by Microsoft
- **Revision:** `bc678cad02f18de3e2b6bf72a8259e9fb322cdfc`
- **Scan scope:** root `package-lock.json` only — not nested lockfiles under `build/`, `extensions/`, or other subfolders
- **Lockfile:** `package-lock.json` (1,374 resolved packages, npm 10.8.2, lockfile v3)
- **Baseline findings:** 9 unique vulnerable packages (0 critical · 1 high · 8 medium · 0 low)
- **OSV advisory matches:** 7 CVE/advisory entries deduplicated into 9 package versions
- **Direct vs transitive:** 2 direct / 7 transitive
- **Validated fix command groups generated:** 2
- **First-pass coverage:** 3 of 9 findings have confident copy-and-run commands
- **npm audit (same lockfile):** 22 vulnerability entries (5 high · 17 moderate)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Visual Studio Code is one of the most widely used developer tools in the world — yet its **root JavaScript toolchain lockfile** resolves **1,374 packages** with only **9 vulnerable package versions** in this snapshot. That makes VS Code a useful counterpoint to framework monorepos like Astro (2,228 packages, 34 findings) or Gatsby-scale graphs: high recognition, relatively lean OSV surface on the root lockfile.

The scan scope matters. VS Code is a multi-folder product tree with additional `package.json` files under `build/`, extensions, and test workspaces. This case study commits and scans the **repository root lockfile only** — the same snapshot pattern used for other in-repo fixtures. Findings reflect build tooling, gulp plugins, Azure SDK paths, and Copilot-related dev dependencies locked at the root — not every nested package tree in the full VS Code checkout.

The direct/transitive split (**2 direct, 7 transitive**) is the headline for triage:

**`@anthropic-ai/sdk@0.81.0` and `@anthropic-ai/sdk@0.82.0` — medium, direct.** Two distinct locked versions of the Anthropic SDK appear in the root graph (including a nested copy under `@anthropic-ai/claude-agent-sdk`). CVE Lite generates a single direct fix: `npm install @anthropic-ai/sdk@0.91.1`.

**`braces@2.3.2` — high, transitive via gulp.** The only high-severity finding arrives through legacy gulp file-watcher tooling (`glob-watcher` → `chokidar` → `micromatch` → `braces`). This is build-pipeline risk, not the shipped Electron editor binary path.

**`uuid@3.4.0`, `uuid@8.3.2`, `uuid@9.0.1` — medium, transitive across three versions.** Multiple uuid majors appear through Azure storage, dev-tunnels, and `@vscode/deviceid`. CVE Lite identifies `@vscode/deviceid@0.1.5` as a parent upgrade resolving the `uuid@9.0.1` path — one of two generated command groups.

**`postcss@7.0.39`, `micromatch@3.1.10`, `qs@6.15.1` — medium, transitive toolchain packages** with validated OSV fix targets but no auto-generated parent upgrade on this lockfile-only snapshot.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against the same root `package-lock.json` on the same machine on 2026-05-28.

| Metric | npm audit (10.8.2) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Total reported findings | 22 | 9 |
| Critical | 0 | 0 |
| High | 5 | 1 |
| Moderate / Medium | 17 | 8 |
| Low | 0 | 0 |
| Direct vs transitive breakdown | ✗ | ✓ (2 / 7) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | partial | ✓ |
| Specific copy-and-run commands | partial (`npm audit fix`) | ✓ (2 groups) |
| Skipped findings with reason | ✗ | ✓ (6 entries) |

**Why the totals differ — and why that is not a coverage gap:**

`npm audit` counts vulnerability **entries** (advisory × dependency path combinations). CVE Lite counts each unique vulnerable package version once. That is why **`braces@2.3.2`** may appear across multiple gulp-related paths in `npm audit` (contributing to **5 high** entries) while CVE Lite reports it **once** as a single high finding.

**Severity bucketing also differs.** CVE Lite assigns **`braces@2.3.2`** as the sole **high** finding. `npm audit`'s summary line reports **5 high** because it counts separate dependency-path rows for the same underlying package graph.

**Fix guidance differs materially:**

CVE Lite generates **two copy-and-run command groups** covering **3 of 9** findings:

```bash
npm install @anthropic-ai/sdk@0.91.1
npm install @vscode/deviceid@0.1.5
```

`npm audit fix` may propose broader changes (including `--force` upgrades to `gulp@5.0.1` or `@anthropic-ai/sdk@0.99.0`) that carry breaking-change risk across the build toolchain. CVE Lite separates confident direct fixes from transitive gulp and uuid paths that need maintainer-level decisions.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 9 | 0 | 1 | 8 | 0 | 2 | 7 | 2 |

Two command groups fixing three findings is a strong first-pass result on a professionally maintained editor repository — but **6 findings remain** without auto-generated commands, mostly legacy gulp and Azure uuid chains.

---

## Fix Journey

No commands were generated or run for this study.

The first instinct on a VS Code scan is to ask whether the editor itself is vulnerable. On this root lockfile snapshot, the answer is more nuanced:

**Direct SDK fixes are actionable.** `@anthropic-ai/sdk` is a declared root devDependency for Copilot-related tooling. Bumping toward `0.91.1` is a concrete maintainer action CVE Lite surfaces immediately.

**Parent upgrade for device identity.** `@vscode/deviceid@0.1.5` resolves one uuid path without requiring a direct `uuid` install at the monorepo root.

**Gulp toolchain is structural.** `braces`, `micromatch`, and `postcss` findings trace through `gulp`, `gulp-cli`, and `gulp-sourcemaps` — upgrading these requires build-pipeline validation, not a one-line `npm install braces@3.0.3` at the root.

**Remaining uuid paths need upstream routing.** `uuid@3.4.0` and `uuid@8.3.2` arrive through `@azure/core-http` and `@microsoft/dev-tunnels-connections`. `npm audit` reports **no fix available** for some uuid paths; CVE Lite correctly skips auto-fix commands for those rows.

---

## Why this matters

Teams trust VS Code as infrastructure. A verified root lockfile scan still surfaces **9 vulnerable package versions**, including a **high-severity braces issue** in the gulp build chain and **two direct Anthropic SDK advisories** in Copilot-related tooling.

That pattern matters for two audiences:

1. **Editor and extension maintainers** — even a heavily scrutinized repository carries JavaScript toolchain debt in build plugins and SDK integrations that standard audit summaries inflate or obscure.
2. **Security engineers evaluating developer tools** — comparing **9 deduplicated packages** against **22 npm audit entries** on the same lockfile shows why triage structure matters as much as raw counts.

CVE Lite's value here is clarity on a lean graph: **two direct fixes to run now**, **one high finding to route to build tooling owners**, and **six transitive rows** explicitly skipped rather than turned into risky `--force` audit fixes.

---

## Scan command

Run from the VS Code repository root or from the `examples/vscode` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects VS Code at revision `bc678cad02f18de3e2b6bf72a8259e9fb322cdfc`. VS Code releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/vscode/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-28 |
| CLI version | v1.18.1 |
| CVE Lite command | `npx tsx src/index.ts examples/vscode --verbose --all` |
| npm audit command | `npm audit` (npm 10.8.2) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/vscode/package-lock.json` from [microsoft/vscode@bc678ca](https://github.com/microsoft/vscode/commit/bc678cad02f18de3e2b6bf72a8259e9fb322cdfc) |
| Packages parsed (CVE Lite) | 1,374 |
| Unique vulnerable packages (CVE Lite) | 9 |
| Vulnerability entries (npm audit) | 22 |
| Fix command groups (CVE Lite) | 2 |
| Findings covered by fix commands (CVE Lite) | 3 of 9 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npx tsx src/index.ts examples/vscode --verbose --all
```

Reproduce `npm audit` from the example directory (Node.js 20+ recommended):

```bash
cd examples/vscode
npm audit
npm audit --json
```

Both tools were run against the same root `package-lock.json` on the same machine on 2026-05-28.

---

## Remaining risk

All 9 baseline findings remain open at the time of this study. No remediation was applied.

- **1 high:** `braces@2.3.2` (gulp toolchain)
- **2 direct medium:** `@anthropic-ai/sdk@0.81.0`, `@anthropic-ai/sdk@0.82.0`
- **6 transitive medium:** `micromatch@3.1.10`, `postcss@7.0.39`, `qs@6.15.1`, three `uuid` versions (`3.4.0`, `8.3.2`, `9.0.1`)

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-28 (revision `bc678ca`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| braces | 2.3.2 | high | transitive | 3.0.3 | GHSA-grv7-fg5c-xmjg |
| @anthropic-ai/sdk | 0.81.0 | medium | direct | 0.91.1 | GHSA-p7fg-763f-g4gf |
| @anthropic-ai/sdk | 0.82.0 | medium | direct | 0.91.1 | GHSA-p7fg-763f-g4gf |
| micromatch | 3.1.10 | medium | transitive | 4.0.8 | GHSA-952p-6rrq-rcjv |
| postcss | 7.0.39 | medium | transitive | 8.5.10 | GHSA-7fh5-64p2-3v2j, GHSA-qx2v-qp2m-jg93 |
| qs | 6.15.1 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 3.4.0 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
