# OpenAI Agents SDK (JavaScript) Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-30

<p align="center">
  <img src="/cve-lite-cli/img/openai-agents-js-logo.svg" alt="OpenAI Agents SDK logo" width="320"/>
</p>

## Summary

- **Project:** [OpenAI Agents SDK (JavaScript)](https://github.com/openai/openai-agents-js) — TypeScript framework for multi-agent workflows, voice agents, and provider integrations
- **Revision:** `f76fc19fba03dfbecf34ffd92302543b3b1d4890`
- **Lockfile:** `pnpm-lock.yaml` (1,683 resolved packages, pnpm workspace monorepo)
- **Lead finding — all-transitive graph:** **0 direct / 31 transitive** — every remediation path requires **tracing a parent upgrade**, not bumping a root manifest dependency
- **One confident first-pass command:** `pnpm add verdaccio@6.7.2` resolves **`minimatch@7.4.6` → `7.4.8`** via a documented path (`project → verdaccio → @verdaccio/core → minimatch`)
- **High-severity parent clusters:** **`@modelcontextprotocol/sdk`** (4 high findings), **`@daytonaio/sdk`** (3), plus **`astro`**, **`prisma`**, **`modal`**, **`@blaxel/core`**, **`@tailwindcss/postcss`** — each with validated OSV targets but no auto-safe parent release on this snapshot
- **Baseline findings:** 31 unique vulnerable packages (0 critical · 13 high · 16 medium · 2 low)
- **OSV advisory matches:** 58 CVE/advisory entries deduplicated into 31 packages
- **Validated fix command groups generated:** 1
- **First-pass coverage:** 1 of 31 findings have a confident copy-and-run command
- **pnpm audit (same lockfile):** 52 vulnerability entries (27 high · 22 moderate · 3 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

> **Framing note (maintainer review on #490):** Repos with at least one **direct** vulnerable dependency often yield stronger “run this now” case studies. This snapshot is intentionally valuable for a different reason: it shows **transitive parent tracing at scale** on a high-visibility AI SDK monorepo where **30 of 31** findings need upstream routing — not root `pnpm add <vulnerable-package>`.

> **Count update:** Issue #490’s preliminary scan on 2026-05-28 reported **29** findings. Re-verification on **2026-05-30** reports **31** packages (added `@ai-sdk/provider-utils` low-severity rows and OSV churn). Numbers below reflect the **2026-05-30** live scan.

---

## What this case study demonstrates

The OpenAI Agents SDK monorepo is a **high-visibility pnpm workspace** spanning `@openai/agents` core packages, documentation (Astro), examples, and optional integration dependencies (MCP, Daytona, Modal, Prisma, Verdaccio local registry tooling). At **1,683 resolved packages**, the graph is leaner than LangChain.js (2,174) or Astro (2,228) — but the vulnerability profile is **entirely transitive**.

That **0 direct / 31 transitive** split is the headline maintainers should internalize:

**You cannot fix this lockfile by editing root `package.json` alone.** CVE Lite’s value is naming **which parent package** owns each high-severity chain — and separating the **one path** where a parent upgrade is auto-validated from the **twelve high findings** that still need manual upstream releases.

### The one actionable first pass

**`minimatch@7.4.6` — high, via `verdaccio@6.7.1`.** CVE Lite generates:

```bash
pnpm add verdaccio@6.7.2
```

The output documents the full chain: `project → verdaccio → @verdaccio/local-storage-legacy → @verdaccio/core → minimatch`. That is **transitive tracking with a runnable parent upgrade** — the clearest “copy and run” outcome on this snapshot.

### High-severity clusters needing parent routing (no auto command)

**`@modelcontextprotocol/sdk` — four high findings:** `@hono/node-server@1.19.9`, `express-rate-limit@8.2.1`, `fast-uri@3.1.0`, `path-to-regexp@8.3.0`. Validated targets exist (`1.19.13`, `8.2.2`, `3.1.2`, `8.4.0`) but CVE Lite cannot identify a safe MCP SDK release that resolves all four on this lockfile-only snapshot.

**`@daytonaio/sdk` — three high findings:** `@opentelemetry/exporter-prometheus@0.207.0`, `@opentelemetry/sdk-node@0.207.0`, `fast-xml-builder@1.1.5`. Targets validate to `0.217.0` / `1.1.7` — maintainer must bump Daytona SDK in the full checkout.

**Other high findings with named parents:** `axios@1.15.1` via **`@blaxel/core`** → `1.16.0`; `devalue@5.7.1` via **`astro`** (docs) → `5.8.1`; `effect@3.18.4` via **`prisma`** → `3.20.0`; `protobufjs@7.5.5` via **`modal`** → `7.5.8`; `tar@7.4.3` via **`@tailwindcss/postcss`** → `7.5.11`.

**Medium/low fragmentation:** four `postcss` versions, three `brace-expansion` versions, two `qs` versions, two `uuid` versions, two `@ai-sdk/provider-utils` versions — typical docs/examples/tooling duplication, each skipped with an explicit parent reason.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-30 (Node.js 22+, pnpm 10.14.0).

| Metric | pnpm audit (10.14.0) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Total reported findings | 52 | 31 |
| Critical | 0 | 0 |
| High | 27 | 13 |
| Moderate / Medium | 22 | 16 |
| Low | 3 | 2 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 31) |
| Deduplicated package view | ✗ | ✓ |
| Parent package named per finding | partial (paths) | ✓ |
| Specific copy-and-run commands | partial | ✓ (1 group) |
| Skipped findings with reason | ✗ | ✓ (30 entries) |

**Why the totals differ:**

`pnpm audit` counts **52 vulnerability entries** (advisory × dependency path). CVE Lite counts **31 unique vulnerable package versions** once each. **`axios@1.15.1`** may appear as multiple high/moderate/low rows in `pnpm audit` while CVE Lite reports it **once** with validated target `1.16.0` and parent `@blaxel/core`.

**Severity bucketing:** `pnpm audit` reports **27 high** entries; CVE Lite reports **13 high** unique packages. The inflation is path multiplication across examples, docs, and integration workspaces — not 27 distinct vulnerable packages.

**Fix guidance differs materially:**

`pnpm audit` may suggest broad `pnpm audit fix` changes across the workspace. CVE Lite generates **one parent-upgrade command** (`verdaccio@6.7.2`) and **30 skipped rows** explaining why the remaining findings need `@modelcontextprotocol/sdk`, `@daytonaio/sdk`, `astro`, or other parent releases — not direct installs of `minimatch`, `hono`, or `axios` at the monorepo root.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 31 | 0 | 13 | 16 | 2 | 0 | 31 | 1 |

One command group covering one finding is a **realistic outcome** for an all-transitive AI SDK monorepo — the case study documents *where triage time goes* (parent routing), not a false promise of 31 one-liner fixes.

---

## Fix Journey

No commands were run for this study.

The maintainer review for #490 asked to keep **0 direct findings** framing in mind: actionability is **limited** compared to VS Code (2 direct) or Lit (3 direct rollup), but **transitive tracking** is the teaching goal.

**What a maintainer should do first:**

1. **Run the one generated command** if Verdaccio is in scope: `pnpm add verdaccio@6.7.2`, then rescan.
2. **Route MCP integration risk** to owners of `@modelcontextprotocol/sdk` — four high findings share one parent.
3. **Route Daytona / OTEL / XML** to `@daytonaio/sdk` maintainers.
4. **Treat docs and examples separately** — `devalue` via `astro`, `axios` via `@blaxel/core`, `effect` via `prisma` are not Agents core runtime issues.

**What not to do:**

- `pnpm add minimatch@7.4.8` at the root (bypasses parent validation; may not update the Verdaccio chain correctly).
- `pnpm audit fix --force` without reviewing breaking changes across 1,683 packages.

CVE Lite’s skipped section lists **30 explicit reasons** — the operational substitute when no direct dependency is vulnerable.

---

## Why this matters

Teams adopting the **OpenAI Agents SDK** will run dependency scans expecting copy-and-run output. On this snapshot, **96.8% of findings (30/31)** require **parent upgrade decisions** because **zero packages are direct vulnerabilities** in the committed lockfile.

That pattern is common in **framework monorepos** where risk lives in:

- **Optional integration SDKs** (MCP, Daytona, Modal, Blaxel)
- **Documentation tooling** (Astro, Tailwind PostCSS, Verdaccio for local package workflows)
- **Examples and test harnesses** (Prisma, AI SDK provider utils)

CVE Lite’s value is **not** pretending every finding is root-fixable. It is:

1. **Deduplicating** 52 audit rows into **31 packages** for triage.
2. **Naming parents** so owners know who must ship the next release.
3. **Generating one validated parent command** where safe (`verdaccio@6.7.2`).
4. **Skipping the other 30** with reasons instead of risky blanket fixes.

For security engineers comparing AI SDK repos: OpenAI Agents JS carries **more high-severity transitive surface per package count** than LangChain.js’s lean 13-finding graph — but the remediation story is the same class of work: **trace parents, don’t patch leaves.**

---

## Scan command

Run from the OpenAI Agents SDK repository root or from the `examples/openai-agents-js` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects the SDK at revision `f76fc19fba03dfbecf34ffd92302543b3b1d4890`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/openai-agents-js/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-30 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/openai-agents-js --verbose --all --json` |
| pnpm audit command | `pnpm audit` / `pnpm audit --json` (Node.js 22+, pnpm 10.14.0) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/openai-agents-js/pnpm-lock.yaml` from [openai/openai-agents-js@f76fc19](https://github.com/openai/openai-agents-js/commit/f76fc19fba03dfbecf34ffd92302543b3b1d4890) |
| Packages parsed (CVE Lite) | 1,683 |
| Unique vulnerable packages (CVE Lite) | 31 |
| Vulnerability entries (pnpm audit) | 52 |
| Fix command groups (CVE Lite) | 1 |
| First-pass covered findings (CVE Lite) | 1 |
| Skipped findings with reason (CVE Lite) | 30 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/openai-agents-js --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/openai-agents-js
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-30.

---

## Remaining risk

All 31 baseline findings remain open at the time of this study. No remediation was applied.

- **13 high:** including MCP cluster (`@hono/node-server`, `express-rate-limit`, `fast-uri`, `path-to-regexp`), Daytona OTEL/XML chain, `axios`, `devalue`, `effect`, `minimatch`, `protobufjs`, `tar`
- **16 medium:** `ajv`, three `brace-expansion` versions, `fast-xml-parser`, `hono`, `ip-address`, three `postcss` versions, two `qs` versions, two `uuid` versions, `ws`, `@protobufjs/utf8`
- **2 low:** `@ai-sdk/provider-utils@2.2.8` and `@ai-sdk/provider-utils@3.0.3`

**1 finding** has a first-pass command (`minimatch` via `verdaccio`); **30** require parent upgrades or acceptance of lockfile-only path limits.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-30 (revision `f76fc19`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @hono/node-server | 1.19.9 | high | transitive | 1.19.13 | CVE-2026-39406, CVE-2026-29087 |
| @opentelemetry/exporter-prometheus | 0.207.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.207.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| axios | 1.15.1 | high | transitive | 1.16.0 | CVE-2026-44494, CVE-2026-44495… |
| devalue | 5.7.1 | high | transitive | 5.8.1 | CVE-2026-42570 |
| effect | 3.18.4 | high | transitive | 3.20.0 | CVE-2026-32887 |
| express-rate-limit | 8.2.1 | high | transitive | 8.2.2 | CVE-2026-30827 |
| fast-uri | 3.1.0 | high | transitive | 3.1.2 | CVE-2026-6321, CVE-2026-6322 |
| fast-xml-builder | 1.1.5 | high | transitive | 1.1.7 | CVE-2026-44664, CVE-2026-44665 |
| minimatch | 7.4.6 | high | transitive | 7.4.8 | CVE-2026-27904, CVE-2026-26996… |
| path-to-regexp | 8.3.0 | high | transitive | 8.4.0 | CVE-2026-4923, CVE-2026-4926 |
| protobufjs | 7.5.5 | high | transitive | 7.5.8 | CVE-2026-44294, CVE-2026-44293… |
| tar | 7.4.3 | high | transitive | 7.5.11 | CVE-2026-24842, CVE-2026-26960… |
| @protobufjs/utf8 | 1.1.0 | medium | transitive | 1.1.1 | CVE-2026-44288 |
| ajv | 8.17.1 | medium | transitive | 8.18.0 | CVE-2025-69873 |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | CVE-2026-33750 |
| brace-expansion | 5.0.4 | medium | transitive | 5.0.6 | CVE-2026-33750, CVE-2026-45149 |
| brace-expansion | 5.0.5 | medium | transitive | 5.0.6 | CVE-2026-45149 |
| fast-xml-parser | 5.5.8 | medium | transitive | 5.7.0 | CVE-2026-41650 |
| hono | 4.12.16 | medium | transitive | 4.12.18 | CVE-2026-44459, CVE-2026-44457… |
| ip-address | 10.0.1 | medium | transitive | 10.1.1 | CVE-2026-42338 |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| postcss | 8.5.5 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| postcss | 8.5.8 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| qs | 6.14.1 | medium | transitive | 6.15.2 | CVE-2026-8723, CVE-2026-2391 |
| qs | 6.14.2 | medium | transitive | 6.15.2 | CVE-2026-8723 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 11.1.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| ws | 8.18.2 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| @ai-sdk/provider-utils | 2.2.8 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @ai-sdk/provider-utils | 3.0.3 | low | transitive | 4.0.0 | CVE-2026-8769 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
