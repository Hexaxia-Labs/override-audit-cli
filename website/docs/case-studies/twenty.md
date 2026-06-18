# Twenty Case Study

> Verified baseline scan — CVE Lite CLI v1.20.0 · 2026-06-09

<p align="center">
  <img src="/cve-lite-cli/img/twenty-logo.svg" alt="Twenty logo" width="280"/>
</p>

## Summary

- **Project:** [Twenty](https://github.com/twentyhq/twenty) — open-source CRM alternative (48k+ GitHub stars) built as a TypeScript **Nx + Yarn Berry** monorepo with NestJS backend, React frontend, and PostgreSQL
- **Revision:** `fc90b4ba8bb0a5d7c12c846fe9b2305527a0f7a8`
- **Lockfile:** `yarn.lock` (5,451 resolved packages, Yarn Berry 4.13.0)
- **Baseline findings:** 105 unique vulnerable packages (6 critical · 40 high · 54 medium · 5 low)
- **OSV advisory matches:** 167 CVE/advisory entries deduplicated into 105 packages
- **Direct vs transitive:** 0 direct / 28 transitive / 77 unknown (Yarn Berry path classification limited in this MVP)
- **Validated fix command groups generated:** 4
- **First-pass coverage:** 24 of 105 findings have confident copy-and-run commands
- **yarn npm audit (same lockfile):** no audit suggestions (lockfile-only snapshot — catalog/workspace protocols require full monorepo install)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Twenty is the **largest lockfile snapshot** in the CVE Lite CLI case study portfolio at **5,451 resolved packages** — exceeding Mastra (4,555) and Ghost (4,447). It adds **open-source CRM / business-application** coverage alongside AI SDK monorepos and CMS platforms.

The direct/transitive split (**0 direct, 28 transitive, 77 unknown**) is the defining pattern. Twenty's root `package.json` is a private Nx workspace manifest — devDependencies only (`@nx/jest`, `@nx/js`, `nx`, `verdaccio`). Every vulnerable package in the scan lives in the resolved lockfile graph, not in anything a CRM deployer would recognize from the root manifest alone.

**All six critical findings are `unknown` relationship** — Yarn Berry path reconstruction could not classify them as direct or transitive in this lockfile-only MVP. That is operationally significant: on a graph this size, **73% of findings (77/105)** fall into the unknown bucket, meaning triage requires maintainer path inspection rather than copy-and-run commands.

The six critical packages cluster around **test environments and legacy HTTP helpers**:

**`@nyariv/sandboxjs@0.8.25` — critical sandbox escape / RCE.** JavaScript sandbox used in tooling chains — validated target `0.9.6` but no auto-generated parent upgrade.

**`happy-dom@15.11.7` and `vitest@4.0.18` / `@vitest/browser@4.0.18` — critical test-stack RCE.** Vitest 4.x browser mode and happy-dom VM escape advisories — deeply embedded in the Nx test toolchain, not in Twenty's production CRM runtime.

**`form-data@2.3.3` and `form-data@4.0.0` — critical unsafe random boundary generation.** Two majors of the same package in different toolchain chains — deduplicated as two rows in CVE Lite's package view.

**High-severity Nx orchestration surface:** `@nx/js`, `@nx/react`, `@nx/jest`, and root `nx` appear in generated fix commands — partial parent upgrades with path-specific coverage notes (e.g. `@nx/js@22.6.4` covers one of five paths to `picomatch`).

**Four command groups, 24/105 first-pass coverage** — a higher absolute coverage count than Storybook (1/92) but a lower percentage (23% vs 1%). The generated plan mixes Nx parent bumps, within-range refreshes (`axios`, `lodash`, `minimatch`/`picomatch`/`brace-expansion` chains), and `verdaccio@6.6.0` for a nested `lodash` path.

---

## Comparison Note: CVE Lite CLI vs yarn npm audit

Both tools were attempted against the same `yarn.lock` on the same machine on 2026-06-09.

| Metric | yarn npm audit (4.13.0) | CVE Lite CLI v1.20.0 |
|---|---:|---:|
| Total reported findings | 0 (no audit suggestions) | 105 |
| Critical | — | 6 |
| High | — | 40 |
| Moderate / Medium | — | 54 |
| Low | — | 5 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 28 / 77 unknown) |
| Full lockfile package parse | ✗ (requires install) | ✓ (5,451 packages) |
| Deduplicated package view | ✗ | ✓ |
| Specific copy-and-run commands | ✗ | ✓ (4 groups) |
| Skipped findings with reason | ✗ | ✓ (81 entries) |

**Why `yarn npm audit` reports nothing on this fixture:**

