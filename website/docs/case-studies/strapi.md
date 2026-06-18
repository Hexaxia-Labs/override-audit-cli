# Strapi Case Study

> Verified baseline scan — CVE Lite CLI v1.20.0 · 2026-06-09

<p align="center">
  <img src="/cve-lite-cli/img/strapi-logo.svg" alt="Strapi logo" width="320"/>
</p>

## Summary

- **Project:** [Strapi](https://github.com/strapi/strapi) — open source headless CMS powering content APIs, admin panels, and plugin ecosystems for millions of sites
- **Revision:** `e666ee26ae8e8c1758a048d6385afe1a62790a84`
- **Lockfile:** `yarn.lock` (2,887 resolved packages, Yarn Berry 4.12.0 workspace monorepo)
- **Baseline findings:** 29 unique vulnerable packages (1 critical · 12 high · 13 medium · 3 low)
- **OSV advisory matches:** 61 CVE/advisory entries deduplicated into 29 packages
- **Direct vs transitive:** 2 direct / 15 transitive / 12 unknown (Yarn Berry path classification limited in this MVP)
- **Validated fix command groups generated:** 6
- **First-pass coverage:** 12 of 29 findings have confident copy-and-run commands
- **yarn npm audit (same lockfile):** not runnable on this lockfile-only snapshot — Yarn Berry catalog protocol requires a full monorepo install (same constraint as [Storybook](./storybook.md))
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Strapi sits in the **headless CMS** category alongside [Ghost](./ghost.md) — a professionally maintained content platform whose risk surface spans admin UI, GraphQL/REST APIs, plugin tooling, and a large Yarn Berry monorepo. At **2,887 resolved packages**, the graph is smaller than Ghost (4,447) or Storybook (3,008) but exposes a different remediation profile: **some findings are directly fixable in the root manifest**, while critical and high-severity issues still run through transitive chains.

The direct/transitive split (**2 direct, 15 transitive, 12 unknown**) is the defining pattern for Strapi at this revision. Unlike Ghost — where every finding is transitive — Strapi exposes **`lodash`** and **`qs`** as direct dependencies with validated upgrade commands. That makes Strapi a useful contrast case for the same CMS category: not all large content platforms hide their vulnerability surface entirely in the lockfile graph.

**`handlebars@4.7.8` — critical prototype pollution / template injection.** Reached through Strapi's code-generation toolchain: `plop → node-plop → handlebars`. CVE Lite validates a within-range refresh to `4.7.9+` and generates:

```bash
yarn upgrade handlebars
```

This is the same critical package class flagged in the [Storybook](./storybook.md) scan — legacy template rendering buried in dev tooling, not visible from Strapi's published `@strapi/*` packages.

**`html-minifier@3.5.21` — high, no fix available.** Pulled in by `rollup-plugin-html`. CVE Lite flags `⚠ no fix` — the same advisory family (`GHSA-pfq8-rq6v-vf5m`) that appears in the [Ghost](./ghost.md) case study on a different CMS stack. Two major headless CMS platforms, one shared dead-end dependency with no published non-vulnerable version.

**`sanitize-html@2.17.4` — present but not flagged.** Strapi's admin and content pipeline depend on `sanitize-html` for HTML sanitization — the same functional role Ghost assigns to the library. At Ghost's scanned revision, `sanitize-html@2.17.0` was a **critical XSS finding with no fix**. At this Strapi revision, `sanitize-html@2.17.4` does not match OSV advisories — illustrating that CMS content-safety risk shifts with patch-level updates even when the dependency name is identical across platforms.

**Direct vs transitive remediation split:**

| Category | Examples | CVE Lite action |
|---|---|---|
| Direct, fixable now | `lodash@4.17.23`, `qs@6.14.2` | `yarn add lodash@4.18.0`, `yarn add qs@6.15.2` |
| Transitive, within-range refresh | `handlebars`, `axios`, `minimatch@5.1.0`, `cross-spawn`, `tmp@0.2.1` | `yarn upgrade <pkg>` |
| Transitive, parent upgrade needed | `minimatch@9.0.3` via `@nx/js`, `minimatch@9.0.5` via `syncpack`, `file-type` via `@swc/cli` | Partial parent commands + rescan |
| No fix available | `html-minifier@3.5.21` | `⚠ no fix` — wait for upstream |

**`lodash@4.17.23` — high, direct.** CVE Lite generates a validated direct upgrade — the clearest "edit root manifest and rescan" outcome on this snapshot:

```bash
yarn add lodash@4.18.0
```

**Three `minimatch` majors — mixed fixability.** `minimatch@5.1.0` gets a within-range `yarn upgrade minimatch` command. `minimatch@9.0.3` (via `@nx/js`) and `minimatch@9.0.5` (via `syncpack`) are skipped — no safe parent upgrade identified automatically. Same package name, three remediation paths.

---

## Comparison Note: CVE Lite CLI vs yarn npm audit

Both tools were attempted against the same `yarn.lock` on the same machine on 2026-06-09.

| Metric | yarn npm audit (4.12.0) | CVE Lite CLI v1.20.0 |
|---|---:|---:|
| Total reported findings | not runnable¹ | 29 |
| Critical | — | 1 |
| High | — | 12 |
| Moderate / Medium | — | 13 |
| Low | — | 3 |
| Direct vs transitive breakdown | ✗ | ✓ (2 / 15 / 12 unknown) |
| Full lockfile package parse | ✗ (requires install) | ✓ (2,887 packages) |
| Deduplicated package view | ✗ | ✓ |
| Packages with no known fix flagged | ✗ | ✓ (`html-minifier`) |
| Specific copy-and-run commands | ✗ | ✓ (6 groups) |
| Skipped findings with reason | ✗ | ✓ (17 entries) |

¹ **`yarn npm audit` fails on this fixture** with `Internal Error: vitest@catalog:: default catalog not found or empty`. Strapi's root `package.json` uses Yarn Berry **catalog** and **workspace** protocols that require the full monorepo context — workspace packages, `.yarnrc.yml`, and `node_modules` — not present in this lockfile-only snapshot. This is the same class of limitation documented in the [Storybook](./storybook.md) case study.

**Why CVE Lite still adds value here:**

On a committed lockfile snapshot, CVE Lite parses all **2,887 resolved packages** without installing the monorepo. It surfaces the critical `handlebars` chain, the no-fix `html-minifier` finding, direct `lodash`/`qs` upgrades, and six grouped fix commands — none of which `yarn npm audit` can produce on this fixture.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Unknown | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 29 | 1 | 12 | 13 | 3 | 2 | 15 | 12 | 6 |

The first-pass plan covers **12 of 29** findings across six command groups. The remaining **17** appear in the skipped section — unknown-relationship packages where Yarn Berry path reconstruction is limited, transitive packages awaiting parent releases (`@nx/js`, `syncpack`, `@commitlint/prompt-cli`), or packages with no fix (`html-minifier`).

---

## Fix Journey

These commands were **generated by the scanner but not run** against the upstream Strapi repository.

On a CMS monorepo, the instinct is to fix direct dependencies first. CVE Lite separates that work clearly:

**Step 1 — critical within-range refresh:**

```bash
yarn upgrade handlebars
```

Addresses `handlebars@4.7.8` (critical, transitive via `plop → node-plop`). No parent bump required — `node-plop` already permits `4.7.9+`.

**Step 2 — direct high/medium fixes:**

```bash
yarn add lodash@4.18.0
yarn add qs@6.15.2
```

Two direct findings with validated targets. `lodash` is high severity; `qs` is medium.

**Step 3 — transitive within-range refreshes:**

```bash
yarn upgrade axios && yarn upgrade cross-spawn && yarn upgrade minimatch && yarn upgrade tmp
yarn upgrade brace-expansion && yarn upgrade ejs && yarn upgrade tough-cookie
```

Covers `axios`, `cross-spawn`, `minimatch@5.1.0`, `tmp@0.2.1`, and three medium-severity toolchain packages.

**Step 4 — parent upgrades (partial coverage):**

```bash
yarn add @swc/cli@0.8.1 lint-staged@15.4.2
```

`lint-staged@15.4.2` fully resolves `yaml@2.5.1`. `@swc/cli@0.8.1` covers **one of five** paths to `file-type@20.5.0` — rescan required for remaining decompress/archive chains.

**Not auto-fixable — requires maintainer triage:**

- **`html-minifier@3.5.21`:** `⚠ no fix` — same dead-end as Ghost's `html-minifier` finding
- **`minimatch@9.0.3` / `9.0.5`:** await `@nx/js` and `syncpack` releases
- **`path-to-regexp@8.3.0`, `undici@5.29.0`, `@apollo/server@4.13.0`, `vite@5.4.21`:** validated fix versions exist but Yarn Berry MVP marks relationship as unknown — inspect workspace manifests manually

Running all six generated command groups should address **12 of 29** findings. Rescan after each parent-upgrade step to measure remaining exposure.

---

## Why this matters

Strapi and Ghost are both headless CMS platforms with active security programs and large JavaScript dependency graphs. Scanning both lockfiles reveals shared structural risk — `html-minifier` with no fix spans both codebases — and divergent remediation profiles: Ghost had **zero direct findings** at its scanned revision; Strapi has **two direct findings with copy-and-run commands** plus a critical `handlebars` chain fixable without a parent bump.

For Strapi maintainers, the useful pre-release question is answered in one pass: **which issues can I fix today with `yarn add` or `yarn upgrade`, which require waiting on `@nx/js` / `syncpack`, and which have no fix at all (`html-minifier`)?** That triage split is what a flat advisory count cannot provide.

---

## Scan command

Run from the Strapi repository root or from the `examples/strapi` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Strapi at revision `e666ee26ae8e8c1758a048d6385afe1a62790a84`. Strapi releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/strapi/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-06-09 |
| CLI version | v1.20.0 |
| CVE Lite command | `node dist/index.js examples/strapi --verbose --all --json` |
| yarn audit command | `yarn npm audit` (Yarn 4.12.0 — fails: catalog protocol requires full install) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/strapi/yarn.lock` from [strapi/strapi@e666ee2](https://github.com/strapi/strapi/commit/e666ee26ae8e8c1758a048d6385afe1a62790a84) |
| Packages parsed (CVE Lite) | 2,887 |
| Unique vulnerable packages (CVE Lite) | 29 |
| OSV advisory matches (CVE Lite) | 61 |
| Fix command groups (CVE Lite) | 6 |
| First-pass coverage (CVE Lite) | 12 / 29 findings |
| Skipped findings with reason (CVE Lite) | 17 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install && npm run build
node dist/index.js examples/strapi --verbose --all
```

---

## Remaining risk

All 29 baseline findings remain open at the time of this study. No remediation was applied.

- **1 critical:** `handlebars@4.7.8` (transitive via `plop → node-plop`, fixable with `yarn upgrade handlebars`)
- **12 high:** including direct `lodash`, three `minimatch` versions (mixed fixability), `html-minifier` (no fix), `axios`, `cross-spawn`, three `tmp` versions, `path-to-regexp`, `undici`
- **13 medium:** direct `qs`, `@apollo/server`, `vite`, plus transitive `file-type`, `yaml`, `ejs`, `brace-expansion`, `tough-cookie`, `esbuild`, `react-router`, and a second `qs` version
- **3 low:** `@ai-sdk/provider-utils` (2 versions, no fix), `elliptic` (no fix)

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-06-09 (revision `e666ee2`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| handlebars | 4.7.8 | critical | transitive | 4.7.9 | GHSA-2qvq-rjwj-gvw9, GHSA-2w6w-674q-4c4q |
| axios | 1.13.6 | high | transitive | 1.16.0 | GHSA-35jp-ww65-95wh, GHSA-3g43-6gmg-66jw |
| cross-spawn | 6.0.5 | high | transitive | 6.0.6 | GHSA-3xgq-45jj-v275 |
| html-minifier | 3.5.21 | high | transitive | ⚠ no fix | GHSA-pfq8-rq6v-vf5m |
| lodash | 4.17.23 | high | direct | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| minimatch | 9.0.3 | high | transitive | 9.0.7 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 9.0.5 | high | transitive | 9.0.7 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 5.1.0 | high | transitive | 5.1.8 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| path-to-regexp | 8.3.0 | high | unknown | 8.4.0 ⊘ | GHSA-27v5-c462-wpq7, GHSA-j3q9-mxjg-w52f |
| tmp | 0.0.33 | high | transitive | 0.2.6 ⊘ | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| tmp | 0.2.5 | high | unknown | 0.2.6 ⊘ | GHSA-ph9p-34f9-6g65 |
| tmp | 0.2.1 | high | transitive | 0.2.6 | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| undici | 5.29.0 | high | unknown | 6.24.0 ⊘ | GHSA-2mjp-6q6p-2qxm, GHSA-4992-7rv2-5pvq |
| @apollo/server | 4.13.0 | medium | unknown | 5.5.0 ⊘ | GHSA-9q82-xgwf-vj6h |
| brace-expansion | 5.0.5 | medium | transitive | 5.0.6 | GHSA-jxxr-4gwj-5jf2 |
| ejs | 3.1.9 | medium | transitive | 3.1.10 | GHSA-ghr5-ch3p-vcr6 |
| esbuild | 0.21.5 | medium | unknown | 0.25.0 ⊘ | GHSA-67mh-4wv8-2f99 |
| file-type | 20.5.0 | medium | transitive | 21.3.1 ⊘ | GHSA-5v7r-6r5c-r473, GHSA-j47w-4g3g-c36v |
| qs | 6.14.2 | medium | direct | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| qs | 6.15.1 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| react-router | 6.30.3 | medium | unknown | 6.30.4 ⊘ | GHSA-2j2x-hqr9-3h42 |
| tough-cookie | 4.0.0 | medium | transitive | 4.1.4 | GHSA-72xf-g2v4-qvf3 |
| uuid | 8.3.2 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| uuid | 9.0.1 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| vite | 5.4.21 | medium | unknown | 6.4.2 ⊘ | GHSA-4w7w-66w2-5vf9 |
| yaml | 2.5.1 | medium | transitive | 2.8.2 | GHSA-48c2-rrv3-qjmp |
| @ai-sdk/provider-utils | 3.0.20 | low | unknown | ⚠ no fix | GHSA-866g-f22w-33x8 |
| @ai-sdk/provider-utils | 3.0.9 | low | unknown | ⚠ no fix | GHSA-866g-f22w-33x8 |
| elliptic | 6.6.1 | low | unknown | ⚠ no fix | GHSA-848j-6mx2-7j84 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
