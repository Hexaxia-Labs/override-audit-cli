# LangChain.js Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-30

<p align="center">
  <img src="/cve-lite-cli/img/langchainjs-logo.svg" alt="LangChain.js logo" width="320"/>
</p>

## Summary

- **Project:** [LangChain.js](https://github.com/langchain-ai/langchainjs) — TypeScript framework for LLM applications, provider integrations, and tooling across a pnpm monorepo
- **Revision:** `1503c9beaa6a578f6a30739b2cfc1af9d18dd805`
- **Lockfile:** `pnpm-lock.yaml` (2,174 resolved packages, pnpm 10.14.0)
- **Lead finding — lean graph:** **13** unique vulnerable packages across **2,174** resolved versions (~0.6% of the graph) — a small OSV surface on a large AI-framework monorepo
- **High-severity triage (validated fix targets):** **`axios@1.15.2` → `1.16.0`**, **`thrift@0.21.0` → `0.23.0`** (via `@zilliz/milvus2-sdk-node`), **`tmp@0.2.5` → `0.2.6`** (via `testcontainers`) — all three targets validated against OSV; no copy-and-run groups on this lockfile-only snapshot
- **Unexpected signal:** **`@opensearch-project/opensearch@2.13.0`** flagged with a **malicious-code** advisory (`MAL-2026-3434`) in examples and `langchain-classic` integration paths — no non-vulnerable published version
- **Direct vs transitive:** 0 direct / 13 transitive
- **Baseline findings:** 13 unique vulnerable packages (0 critical · 3 high · 8 medium · 1 low · 1 malicious/unknown)
- **OSV advisory matches:** 16 CVE/advisory entries deduplicated into 13 packages
- **Validated fix command groups generated:** 0
- **First-pass coverage:** 0 of 13 findings have confident copy-and-run commands on this snapshot
- **pnpm audit (same lockfile):** 18 vulnerability entries (2 critical · 5 high · 9 moderate · 2 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

> **Note on counts:** Issue #489’s preliminary scan on 2026-05-28 reported **10** findings (2 high · 8 medium). Re-verification on **2026-05-30** reports **13** packages because OSV advisory data evolved — notably a malicious-package advisory on `@opensearch-project/opensearch`, an additional `uuid@11.1.0` row, and a low-severity `@ai-sdk/provider-utils` advisory. All numbers below reflect the **2026-05-30** live scan.

---

## What this case study demonstrates

LangChain.js is one of the most widely adopted **LLM application frameworks** in TypeScript. Its pnpm monorepo spans core packages, dozens of provider integrations, environment-test sandboxes, and a large `examples/` workspace that pulls optional vector-store, browser-automation, and cloud SDK dependencies.

At **2,174 resolved packages**, the graph is comparable to Astro (2,228) — but the vulnerability profile is radically leaner: **13 unique vulnerable package versions** versus Astro’s 34 on a similar-sized graph. That is the **lean-graph story** maintainers asked for: most of the monorepo is clean; risk concentrates in **optional example and integration dependencies**, not in `@langchain/core` runtime packages themselves.

Every finding is **transitive** on this lockfile-only snapshot (**0 direct**). CVE Lite still names **validated upgrade targets** for the three **high** findings — the maintainer review criterion for this issue:

**`axios@1.15.2` — high, validated target `1.16.0`.** `pnpm audit` paths show `examples>axios`. In a full checkout, bumping the examples workspace dependency toward `1.16.0+` is the concrete fix — proxy-bypass and prototype-pollution advisories on the 1.x line.

**`thrift@0.21.0` — high, validated target `0.23.0`.** Arrives through `@zilliz/milvus2-sdk-node` → `@dsnp/parquetjs` in the examples workspace. CVE Lite names `@zilliz/milvus2-sdk-node` as the parent and validates `0.23.0` as the lowest known non-vulnerable thrift version.

**`tmp@0.2.5` — high, validated target `0.2.6`.** Pulled by `testcontainers` in the Google Cloud SQL provider package (`libs/providers/langchain-google-cloud-sql-pg`). Path-traversal class advisory with a one-patch-version fix target.

The **unexpected** finding for a high-profile AI repo is not axios — it is **`@opensearch-project/opensearch@2.13.0`**:

CVE Lite and `pnpm audit` both surface a **malicious-code** advisory. CVE Lite marks **no known non-vulnerable published version** above the installed release. The correct outcome is **remove or replace the parent integration** that depends on OpenSearch in examples and `langchain-classic` — not `pnpm add @opensearch-project/opensearch`.

Medium-severity noise is mostly **version fragmentation**: four distinct **`uuid`** versions and two **`ws`** versions across optional examples (`convex`, `@browserbasehq/stagehand`, `@azure/identity`, `@langchain/langgraph`). CVE Lite skips auto-fix commands because no single parent upgrade was validated as safe across all paths on this snapshot.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-30.

| Metric | pnpm audit (10.14.0) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Total reported findings | 18 | 13 |
| Critical | 2 | 0 |
| High | 5 | 3 |
| Moderate / Medium | 9 | 8 |
| Low | 2 | 1 |
| Malicious / unknown bucket | (in critical) | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 13) |
| Deduplicated package view | ✗ | ✓ |
| Malicious package explicitly flagged | partial | ✓ |
| Validated fix targets per package | partial | ✓ |
| Specific copy-and-run commands | ✗ | ✗ (0 groups) |
| Skipped findings with reason | ✗ | ✓ (13 entries) |

**Why the totals differ:**

`pnpm audit` counts vulnerability **entries** (advisory × dependency path). CVE Lite counts each unique vulnerable package version once. **`axios@1.15.2`** may appear as multiple high/moderate/low rows in `pnpm audit` (five high-related entries in the human-readable report) while CVE Lite reports it **once** as a single high finding with validated target `1.16.0`.

**Critical severity:** `pnpm audit` reports **2 critical** entries for the **malicious `@opensearch-project/opensearch`** advisory (duplicate paths under `examples` and `libs/langchain-classic`). CVE Lite assigns that package to an **unknown/malicious** bucket with **0 critical** in the severity table — reflecting OSV’s malicious advisory type rather than a CVSS critical score.

**Fix guidance:**

On this lockfile-only snapshot, CVE Lite generates **zero copy-and-run command groups**. That is informative, not a failure: every finding is transitive, and the MVP cannot auto-identify safe parent releases for most optional-integration paths.

`pnpm audit` lists patched versions but does not separate “validated target exists” from “safe parent upgrade identified.” CVE Lite’s skipped section documents **13 explicit reasons** — including parent names (`testcontainers`, `@zilliz/milvus2-sdk-node`, `convex`) for maintainers routing work in a full checkout.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Malicious | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 13 | 0 | 3 | 8 | 1 | 1 | 0 | 13 | 0 |

Zero command groups on a **13-finding / 2,174-package** graph is a meaningful result: the first scan answer is “triage three high targets and one malicious integration — do not run blanket `pnpm audit fix` on a framework monorepo.”

---

## Fix Journey

No commands were generated or run for this study.

The maintainer review for this case study asked to **verify high-severity fix confidence before writing up**. On the committed lockfile snapshot, CVE Lite validates targets but does not emit runnable groups. In a **full LangChain.js checkout**, the confident maintainer actions map as follows:

**High — axios (examples workspace).** `pnpm audit` shows `examples>axios`. Upgrade the examples workspace dependency toward **`axios@1.16.0+`** after checking breaking changes on the 1.x line.

**High — thrift (Milvus examples path).** Bump **`@zilliz/milvus2-sdk-node`** (or remove the Milvus example integration) so the lockfile resolves **`thrift@0.23.0+`**.

**High — tmp (testcontainers path).** Bump **`testcontainers`** in the Google Cloud SQL provider workspace so **`tmp@0.2.6+`** is pulled in — a single-patch validated target.

**Malicious — OpenSearch.** Treat **`@opensearch-project/opensearch@2.13.0`** as a **supply-chain incident**, not a semver bump. Remove the dependency from examples and `langchain-classic` integration tests or replace the integration entirely. CVE Lite correctly reports **no non-vulnerable published version**.

**Medium — uuid / ws fragmentation.** Four `uuid` versions and two `ws` versions need **per-parent** upgrades (`@langchain/langgraph`, `@azure/identity`, `convex`, `@browserbasehq/stagehand`) — not a root `pnpm add uuid`.

---

## Why this matters

Security teams evaluating **AI/LLM frameworks** often assume massive dependency trees imply massive vulnerability counts. LangChain.js shows the opposite pattern at scale: **2,174 packages, 13 vulnerable versions** — risk clustered in **optional examples and provider integrations**, not in the core `@langchain/*` packages most applications import.

Three lessons for practitioners:

1. **Lean graphs still need triage.** Thirteen findings is small, but three are **high** with **validated patch targets** and one is a **malicious-package** signal that `pnpm audit fix` cannot safely auto-resolve.

2. **High-profile repos carry unexpected paths.** OpenSearch malware advisories in **examples** and **classic integration** packages are not obvious from scanning “LangChain core” alone — CVE Lite surfaces the package and blocks fake “upgrade to latest” guidance.

3. **Deduplication changes the conversation.** **18 pnpm audit entries** vs **13 CVE Lite packages** on the same lockfile prevents overstating risk while still naming every distinct vulnerable version maintainers must track.

CVE Lite’s value here is **clarity on a lean AI monorepo**: validated targets for the three high findings, explicit malicious-package handling, and **13 skipped reasons** instead of a misleading “run audit fix” default.

---

## Scan command

Run from the LangChain.js repository root or from the `examples/langchainjs` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects LangChain.js at revision `1503c9beaa6a578f6a30739b2cfc1af9d18dd805`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/langchainjs/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-30 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/langchainjs --verbose --all --json` |
| pnpm audit command | `pnpm audit` / `pnpm audit --json` |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/langchainjs/pnpm-lock.yaml` from [langchain-ai/langchainjs@1503c9b](https://github.com/langchain-ai/langchainjs/commit/1503c9beaa6a578f6a30739b2cfc1af9d18dd805) |
| Packages parsed (CVE Lite) | 2,174 |
| Unique vulnerable packages (CVE Lite) | 13 |
| Vulnerability entries (pnpm audit) | 18 |
| Fix command groups (CVE Lite) | 0 |
| First-pass covered findings (CVE Lite) | 0 |
| Skipped findings with reason (CVE Lite) | 13 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/langchainjs --verbose --all
```

Reproduce `pnpm audit` from the example directory:

```bash
cd examples/langchainjs
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-30.

---

## Remaining risk

All 13 baseline findings remain open at the time of this study. No remediation was applied.

- **3 high:** `axios@1.15.2`, `thrift@0.21.0`, `tmp@0.2.5` — validated targets exist; parent upgrades required in full checkout
- **1 malicious:** `@opensearch-project/opensearch@2.13.0` — remove integration; no safe published upgrade
- **8 medium:** `ip-address@10.1.0`, `qs@6.15.1`, four `uuid` versions (`8.3.2`, `9.0.1`, `10.0.0`, `11.1.0`), two `ws` versions (`8.18.0`, `8.20.0`)
- **1 low:** `@ai-sdk/provider-utils@3.0.23` via `@browserbasehq/stagehand` (validated target `4.0.0`, no safe parent auto-identified)

**0 findings** have first-pass copy-and-run commands on this lockfile-only snapshot; **13** include explicit skip reasons with named parents where path reconstruction succeeded.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-30 (revision `1503c9b`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| axios | 1.15.2 | high | transitive | 1.16.0 | CVE-2026-44494, CVE-2026-44489, CVE-2026-44490… |
| thrift | 0.21.0 | high | transitive | 0.23.0 | CVE-2026-43870, CVE-2026-41636 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | CVE-2026-44705 |
| ip-address | 10.1.0 | medium | transitive | 10.1.1 | CVE-2026-42338 |
| qs | 6.15.1 | medium | transitive | 6.15.2 | CVE-2026-8723 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 10.0.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 11.1.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| ws | 8.18.0 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| ws | 8.20.0 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| @ai-sdk/provider-utils | 3.0.23 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @opensearch-project/opensearch | 2.13.0 | unknown | transitive | ⚠ Malicious | MAL-2026-3434 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
