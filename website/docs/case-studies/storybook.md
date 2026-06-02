# Storybook Case Study

> Verified baseline scan — CVE Lite CLI v1.18.0 · 2026-05-27

<p align="center">
  <img src="/cve-lite-cli/img/storybook-logo.svg" alt="Storybook logo" width="260"/>
</p>

## Summary

- **Project:** [Storybook](https://github.com/storybookjs/storybook) — UI component development, documentation, and testing environment used across React, Vue, Angular, Svelte, and other frameworks
- **Revision:** `cc19ae1a2145e8f7cda8dc869f1b90d5346dcedb`
- **Lockfile:** `yarn.lock` (3,008 resolved packages, Yarn Berry 4.10.3)
- **Baseline findings:** 92 unique vulnerable packages (5 critical · 40 high · 39 medium · 8 low)
- **OSV advisory matches:** 212 CVE/advisory entries deduplicated into 92 packages
- **Direct vs transitive:** 2 direct / 90 transitive
- **Validated fix command groups generated:** 1
- **First-pass coverage:** 1 of 92 findings have confident copy-and-run commands
- **yarn npm audit (same lockfile, default scope):** 3 vulnerability entries on root direct deps (2 high · 1 moderate)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Storybook is one of the largest JavaScript monorepos in the ecosystem — a Yarn Berry workspace spanning core packages, framework renderers, builders, presets, addons, and sandbox templates. At **3,008 resolved packages**, it exceeds Astro (2,228) and sits below Ghost (4,447).

The direct/transitive split (**2 direct, 90 transitive**) is the defining pattern. Storybook's root manifest only exposes a small devDependency surface (`vite`, `vitest`, `nx`, and tooling). The vulnerable graph lives almost entirely in sandbox templates and framework integration packages locked in `yarn.lock` — **Next.js**, **Angular**, **happy-dom**, **handlebars**, **simple-git**, and dozens of build-toolchain packages a contributor would never see from the root `package.json` alone.

The five critical findings illustrate why a lockfile-wide scan matters on monorepo tooling:

**`happy-dom@17.6.3` — critical RCE via VM context escape.** Used in Storybook's test and sandbox stack. CVE Lite validates a non-vulnerable target (`20.8.9`) but does not auto-generate a parent upgrade — the package is deeply transitive.

**`simple-git@3.30.0` — critical remote code execution.** Present in automation and sandbox tooling chains, not in Storybook's published package surface.

**`next@15.5.6` — critical middleware bypass.** Reached through Next.js framework sandbox templates, not through anything Storybook ships to npm consumers directly.

**`handlebars@4.7.8` and `form-data@2.3.3` — critical prototype pollution / unsafe boundary generation.** Legacy template and HTTP helper packages buried in the integration test graph.

The two **direct** findings are both **`vite`** versions resolved at the workspace root (`6.4.1` and `7.2.2`). CVE Lite generates one validated direct upgrade for the current root constraint:

```bash
yarn add vite@7.3.2
```

That command addresses the high-severity `vite@7.2.2` finding. The remaining **91 findings** require parent-chain or maintainer decisions.

---

## Comparison Note: CVE Lite CLI vs yarn npm audit

Both tools were run against the same `yarn.lock` on the same machine on 2026-05-27.

| Metric | yarn npm audit (4.10.3, default) | CVE Lite CLI v1.18.0 |
|---|---:|---:|
| Total reported findings | 3 | 92 |
| Critical | 0 | 5 |
| High | 2 | 40 |
| Moderate / Medium | 1 | 39 |
| Low | 0 | 8 |
| Direct vs transitive breakdown | ✗ | ✓ (2 / 90) |
| Full lockfile package parse | ✗ (root workspace direct deps only) | ✓ (3,008 packages) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | partial | ✓ |
| Specific copy-and-run commands | ✗ | ✓ (1 group) |
| Skipped findings with reason | ✗ | ✓ (90 entries) |

**Why the totals differ — and why that is not a coverage gap:**

By default, `yarn npm audit` checks **direct dependencies for the active workspace** only. On this lockfile-only snapshot (no `node_modules`, no nested workspace packages checked in), that means **three advisories on `vite@7.2.2`** — the one root devDependency Yarn can see without a full install.

CVE Lite parses the entire **`yarn.lock`** — including sandbox templates for Next.js, Angular, webpack, Svelte, and other framework integrations — and reports **92 unique vulnerable package versions**.

Running `yarn npm audit -AR` on this fixture without a full monorepo install does not produce a comparable full-graph audit. CVE Lite's value on a committed lockfile snapshot is that it works **without installing 3,000+ packages**.

**Fix guidance differs materially:**

`yarn npm audit` lists vite advisories but does not produce a validated upgrade command accounting for Storybook's pinned resolution range. CVE Lite scans published versions above `7.2.2`, finds six still vulnerable, and recommends **`7.3.2`** as the lowest known non-vulnerable target.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 92 | 5 | 40 | 39 | 8 | 2 | 90 | 1 |

The first-pass plan covers **1 of 92** findings. The remaining **91** appear in the skipped section — overwhelmingly transitive packages where Yarn Berry path reconstruction is limited in this MVP, or where no safe parent upgrade was identified automatically.

---

## Fix Journey

These commands were **generated by the scanner but not run** against the upstream Storybook repository.

On a monorepo this size, the instinct is to chase critical findings first. CVE Lite surfaces five critical packages — `happy-dom`, `simple-git`, `next`, `handlebars`, and `form-data` — but generates **no auto-install commands** for any of them. Each is transitive with incomplete parent-chain data in the Yarn Berry lockfile MVP.

The one confident first pass is the root direct upgrade:

```bash
yarn add vite@7.3.2
```

That addresses `vite@7.2.2` (high, direct). The second direct finding (`vite@6.4.1`, high) and all critical sandbox-chain packages require maintainer triage: framework template bumps, test-environment upgrades, or upstream releases — not direct installs of transitive packages.

---

## Why this matters

Storybook maintainers and contributors work inside a monorepo whose lockfile encodes the entire cross-framework test matrix. A developer running default `yarn npm audit` at the repo root sees **three vite advisories**. A lockfile scan reveals **92 vulnerable packages** including critical RCE paths in test environments and framework sandboxes.

That gap is operationally significant for any team using Storybook as a reference for "what does our dependency graph look like?" The risk is not in the `@storybook/*` packages consumers install — it is in the **integration and sandbox layer** Storybook uses to verify React, Next.js, Angular, and other renderers.

CVE Lite answers the useful pre-release question in one pass: **one copy-and-run command for what Storybook controls directly (`vite`), five critical findings routed to sandbox/tooling chains, and 90 skipped entries explaining why the rest are not auto-fixable.**

---

## Scan command

Run from the Storybook repository root or from the `examples/storybook` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Storybook at revision `cc19ae1a2145e8f7cda8dc869f1b90d5346dcedb`. Storybook releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/storybook/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-27 |
| CLI version | v1.18.0 |
| CVE Lite command | `npx tsx src/index.ts examples/storybook --json --all` |
| yarn audit command | `yarn npm audit` (Yarn 4.10.3, default direct-deps scope) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/storybook/yarn.lock` from [storybookjs/storybook@cc19ae1](https://github.com/storybookjs/storybook/commit/cc19ae1a2145e8f7cda8dc869f1b90d5346dcedb) |
| Packages parsed (CVE Lite) | 3,008 |
| Unique vulnerable packages (CVE Lite) | 92 |
| Vulnerability entries (yarn npm audit) | 3 |
| Fix command groups (CVE Lite) | 1 |
| Skipped findings with reason (CVE Lite) | 90 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npx tsx src/index.ts examples/storybook --verbose --all
```

Reproduce `yarn npm audit` from the example directory (Corepack/Yarn 4 recommended):

```bash
cd examples/storybook
yarn npm audit
```

Both tools were run against the same `yarn.lock` on the same machine on 2026-05-27.

---

## Remaining risk

All 92 baseline findings remain open at the time of this study. No remediation was applied.

- **5 critical:** `form-data`, `handlebars`, `happy-dom`, `next`, `simple-git`
- **40 high:** including direct `vite` versions, `@angular/*` sandbox packages, `axios`, multiple `minimatch` versions, `rollup`, `tar`, and `lodash`
- **39 medium:** toolchain packages across webpack, postcss, octokit, and framework integrations
- **8 low:** including `webpack`, `elliptic` (no known fix), and `@tootallnate/once`

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-27 (revision `cc19ae1`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| form-data | 2.3.3 | critical | transitive | 2.5.4 | GHSA-fjxv-7rqg-78g4 |
| handlebars | 4.7.8 | critical | transitive | 4.7.9 | GHSA-2qvq-rjwj-gvw9, GHSA-2w6w-674q-4c4q… |
| happy-dom | 17.6.3 | critical | transitive | 20.8.9 | GHSA-37j7-fg3j-429f, GHSA-6q6h-j7hj-3r64… |
| next | 15.5.6 | critical | transitive | 15.5.18 | GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6… |
| simple-git | 3.30.0 | critical | transitive | 3.36.0 | GHSA-hffm-xvc3-vprc, GHSA-jcxm-m3jx-f287… |
| @angular/common | 19.2.15 | high | transitive | 19.2.16 | GHSA-58c5-g7wp-6w37 |
| @angular/compiler | 19.2.15 | high | transitive | 19.2.20 | GHSA-g93w-mfhg-p222, GHSA-jrmj-c5cx-3cw6… |
| @angular/core | 19.2.15 | high | transitive | 19.2.20 | GHSA-g93w-mfhg-p222, GHSA-jrmj-c5cx-3cw6… |
| @babel/plugin-transform-modules-systemjs | 7.28.5 | high | transitive | 7.29.4 | GHSA-fv7c-fp4j-7gwp |
| @remix-run/router | 1.8.0 | high | transitive | 1.23.2 | GHSA-2w69-qvjg-hvjx |
| axios | 1.13.2 | high | transitive | 1.15.2 | GHSA-3p68-rc4w-qgx5, GHSA-3w6x-2g7m-8v23… |
| cross-spawn | 6.0.5 | high | transitive | 6.0.6 | GHSA-3xgq-45jj-v275 |
| fast-uri | 3.0.6 | high | transitive | 3.1.2 | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc |
| flatted | 3.2.9 | high | transitive | 3.4.2 | GHSA-25h7-pfq9-p65f, GHSA-rf6f-7fwh-wjgh |
| happy-dom | 20.0.11 | high | transitive | 20.8.9 | GHSA-6q6h-j7hj-3r64, GHSA-w4gp-fjgq-3q4g |
| immutable | 5.1.4 | high | transitive | 5.1.5 | GHSA-wf6x-7x77-mvgw |
| js-cookie | 3.0.5 | high | transitive | 3.0.7 | GHSA-qjx8-664m-686j |
| jws | 3.2.2 | high | transitive | 3.2.3 | GHSA-869p-cjfg-cm3x |
| jws | 4.0.0 | high | transitive | 4.0.1 | GHSA-869p-cjfg-cm3x |
| lodash | 4.17.21 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc… |
| lodash-es | 4.17.21 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc… |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26… |
| minimatch | 5.1.6 | high | transitive | 5.1.8 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26… |
| minimatch | 7.4.6 | high | transitive | 7.4.8 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26… |
| minimatch | 9.0.1 | high | transitive | 9.0.7 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26… |
| minimatch | 9.0.5 | high | transitive | 9.0.7 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26… |
| node-forge | 1.3.1 | high | transitive | 1.4.0 | GHSA-2328-f5f3-gj25, GHSA-554w-wpv2-vw27… |
| path-to-regexp | 0.1.10 | high | transitive | 0.1.13 | GHSA-37ch-88jc-xwx2, GHSA-rhx6-c78j-4q9w |
| path-to-regexp | 0.1.12 | high | transitive | 0.1.13 | GHSA-37ch-88jc-xwx2 |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| picomatch | 4.0.2 | high | transitive | 4.0.4 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| preact | 10.27.2 | high | transitive | 10.27.3 | GHSA-36hm-qxxp-pg3m |
| rollup | 4.34.8 | high | transitive | 4.59.0 | GHSA-mw96-cpmx-2vgc |
| rollup | 4.53.2 | high | transitive | 4.59.0 | GHSA-mw96-cpmx-2vgc |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| ssri | 5.3.0 | high | transitive | 6.0.2 | GHSA-vx3p-948g-6vhq |
| tar | 6.2.0 | high | transitive | 7.5.11 | GHSA-34x7-hfp2-rc4v, GHSA-83g3-92jg-28cx… |
| tar | 7.5.2 | high | transitive | 7.5.11 | GHSA-34x7-hfp2-rc4v, GHSA-83g3-92jg-28cx… |
| tmp | 0.0.28 | high | transitive | 0.2.6 | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| tmp | 0.0.33 | high | transitive | 0.2.6 | GHSA-52f5-9888-hmc6, GHSA-ph9p-34f9-6g65 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | GHSA-ph9p-34f9-6g65 |
| undici | 5.27.2 | high | transitive | 6.24.0 | GHSA-2mjp-6q6p-2qxm, GHSA-3787-6prv-h9w3… |
| validator | 13.12.0 | high | transitive | 13.15.22 | GHSA-9965-vmph-33xx, GHSA-vghf-hv5q-vc2g |
| vite | 6.4.1 | high | direct | 6.4.2 | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f583 |
| vite | 7.2.2 | high | direct | 7.3.2 | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f583… |
| @octokit/plugin-paginate-rest | 2.21.3 | medium | transitive | 9.2.2 | GHSA-h5c3-5r3r-rr8q |
| @octokit/request | 5.6.3 | medium | transitive | 8.4.1 | GHSA-rmvr-2pp2-xj38 |
| @octokit/request | 6.2.8 | medium | transitive | 8.4.1 | GHSA-rmvr-2pp2-xj38 |
| @octokit/request-error | 2.1.0 | medium | transitive | 5.1.1 | GHSA-xx4v-prfh-6cgc |
| @octokit/request-error | 3.0.3 | medium | transitive | 5.1.1 | GHSA-xx4v-prfh-6cgc |
| @tanstack/start-server-core | 1.167.9 | medium | transitive | 1.167.30 | GHSA-9m65-766c-r333 |
| ajv | 6.12.6 | medium | transitive | 6.14.0 | GHSA-2g4f-4pwh-qvx6 |
| ajv | 8.17.1 | medium | transitive | 8.18.0 | GHSA-2g4f-4pwh-qvx6 |
| bn.js | 4.12.2 | medium | transitive | 4.12.3 | GHSA-378v-28hj-76wf |
| bn.js | 5.2.2 | medium | transitive | 5.2.3 | GHSA-378v-28hj-76wf |
| brace-expansion | 1.1.11 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v, GHSA-v6h2-p8h4-qcjw |
| brace-expansion | 2.0.1 | medium | transitive | 2.0.3 | GHSA-f886-m6hf-6m8v, GHSA-v6h2-p8h4-qcjw |
| brace-expansion | 5.0.4 | medium | transitive | 5.0.6 | GHSA-f886-m6hf-6m8v, GHSA-jxxr-4gwj-5jf2 |
| follow-redirects | 1.15.6 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| h3 | 2.0.1-rc.16 | medium | transitive | ⚠ no fix | GHSA-2j6q-whv2-gh6w, GHSA-4hxc-9384-m385… |
| ip-address | 10.1.0 | medium | transitive | 10.1.1 | GHSA-v2v4-37r5-5v8g |
| js-yaml | 3.14.1 | medium | transitive | 3.14.2 | GHSA-mh29-5h37-fv8m |
| js-yaml | 4.1.0 | medium | transitive | 4.1.1 | GHSA-mh29-5h37-fv8m |
| mdast-util-to-hast | 13.2.0 | medium | transitive | 13.2.1 | GHSA-4fh9-h7wg-q85m |
| nanoid | 4.0.2 | medium | transitive | 5.0.9 | GHSA-mwcw-c2x4-8c55 |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| postcss | 8.5.2 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| prismjs | 1.27.0 | medium | transitive | 1.30.0 | GHSA-x7hr-w5r2-h6wg |
| qs | 6.13.0 | medium | transitive | 6.15.2 | GHSA-6rw7-vpxm-498p, GHSA-q8mj-m7cp-5q26… |
| qs | 6.14.0 | medium | transitive | 6.15.2 | GHSA-6rw7-vpxm-498p, GHSA-q8mj-m7cp-5q26… |
| qs | 6.5.3 | medium | transitive | 6.14.1 | GHSA-6rw7-vpxm-498p |
| react-router | 6.15.0 | medium | transitive | 6.30.2 | GHSA-9jcx-v3wj-wh4m |
| request | 2.88.2 | medium | transitive | 3.0.0 | GHSA-p8p7-x288-28g6 |
| smol-toml | 1.5.2 | medium | transitive | 1.6.1 | GHSA-v3rj-xjv7-4jmq |
| svelte | 5.43.11 | medium | transitive | 5.55.7 | GHSA-crpf-4hrx-3jrp, GHSA-f7gr-6p89-r883… |
| tough-cookie | 2.5.0 | medium | transitive | 4.1.3 | GHSA-72xf-g2v4-qvf3 |
| uuid | 11.1.0 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 3.4.0 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| webpack-dev-server | 5.2.2 | medium | transitive | 5.2.4 | GHSA-79cf-xcqc-c78w |
| ws | 8.19.0 | medium | transitive | 8.20.1 | GHSA-58qx-3vcg-4xpx |
| yaml | 1.10.2 | medium | transitive | 1.10.3 | GHSA-48c2-rrv3-qjmp |
| yaml | 2.8.2 | medium | transitive | 2.8.3 | GHSA-48c2-rrv3-qjmp |
| @tootallnate/once | 1.1.2 | low | transitive | 2.0.1 | GHSA-vpq2-c234-7xj6 |
| @tootallnate/once | 2.0.0 | low | transitive | 2.0.1 | GHSA-vpq2-c234-7xj6 |
| cookie | 0.6.0 | low | transitive | 0.7.0 | GHSA-pxg6-pf52-xh8x |
| diff | 8.0.2 | low | transitive | 8.0.3 | GHSA-73rr-hh4g-fpgx |
| elliptic | 6.6.1 | low | transitive | ⚠ no fix | GHSA-848j-6mx2-7j84 |
| on-headers | 1.0.2 | low | transitive | 1.1.0 | GHSA-76c9-3jph-rj3q |
| webpack | 5.103.0 | low | transitive | 5.104.1 | GHSA-38r7-794h-5758, GHSA-8fgc-7cc6-rx7x |
| webpack | 5.98.0 | low | transitive | 5.104.1 | GHSA-38r7-794h-5758, GHSA-8fgc-7cc6-rx7x |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
