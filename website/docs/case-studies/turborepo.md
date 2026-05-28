# Turborepo Case Study

> Verified baseline scan — CVE Lite CLI v1.18.0 · 2026-05-27

<p align="center">
  <img src="https://raw.githubusercontent.com/vercel/turborepo/main/apps/docs/public/images/docs/repo/repo-hero-logo-dark.svg" alt="Turborepo logo" width="260"/>
</p>

## Summary

- **Project:** [Turborepo](https://github.com/vercel/turborepo) — high-performance monorepo build system for JavaScript and TypeScript, maintained by Vercel
- **Revision:** `c85d4104bdc18df051334210d29c49353c46facf`
- **Lockfile:** `pnpm-lock.yaml` (1,776 resolved packages, pnpm 10.28.0)
- **Baseline findings:** 13 unique vulnerable packages (1 critical · 5 high · 7 medium · 0 low)
- **OSV advisory matches:** 29 CVE/advisory entries deduplicated into 13 packages
- **Direct vs transitive:** 0 direct / 13 transitive
- **Validated fix command groups generated:** 0
- **First-pass coverage:** 0 of 13 findings have confident copy-and-run commands
- **pnpm audit (same lockfile):** 28 vulnerability entries (13 high · 11 moderate · 4 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Turborepo is a build-system-centric pnpm monorepo — Rust CLI, TypeScript packages, documentation apps, and example workspaces — rather than a consumer application framework. At **1,776 resolved packages**, it is leaner than Astro (2,228) or Storybook (3,008), but the vulnerability profile is still entirely transitive.

The direct/transitive split (**0 direct, 13 transitive**) is the headline. Turborepo's root `package.json` devDependencies (`husky`, `oxlint`, `typescript`, and tooling) do not surface as directly vulnerable in this snapshot. Every finding arrives through documentation apps, example sandboxes, or shared toolchain packages locked in `pnpm-lock.yaml`.

That makes Turborepo a useful complement to framework case studies: it shows what dependency risk looks like in a **monorepo build tool** whose graph is dominated by docs-site and CI tooling rather than runtime app code.

The critical finding is the most important triage signal:

**`sandbox@3.0.0-beta.16` — critical, no known fix.** CVE Lite flags sandbox breakout / arbitrary code execution advisories and reports **no published non-vulnerable version** above the installed beta. There is no copy-and-run command — the correct outcome is to treat this as upstream-blocked risk, not to `pnpm add sandbox` directly.

Other high-severity findings show the docs-and-examples layer:

**`next@16.2.3` — high, transitive via docs apps.** Middleware bypass advisories on a version pinned for the Turborepo documentation site — not the Rust CLI binary consumers install.

**`basic-ftp@5.2.2`, `fast-uri@3.1.0`, `fast-xml-builder@1.1.4`, `tmp@0.2.5` — high, transitive toolchain packages** with validated fix targets but no auto-generated parent upgrade on this lockfile-only snapshot.

**`turbo@2.8.3` — medium, transitive.** The monorepo that builds Turborepo itself resolves an older `turbo` package version in a toolchain path (`eslint-config-turbo`). CVE Lite identifies `2.9.14` as a validated target but does not auto-generate an install command without a identified parent chain on this snapshot.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-27.

| Metric | pnpm audit (10.28.0) | CVE Lite CLI v1.18.0 |
|---|---:|---:|
| Total reported findings | 28 | 13 |
| Critical | 0 | 1 |
| High | 13 | 5 |
| Moderate / Medium | 11 | 7 |
| Low | 4 | 0 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 13) |
| Deduplicated package view | ✗ | ✓ |
| Packages with no known fix flagged | ✗ | ✓ (1 package) |
| Validated fix targets | partial | ✓ |
| Specific copy-and-run commands | ✗ | ✗ (0 groups) |
| Skipped findings with reason | ✗ | ✓ (13 entries) |

**Why the totals differ — and why that is not a coverage gap:**

`pnpm audit` counts vulnerability **entries** (advisory × dependency path combinations). CVE Lite counts each unique vulnerable package version once. That is why the totals differ: **28 vs 13**.

The **`sandbox@3.0.0-beta.16`** row illustrates severity handling differences. CVE Lite elevates the package to **critical** based on the highest validated OSV severity (`GHSA-gc25-3vc5-2jf9`) and marks it **⚠ no fix**. `pnpm audit`'s summary line for this lockfile reports **13 high** as its top severity bucket — it does not surface a separate critical count for this snapshot.

**`next@16.2.3`** may appear multiple times in `pnpm audit` output across docs-app paths. CVE Lite reports it once as a single high finding with a validated target (`16.2.6`).

**Fix guidance differs materially:**

On this lockfile-only snapshot, CVE Lite generates **zero copy-and-run command groups**. That is intentional and informative: every finding is transitive, and this MVP cannot identify safe parent upgrades automatically for most paths in an unresolved workspace snapshot.

`pnpm audit` lists advisories and patched versions but does not distinguish "fixable now with one command" from "blocked on upstream / parent release." CVE Lite's skipped section makes that explicit for all **13** findings.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 13 | 1 | 5 | 7 | 0 | 0 | 13 | 0 |

Zero command groups is itself a meaningful result. On a professionally maintained build-tool monorepo, the first scan answer may be "nothing to run locally yet — triage upstream and docs-app dependencies first."

---

## Fix Journey

No commands were generated or run for this study.

The instinct on a critical finding is to search for an upgrade command immediately. For **`sandbox@3.0.0-beta.16`**, CVE Lite correctly returns **no command** and flags **no known non-vulnerable published version** — the right next step is identifying which docs or example workspace pulls `sandbox` in and whether an upstream release replaces the beta.

For **`next@16.2.3`**, a maintainer would bump the docs app dependency toward `16.2.6+` in the full Turborepo checkout — not install `next` at the monorepo root from this lockfile snapshot alone.

For **`turbo@2.8.3`**, the finding is a reminder that the repository's own toolchain can lag the latest patched `turbo` release even while the project ships build-system software.

---

## Why this matters

Turborepo is widely adopted as monorepo infrastructure — teams trust it to orchestrate builds, not to introduce supply-chain risk. Yet a verified lockfile scan still surfaces **13 vulnerable packages**, including a **critical no-fix sandbox beta** and a **high-severity Next.js docs dependency**.

That pattern matters for build-tool maintainers and for teams vendoring Turborepo's docs or example workspaces into their own environments. The risk is not necessarily in the `turbo` CLI binary path alone — it is in the **JavaScript toolchain graph** the monorepo carries for documentation, examples, and lint configuration.

CVE Lite's value here is triage clarity on a smaller graph: **one critical no-fix package to escalate immediately**, **five high findings to route to docs/tooling owners**, and **zero misleading auto-fix commands** that would suggest `pnpm add` on transitive packages from an incomplete workspace snapshot.

---

## Scan command

Run from the Turborepo repository root or from the `examples/turborepo` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Turborepo at revision `c85d4104bdc18df051334210d29c49353c46facf`. Turborepo releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/turborepo/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-27 |
| CLI version | v1.18.0 |
| CVE Lite command | `npx tsx src/index.ts examples/turborepo --json --all` |
| pnpm audit command | `pnpm audit` (pnpm 10.28.0) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/turborepo/pnpm-lock.yaml` from [vercel/turborepo@c85d410](https://github.com/vercel/turborepo/commit/c85d4104bdc18df051334210d29c49353c46facf) |
| Packages parsed (CVE Lite) | 1,776 |
| Unique vulnerable packages (CVE Lite) | 13 |
| Vulnerability entries (pnpm audit) | 28 |
| Fix command groups (CVE Lite) | 0 |
| Skipped findings with reason (CVE Lite) | 13 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npx tsx src/index.ts examples/turborepo --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/turborepo
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-27.

---

## Remaining risk

All 13 baseline findings remain open at the time of this study. No remediation was applied.

- **1 critical (no known fix):** `sandbox@3.0.0-beta.16`
- **5 high:** `basic-ftp`, `fast-uri`, `fast-xml-builder`, `next`, `tmp`
- **7 medium:** `brace-expansion`, `fast-xml-parser`, `ip-address`, two `postcss` versions, `qs`, `turbo`

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-27 (revision `c85d410`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| sandbox | 3.0.0-beta.16 | critical | transitive | ⚠ no fix | GHSA-fm4j-4xhm-xpwx, GHSA-gc25-3vc5-2jf9 |
| basic-ftp | 5.2.2 | high | transitive | 5.3.1 | GHSA-rp42-5vxx-qpwr, GHSA-rpmf-866q-6p89 |
| fast-uri | 3.1.0 | high | transitive | 3.1.2 | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc |
| fast-xml-builder | 1.1.4 | high | transitive | 1.1.7 | GHSA-5wm8-gmm8-39j9 |
| next | 16.2.3 | high | transitive | 16.2.6 | GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6… |
| tmp | 0.2.5 | high | transitive | 0.2.6 | GHSA-ph9p-34f9-6g65 |
| brace-expansion | 5.0.5 | medium | transitive | 5.0.6 | GHSA-jxxr-4gwj-5jf2 |
| fast-xml-parser | 5.5.11 | medium | transitive | 5.7.0 | GHSA-gh4j-gqv2-49f6 |
| ip-address | 10.1.0 | medium | transitive | 10.1.1 | GHSA-v2v4-37r5-5v8g |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| postcss | 8.5.6 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| qs | 6.15.1 | medium | transitive | 6.15.2 | GHSA-q8mj-m7cp-5q26 |
| turbo | 2.8.3 | medium | transitive | 2.9.14 | GHSA-3qcw-2rhx-2726, GHSA-hcf7-66rw-9f5r |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