Running `yarn npm audit` and `yarn npm audit -A` on this lockfile-only snapshot returns **`No audit suggestions`**. Twenty uses Yarn Berry **catalog** and **workspace** protocols across dozens of packages (`twenty-front`, `twenty-server`, `twenty-ui`, etc.) that require a full monorepo install context — not present in a committed `package.json` + `yarn.lock` snapshot.

This is the same class of limitation documented in the [Storybook](./storybook.md) case study. CVE Lite's value here is parsing the **entire 5,451-package lockfile** without installing the monorepo — surfacing 105 vulnerable packages including six critical findings that native audit cannot see on this fixture.

**Why CVE Lite counts matter for triage:**

A flat audit row count (when audit works at all) multiplies advisory × path entries. CVE Lite's **105** is the deduplicated package surface: 105 distinct package versions needing a decision, not hundreds of repeated path rows.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Unknown | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 105 | 6 | 40 | 54 | 5 | 0 | 28 | 77 | 4 |

The first-pass plan covers **24 of 105** findings across four command groups. The remaining **81** appear in the skipped section — overwhelmingly unknown-relationship packages where Yarn Berry path reconstruction is limited, or transitive packages awaiting Nx/plugin parent releases.

---

## Fix Journey

These commands were **generated by the scanner but not run** against the upstream Twenty repository.

On a 5,451-package Nx monorepo, the instinct is to run `yarn npm audit fix`. That path fails silently on this fixture (`No audit suggestions`). CVE Lite generates four grouped command sets instead:

**Step 1 — Nx parent upgrades (high, partial coverage):**

```bash
yarn add @nx/js@22.6.4 @nx/react@22.6.0 verdaccio@6.6.0
```

Covers one path each to `picomatch`, `koa` (via module federation), and `lodash` (via verdaccio/local-storage). Rescan required — multiple remaining paths noted in output.

**Step 2 — within-range high refreshes:**

```bash
yarn upgrade @babel/plugin-transform-modules-systemjs && yarn upgrade axios && yarn upgrade fast-uri && yarn upgrade lodash && yarn upgrade path-to-regexp && yarn upgrade picomatch && yarn upgrade tmp
```

**Step 3 — within-range medium refreshes:**

```bash
yarn upgrade ajv && yarn upgrade follow-redirects && yarn upgrade ip-address && yarn upgrade postcss && yarn upgrade qs && yarn upgrade yaml
```

**Step 4 — Nx/jest parent upgrades (medium, partial):**

```bash
yarn add @nx/jest@22.7.2 nx@22.6.5
```

Partial coverage on `brace-expansion` chains through `@nx/jest` and `nx → ejs → jake → minimatch`.

**Not auto-fixable without maintainer triage:**

- **6 critical:** `@nyariv/sandboxjs`, `happy-dom`, `vitest`, `@vitest/browser`, two `form-data` versions — all unknown relationship
- **Multiple `minimatch` majors** (6 versions) — mixed fixability across Nx, webpack, and tooling chains
- **`simplemde` and `vue-template-compiler`** — medium, no fix available

Running all four generated command groups should address **24 of 105** findings. The six critical findings require upstream Nx/Vitest/test-environment decisions, not direct installs of transitive packages.

---

## Why this matters

Twenty is one of the fastest-growing open-source CRM projects — a full-stack TypeScript monorepo that teams deploy as production business infrastructure. A developer running default `yarn npm audit` on this lockfile-only snapshot sees **nothing**. A lockfile scan reveals **105 vulnerable packages**, including six critical findings in test sandboxes and legacy HTTP helpers.

That gap matters for any team using Twenty as a reference for dependency hygiene. The risk is not only in packages Twenty ships to CRM users — it is in the **Nx orchestration layer**, Vitest browser testing stack, module federation tooling, and Electron companion builds locked in `yarn.lock`.

CVE Lite answers the useful pre-release question in one pass: **four copy-and-run command groups for what the toolchain permits today, six critical findings routed to test/sandbox chains, and 81 skipped entries explaining why the rest are not auto-fixable.**

---

## Scan command

