# Gatsby Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-29

<p align="center">
  <img src="/cve-lite-cli/img/gatsby-logo.svg" alt="Gatsby logo" width="200"/>
</p>

## Summary

- **Project:** [Gatsby](https://github.com/gatsbyjs/gatsby) — React-based static site generator and open-source framework ecosystem (core, plugins, starters, and documentation tooling)
- **Revision:** `1f38c85963fd6bcfa9ccee2f925e5e02b00eafbb`
- **Lockfile:** `yarn.lock` (3,568 resolved packages, Yarn Classic 1.22.19)
- **Baseline findings:** 128 unique vulnerable packages (9 critical · 66 high · 42 medium · 11 low)
- **OSV advisory matches:** 220 CVE/advisory entries deduplicated into 128 packages
- **Direct vs transitive:** 5 direct / 123 transitive
- **Validated fix command groups generated:** 2
- **First-pass coverage:** 3 of 128 findings have confident copy-and-run commands
- **yarn audit (same lockfile):** 281 vulnerability entries (25 critical · 123 high · 122 moderate · 11 low) across 1,629 audited packages
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Gatsby is a long-running JavaScript monorepo that predates modern Yarn Berry workspaces and pnpm-first tooling. At **3,568 resolved packages** on a Yarn Classic v1 lockfile, it is one of the largest snapshots in the CVE Lite CLI example set — larger than VS Code root (1,374), Turborepo (1,776), and Astro (2,228), and below Storybook-scale Berry graphs when those are present in the repo.

The direct/transitive split (**5 direct, 123 transitive**) shows where maintainers have immediate leverage versus where risk lives in legacy integration and build-tooling chains. CVE Lite surfaces **Yarn Classic path limitations** explicitly in coverage notes — dependency path reconstruction is limited compared to npm or pnpm lockfiles — yet still deduplicates **128 unique vulnerable packages** with severity, relationship, and fix-target hints.

The nine critical findings are almost entirely **transitive legacy packages** typical of long-lived monorepos:

**`handlebars@4.7.7` — critical prototype pollution / RCE class advisories.** Template compilation paths in older toolchain stacks.

**`form-data@2.3.3`, `2.1.4`, `3.0.0` — critical unsafe random boundary generation.** Multiple majors locked across HTTP client eras.

**`loader-utils@0.2.17` — critical prototype pollution** in webpack-era loader resolution.

**`@babel/traverse@7.20.13` — critical** compiler traversal advisory — deep in the Babel graph, not a root `package.json` direct dep.

**`parse-url@6.0.0`, `json-schema@0.2.3`, `xmldom@0.1.27` — critical** legacy URL/XML/schema helpers buried in integration packages.

The **five direct** findings are where a maintainer can act from the root manifest without guessing parent chains:

```bash
yarn add glob@10.5.0 js-yaml@4.1.1 @babel/runtime@7.26.10
```

CVE Lite validates **`glob@10.5.0`** and **`js-yaml@4.1.1`** as high-severity direct upgrades and **`@babel/runtime@7.26.10`** as a medium direct upgrade. Additional direct **`js-yaml`** versions (`3.7.0`, `3.14.1`, `4.1.0`) appear as separate findings — a reminder that duplicate majors in Yarn Classic graphs can each carry advisories even when one upgrade path exists.

---

## Comparison Note: CVE Lite CLI vs yarn audit

Both tools were run against the same `yarn.lock` on the same machine on 2026-05-29.

| Metric | yarn audit (1.22.19) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Packages audited / parsed | 1,629 | 3,568 |
| Total reported findings | 281 | 128 |
| Critical | 25 | 9 |
| High | 123 | 66 |
| Moderate / Medium | 122 | 42 |
| Low | 11 | 11 |
| Direct vs transitive breakdown | ✗ | ✓ (5 / 123) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | ✗ | ✓ |
| Copy-and-run command groups | ✗ | ✓ (2 groups) |
| Skipped findings with reason | ✗ | ✓ (123 entries) |

**Why package counts differ:** `yarn audit` reports **1,629** audited packages from its dependency tree walk. CVE Lite parses **3,568** resolved package entries from the lockfile graph — a broader resolved view of the same `yarn.lock` snapshot.

**Why finding totals differ:** `yarn audit` counts **281 vulnerability entries** (advisory × path rows). CVE Lite counts **128 unique vulnerable package versions** once each. Example: multiple `form-data` majors each appear as separate unique packages in CVE Lite; `yarn audit` may emit multiple rows per advisory path.

**Severity mix:** `yarn audit` reports **25 critical** entries; CVE Lite reports **9 critical** unique packages. Both flag the same underlying critical packages (`handlebars`, legacy `form-data`, `loader-utils`, etc.) — CVE Lite's critical column is per unique package version, not per audit row.

**Fix guidance:**

`yarn audit` does not produce validated, copy-and-run upgrade commands grouped by severity. CVE Lite generates:

```bash
yarn add glob@10.5.0 js-yaml@4.1.1
yarn add @babel/runtime@7.26.10
```

…covering **3 of 128** findings on first pass. The remaining **123** are skipped with explicit reasons — mostly transitive chains without an auto-identified safe parent upgrade on Yarn Classic path reconstruction.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 128 | 9 | 66 | 42 | 11 | 5 | 123 | 2 |

---

## Fix Journey

No commands were run for this study.

The first instinct on **9 critical** findings is to run a bulk upgrade. CVE Lite's output makes the constraint visible: **only 3 findings** have confident first-pass commands from this lockfile-only snapshot. Critical packages like **`handlebars@4.7.7`** and legacy **`xmldom@0.1.27`** require parent-chain or upstream package maintainer decisions — not root `yarn add` guesses.

For **`glob@10.4.5`** and **`js-yaml@3.7.0`**, the direct upgrade path is immediate and validated.

For **`@babel/runtime@7.23.7`**, CVE Lite scans **18** versions and notes **17** still known vulnerable on the advisory path — the command targets **`7.26.10`** as the validated non-vulnerable choice for this direct constraint.

---

## Why this matters

Gatsby represents a large class of real-world repositories: **Yarn Classic monorepos** with years of integration packages, webpack-era tooling, and plugin ecosystems. Security teams still need to triage these graphs even as greenfield projects move to pnpm and Yarn Berry.

CVE Lite's value on this snapshot is **triage at scale without pretending paths are complete**: 128 deduplicated packages, explicit Yarn Classic limitations, **5 direct levers**, and **123 skipped findings with reasons** — versus **281 yarn audit rows** without remediation grouping.

---

## Scan command

Run from the Gatsby repository root or from the `examples/gatsby` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Gatsby at revision `1f38c85963fd6bcfa9ccee2f925e5e02b00eafbb`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/gatsby/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-29 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/gatsby --verbose --all --json` |
| yarn audit command | `yarn audit` / `yarn audit --json` (yarn 1.22.19) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/gatsby/yarn.lock` from [gatsbyjs/gatsby@1f38c85](https://github.com/gatsbyjs/gatsby/commit/1f38c85963fd6bcfa9ccee2f925e5e02b00eafbb) |
| Packages parsed (CVE Lite) | 3,568 |
| Unique vulnerable packages (CVE Lite) | 128 |
| Vulnerability entries (yarn audit) | 281 |
| Fix command groups (CVE Lite) | 2 |
| First-pass covered findings (CVE Lite) | 3 |
| Skipped findings with reason (CVE Lite) | 123 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/gatsby --verbose --all
```

Reproduce `yarn audit` from the example directory:

```bash
cd examples/gatsby
yarn audit
yarn audit --json
```

Both tools were run against the same `yarn.lock` on the same machine on 2026-05-29.

---

## Remaining risk

All 128 baseline findings remain open at the time of this study. No remediation was applied.

- **9 critical:** `@babel/traverse`, three `form-data` versions, `handlebars`, `json-schema`, `loader-utils`, `parse-url`, `xmldom`
- **66 high:** including **2 direct** (`glob@10.4.5`, `js-yaml@3.7.0`), plus transitive toolchain packages (`axios`, `lodash`, five `path-to-regexp` versions, three `semver` versions, `html-minifier` and `xlsx` with no fix, `parse-git-config` with no fix)
- **42 medium:** including **3 direct** (`@babel/runtime@7.23.7`, `js-yaml@3.14.1`, `js-yaml@4.1.0`), plus five `postcss` versions, three `qs` versions, three `uuid` versions, `vue-template-compiler` (no fix)
- **11 low:** `cookie` (three versions), `webpack`, `send`, `serve-static`, and other legacy HTTP/tooling packages

Only **3 findings** have first-pass copy-and-run commands. The other **125** require parent upgrades, manual upstream bumps, or acceptance of Yarn Classic path-reconstruction limits documented in the scan output.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-29 (revision `1f38c85`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @babel/traverse | 7.20.13 | critical | transitive | 7.23.2 | CVE-2023-45133 |
| form-data | 2.1.4 | critical | transitive | 2.5.4 | CVE-2025-7783 |
| form-data | 2.3.3 | critical | transitive | 2.5.4 | CVE-2025-7783 |
| form-data | 3.0.0 | critical | transitive | 3.0.4 | CVE-2025-7783 |
| handlebars | 4.7.7 | critical | transitive | 4.7.9 | CVE-2026-33916, CVE-2026-33937… |
| json-schema | 0.2.3 | critical | transitive | 0.4.0 | CVE-2021-3918 |
| loader-utils | 0.2.17 | critical | transitive | 1.4.1 | CVE-2022-37601 |
| parse-url | 6.0.0 | critical | transitive | 8.1.0 | CVE-2022-0722, CVE-2022-2216… |
| xmldom | 0.1.27 | critical | transitive | 0.5.0 | CVE-2026-41673, CVE-2021-32796… |
| @babel/plugin-transform-modules-systemjs | 7.20.11 | high | transitive | 7.29.4 | CVE-2026-44728 |
| @hapi/hoek | 6.2.4 | high | transitive | 8.5.1 | CVE-2020-36604 |
| @xmldom/xmldom | 0.7.10 | high | transitive | 0.8.13 | CVE-2026-41673, CVE-2026-41674… |
| @xmldom/xmldom | 0.8.6 | high | transitive | 0.8.13 | CVE-2026-41673, CVE-2026-41674… |
| ansi-html | 0.0.7 | high | transitive | 0.0.8 | CVE-2021-23424 |
| ansi-regex | 4.1.0 | high | transitive | 4.1.1 | CVE-2021-3807 |
| axios | 1.13.5 | high | transitive | 1.15.2 | CVE-2025-62718, CVE-2026-42044… |
| body-parser | 1.20.1 | high | transitive | 1.20.3 | CVE-2024-45590 |
| body-parser | 1.20.2 | high | transitive | 1.20.3 | CVE-2024-45590 |
| braces | 2.3.2 | high | transitive | 3.0.3 | CVE-2024-4068 |
| cross-spawn | 5.1.0 | high | transitive | 6.0.6 | CVE-2024-21538 |
| cross-spawn | 7.0.3 | high | transitive | 7.0.5 | CVE-2024-21538 |
| fast-json-patch | 3.0.0-1 | high | transitive | 3.1.1 | CVE-2021-4279 |
| flatted | 3.1.0 | high | transitive | 3.4.2 | CVE-2026-32141, CVE-2026-33228 |
| glob | 10.4.5 | high | direct | 10.5.0 | CVE-2025-64756 |
| hoek | 6.1.3 | high | transitive | 8.5.1 | CVE-2020-36604 |
| html-minifier | 4.0.0 | high | transitive | ⚠ no fix | CVE-2022-37620 |
| http-cache-semantics | 3.8.1 | high | transitive | 4.1.1 | CVE-2022-25881 |
| immutable | 3.7.6 | high | transitive | 3.8.3 | CVE-2026-29063 |
| ip | 1.1.5 | high | transitive | 1.1.9 | CVE-2024-29415, CVE-2023-42282 |
| js-yaml | 3.7.0 | high | direct | 3.14.2 | CVE-2025-64718 |
| json5 | 0.5.1 | high | transitive | 1.0.2 | CVE-2022-46175 |
| json5 | 1.0.1 | high | transitive | 1.0.2 | CVE-2022-46175 |
| jsonwebtoken | 8.5.1 | high | transitive | 9.0.0 | CVE-2022-23539, CVE-2022-23541… |
| jws | 3.2.2 | high | transitive | 3.2.3 | CVE-2025-65945 |
| loader-utils | 3.2.0 | high | transitive | 3.2.1 | CVE-2022-37603, CVE-2022-37599 |
| lodash | 4.17.21 | high | transitive | 4.18.0 | CVE-2026-2950, CVE-2026-4800… |
| lodash-es | 4.17.23 | high | transitive | 4.18.0 | CVE-2026-2950, CVE-2026-4800 |
| lodash.set | 4.3.2 | high | transitive | 4.17.19 | CVE-2020-8203 |
| lodash.template | 4.5.0 | high | transitive | 4.18.0 | CVE-2021-23337, CVE-2026-4800 |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | CVE-2026-27904, CVE-2026-26996… |
| multer | 2.0.1 | high | transitive | 2.1.1 | CVE-2026-3520, CVE-2025-7338… |
| node-fetch | 2.1.2 | high | transitive | 2.6.7 | CVE-2022-0235, CVE-2020-15168 |
| normalize-url | 4.5.0 | high | transitive | 4.5.1 | CVE-2021-33502 |
| nth-check | 1.0.1 | high | transitive | 2.0.1 | CVE-2021-3803 |
| parse-git-config | 2.0.3 | high | transitive | ⚠ no fix | CVE-2025-25975 |
| parse-path | 4.0.1 | high | transitive | 5.0.0 | CVE-2022-0624 |
| path-to-regexp | 0.1.10 | high | transitive | 0.1.13 | CVE-2026-4867, CVE-2024-52798 |
| path-to-regexp | 0.1.12 | high | transitive | 0.1.13 | CVE-2026-4867 |
| path-to-regexp | 0.1.7 | high | transitive | 0.1.13 | CVE-2026-4867, CVE-2024-45296… |
| path-to-regexp | 1.7.0 | high | transitive | 1.9.0 | CVE-2024-45296 |
| path-to-regexp | 6.2.0 | high | transitive | 6.3.0 | CVE-2024-45296 |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | CVE-2026-33672, CVE-2026-33671 |
| qs | 6.5.2 | high | transitive | 6.14.1 | CVE-2025-15284, CVE-2022-24999 |
| semver | 6.3.0 | high | transitive | 6.3.1 | CVE-2022-25883 |
| semver | 7.5.0 | high | transitive | 7.5.2 | CVE-2022-25883 |
| semver | 7.5.1 | high | transitive | 7.5.2 | CVE-2022-25883 |
| serialize-javascript | 4.0.0 | high | transitive | 7.0.3 | — |
| serialize-javascript | 5.0.1 | high | transitive | 7.0.5 | CVE-2026-34043 |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | CVE-2026-34043 |
| socket.io-parser | 4.2.4 | high | transitive | 4.2.6 | CVE-2026-33151 |
| svgo | 2.8.0 | high | transitive | 2.8.1 | CVE-2026-29074 |
| tar | 4.4.19 | high | transitive | 7.5.11 | CVE-2026-24842, CVE-2026-26960… |
| terser | 4.8.0 | high | transitive | 4.8.1 | CVE-2022-25858 |
| tmp | 0.0.33 | high | transitive | 0.2.6 | CVE-2025-54798, CVE-2026-44705 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | CVE-2026-44705 |
| trim | 0.0.1 | high | transitive | 0.0.3 | CVE-2020-7753 |
| trim-newlines | 1.0.0 | high | transitive | 3.0.1 | CVE-2021-33623 |
| trim-newlines | 2.0.0 | high | transitive | 3.0.1 | CVE-2021-33623 |
| ua-parser-js | 0.7.31 | high | transitive | 0.7.33 | CVE-2022-25927 |
| validator | 13.9.0 | high | transitive | 13.15.22 | CVE-2025-56200, CVE-2025-12758 |
| websocket-extensions | 0.1.3 | high | transitive | 0.1.4 | CVE-2020-7662 |
| ws | 7.5.5 | high | transitive | 7.5.10 | CVE-2024-37890 |
| ws | 8.11.0 | high | transitive | 8.20.1 | CVE-2024-37890, CVE-2026-45736 |
| xlsx | 0.18.3 | high | transitive | ⚠ no fix | CVE-2023-30533, CVE-2024-22363 |
| y18n | 4.0.0 | high | transitive | 4.0.1 | CVE-2020-7774 |
| @babel/helpers | 7.20.7 | medium | transitive | 7.26.10 | CVE-2025-27789 |
| @babel/runtime | 7.23.7 | medium | direct | 7.26.10 | CVE-2025-27789 |
| @babel/runtime-corejs3 | 7.10.3 | medium | transitive | 7.26.10 | CVE-2025-27789 |
| @octokit/plugin-paginate-rest | 1.1.2 | medium | transitive | 9.2.2 | CVE-2025-25288 |
| @octokit/request | 5.4.9 | medium | transitive | 8.4.1 | CVE-2025-25290 |
| @octokit/request-error | 1.0.4 | medium | transitive | 5.1.1 | CVE-2025-25289 |
| @octokit/request-error | 2.0.2 | medium | transitive | 5.1.1 | CVE-2025-25289 |
| @parcel/reporter-dev-server | 2.8.3 | medium | transitive | 2.16.4 | CVE-2025-56648 |
| ajv | 8.12.0 | medium | transitive | 8.18.0 | CVE-2025-69873 |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | CVE-2026-33750 |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | CVE-2026-33750 |
| express | 4.18.2 | medium | transitive | 4.20.0 | CVE-2024-43796, CVE-2024-29041 |
| file-type | 16.5.4 | medium | transitive | 21.3.1 | CVE-2026-31808 |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | — |
| got | 6.7.1 | medium | transitive | 11.8.5 | CVE-2022-33987 |
| hosted-git-info | 2.8.4 | medium | transitive | 2.8.9 | CVE-2021-23362 |
| js-yaml | 3.14.1 | medium | direct | 3.14.2 | CVE-2025-64718 |
| js-yaml | 4.1.0 | medium | direct | 4.1.1 | CVE-2025-64718 |
| katex | 0.12.0 | medium | transitive | 0.16.21 | CVE-2024-28246, CVE-2024-28243… |
| micromatch | 3.1.10 | medium | transitive | 4.0.8 | CVE-2024-4067 |
| postcss | 5.2.18 | medium | transitive | 8.5.10 | CVE-2021-23382, CVE-2023-44270… |
| postcss | 6.0.1 | medium | transitive | 8.5.10 | CVE-2021-23382, CVE-2023-44270… |
| postcss | 6.0.23 | medium | transitive | 8.5.10 | CVE-2021-23382, CVE-2023-44270… |
| postcss | 7.0.36 | medium | transitive | 8.5.10 | CVE-2023-44270, CVE-2026-41305 |
| postcss | 8.4.24 | medium | transitive | 8.5.10 | CVE-2023-44270, CVE-2026-41305 |
| prismjs | 1.29.0 | medium | transitive | 1.30.0 | CVE-2024-53382 |
| qs | 6.11.0 | medium | transitive | 6.14.2 | CVE-2025-15284, CVE-2026-2391 |
| qs | 6.13.0 | medium | transitive | 6.15.2 | CVE-2025-15284, CVE-2026-8723… |
| qs | 6.14.1 | medium | transitive | 6.15.2 | CVE-2026-8723, CVE-2026-2391 |
| react-devtools-core | 4.20.2 | medium | transitive | 4.28.4 | CVE-2023-5654 |
| request | 2.88.2 | medium | transitive | 3.0.0 | CVE-2023-28155 |
| tough-cookie | 2.5.0 | medium | transitive | 4.1.3 | CVE-2023-26136 |
| tough-cookie | 3.0.1 | medium | transitive | 4.1.3 | CVE-2023-26136 |
| trim-off-newlines | 1.0.1 | medium | transitive | 1.0.3 | CVE-2021-23425 |
| uuid | 3.4.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 9.0.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| vue-template-compiler | 2.7.14 | medium | transitive | ⚠ no fix | CVE-2024-6783 |
| word-wrap | 1.2.3 | medium | transitive | 1.2.4 | CVE-2023-26115 |
| ws | 8.17.1 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| yaml | 1.10.0 | medium | transitive | 1.10.3 | CVE-2026-33532 |
| yaml | 2.8.2 | medium | transitive | 2.8.3 | CVE-2026-33532 |
| @tootallnate/once | 2.0.0 | low | transitive | 2.0.1 | CVE-2026-3449 |
| cookie | 0.4.2 | low | transitive | 0.7.0 | CVE-2024-47764 |
| cookie | 0.5.0 | low | transitive | 0.7.0 | CVE-2024-47764 |
| cookie | 0.6.0 | low | transitive | 0.7.0 | CVE-2024-47764 |
| diff | 4.0.1 | low | transitive | 4.0.4 | CVE-2026-24001 |
| es5-ext | 0.10.53 | low | transitive | 0.10.63 | CVE-2024-27088 |
| min-document | 2.19.0 | low | transitive | 2.19.1 | CVE-2025-57352 |
| on-headers | 1.0.2 | low | transitive | 1.1.0 | CVE-2025-7339 |
| send | 0.18.0 | low | transitive | 0.19.0 | CVE-2024-43799 |
| serve-static | 1.15.0 | low | transitive | 1.16.0 | CVE-2024-43800 |
| webpack | 5.98.0 | low | transitive | 5.104.1 | CVE-2025-68157, CVE-2025-68458 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
