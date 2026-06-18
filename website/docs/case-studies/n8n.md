# n8n Case Study

> Verified baseline scan — CVE Lite CLI v1.19.1 · 2026-06-02

<p align="center">
  <img src="/cve-lite-cli/img/n8n-logo.png" alt="n8n logo" width="320"/>
</p>

## Summary

- **Project:** [n8n](https://github.com/n8n-io/n8n) — fair-code workflow automation platform with native AI capabilities, 400+ integrations, and a large TypeScript pnpm monorepo
- **Revision:** `e2e03948562e1c744be4ef7898b3b754fbdb6cf9`
- **Lockfile:** `pnpm-lock.yaml` (3,746 resolved packages, pnpm workspace monorepo)
- **Baseline findings:** 32 unique vulnerable packages (0 critical · 13 high · 14 medium · 5 low)
- **OSV advisory matches:** 53 CVE/advisory entries deduplicated into 32 packages
- **Direct vs transitive:** 1 direct / 31 transitive
- **Validated fix command groups generated:** 4
- **First-pass coverage:** 4 of 32 findings have confident copy-and-run commands (one partial path on `@tootallnate/once`)
- **pnpm audit (same lockfile):** 51 vulnerability entries (19 high · 25 moderate · 7 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

n8n sits in the **workflow automation / integration platform** category — distinct from pure AI SDK monorepos (OpenAI Agents JS, Mastra) or UI tooling (Storybook, Lit). At **3,746 resolved packages**, the graph is large but not the largest in the portfolio (Mastra: 4,555; Ghost: 4,447). The vulnerability profile mixes **one direct toolchain finding** with **31 transitive** integration, email, editor, and build-tooling risks.

**`turbo@2.9.4` — medium, direct.** CVE Lite generates a validated direct upgrade:

```bash
pnpm add turbo@2.9.14
```

That is the clearest “edit root manifest and rescan” outcome on this snapshot — the same class of finding as Vercel AI SDK and Mastra, but on a workflow platform where `turbo` orchestrates dozens of packages.

**High-severity build and docs tooling:** three `minimatch` majors, two `rollup` majors, `vite@8.0.2`, `storybook@10.1.11`, `serialize-javascript`, `svgo`, `tmp`, and `html-minifier` — typical of a monorepo that ships editor UI, email templates (MJML), and frontend tooling. CVE Lite names validated targets (`9.0.7`, `4.59.0`, `8.0.5`, etc.) but most rows are **skipped** until parent packages (`@n8n/*` workspaces, Storybook consumers, bundler configs) ship safe releases.

**`@babel/plugin-transform-modules-systemjs@7.29.0` — high, with within-range refresh.** CVE Lite generates:

```bash
pnpm update --recursive --no-save @babel/plugin-transform-modules-systemjs
```

This is a **lockfile refresh** pattern (v1.19.1 within-range transitive fix): the plugin’s declared range already permits `7.29.7+`; no parent bump is required.

**Email and content-safety cluster (medium):** `dompurify`, `mjml`, `nodemailer`, `markdown-it`, `showdown`, `element-plus`, `prismjs` — risk relevant to **user-supplied HTML/email** in automation workflows, not abstract CVE noise.

**SheetJS CDN tarball (`xlsx`) — high, unknown relationship:** n8n pins `xlsx` from `cdn.sheetjs.com` rather than npm. CVE Lite still flags CVE-2023-30533 / CVE-2024-22363; remediation requires upstream packaging decisions, not a one-line `pnpm add`.

**Partial parent upgrade on `@tootallnate/once`:** `pnpm add jest-environment-jsdom@30.0.0` covers **one** of five documented paths to `@tootallnate/once@2.0.0`; LangChain and Google Cloud storage chains remain after a single command.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-06-02 (Node.js 22+, pnpm 10.14.0).

| Metric | pnpm audit (10.14.0) | CVE Lite CLI v1.19.1 |
|---|---:|---:|
| Packages audited / parsed | 3,746 | 3,746 |
| Total reported findings | 51 | 32 |
| Critical | 0 | 0 |
| High | 19 | 13 |
| Moderate / Medium | 25 | 14 |
| Low | 7 | 5 |
| Direct vs transitive breakdown | ✗ | ✓ (1 / 31) |
| Deduplicated package view | ✗ | ✓ |
| Parent package named per finding | partial (paths) | ✓ |
| Specific copy-and-run commands | partial | ✓ (4 groups) |
| Skipped findings with reason | ✗ | ✓ (28 entries) |

**Why the totals differ:** `pnpm audit` counts **51 vulnerability entries** (advisory × dependency path rows in metadata). CVE Lite counts **32 unique vulnerable package versions** once each. Example: three `minimatch` majors are **three rows** in CVE Lite and **multiple path rows** in `pnpm audit`.

**Severity bucketing:** `pnpm audit` reports **19 high** entries; CVE Lite reports **13 high** unique packages. Path multiplication across editor, CLI, and integration packages inflates audit output without adding distinct remediation targets.

**Fix guidance:**

`pnpm audit` may suggest broad `pnpm audit fix` changes. CVE Lite separates **four command groups** — Babel within-range refresh, direct `turbo`, ESLint plugin-kit refresh, and partial `jest-environment-jsdom` parent upgrade — and **28 skipped rows** explaining why `rollup`, `vite`, `storybook`, `xlsx`, and email-template packages need parent or upstream routing.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 32 | 0 | 13 | 14 | 5 | 1 | 31 | 4 |

Four command groups covering four findings (with partial coverage on one low finding) is a **realistic first pass** on a 3,746-package integration monorepo — the case study documents where triage time goes after the direct `turbo` bump.

---

## Fix Journey

No commands were run for this study.

**What a maintainer should do first:**

1. **Run the direct command:** `pnpm add turbo@2.9.14`, then rescan.
2. **Run generated within-range refreshes:** `@babel/plugin-transform-modules-systemjs` and `@eslint/plugin-kit` update commands.
3. **Evaluate `jest-environment-jsdom@30.0.0`** if test tooling is in scope — rescan for remaining `@tootallnate/once` paths via LangChain / GCP clients.
4. **Route high build-tooling** (`rollup`, `vite`, `storybook`, `minimatch`) to owners of the workspaces that import them — not root `pnpm add minimatch`.
5. **Treat `xlsx` CDN pin separately** — advisory fix may require changing how SheetJS is vendored, not a semver bump on npm.

**What not to do:**

- `pnpm audit fix --force` across 3,746 packages without reviewing breaking changes in workflow nodes and editor UI.
- `pnpm add rollup@4.59.0` at the monorepo root without validating which workspace owns each `rollup` major.

---

## Why this matters

Teams running **workflow automation** platforms inherit dependency graphs from **email rendering**, **rich text editors**, **AI/LLM clients**, and **frontend build pipelines** — not just runtime API servers. n8n’s snapshot shows:

1. **One direct finding** (`turbo`) maintainers can fix immediately from the root toolchain.
2. **Within-range transitive refresh** (Babel plugin) that v1.19.1 surfaces correctly instead of suggesting a wrong parent upgrade.
3. **Integration-heavy transitive risk** (MJML, DOMPurify, Nodemailer) where CVE IDs map to **user-content safety**, not devDependency noise.
4. **Non-npm tarball pins** (`xlsx` from CDN) that scanners must still flag with explicit “unknown relationship” honesty.

For security engineers comparing platforms: n8n has **more findings per package count** than LangChain.js (13 / 2,174) but **fewer** than Storybook (92 / 3,008) — with a **stronger direct-fix story** than OpenAI Agents JS (0 direct).

---

## Scan command

Run from the n8n repository root or from the `examples/n8n` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects n8n at revision `e2e03948562e1c744be4ef7898b3b754fbdb6cf9`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/n8n/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-06-02 |
| CLI version | v1.19.1 |
| CVE Lite command | `node dist/index.js examples/n8n --verbose --all --json` |
| pnpm audit command | `pnpm audit` / `pnpm audit --json` (Node.js 22+, pnpm 10.14.0) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/n8n/pnpm-lock.yaml` from [n8n-io/n8n@e2e0394](https://github.com/n8n-io/n8n/commit/e2e03948562e1c744be4ef7898b3b754fbdb6cf9) |
| Packages parsed (CVE Lite) | 3,746 |
| Unique vulnerable packages (CVE Lite) | 32 |
| Vulnerability entries (pnpm audit metadata) | 51 |
| Fix command groups (CVE Lite) | 4 |
| First-pass covered findings (CVE Lite) | 4 |
| Skipped findings with reason (CVE Lite) | 28 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/n8n --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/n8n
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-06-02.

---

## Remaining risk

All 32 baseline findings remain open at the time of this study. No remediation was applied.

- **13 high:** Babel plugin, `html-minifier`, three `minimatch` versions, two `rollup` versions, `serialize-javascript`, `storybook`, `svgo`, `tmp`, `vite`, CDN `xlsx`
- **14 medium:** `turbo` (direct), `dompurify`, `element-plus`, `file-type`, `ip-address`, `markdown-it`, `mjml`, `nodemailer`, two `postcss` versions, `prismjs`, `qs`, `showdown`, `uuid`
- **5 low:** two `@eslint/plugin-kit` versions, two `@tootallnate/once` versions, `elliptic`

**4 findings** have first-pass commands (including partial `@tootallnate/once` coverage via `jest-environment-jsdom`); **28** require parent upgrades, upstream releases, or CDN packaging changes.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-06-02 (revision `e2e0394`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @babel/plugin-transform-modules-systemjs | 7.29.0 | high | transitive | 7.29.4 | CVE-2026-44728 |
| html-minifier | 4.0.0 | high | transitive | — | CVE-2022-37620 |
| minimatch | 8.0.4 | high | transitive | 8.0.6 | CVE-2026-27904, CVE-2026-26996, CVE-2026-27903 |
| minimatch | 9.0.1 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996, CVE-2026-27903 |
| minimatch | 9.0.3 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996, CVE-2026-27903 |
| rollup | 2.79.2 | high | transitive | 2.80.0 | CVE-2026-27606 |
| rollup | 4.52.4 | high | transitive | 4.59.0 | CVE-2026-27606 |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | CVE-2026-34043 |
| storybook | 10.1.11 | high | transitive | 10.2.10 | CVE-2026-27148 |
| svgo | 3.3.2 | high | transitive | 3.3.3 | CVE-2026-29074 |
| tmp | 0.2.4 | high | transitive | 0.2.6 | CVE-2026-44705 |
| vite | 8.0.2 | high | transitive | 8.0.5 | CVE-2026-39365, CVE-2026-39363, CVE-2026-39364 |
| xlsx | https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz | high | unknown | — | CVE-2023-30533, CVE-2024-22363 |
| dompurify | 3.1.7 | medium | transitive | 3.4.0 | CVE-2026-41239, CVE-2026-41240, CVE-2026-0540… (+3) |
| element-plus | 2.4.3 | medium | transitive | 2.11.1 | CVE-2025-57665 |
| file-type | 16.5.4 | medium | transitive | 21.3.1 | CVE-2026-31808 |
| ip-address | 9.0.5 | medium | transitive | 10.1.1 | CVE-2026-42338 |
| markdown-it | 13.0.2 | medium | transitive | 14.1.1 | CVE-2026-2327 |
| mjml | 4.15.3 | medium | transitive | 5.0.0 | CVE-2025-67898 |
| nodemailer | 7.0.11 | medium | transitive | 8.0.5 | GHSA-c7w3-x93f-qmm8, GHSA-vvjj-xcjg-gr5g |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| postcss | 8.5.8 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| prismjs | 1.29.0 | medium | transitive | 1.30.0 | CVE-2024-53382 |
| qs | 6.14.2 | medium | transitive | 6.15.2 | CVE-2026-8723 |
| showdown | 2.1.0 | medium | transitive | — | CVE-2024-1899 |
| turbo | 2.9.4 | medium | direct | 2.9.14 | CVE-2026-45772, CVE-2026-45773 |
| uuid | 10.0.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| @eslint/plugin-kit | 0.2.8 | low | transitive | 0.3.4 | GHSA-xffm-g5w8-qvg7 |
| @eslint/plugin-kit | 0.3.2 | low | transitive | 0.3.4 | GHSA-xffm-g5w8-qvg7 |
| @tootallnate/once | 1.1.2 | low | transitive | 2.0.1 | CVE-2026-3449 |
| @tootallnate/once | 2.0.0 | low | transitive | 2.0.1 | CVE-2026-3449 |
| elliptic | 6.6.1 | low | transitive | — | CVE-2025-14505 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
