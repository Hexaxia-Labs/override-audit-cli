# Astro Case Study

> Verified baseline scan — CVE Lite CLI v1.18.0 · 2026-05-26

<p align="center">
  <img src="https://raw.githubusercontent.com/withastro/astro/main/examples/basics/src/assets/astro.svg" alt="Astro logo" width="260"/>
</p>

## Summary

- **Project:** [Astro](https://github.com/withastro/astro) — modern content-focused web framework for building fast, content-driven sites with islands architecture, SSR/SSG, and a large integration ecosystem
- **Revision:** `221bb4b36831f3fc278f05dc40a7498abb864ddf`
- **Lockfile:** `pnpm-lock.yaml` (2,228 resolved packages, pnpm 11.0.9)
- **Baseline findings:** 34 unique vulnerable packages (1 critical · 13 high · 19 medium · 1 low)
- **OSV advisory matches:** 68 CVE/advisory entries deduplicated into 34 packages
- **Direct vs transitive:** 2 direct / 32 transitive
- **Validated fix command groups generated:** 4
- **First-pass coverage:** 5 of 34 findings have confident copy-and-run commands
- **pnpm audit (same lockfile):** 77 vulnerability entries (1 critical · 34 high · 37 moderate · 5 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Astro is a large, actively maintained pnpm monorepo spanning the core framework, dozens of `@astrojs/*` integrations, language tooling, benchmarks, and example apps. At 2,228 resolved packages, it sits between medium npm snapshots like NestJS (~1,623) and very large pnpm graphs like Ghost (~4,447).

The direct/transitive split (2 direct, 32 transitive) is the first thing worth noticing. Almost all risk lives in the monorepo toolchain — linting, testing, publishing, adapter plugins, and internal SDK packages — not in the two packages Astro's root manifest declares as direct dependencies with known issues (`esbuild`, `turbo`). A developer running `pnpm audit` on this lockfile sees **77 vulnerability entries** with no direct/transitive breakdown and no copy-and-run fix plan. CVE Lite surfaces **34 unique vulnerable packages**, **4 command groups**, and a clear split between what is directly fixable and what requires parent-chain decisions.

The critical finding tells a different story than the direct count suggests:

**`fast-xml-parser@5.3.3` — critical, transitive via `@flue/sdk`.** Astro's dependency on the Flue SDK pulls in `just-bash`, which resolves `fast-xml-parser@5.3.3`. CVE Lite surfaces seven related advisories for this package. The scanner identifies a validated non-vulnerable target (`5.7.0`) but does not auto-generate a parent upgrade for `@flue/sdk`.

**`esbuild@0.17.19` and `turbo@2.8.15` — medium, direct.** These are the packages Astro's maintainers control at the root level. CVE Lite produces validated direct upgrade commands:

```bash
pnpm add esbuild@0.25.0 turbo@2.9.14
```

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-26.

| Metric | pnpm audit (11.0.9) | CVE Lite CLI v1.18.0 |
|---|---:|---:|
| Total reported findings | 77 | 34 |
| Critical | 1 | 1 |
| High | 34 | 13 |
| Moderate / Medium | 37 | 19 |
| Low | 5 | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (2 / 32) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | ✗ | ✓ |
| `pnpm update` vs parent upgrade distinction | ✗ | ✓ |
| Specific copy-and-run commands | ✗ | ✓ (4 groups) |
| Skipped findings with reason | ✗ | ✓ (29 entries) |

**Why the totals differ — and why that is not a coverage gap:**

`pnpm audit` counts vulnerability entries (advisory × dependency path combinations). A single package with multiple advisories, or one reached through several paths, can appear multiple times. CVE Lite counts each unique vulnerable package version once. That is why the totals differ: **77 vs 34**.

`fast-xml-parser` is a concrete example. On this lockfile, `pnpm audit` reports **nine separate entries** — seven for `fast-xml-parser` and two for `fast-xml-builder` — across critical, high, moderate, and low severities. CVE Lite deduplicates the parser side into **one critical finding** for `fast-xml-parser@5.3.3` with all seven advisory IDs attached, plus a separate high finding for `fast-xml-builder@1.1.5` — a clearer picture of how many package-level decisions are actually required.

**Severity mix also differs by design.** `pnpm audit` reports **34 high** entries; CVE Lite reports **13 high** unique packages. Both flag the same underlying advisories, but CVE Lite's severity column reflects the highest validated severity per unique package version, not every advisory-path row separately.

**Fix guidance differs materially:**

`pnpm audit --fix update` was attempted in an isolated copy of this lockfile and failed because the snapshot is a monorepo root without workspace packages (`astro-benchmark@workspace:*` and others are unresolved). On a full Astro checkout, automatic fix behavior may differ.

CVE Lite generates validated commands without requiring a full workspace install:

```bash
pnpm update --recursive --no-save minimatch
pnpm add esbuild@0.25.0 turbo@2.9.14
pnpm update --recursive --no-save ajv
pnpm add eslint@9.39.4
```

For the critical finding, CVE Lite names `@flue/sdk` as the parent chain (`project → @flue/sdk → just-bash → fast-xml-parser`) rather than suggesting a direct install of the transitive package.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 34 | 1 | 13 | 19 | 1 | 2 | 32 | 4 |

The first-pass plan covers **5 of 34** findings. The remaining **29** appear in the skipped section with explicit reasons — usually "no safe parent upgrade identified automatically" for transitive packages like `@flue/sdk`, `mocha`, `@vscode/test-cli`, and `@netlify/vite-plugin`.

---

## Fix Journey

These commands were **generated by the scanner but not run** against the upstream Astro repository.

In a monorepo like Astro, the instinct is to chase the critical finding first. Here, the critical issue — `fast-xml-parser@5.3.3` via `@flue/sdk` — has no auto-generated install command. CVE Lite names `@flue/sdk` as the parent and recommends checking for a release that resolves `fast-xml-parser` to `5.7.0+`. That is the correct first triage outcome: do not run `pnpm add fast-xml-parser` directly.

The confident first pass splits into four groups:

**Group 1 — high severity range refresh:** `pnpm update --recursive --no-save minimatch` targets `minimatch@3.1.2` and similar versions that can be refreshed within existing parent constraints without bumping a top-level package.

**Group 2 — medium severity direct fixes:** `pnpm add esbuild@0.25.0 turbo@2.9.14` clears the two direct findings Astro controls at the root manifest level.

**Group 3 — medium severity range refresh:** `pnpm update --recursive --no-save ajv` addresses `ajv@6.12.6` through lockfile re-resolution.

**Group 4 — medium severity partial parent upgrade:** `pnpm add eslint@9.39.4` covers one `brace-expansion` path through `eslint → minimatch → brace-expansion`. CVE Lite explicitly notes four remaining paths that would need separate investigation after rescanning.

The distinction between `pnpm update --recursive --no-save minimatch` and `pnpm add eslint@9.39.4` is intentional. The first refreshes a transitive package within existing parent ranges. The second is a path-specific parent upgrade with partial coverage.

After these four groups, the remaining work is structural: SDK and plugin packages (`@flue/sdk`, `@vscode/vsce`, `@netlify/vite-plugin`, `mocha`, `fastify`, and others) where parent upgrades require maintainer releases or broader toolchain decisions.

---

## Why this matters

Astro is one of the most widely adopted content frameworks in the JavaScript ecosystem. Its monorepo is professionally maintained, heavily tested, and ships on a regular cadence. Yet a verified lockfile scan still surfaces 34 vulnerable packages — 32 of them transitive.

That pattern is consistent across every modern framework monorepo scan in this project: the risk is not in application runtime code. It is in the toolchain developers install, trust, and rarely audit — test runners, VS Code publishing tools, Netlify and Cloudflare adapters, linting stacks, and internal SDK packages.

Two chains in this scan are worth naming specifically:

`@flue/sdk` → `just-bash` → `fast-xml-parser@5.3.3` (critical). Flue is Astro's internal SDK surface. A developer auditing "my Astro site dependencies" would not expect the critical finding to arrive through an SDK test harness chain. CVE Lite names the parent immediately.

`eslint` → `minimatch` → `brace-expansion` (medium, multiple paths). Brace-expansion issues appear across several toolchain entry points — ESLint, VS Code test CLI, and Flue SDK. CVE Lite separates a partial parent upgrade (`eslint@9.39.4`) from the paths that still need follow-up, instead of implying one command fixes everything.

For a team doing a pre-release check, the operationally useful question is not "how many advisories exist?" It is "what do I run right now, and what needs upstream?" CVE Lite answers that in under 30 seconds: four command groups for the confident first pass, one critical finding routed to `@flue/sdk`, and 29 skipped entries explaining why the rest are not auto-fixable.

---

## Scan command

Run from the Astro repository root or from the `examples/astro` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile in this repository reflects Astro at revision `221bb4b36831f3fc278f05dc40a7498abb864ddf`. Astro releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/astro/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-26 |
| CLI version | v1.18.0 |
| CVE Lite command | `npx tsx src/index.ts examples/astro --json --all` |
| pnpm audit command | `pnpm audit` (requires Node.js ≥ 22.13 for pnpm 11.0.9) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/astro/pnpm-lock.yaml` from [withastro/astro@221bb4b](https://github.com/withastro/astro/commit/221bb4b36831f3fc278f05dc40a7498abb864ddf) |
| Packages parsed (CVE Lite) | 2,228 |
| Unique vulnerable packages (CVE Lite) | 34 |
| Vulnerability entries (pnpm audit) | 77 |
| Fix command groups (CVE Lite) | 4 |
| Skipped findings with reason (CVE Lite) | 29 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npx tsx src/index.ts examples/astro --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/astro
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-26.

---

## Remaining risk

All 34 baseline findings remain open at the time of this study. No remediation was applied.

- **1 critical:** `fast-xml-parser@5.3.3` via `@flue/sdk` (no auto parent upgrade)
- **13 high:** including `@xmldom/xmldom`, `axios`, `devalue`, `fast-uri`, `fast-xml-builder`, `flatted`, three `minimatch` versions, `node-forge`, `path-to-regexp`, `serialize-javascript`, `underscore`
- **19 medium:** including direct `esbuild` and `turbo`, plus transitive toolchain packages across ESLint, Netlify, Cloudflare, Mocha, and language tooling
- **1 low:** `diff@7.0.0` via `mocha`

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-26 (revision `221bb4b`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| fast-xml-parser | 5.3.3 | critical | transitive | 5.7.0 | GHSA-37qj-frw5-hhjh, GHSA-8gc5-j5rx-235r |
| @xmldom/xmldom | 0.9.8 | high | transitive | 0.9.10 | GHSA-2v35-w6hq-6mfw, GHSA-f6ww-3ggp-fr8h |
| axios | 1.13.5 | high | transitive | 1.15.2 | GHSA-3p68-rc4w-qgx5, GHSA-3w6x-2g7m-8v23 |
| devalue | 5.6.4 | high | transitive | 5.8.1 | GHSA-77vg-94rm-hx3p |
| fast-uri | 3.1.0 | high | transitive | 3.1.2 | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc |
| fast-xml-builder | 1.1.5 | high | transitive | 1.1.7 | GHSA-45c6-75p6-83cc, GHSA-5wm8-gmm8-39j9 |
| flatted | 3.3.3 | high | transitive | 3.4.2 | GHSA-25h7-pfq9-p65f, GHSA-rf6f-7fwh-wjgh |
| minimatch | 9.0.5 | high | transitive | 9.0.7 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 5.1.6 | high | transitive | 5.1.8 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| node-forge | 1.3.3 | high | transitive | 1.4.0 | GHSA-2328-f5f3-gj25, GHSA-5m6q-g25r-mvwx |
| path-to-regexp | 6.1.0 | high | transitive | 6.3.0 | GHSA-9wv6-86v2-598j |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.5 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| underscore | 1.13.7 | high | transitive | 1.13.8 | GHSA-qpx9-hpmf-5gmw |
| @fastify/static | 9.0.0 | medium | transitive | 9.1.1 | GHSA-pr96-94w5-mx2h, GHSA-x428-ghpx-8j92 |
| ajv | 6.12.6 | medium | transitive | 6.14.0 | GHSA-2g4f-4pwh-qvx6 |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 5.0.2 | medium | transitive | 5.0.6 | GHSA-f886-m6hf-6m8v, GHSA-jxxr-4gwj-5jf2 |
| esbuild | 0.17.19 | medium | direct | 0.25.0 | GHSA-67mh-4wv8-2f99 |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| hono | 4.12.16 | medium | transitive | 4.12.18 | GHSA-hm8q-7f3q-5f36, GHSA-p77w-8qqv-26rm |
| ip-address | 10.1.0 | medium | transitive | 10.1.1 | GHSA-v2v4-37r5-5v8g |
| protobufjs | 7.5.6 | medium | transitive | 7.5.8 | GHSA-jggg-4jg4-v7c6 |
| qs | 6.14.2 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| svelte | 5.55.3 | medium | transitive | 5.55.7 | GHSA-9rmh-mm8f-r9h6, GHSA-f3cj-j4f6-wq85 |
| turbo | 2.8.15 | medium | direct | 2.9.14 | GHSA-3qcw-2rhx-2726, GHSA-hcf7-66rw-9f5r |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 11.1.0 | medium | transitive | 11.1.1 | GHSA-w5hq-g745-h8pq |
| uuid | 13.0.0 | medium | transitive | 13.0.1 | GHSA-w5hq-g745-h8pq |
| ws | 8.18.0 | medium | transitive | 8.20.1 | GHSA-58qx-3vcg-4xpx |
| ws | 8.19.0 | medium | transitive | 8.20.1 | GHSA-58qx-3vcg-4xpx |
| yaml | 2.7.1 | medium | transitive | 2.8.3 | GHSA-48c2-rrv3-qjmp |
| diff | 7.0.0 | low | transitive | 8.0.3 | GHSA-73rr-hh4g-fpgx |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