Run from the Twenty repository root or from the `examples/twenty` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Twenty at revision `fc90b4ba8bb0a5d7c12c846fe9b2305527a0f7a8`. Twenty releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/twenty/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-06-09 |
| CLI version | v1.20.0 |
| CVE Lite command | `node dist/index.js examples/twenty --verbose --all --json` |
| yarn audit command | `yarn npm audit` / `yarn npm audit -A` (Yarn 4.13.0 — no audit suggestions on lockfile-only snapshot) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/twenty/yarn.lock` from [twentyhq/twenty@fc90b4b](https://github.com/twentyhq/twenty/commit/fc90b4ba8bb0a5d7c12c846fe9b2305527a0f7a8) |
| Packages parsed (CVE Lite) | 5,451 |
| Unique vulnerable packages (CVE Lite) | 105 |
| OSV advisory matches (CVE Lite) | 167 |
| Fix command groups (CVE Lite) | 4 |
| First-pass coverage (CVE Lite) | 24 / 105 findings |
| Skipped findings with reason (CVE Lite) | 81 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install && npm run build
node dist/index.js examples/twenty --verbose --all
```

---

## Remaining risk

All 105 baseline findings remain open at the time of this study. No remediation was applied.

- **6 critical:** `@nyariv/sandboxjs`, `@vitest/browser`, `vitest`, `happy-dom`, two `form-data` versions
- **40 high:** including six `minimatch` versions, two `next` versions, OpenTelemetry exporters, `electron`, `typeorm`, `axios`, `lodash`, `path-to-regexp`, `ws`, and Nx toolchain packages
- **54 medium:** including `@nestjs/core`, multiple `ajv`/`postcss`/`qs`/`uuid`/`ws` versions, `dompurify`, `file-type`, `webpack-dev-server`
- **5 low:** `@tootallnate/once` (2 versions), two `diff` versions, `elliptic` (no fix)

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-06-09 (revision `fc90b4b`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @nyariv/sandboxjs | 0.8.25 | critical | unknown | 0.9.6 ⊘ | GHSA-2gg9-6p7w-6cpj, GHSA-58jh-xv4v-pcx4 |
| @vitest/browser | 4.0.18 | critical | unknown | 4.1.6 ⊘ | GHSA-2h32-95rg-cppp |
| form-data | 2.3.3 | critical | unknown | 2.5.4 ⊘ | GHSA-fjxv-7rqg-78g4 |
| form-data | 4.0.0 | critical | unknown | 4.0.4 ⊘ | GHSA-fjxv-7rqg-78g4 |
| happy-dom | 15.11.7 | critical | unknown | 20.8.9 ⊘ | GHSA-37j7-fg3j-429f, GHSA-6q6h-j7hj-3r64 |
| vitest | 4.0.18 | critical | unknown | 4.1.0 ⊘ | GHSA-5xrq-8626-4rwp |
| @babel/plugin-transform-modules-systemjs | 7.25.9 | high | transitive | 7.29.4 | GHSA-fv7c-fp4j-7gwp |
| @opentelemetry/auto-instrumentations-node | 0.60.1 | high | unknown | 0.75.0 ⊘ | GHSA-q7rr-3cgh-j5r3 |
| @opentelemetry/exporter-prometheus | 0.202.0 | high | unknown | 0.217.0 ⊘ | GHSA-q7rr-3cgh-j5r3 |
| @opentelemetry/exporter-prometheus | 0.211.0 | high | unknown | 0.217.0 ⊘ | GHSA-q7rr-3cgh-j5r3 |
| @opentelemetry/sdk-node | 0.202.0 | high | unknown | 0.217.0 ⊘ | GHSA-q7rr-3cgh-j5r3 |
| axios | 1.13.6 | high | unknown | 1.16.0 ⊘ | GHSA-35jp-ww65-95wh, GHSA-3g43-6gmg-66jw |
| axios | 1.13.5 | high | transitive | 1.16.0 | GHSA-35jp-ww65-95wh, GHSA-3g43-6gmg-66jw |
| defu | 6.1.4 | high | unknown | 6.1.5 ⊘ | GHSA-737v-mqg7-c878 |
| electron | 36.0.1 | high | unknown | 39.8.5 ⊘ | GHSA-3c8v-cfp5-9885, GHSA-4p4r-m79c-wq3v |
| fast-uri | 3.0.1 | high | transitive | 3.1.2 | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc |
| fast-xml-builder | 1.0.0 | high | unknown | 1.1.7 ⊘ | GHSA-5wm8-gmm8-39j9 |
| fast-xml-parser | 5.4.1 | high | unknown | 5.7.0 ⊘ | GHSA-8gc5-j5rx-235r, GHSA-gh4j-gqv2-49f6 |
| immutable | 3.7.6 | high | unknown | 3.8.3 ⊘ | GHSA-wf6x-7x77-mvgw |
| koa | 3.0.3 | high | transitive | 3.1.2 | GHSA-7gcc-r8m5-44qm |
| lodash | 4.17.23 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| lodash | 4.17.21 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| minimatch | 9.0.3 | high | unknown | 9.0.7 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 10.0.3 | high | unknown | 10.2.3 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 3.1.2 | high | unknown | 3.1.4 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 4.2.3 | high | unknown | 4.2.5 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 7.4.6 | high | transitive | 7.4.8 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 3.0.8 | high | unknown | 3.1.4 ⊘ | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| next | 16.0.10 | high | unknown | 16.2.6 ⊘ | GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6 |
| next | 16.1.7 | high | unknown | 16.2.6 ⊘ | GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6 |
| node-forge | 1.3.2 | high | unknown | 1.4.0 ⊘ | GHSA-2328-f5f3-gj25, GHSA-5m6q-g25r-mvwx |
| path-to-regexp | 8.3.0 | high | unknown | 8.4.0 ⊘ | GHSA-27v5-c462-wpq7, GHSA-j3q9-mxjg-w52f |
| path-to-regexp | 0.1.12 | high | transitive | 0.1.13 | GHSA-37ch-88jc-xwx2 |
| picomatch | 4.0.2 | high | transitive | 4.0.4 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| picomatch | 4.0.3 | high | transitive | 4.0.4 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| tar | 6.2.1 | high | transitive | 7.5.11 | GHSA-34x7-hfp2-rc4v, GHSA-83g3-92jg-28cx |
| tmp | 0.2.1 | high | unknown | 0.2.6 ⊘ | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| tmp | 0.0.33 | high | unknown | 0.2.6 ⊘ | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | GHSA-ph9p-34f9-6g65 |
| typeorm | 0.3.20 | high | unknown | 0.3.26 ⊘ | GHSA-q2pj-6v73-8rgj |
| undici | 5.29.0 | high | unknown | 6.24.0 ⊘ | GHSA-2mjp-6q6p-2qxm, GHSA-4992-7rv2-5pvq |
| ws | 8.13.0 | high | unknown | 8.20.1 ⊘ | GHSA-3h5v-q93c-6h6q, GHSA-58qx-3vcg-4xpx |
| ws | 8.16.0 | high | unknown | 8.20.1 ⊘ | GHSA-3h5v-q93c-6h6q, GHSA-58qx-3vcg-4xpx |
| yeoman-environment | 3.3.0 | high | unknown | 6.0.1 ⊘ | GHSA-vv9j-gjw2-j8wp |
| @nestjs/core | 11.1.16 | medium | unknown | 11.1.18 ⊘ | GHSA-36xv-jgw5-4q75 |
| @octokit/plugin-paginate-rest | 2.21.3 | medium | unknown | 9.2.2 ⊘ | GHSA-h5c3-5r3r-rr8q |
| @octokit/request | 5.6.3 | medium | unknown | 8.4.1 ⊘ | GHSA-rmvr-2pp2-xj38 |
| @octokit/request-error | 2.1.0 | medium | unknown | 5.1.1 ⊘ | GHSA-xx4v-prfh-6cgc |
| @protobufjs/utf8 | 1.1.0 | medium | unknown | 1.1.1 ⊘ | GHSA-q6x5-8v7m-xcrf |
| ajv | 8.13.0 | medium | unknown | 8.18.0 ⊘ | GHSA-2g4f-4pwh-qvx6 |
| ajv | 8.17.1 | medium | transitive | 8.18.0 | GHSA-2g4f-4pwh-qvx6 |
| ajv | 6.12.6 | medium | unknown | 6.14.0 ⊘ | GHSA-2g4f-4pwh-qvx6 |
| ajv | 7.2.4 | medium | unknown | 8.18.0 ⊘ | GHSA-2g4f-4pwh-qvx6 |
| ajv | 8.12.0 | medium | unknown | 8.18.0 ⊘ | GHSA-2g4f-4pwh-qvx6 |
| apollo-server-core | 3.13.0 | medium | unknown | 5.5.0 ⊘ | GHSA-9q82-xgwf-vj6h |
| bn.js | 4.12.0 | medium | unknown | 4.12.3 ⊘ | GHSA-378v-28hj-76wf |
| bn.js | 5.2.1 | medium | unknown | 5.2.3 ⊘ | GHSA-378v-28hj-76wf |
| brace-expansion | 5.0.5 | medium | unknown | 5.0.6 ⊘ | GHSA-jxxr-4gwj-5jf2 |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 5.0.3 | medium | transitive | 5.0.6 | GHSA-f886-m6hf-6m8v, GHSA-jxxr-4gwj-5jf2 |
| dompurify | 3.3.3 | medium | unknown | 3.4.0 ⊘ | GHSA-39q2-94rc-95cp, GHSA-crv5-9vww-q3g8 |
| esbuild | 0.21.5 | medium | unknown | 0.25.0 ⊘ | GHSA-67mh-4wv8-2f99 |
| file-type | 20.5.0 | medium | unknown | 21.3.2 ⊘ | GHSA-5v7r-6r5c-r473, GHSA-j47w-4g3g-c36v |
| file-type | 21.3.0 | medium | unknown | 21.3.2 ⊘ | GHSA-5v7r-6r5c-r473, GHSA-j47w-4g3g-c36v |
| file-type | 21.3.1 | medium | unknown | 21.3.2 ⊘ | GHSA-j47w-4g3g-c36v |
| follow-redirects | 1.15.6 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| got | 9.6.0 | medium | unknown | 11.8.5 ⊘ | GHSA-pfrx-2q88-qq97 |
| ip-address | 10.0.1 | medium | unknown | 10.1.1 ⊘ | GHSA-v2v4-37r5-5v8g |
| ip-address | 9.0.5 | medium | transitive | 10.1.1 | GHSA-v2v4-37r5-5v8g |
| nodemailer | 8.0.4 | medium | unknown | 8.0.5 ⊘ | GHSA-vvjj-xcjg-gr5g |
| postcss | 8.4.31 | medium | unknown | 8.5.10 ⊘ | GHSA-qx2v-qp2m-jg93 |
| postcss | 8.4.49 | medium | unknown | 8.5.10 ⊘ | GHSA-qx2v-qp2m-jg93 |
| postcss | 8.5.8 | medium | unknown | 8.5.10 ⊘ | GHSA-qx2v-qp2m-jg93 |
| postcss | 8.5.6 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| qs | 6.15.0 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| qs | 6.14.2 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| qs | 6.5.5 | medium | unknown | 6.14.1 ⊘ | GHSA-6rw7-vpxm-498p |
| react-router | 6.30.3 | medium | unknown | 6.30.4 ⊘ | GHSA-2j2x-hqr9-3h42 |
| request | 2.88.2 | medium | unknown | 3.0.0 ⊘ | GHSA-p8p7-x288-28g6 |
| simplemde | 1.11.2 | medium | unknown | ⚠ no fix | GHSA-wg85-p6j7-gp3w |
| tough-cookie | 2.5.0 | medium | unknown | 4.1.3 ⊘ | GHSA-72xf-g2v4-qvf3 |
| unhead | 1.11.20 | medium | unknown | 2.1.13 ⊘ | GHSA-5339-hvwr-7582, GHSA-95h2-gj7x-gx9w |
| uuid | 9.0.1 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| uuid | 3.4.0 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 10.0.0 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| uuid | 11.1.0 | medium | unknown | 11.1.1 ⊘ | GHSA-w5hq-g745-h8pq |
| uuid | 13.0.0 | medium | unknown | 13.0.1 ⊘ | GHSA-w5hq-g745-h8pq |
| vue-template-compiler | 2.7.16 | medium | unknown | ⚠ no fix | GHSA-g3ch-rx76-35fx |
| webpack-dev-server | 4.15.2 | medium | unknown | 5.2.4 ⊘ | GHSA-4v9v-hfq4-rm2v, GHSA-79cf-xcqc-c78w |
| ws | 8.17.1 | medium | unknown | 8.20.1 ⊘ | GHSA-58qx-3vcg-4xpx |
| ws | 8.18.0 | medium | transitive | 8.20.1 | GHSA-58qx-3vcg-4xpx |
| ws | 8.18.2 | medium | unknown | 8.20.1 ⊘ | GHSA-58qx-3vcg-4xpx |
| ws | 8.19.0 | medium | unknown | 8.20.1 ⊘ | GHSA-58qx-3vcg-4xpx |
| yaml | 1.10.2 | medium | transitive | 1.10.3 | GHSA-48c2-rrv3-qjmp |
| yaml | 2.8.1 | medium | transitive | 2.8.3 | GHSA-48c2-rrv3-qjmp |
| @tootallnate/once | 1.1.2 | low | unknown | 2.0.1 ⊘ | GHSA-vpq2-c234-7xj6 |
| @tootallnate/once | 2.0.0 | low | unknown | 2.0.1 ⊘ | GHSA-vpq2-c234-7xj6 |
| diff | 4.0.2 | low | unknown | 4.0.4 ⊘ | GHSA-73rr-hh4g-fpgx |
| diff | 5.2.0 | low | unknown | 5.2.2 ⊘ | GHSA-73rr-hh4g-fpgx |
| elliptic | 6.6.1 | low | unknown | ⚠ no fix | GHSA-848j-6mx2-7j84 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
