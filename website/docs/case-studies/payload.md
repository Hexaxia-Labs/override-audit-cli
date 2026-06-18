# Payload CMS

> Verified baseline scan — CVE Lite CLI v1.22.0 · 2026-06-12

<p align="center">
  <img src="/img/payload-logo.svg" alt="Payload CMS logo" width="260"/>
</p>

## Summary

- **Project:** Payload CMS — TypeScript-first headless CMS and application framework
- **Revision:** `eb5708b3d3834a50a29f19d93df7406011e08114`
- **Lockfile:** `pnpm-lock.yaml` (2,602 resolved packages, pnpm workspace monorepo)
- **Baseline findings:** 18 unique vulnerable packages (1 critical · 7 high · 9 medium · 1 low)
- **OSV advisory matches:** 36 CVE/advisory entries deduplicated into 18 packages
- **Direct vs transitive:** 1 direct / 17 transitive
- **Validated fix command groups generated:** 2
- **pnpm audit (same lockfile):** 42 vulnerability entries (1 critical · 12 high · 26 moderate · 3 low)
- **Remediation applied in this study:** workspace-scoped `drizzle-orm` remediation attempt and verification rescan

---

## What this case study demonstrates

Payload CMS is a large pnpm workspace monorepo containing the core CMS, database adapters, testing infrastructure, examples, and deployment tooling. At 2,602 resolved packages, it represents a realistic modern JavaScript dependency graph where most risk originates from transitive dependencies rather than application runtime code.

The direct/transitive split (1 direct, 17 transitive) is the first thing worth noticing. Only one vulnerable package (`drizzle-orm`) is directly controlled by the project. The remaining findings arrive through build tooling, SDKs, framework integrations, and development dependencies. A developer running `pnpm audit` on this lockfile sees **42 vulnerability entries** with no direct/transitive breakdown and no copy-and-run fix plan. CVE Lite surfaces **18 unique vulnerable packages**, **2 command groups**, and a clear split between what is directly fixable and what requires parent-chain decisions.

The most important findings are:

**`drizzle-orm@0.44.7` — high, direct.** CVE Lite generates a validated workspace-scoped upgrade command targeting the exact workspaces that depend on the package. This is the one finding Payload's maintainers directly control at the manifest level.

**`fast-xml-parser@4.2.5` — critical, transitive.** CVE Lite identifies a fixed version but cannot safely generate an automated parent-upgrade path. This is an example of a finding that requires manual dependency-chain investigation.

**`undici@7.18.2` — high, transitive.** A validated parent-upgrade path exists through `wrangler`. CVE Lite generates the specific `pnpm add wrangler@4.62.0` command rather than suggesting a direct install of the transitive package.

Unlike raw advisory feeds, CVE Lite identifies a clear distinction between direct fixes, parent upgrades, and findings that require upstream dependency-chain investigation.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-06-12.

| Metric | pnpm audit | CVE Lite CLI |
|---|---:|---:|
| Total reported findings | 42 | 18 |
| Critical | 1 | 1 |
| High | 12 | 7 |
| Moderate / Medium | 26 | 9 |
| Low | 3 | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (1 / 17) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | ✗ | ✓ |
| Parent-upgrade guidance | ✗ | ✓ |
| Copy-and-run commands | ✗ | ✓ (2 groups) |
| Skipped findings with reason | ✗ | ✓ |

### Why the totals differ

`pnpm audit` reports vulnerability entries. A single vulnerable package may appear multiple times across advisory IDs and dependency paths.

CVE Lite reports unique vulnerable package versions and groups advisory data around actionable remediation decisions.

This explains the difference between **42 vulnerability entries** and **18 vulnerable packages**.

`drizzle-orm` is a concrete example. On this lockfile, `pnpm audit` reports multiple separate entries for the same package version across different workspace paths. CVE Lite deduplicates these into **one high finding** for `drizzle-orm@0.44.7` with a single consolidated workspace-scoped fix command — a clearer picture of how many package-level decisions are actually required.

**Fix guidance differs materially:**

`pnpm audit --fix` was attempted in an isolated copy of this lockfile. The workspace-scoped nature of the monorepo means automatic fix behavior may differ from what `pnpm audit` suggests.

CVE Lite generates validated commands without requiring assumptions about workspace layout:

```bash
pnpm add --filter ./packages/db-d1-sqlite --filter ./packages/db-postgres --filter ./packages/db-sqlite --filter ./packages/db-vercel-postgres --filter ./packages/drizzle --filter ./test drizzle-orm@0.45.2
```

```bash
pnpm add @sentry/nextjs@9.0.0 @swc/cli@0.8.1 lint-staged@15.4.2
pnpm add wrangler@4.62.0
```

For the critical finding, CVE Lite names `fast-xml-parser` as requiring manual chain investigation rather than suggesting a direct install of the transitive package.

---

## Before vs After

A remediation attempt was performed using the generated workspace-scoped `drizzle-orm` upgrade command.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 18 | 1 | 7 | 9 | 1 | 1 | 17 | 2 |
| After remediation attempt | 18 | 1 | 7 | 9 | 1 | 1 | 17 | 2 |

The generated remediation command completed successfully but did not reduce the finding count. The vulnerable `drizzle-orm@0.44.7` version remained present in the dependency graph.

