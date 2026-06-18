# Lit Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-30

<p align="center">
  <img src="/cve-lite-cli/img/lit-logo.svg" alt="Lit logo" width="220"/>
</p>

## Summary

- **Project:** [Lit](https://github.com/lit/lit) — web components library and monorepo (`lit`, `lit-html`, labs, examples, and tooling)
- **Revision:** `20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6`
- **Lockfile:** `package-lock.json` (2,059 resolved packages, npm workspaces, lockfile v3)
- **Lead finding:** all **3 direct** vulnerable packages are **`rollup`** majors (`2.79.2`, `3.29.5`, `4.46.4`) — CVE Lite emits workspace-scoped upgrade commands to `2.80.0`, `3.30.0`, and `4.59.0`
- **First-pass coverage:** 13 findings have confident copy-and-run commands across **4** validated fix command groups
- **Direct vs transitive:** 3 direct / 96 transitive — five **critical** findings are entirely transitive (`handlebars`, `form-data`, `liquidjs`, and legacy utility paths)
- **Baseline findings:** 99 unique vulnerable packages (5 critical · 52 high · 33 medium · 9 low)
- **OSV advisory matches:** 289 CVE/advisory entries deduplicated into 99 packages
- **npm audit (same lockfile):** 107 vulnerability entries (7 critical · 65 high · 29 moderate · 6 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Lit is the reference implementation for **Web Components** in the modern JavaScript ecosystem — a large **npm workspaces monorepo** spanning core packages, labs tooling, localization examples, Next.js integration demos, and test infrastructure. At **2,059 resolved packages**, it sits between VS Code root (1,374) and Astro (2,228) in graph size.

Unlike framework monorepos that surface risk primarily in example apps, Lit’s **direct vulnerable packages are all `rollup` versions** (`2.79.2`, `3.29.5`, `4.46.4`) — the build toolchain the monorepo depends on directly. CVE Lite generates workspace-scoped upgrade commands for labs packages and parent-range `npm update` patterns across workspaces.

The five critical findings are **entirely transitive** — typical of documentation, localization, and legacy tooling paths:

**`handlebars@4.7.8` — critical prototype pollution / RCE class advisories.**

**`form-data@2.3.3` — critical unsafe random boundary generation.**

**`liquidjs@9.43.0` — critical template engine advisories** in localization/labs paths.

**`basic-ftp@5.0.5` and `minimist@1.2.0` — critical** legacy utility packages in deep toolchain chains.

The **three direct** findings share one remediation theme:

```bash
npm install -w packages/labs/compiler -w packages/labs/rollup-plugin-minify-html-literals …
```

CVE Lite validates separate upgrade targets for **`rollup@2.80.0`**, **`rollup@3.30.0`**, and **`rollup@4.59.0`** — reflecting three majors locked simultaneously in a long-lived monorepo.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against the same `package-lock.json` on the same machine on 2026-05-30.

| Metric | npm audit | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Total reported findings | 107 | 99 |
| Critical | 7 | 5 |
| High | 65 | 52 |
| Moderate / Medium | 29 | 33 |
| Low | 6 | 9 |
| Direct vs transitive breakdown | ✗ | ✓ (3 / 96) |
| Deduplicated package view | ✗ | ✓ |
| npm workspace-scoped commands | ✗ | ✓ (4 groups) |
| Skipped findings with reason | ✗ | ✓ (77 entries) |

**Why the totals differ:** `npm audit` counts **107 vulnerability entries** (advisory × path rows). CVE Lite counts **99 unique vulnerable package versions** once each. Nine `minimatch` majors each appear as separate unique packages in CVE Lite; `npm audit` may emit multiple rows per path.

**Critical severity:** `npm audit` reports **7 critical** entries; CVE Lite reports **5 critical** unique packages. Both flag `handlebars`, `form-data`, and related legacy packages — CVE Lite deduplicates per package version rather than per audit row.

**Fix guidance:**

`npm audit` lists advisories without workspace-aware grouping. CVE Lite generates **4 command groups** covering **13 findings** on first pass — including `npm install -w` for labs Rollup plugins, `npm update --workspace=…` for analyzer tooling, and `npm install lint-staged@15.4.2` as a parent upgrade. That is a materially better first-pass outcome than lockfile-only snapshots where zero commands are generated.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 99 | 5 | 52 | 33 | 9 | 3 | 96 | 4 |

---

## Fix Journey

No commands were run for this study.

The instinct on **5 critical** findings is to bump root dependencies. CVE Lite shows they are **transitive** — `liquidjs`, `handlebars`, and `form-data` require upstream labs or localization package decisions, not root `npm install`.

For **`rollup`**, three direct versions each get validated targets — a maintainer must upgrade labs compiler plugins and parent workspace ranges together, not assume one `rollup` bump fixes all three locked majors.

**13 of 99** first-pass coverage is unusually high for a lockfile-only snapshot — driven by npm workspace command generation and identifiable parent upgrades (`lint-staged`, `@web/test-runner` paths).

---

## Why this matters

Lit is embedded in countless design systems and component libraries. Security teams auditing Lit need to understand that risk splits between **direct Rollup toolchain debt** (three versions) and **transitive legacy template/HTTP utilities** in labs and localization paths — not a single `lit` package version alone.

CVE Lite's value is **workspace-aware remediation at 2,059-package scale**: 99 deduplicated findings, **13 first-pass fixes**, and **77 skipped findings with reasons** — versus **107 npm audit rows** without grouped commands.

---

## Scan command

Run from the Lit repository root or from the `examples/lit` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Lit at revision `20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/lit/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-30 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/lit --verbose --all --json` |
| npm audit command | `npm audit` / `npm audit --json` |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/lit/package-lock.json` from [lit/lit@20afabd](https://github.com/lit/lit/commit/20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6) |
| Packages parsed (CVE Lite) | 2,059 |
| Unique vulnerable packages (CVE Lite) | 99 |
| Vulnerability entries (npm audit) | 107 |
| Fix command groups (CVE Lite) | 4 |
| First-pass covered findings (CVE Lite) | 13 |
| Skipped findings with reason (CVE Lite) | 77 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/lit --verbose --all
```

Reproduce `npm audit` from the example directory:

```bash
cd examples/lit
npm audit
npm audit --json
```

Both tools were run against the same `package-lock.json` on the same machine on 2026-05-30.

---

## Remaining risk

All 99 baseline findings remain open at the time of this study. No remediation was applied.

- **5 critical:** `basic-ftp@5.0.5`, `form-data@2.3.3`, `handlebars@4.7.8`, `liquidjs@9.43.0`, `minimist@1.2.0`
- **52 high:** including **3 direct** `rollup` versions (`2.79.2`, `3.29.5`, `4.46.4`), three `next` versions, nine `minimatch` versions, four `ws` versions, three `axios` versions, `playwright`, `koa`, `ip` (no fix)
- **33 medium:** multiple `esbuild` versions, `vite` (two versions), `postcss`, `qs`, `js-yaml`, `useragent` (no fix), `parseuri` (no fix)
- **9 low:** `debug` (two versions), three `diff` versions, `cookie`, `send`, `serve-static`, `webpack`

**13 findings** have first-pass commands; **77** require parent upgrades, workspace-scoped manual releases, or acceptance of npm workspace path-reconstruction limits.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-30 (revision `20afabd`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| basic-ftp | 5.0.5 | critical | transitive | 5.3.1 | CVE-2026-27699, CVE-2026-41324… |
| form-data | 2.3.3 | critical | transitive | 2.5.4 | CVE-2025-7783 |
| handlebars | 4.7.8 | critical | transitive | 4.7.9 | CVE-2026-33916, CVE-2026-33937… |
| liquidjs | 9.43.0 | critical | transitive | 10.26.0 | CVE-2026-44644, CVE-2022-25948… |
| minimist | 1.2.0 | critical | transitive | 1.2.6 | CVE-2020-7598, CVE-2021-44906 |
| @babel/plugin-transform-modules-systemjs | 7.27.1 | high | transitive | 7.29.4 | CVE-2026-44728 |
| @koa/cors | 3.4.3 | high | transitive | 5.0.0 | CVE-2023-49803 |
| @xmldom/xmldom | 0.8.11 | high | transitive | 0.8.13 | CVE-2026-41673, CVE-2026-41674… |
| axios | 0.21.4 | high | transitive | 0.32.0 | CVE-2026-44495, CVE-2025-62718… |
| axios | 0.26.1 | high | transitive | 0.32.0 | CVE-2026-44495, CVE-2025-62718… |
| axios | 1.11.0 | high | transitive | 1.16.0 | CVE-2026-44494, CVE-2026-44495… |
| braces | 2.3.2 | high | transitive | 3.0.3 | CVE-2024-4068 |
| compressing | 1.10.3 | high | transitive | 1.10.5 | CVE-2026-40931, CVE-2026-24884 |
| fast-uri | 3.0.6 | high | transitive | 3.1.2 | CVE-2026-6321, CVE-2026-6322 |
| flatted | 2.0.2 | high | transitive | 3.4.2 | CVE-2026-32141, CVE-2026-33228 |
| flatted | 3.3.3 | high | transitive | 3.4.2 | CVE-2026-32141, CVE-2026-33228 |
| glob | 10.4.5 | high | transitive | 10.5.0 | CVE-2025-64756 |
| immutable | 3.8.2 | high | transitive | 3.8.3 | CVE-2026-29063 |
| ip | 1.1.9 | high | transitive | ⚠ no fix | CVE-2024-29415 |
| js-cookie | 3.0.5 | high | transitive | 3.0.7 | CVE-2026-46625 |
| jws | 3.2.2 | high | transitive | 3.2.3 | CVE-2025-65945 |
| koa | 2.16.2 | high | transitive | 2.16.4 | CVE-2026-27959, CVE-2025-62595 |
| lodash | 4.17.21 | high | transitive | 4.18.0 | CVE-2026-2950, CVE-2026-4800… |
| minimatch | 3.0.4 | high | transitive | 3.1.4 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 5.1.6 | high | transitive | 5.1.8 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 6.2.0 | high | transitive | 6.2.2 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 7.4.6 | high | transitive | 7.4.8 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 9.0.1 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 9.0.3 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 9.0.5 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996… |
| next | 13.5.11 | high | transitive | 14.1.1 | CVE-2026-44573, CVE-2026-44572… |
| next | 14.2.32 | high | transitive | 15.5.16 | CVE-2026-44573, CVE-2026-44572… |
| next | 15.5.7 | high | transitive | 15.5.18 | CVE-2026-44575, CVE-2026-45109… |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | CVE-2026-33672, CVE-2026-33671 |
| picomatch | 4.0.3 | high | transitive | 4.0.4 | CVE-2026-33672, CVE-2026-33671 |
| playwright | 1.55.0 | high | transitive | 1.55.1 | CVE-2025-59288 |
| preact | 10.27.1 | high | transitive | 10.27.3 | CVE-2026-22028 |
| rollup | 2.79.2 | high | direct | 2.80.0 | CVE-2026-27606 |
| rollup | 3.29.5 | high | direct | 3.30.0 | CVE-2026-27606 |
| rollup | 4.46.4 | high | direct | 4.59.0 | CVE-2026-27606 |
| serialize-javascript | 4.0.0 | high | transitive | 7.0.3 | — |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | CVE-2026-34043 |
| socket.io-parser | 3.3.4 | high | transitive | 3.3.5 | CVE-2026-33151 |
| socket.io-parser | 3.4.3 | high | transitive | 3.4.4 | CVE-2026-33151 |
| socket.io-parser | 4.2.4 | high | transitive | 4.2.6 | CVE-2026-33151 |
| systeminformation | 5.27.7 | high | transitive | 5.31.6 | CVE-2026-26318, CVE-2026-26280… |
| tar-fs | 2.1.1 | high | transitive | 2.1.4 | CVE-2025-48387, CVE-2024-12905… |
| tmp | 0.0.33 | high | transitive | 0.2.6 | CVE-2025-54798, CVE-2026-44705 |
| tmp | 0.2.1 | high | transitive | 0.2.6 | CVE-2025-54798, CVE-2026-44705 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | CVE-2026-44705 |
| trim | 0.0.1 | high | transitive | 0.0.3 | CVE-2020-7753 |
| ua-parser-js | 0.7.22 | high | transitive | 0.7.24 | CVE-2020-7793, CVE-2021-27292 |
| ws | 8.13.0 | high | transitive | 8.20.1 | CVE-2024-37890, CVE-2026-45736 |
| ws | 8.2.3 | high | transitive | 8.20.1 | CVE-2024-37890, CVE-2026-45736 |
| ws | 8.5.0 | high | transitive | 8.20.1 | CVE-2024-37890, CVE-2026-45736 |
| ws | 8.8.0 | high | transitive | 8.20.1 | CVE-2024-37890, CVE-2026-45736 |
| ajv | 6.12.6 | medium | transitive | 6.14.0 | CVE-2025-69873 |
| ajv | 8.17.1 | medium | transitive | 8.18.0 | CVE-2025-69873 |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | CVE-2026-33750 |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | CVE-2026-33750 |
| brace-expansion | 4.0.1 | medium | transitive | 5.0.5 | CVE-2026-33750 |
| esbuild | 0.17.19 | medium | transitive | 0.25.0 | — |
| esbuild | 0.18.20 | medium | transitive | 0.25.0 | — |
| esbuild | 0.21.5 | medium | transitive | 0.25.0 | — |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | — |
| ip-address | 10.0.1 | medium | transitive | 10.1.1 | CVE-2026-42338 |
| js-yaml | 3.13.1 | medium | transitive | 3.14.2 | CVE-2025-64718 |
| js-yaml | 3.14.1 | medium | transitive | 3.14.2 | CVE-2025-64718 |
| js-yaml | 4.1.0 | medium | transitive | 4.1.1 | CVE-2025-64718 |
| karma | 5.2.3 | medium | transitive | 6.3.16 | CVE-2022-0437, CVE-2021-23495 |
| log4js | 4.5.1 | medium | transitive | 6.4.0 | CVE-2022-21704 |
| micromatch | 3.1.10 | medium | transitive | 4.0.8 | CVE-2024-4067 |
| micromatch | 4.0.5 | medium | transitive | 4.0.8 | CVE-2024-4067 |
| parseuri | 0.0.6 | medium | transitive | ⚠ no fix | CVE-2024-36751 |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| postcss | 8.5.6 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| qs | 6.13.0 | medium | transitive | 6.15.2 | CVE-2025-15284, CVE-2026-8723… |
| qs | 6.14.0 | medium | transitive | 6.15.2 | CVE-2025-15284, CVE-2026-8723… |
| qs | 6.5.3 | medium | transitive | 6.14.1 | CVE-2025-15284 |
| request | 2.88.2 | medium | transitive | 3.0.0 | CVE-2023-28155 |
| tough-cookie | 2.5.0 | medium | transitive | 4.1.3 | CVE-2023-26136 |
| useragent | 2.3.0 | medium | transitive | ⚠ no fix | CVE-2020-26311 |
| uuid | 3.4.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| vite | 4.5.14 | medium | transitive | 6.4.2 | CVE-2026-39365, CVE-2025-62522… |
| vite | 5.4.19 | medium | transitive | 6.4.2 | CVE-2026-39365, CVE-2025-62522… |
| ws | 8.17.1 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| ws | 8.18.3 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| yaml | 2.3.1 | medium | transitive | 2.8.3 | CVE-2026-33532 |
| cookie | 0.4.2 | low | transitive | 0.7.0 | CVE-2024-47764 |
| debug | 3.2.6 | low | transitive | 3.2.7 | CVE-2017-16137 |
| debug | 4.1.1 | low | transitive | 4.3.1 | CVE-2017-16137 |
| diff | 3.5.0 | low | transitive | 3.5.1 | CVE-2026-24001 |
| diff | 4.0.2 | low | transitive | 4.0.4 | CVE-2026-24001 |
| diff | 5.2.0 | low | transitive | 5.2.2 | CVE-2026-24001 |
| send | 0.16.2 | low | transitive | 0.19.0 | CVE-2024-43799 |
| serve-static | 1.13.2 | low | transitive | 1.16.0 | CVE-2024-43800 |
| webpack | 5.101.3 | low | transitive | 5.104.1 | CVE-2025-68157, CVE-2025-68458 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
