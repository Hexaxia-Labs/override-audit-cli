# Visual Studio Code Case Study

> Verified baseline scan — CVE Lite CLI v1.21.0 · 2026-06-11

<p align="center">
  <img src="/cve-lite-cli/img/vscode-logo.png" alt="Visual Studio Code logo" width="260"/>
</p>

## Summary

- **Project:** [Visual Studio Code](https://github.com/microsoft/vscode) — open-source code editor maintained by Microsoft
- **Revision:** `b867fed` (main branch, 2026-06-11)
- **Scan scope:** root `package-lock.json` only — not nested lockfiles under `build/`, `extensions/`, or other subfolders
- **Lockfile:** `package-lock.json` (1,374 resolved packages, lockfile v3)
- **Baseline findings:** 6 unique vulnerable packages (1 critical · 1 high · 4 medium · 0 low)
- **Direct vs transitive:** 1 direct / 5 transitive
- **Dev vs runtime:** 3 of 5 transitive findings are build-time only (`· dev`)
- **Fix command groups generated:** 4
- **First-pass coverage:** 4 of 6 findings have confident copy-and-run commands
- **npm audit (same lockfile):** 18 vulnerability entries (1 critical · 5 high · 12 moderate)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Visual Studio Code is one of the most widely used developer tools in the world — yet its **root JavaScript toolchain lockfile** resolves **1,374 packages** with only **6 vulnerable package versions** in this snapshot. That makes it a useful counterpoint to framework monorepos like Astro or Gatsby-scale graphs: high recognition, relatively lean OSV surface on the root lockfile.

The scan scope matters. VS Code is a multi-folder product tree with additional `package.json` files under `build/`, extensions, and test workspaces. This case study commits and scans the **repository root lockfile only**. Findings reflect build tooling, gulp plugins, sandbox runtime paths, and Copilot-related dependencies locked at the root — not every nested package tree in the full VS Code checkout.

The **direct/transitive split** and **dev/runtime labelling** are the headline for triage:

**`shell-quote@1.8.3` — critical, transitive via `@vscode/sandbox-runtime`.** A command-injection advisory in the VS Code sandbox runtime. The parent range already covers the fix (`shell-quote@1.8.4`) — CVE Lite generates `npm update @vscode/sandbox-runtime` as a within-range lockfile refresh.

**`braces@2.3.2` — high, transitive · dev.** The only high-severity finding arrives through legacy gulp file-watcher tooling. The `· dev` label immediately signals this is build-pipeline risk, not the shipped editor binary. The parent range covers the fix: `npm update braces`.

**`@anthropic-ai/sdk@0.82.0` — medium, direct.** One locked version of the Anthropic SDK in the root graph, used by Copilot-related tooling. CVE Lite generates a direct fix: `npm install @anthropic-ai/sdk@0.91.1`.

**`micromatch@3.1.10`, `postcss@7.0.39` — medium, transitive · dev.** Both trace through gulp build tooling. The `· dev` label correctly deprioritises these as build-time noise with no runtime exposure.

**`uuid@3.4.0` — medium, transitive.** Arrives through `@microsoft/dev-tunnels-connections`. No auto-generated fix command — no confident parent upgrade path identified.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against the same root `package-lock.json` on the same machine on 2026-06-11.

| Metric | npm audit | CVE Lite CLI v1.21.0 |
|---|---:|---:|
| Total reported findings | 18 | 6 |
| Critical | 1 | 1 |
| High | 5 | 1 |
| Moderate / Medium | 12 | 4 |
| Low | 0 | 0 |
| Direct vs transitive breakdown | ✗ | ✓ (1 / 5) |
| Dev vs runtime labelling | ✗ | ✓ (3 dev, 3 runtime) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | partial | ✓ |
| Specific copy-and-run commands | partial (`npm audit fix`) | ✓ (4 groups) |
| Skipped findings with reason | ✗ | ✓ |

**Why the totals differ:**

`npm audit` counts vulnerability **entries** (advisory × dependency path combinations). CVE Lite counts each unique vulnerable package version once. `braces@2.3.2` appears across multiple gulp-related paths in `npm audit` (contributing to its 5 high entries) while CVE Lite reports it **once** as a single high finding.

**The dev/runtime distinction changes how you prioritise:**

Of CVE Lite's 6 findings, 3 are labelled `· dev` — `braces`, `micromatch`, and `postcss` are all build tooling that never reaches the shipped editor. `npm audit` reports no such distinction. A developer reading the raw audit output has no signal for which findings require urgent attention and which are build-chain maintenance.

**Fix guidance differs materially:**

CVE Lite generates **four copy-and-run command groups** covering **4 of 6** findings:

```bash
npm update @vscode/sandbox-runtime   # critical: shell-quote
npm update braces                    # high: braces (dev)
npm install @anthropic-ai/sdk@0.91.1 # medium: direct Copilot dep
npm install gulp@5.0.0               # medium: micromatch path-specific
```

`npm audit fix` may propose broader changes carrying breaking-change risk across the build toolchain. CVE Lite separates confident fixes from paths that need maintainer-level decisions.

---

## Before vs After

No remediation pass was performed for this study. VS Code's peer dependency graph prevents automated lockfile-only remediation. This table records the verified baseline only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 6 | 1 | 1 | 4 | 0 | 1 | 5 | 4 |

Four command groups covering four findings is strong first-pass coverage on a professionally maintained editor repository. The two remaining findings (`uuid@3.4.0` and the remaining `micromatch` paths) require maintainer-level dependency routing.

---

## Fix Journey

No commands were generated or run for this study.

**The critical finding is runtime.** `shell-quote@1.8.3` in `@vscode/sandbox-runtime` is the only non-dev critical or high finding. The within-range fix (`npm update @vscode/sandbox-runtime`) is the highest-priority action and the first command CVE Lite surfaces.

**The high finding is dev-only.** `braces@2.3.2` through gulp is immediately deprioritised by the `· dev` label. It should be fixed — but it is build-pipeline maintenance, not an exposure in the shipped editor.

**The direct SDK fix is actionable.** `@anthropic-ai/sdk@0.82.0` is a declared root devDependency for Copilot-related tooling. Bumping to `0.91.1` is a concrete maintainer action with no transitive complexity.

**The remaining paths need routing.** `uuid@3.4.0` arrives through `@microsoft/dev-tunnels-connections` with no clear within-range fix. `postcss@7.0.39` traces through gulp — no auto-generated parent upgrade on this lockfile-only snapshot.

---

## Why this matters

Teams trust VS Code as infrastructure. A verified root lockfile scan still surfaces **6 vulnerable package versions** — including a **critical sandbox runtime issue** and a **direct Anthropic SDK advisory** in Copilot-related tooling.

The **dev/runtime labelling** is the key contribution of this scan. Without it, a developer reading raw audit output sees 18 entries across critical, high, and moderate buckets with no guidance on what to prioritise. CVE Lite's output collapses that to 6 deduplicated findings, labels 3 as build-time only, and surfaces 4 specific commands — making the difference between alert fatigue and an actionable triage list.

---

## Scan command

Run from the VS Code repository root or from the `examples/vscode` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects VS Code at revision `b867fed` (2026-06-11). VS Code releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/vscode/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-06-11 |
| CLI version | v1.21.0 |
| CVE Lite command | `cve-lite examples/vscode --verbose --all` |
| npm audit command | `npm audit` |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/vscode/package-lock.json` from [microsoft/vscode@b867fed](https://github.com/microsoft/vscode/commit/b867fed) |
| Packages parsed (CVE Lite) | 1,374 |
| Unique vulnerable packages (CVE Lite) | 6 |
| Vulnerability entries (npm audit) | 18 |
| Fix command groups (CVE Lite) | 4 |
| Findings covered by fix commands (CVE Lite) | 4 of 6 |

---

## Remaining risk after baseline

All 6 baseline findings remain open at the time of this study. No remediation was applied.

- **1 critical runtime:** `shell-quote@1.8.3` (sandbox runtime) — fix: `npm update @vscode/sandbox-runtime`
- **1 high dev:** `braces@2.3.2` (gulp toolchain) — fix: `npm update braces`
- **1 direct medium:** `@anthropic-ai/sdk@0.82.0` — fix: `npm install @anthropic-ai/sdk@0.91.1`
- **2 transitive dev medium:** `micromatch@3.1.10`, `postcss@7.0.39` (gulp toolchain)
- **1 transitive medium:** `uuid@3.4.0` (dev-tunnels) — no auto-fix available

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-06-11 (revision `b867fed`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| shell-quote | 1.8.3 | critical | transitive | 1.8.4 | GHSA-w7jw-789q-3m8p |
| braces | 2.3.2 | high | transitive · dev | 3.0.3 | GHSA-grv7-fg5c-xmjg |
| @anthropic-ai/sdk | 0.82.0 | medium | direct | 0.91.1 | GHSA-p7fg-763f-g4gf |
| micromatch | 3.1.10 | medium | transitive · dev | 4.0.8 | GHSA-952p-6rrq-rcjv |
| postcss | 7.0.39 | medium | transitive · dev | 8.5.10 | GHSA-7fh5-64p2-3v2j, GHSA-qx2v-qp2m-jg93 |
| uuid | 3.4.0 | medium | transitive | 7.0.0 | GHSA-w5hq-g745-h8pq |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