This illustrates a common monorepo reality: upgrading a dependency in selected workspaces does not always eliminate every vulnerable path present in the lockfile. Partial coverage is a documented limitation of workspace-scoped remediation commands, and rescanning after every command group is the correct workflow.

---

## Fix Journey

The scanner generated two remediation groups.

### Group 1 — direct workspace remediation

```bash
pnpm add --filter ./packages/db-d1-sqlite --filter ./packages/db-postgres --filter ./packages/db-sqlite --filter ./packages/db-vercel-postgres --filter ./packages/drizzle --filter ./test drizzle-orm@0.45.2
```

This command targets the workspaces that depend on `drizzle-orm` directly. CVE Lite identifies the exact `--filter` paths rather than applying a root-level upgrade, which preserves workspace isolation.

### Group 2 — parent upgrades

```bash
pnpm add @sentry/nextjs@9.0.0 @swc/cli@0.8.1 lint-staged@15.4.2
```

```bash
pnpm add wrangler@4.62.0
```

These upgrades address findings through dependency-parent relationships rather than direct package replacement. The `wrangler` upgrade resolves the `undici@7.18.2` finding. The `@sentry/nextjs`, `@swc/cli`, and `lint-staged` upgrades address several medium transitive findings through their resolved dependency trees.

### Critical finding

`fast-xml-parser@4.2.5` remains unresolved. The scanner identified a fixed version but could not generate a safe parent-upgrade recommendation automatically. This is an example of a finding that requires manual dependency-chain investigation — identifying which workspace or toolchain package pulls in `fast-xml-parser` and whether a newer version of that parent resolves the transitive dependency.

The distinction between Group 1's direct workspace scoping and Group 2's parent upgrades is intentional. The first replaces a package Payload controls. The second upgrades parents to pull in safer transitive versions. Neither covers `fast-xml-parser` because no safe automated path was identified.

---

## Why this matters

Payload CMS is a widely used TypeScript-first headless CMS adopted across production applications. Its monorepo is professionally maintained, typed end-to-end, and ships on a regular cadence. Yet a verified lockfile scan still surfaces 18 vulnerable packages — 17 of them transitive.

That pattern is consistent across every modern framework monorepo scan in this project: the risk is not in application runtime code. It is in the toolchain developers install, trust, and rarely audit — ORM adapters, observability SDKs, deployment tools, linting stacks, and testing infrastructure.

Two chains in this scan are worth naming specifically:

`wrangler` → `undici@7.18.2` (high). A developer auditing "my Payload site dependencies" would not immediately associate a Cloudflare deployment tool with an HTTP client vulnerability. CVE Lite names the parent chain and generates the upgrade command directly.

`fast-xml-parser@4.2.5` (critical, transitive). The critical finding arrives through a transitive path with no auto-generated fix. This is the operationally correct outcome — surfacing the finding with an honest assessment of what can and cannot be automated, rather than generating a command that might introduce breakage.

For a team doing a pre-release check, the operationally useful question is not "how many advisories exist?" It is "what do I run right now, and what needs upstream?" CVE Lite answers that in under 30 seconds: two command groups for the confident first pass, one critical finding flagged for manual investigation, and remaining entries explaining why the rest are not auto-fixable.

---

## Scan command

Run from the Payload CMS repository root or from the `examples/payload` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile in this repository reflects Payload CMS at revision `eb5708b3d3834a50a29f19d93df7406011e08114`. Payload releases frequently — and OSV advisory data changes over time — so re-scanning may show a different finding count even on the same lockfile revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/payload/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-06-12 |
| CLI version | v1.22.0 |
| CVE Lite command | `npx cve-lite-cli . --verbose --all` |
| pnpm audit command | `pnpm audit` |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/payload/pnpm-lock.yaml` from [payloadcms/payload@eb5708b](https://github.com/payloadcms/payload/commit/eb5708b3d3834a50a29f19d93df7406011e08114) |
| Packages parsed (CVE Lite) | 2,602 |
| Unique vulnerable packages (CVE Lite) | 18 |
| Vulnerability entries (pnpm audit) | 42 |
| Fix command groups (CVE Lite) | 2 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npx tsx src/index.ts examples/payload --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/payload
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-06-12.

---

## Remaining risk

All 18 findings remain present after the remediation attempt.

- **1 critical:** `fast-xml-parser@4.2.5` (transitive — no auto parent upgrade)
- **7 high:** including `drizzle-orm`, `undici`, `rollup`, `effect`, and others via toolchain paths
- **9 medium:** including `file-type`, `yaml`, `postcss`, `uuid`, and related build/SDK packages
- **1 low:** transitive finding via a development dependency chain

---

## Baseline findings

The verified scan surfaced 18 vulnerable packages:

### Critical
- fast-xml-parser@4.2.5

### High
- drizzle-orm@0.44.7 (direct)
- undici@7.18.2
- rollup@3.29.5
- effect@3.10.3
- js-cookie@2.2.1
- @opennextjs/cloudflare@1.16.1

### Medium
- file-type@20.5.0
- yaml@2.4.5
- postcss@8.4.31
- uuid@9.0.1
- uuid@10.0.0
- uuid@8.3.2
- ws@8.18.0
- dompurify@3.2.7
- esbuild@0.18.20
- and additional transitive findings

### Low
- One transitive low-severity finding

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.