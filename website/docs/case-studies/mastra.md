# Mastra Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-29

<p align="center">
  <img src="/cve-lite-cli/img/mastra-logo.svg" alt="Mastra logo" width="200"/>
</p>

## Summary

- **Project:** [Mastra](https://github.com/mastra-ai/mastra) — TypeScript AI agent framework (agents, tools, workflows, observability, and playground UI)
- **Revision:** `e9d54b281667477dd97b9dfc166b338f6d097fe8`
- **Lockfile:** `pnpm-lock.yaml` (4,555 resolved packages, pnpm 11.3.0)
- **Baseline findings:** 64 unique vulnerable packages (3 critical · 30 high · 25 medium · 6 low)
- **OSV advisory matches:** 135 CVE/advisory entries deduplicated into 64 packages
- **Direct vs transitive:** 4 direct / 60 transitive
- **Validated fix command groups generated:** 2
- **First-pass coverage:** 3 of 64 findings have confident copy-and-run commands
- **pnpm audit (same lockfile):** 116 vulnerability entries (4 critical · 55 high · 51 moderate · 6 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

Mastra is one of the largest pnpm monorepos in the CVE Lite CLI example set — **4,555 resolved packages** across core SDK packages, deployer tooling, playground UI, client SDKs, docs apps, and integration examples. It exceeds the Vercel AI SDK snapshot (3,570) and Gatsby Yarn Classic snapshot (3,568) in raw graph size.

The direct/transitive split (**4 direct, 60 transitive**) highlights where maintainers can act from the root toolchain versus where risk lives in auth, observability, and agent-runtime dependencies:

**`@clerk/shared@3.28.2` — critical, transitive.** Fast-password-hash advisories in Clerk auth paths used by playground and deployer flows — not a root `package.json` dependency.

**`simple-git@3.28.0` — critical, transitive.** Remote code execution class advisories in git automation tooling pulled into the monorepo graph.

**`protobufjs@7.5.4` — critical, transitive.** Telemetry and gRPC-style serialization paths — CVE Lite also reports additional `protobufjs` versions at high severity separately.

The **four direct** findings are all toolchain-leverage points:

```bash
pnpm add path-to-regexp@8.4.0 turbo@2.9.14
pnpm add --filter ./client-sdks/react --filter ./packages/playground --filter ./packages/playground-ui vite@7.3.2
```

CVE Lite validates **`path-to-regexp@8.4.0`** (covering both direct versions `0.1.12` and `8.3.0`), **`turbo@2.9.14`**, and **filtered `vite@7.3.2`** upgrades across playground workspaces.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-29.

| Metric | pnpm audit (11.3.0) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Packages audited / parsed | 4,555 | 4,555 |
| Total reported findings | 116 | 64 |
| Critical | 4 | 3 |
| High | 55 | 30 |
| Moderate / Medium | 51 | 25 |
| Low | 6 | 6 |
| Direct vs transitive breakdown | ✗ | ✓ (4 / 60) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | partial | ✓ |
| Copy-and-run command groups | ✗ | ✓ (2 groups) |
| Skipped findings with reason | ✗ | ✓ (60 entries) |

**Why the totals differ:** `pnpm audit` counts **116 vulnerability entries** (advisory × path rows). CVE Lite counts **64 unique vulnerable package versions** once each. Example: four `minimatch` majors each appear as separate unique packages in CVE Lite; `pnpm audit` may emit multiple rows per advisory path.

**Critical severity:** `pnpm audit` reports **4 critical** entries; CVE Lite reports **3 critical** unique packages (`@clerk/shared`, `protobufjs@7.5.4`, `simple-git`). Both flag the same underlying critical packages — CVE Lite deduplicates `protobufjs@7.5.5` and `8.0.1` as separate high findings rather than folding them into the critical row.

**Fix guidance:**

`pnpm audit` lists advisories without workspace-filtered remediation. CVE Lite generates **2 command groups** covering **3 findings** on first pass, including filtered `pnpm add` for Vite across playground packages — a pattern highly relevant to AI framework monorepos where dev-server risk sits in UI workspaces, not the published npm tarball alone.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 64 | 3 | 30 | 25 | 6 | 4 | 60 | 2 |

---

## Fix Journey

No commands were run for this study.

The instinct on **3 critical** findings is to `pnpm add` at the repo root. CVE Lite shows why that fails: **`@clerk/shared`**, **`simple-git`**, and critical **`protobufjs`** are transitive — they require parent-package or upstream workspace decisions.

For **`path-to-regexp`**, two direct versions (`0.1.12` and `8.3.0`) collapse into one validated command targeting **`8.4.0`**.

For **`vite@7.3.1`**, the fix is explicitly **filtered** to `./client-sdks/react`, `./packages/playground`, and `./packages/playground-ui` — the correct mental model for monorepo maintainers.

---

## Why this matters

Mastra sits at the intersection of **AI agent frameworks** and **large pnpm monorepos** — the exact graph shape teams struggle to triage: Clerk auth, OpenTelemetry, LangSmith, `ai` SDK versions, playground Vite servers, and Turbo build tooling all in one lockfile.

CVE Lite's value is **deduplication and actionable grouping at 4,555-package scale**: 64 unique findings, **4 direct levers**, **2 command groups**, and **60 skipped findings with reasons** — versus **116 pnpm audit rows** without remediation structure.

---

## Scan command

Run from the Mastra repository root or from the `examples/mastra` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects Mastra at revision `e9d54b281667477dd97b9dfc166b338f6d097fe8`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/mastra/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-29 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/mastra --verbose --all --json` |
| pnpm audit command | `pnpm audit` / `pnpm audit --json` (pnpm 11.3.0, Node.js 24) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/mastra/pnpm-lock.yaml` from [mastra-ai/mastra@e9d54b2](https://github.com/mastra-ai/mastra/commit/e9d54b281667477dd97b9dfc166b338f6d097fe8) |
| Packages parsed (CVE Lite) | 4,555 |
| Unique vulnerable packages (CVE Lite) | 64 |
| Vulnerability entries (pnpm audit) | 116 |
| Fix command groups (CVE Lite) | 2 |
| First-pass covered findings (CVE Lite) | 3 |
| Skipped findings with reason (CVE Lite) | 60 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/mastra --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended for pnpm 11):

```bash
cd examples/mastra
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-29.

---

## Remaining risk

All 64 baseline findings remain open at the time of this study. No remediation was applied.

- **3 critical:** `@clerk/shared@3.28.2`, `protobufjs@7.5.4`, `simple-git@3.28.0`
- **30 high:** including direct `path-to-regexp@0.1.12`, `path-to-regexp@8.3.0`, `vite@7.3.1`, plus `axios`, `kysely`, `langsmith`, four `minimatch` versions, two additional `protobufjs` versions, `undici`, OpenTelemetry packages
- **25 medium:** including direct `turbo@2.9.12`, five `uuid` versions, `better-auth`, `postcss`, two `ws` versions
- **6 low:** four `@ai-sdk/provider-utils` versions, legacy `ai@4.3.19`, `@wong2/mcp-cli`

Only **3 findings** have first-pass copy-and-run commands. The other **60** are skipped with explicit reasons in the scan output.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-29 (revision `e9d54b2`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @clerk/shared | 3.28.2 | critical | transitive | 3.47.5 | CVE-2026-41248, CVE-2026-42349 |
| protobufjs | 7.5.4 | critical | transitive | 7.5.8 | CVE-2026-44294, CVE-2026-44293… |
| simple-git | 3.28.0 | critical | transitive | 3.36.0 | CVE-2026-6951, CVE-2026-28291… |
| @babel/plugin-transform-modules-systemjs | 7.28.5 | high | transitive | 7.29.4 | CVE-2026-44728 |
| @opentelemetry/auto-instrumentations-node | 0.56.1 | high | transitive | 0.75.0 | CVE-2026-44902 |
| @opentelemetry/exporter-prometheus | 0.207.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/exporter-prometheus | 0.208.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/exporter-prometheus | 0.57.2 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.207.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.208.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.57.2 | high | transitive | 0.217.0 | CVE-2026-44902 |
| axios | 1.13.5 | high | transitive | 1.16.0 | CVE-2026-44494, CVE-2026-44495… |
| defu | 6.1.4 | high | transitive | 6.1.5 | CVE-2026-35209 |
| fast-uri | 3.1.0 | high | transitive | 3.1.2 | CVE-2026-6321, CVE-2026-6322 |
| js-cookie | 3.0.5 | high | transitive | 3.0.7 | CVE-2026-46625 |
| kysely | 0.28.8 | high | transitive | 0.28.17 | CVE-2026-33468, CVE-2026-44635… |
| langsmith | 0.5.26 | high | transitive | 0.6.0 | CVE-2026-45134 |
| lodash-es | 4.17.21 | high | transitive | 4.18.0 | CVE-2026-2950, CVE-2026-4800… |
| minimatch | 10.2.1 | high | transitive | 10.2.3 | CVE-2026-27904, CVE-2026-27903 |
| minimatch | 5.1.7 | high | transitive | 5.1.8 | CVE-2026-27904, CVE-2026-27903 |
| minimatch | 7.4.6 | high | transitive | 7.4.8 | CVE-2026-27904, CVE-2026-26996… |
| minimatch | 9.0.5 | high | transitive | 9.0.7 | CVE-2026-27904, CVE-2026-26996… |
| multer | 2.0.2 | high | transitive | 2.1.1 | CVE-2026-3520, CVE-2026-2359… |
| path-to-regexp | 0.1.12 | high | direct | 0.1.13 | CVE-2026-4867 |
| path-to-regexp | 8.3.0 | high | direct | 8.4.0 | CVE-2026-4923, CVE-2026-4926 |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | CVE-2026-33672, CVE-2026-33671 |
| picomatch | 4.0.3 | high | transitive | 4.0.4 | CVE-2026-33672, CVE-2026-33671 |
| protobufjs | 7.5.5 | high | transitive | 7.5.8 | CVE-2026-44294, CVE-2026-44293… |
| protobufjs | 8.0.1 | high | transitive | 8.2.0 | CVE-2026-44294, CVE-2026-44293… |
| svgo | 3.3.2 | high | transitive | 3.3.3 | CVE-2026-29074 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | CVE-2026-44705 |
| undici | 6.22.0 | high | transitive | 6.24.0 | CVE-2026-1525, CVE-2026-1527… |
| vite | 7.3.1 | high | direct | 7.3.2 | CVE-2026-39365, CVE-2026-39363… |
| @fastify/static | 9.0.0 | medium | transitive | 9.1.1 | CVE-2026-6410, CVE-2026-6414 |
| @protobufjs/utf8 | 1.1.0 | medium | transitive | 1.1.1 | CVE-2026-44288 |
| @workos/authkit-session | 0.3.4 | medium | transitive | 0.5.1 | CVE-2026-42565 |
| ajv | 8.17.1 | medium | transitive | 8.18.0 | CVE-2025-69873 |
| better-auth | 1.4.18 | medium | transitive | 1.6.2 | — |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | CVE-2026-33750 |
| brace-expansion | 2.0.2 | medium | transitive | 2.0.3 | CVE-2026-33750 |
| brace-expansion | 5.0.4 | medium | transitive | 5.0.6 | CVE-2026-33750, CVE-2026-45149 |
| file-type | 20.4.1 | medium | transitive | 21.3.2 | CVE-2026-31808, CVE-2026-32630 |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | — |
| ip-address | 10.1.0 | medium | transitive | 10.1.1 | CVE-2026-42338 |
| mdast-util-to-hast | 13.2.0 | medium | transitive | 13.2.1 | CVE-2025-66400 |
| postcss | 8.5.8 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| protobufjs | 7.5.7 | medium | transitive | 7.5.8 | CVE-2026-45740 |
| qs | 6.14.1 | medium | transitive | 6.15.2 | CVE-2026-8723, CVE-2026-2391 |
| turbo | 2.9.12 | medium | direct | 2.9.14 | CVE-2026-45772, CVE-2026-45773 |
| uuid | 10.0.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 11.1.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 13.0.0 | medium | transitive | 13.0.1 | CVE-2026-41907 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| webpack-dev-server | 5.2.3 | medium | transitive | 5.2.4 | CVE-2026-6402 |
| ws | 8.18.0 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| ws | 8.20.0 | medium | transitive | 8.20.1 | CVE-2026-45736 |
| yaml | 2.8.1 | medium | transitive | 2.8.3 | CVE-2026-33532 |
| @ai-sdk/provider-utils | 2.1.10 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @ai-sdk/provider-utils | 2.2.8 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @ai-sdk/provider-utils | 3.0.20 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @ai-sdk/provider-utils | 3.0.25 | low | transitive | 4.0.0 | CVE-2026-8769 |
| @wong2/mcp-cli | 1.13.0 | low | transitive | 2.0.0 | CVE-2025-9262 |
| ai | 4.3.19 | low | transitive | 5.0.52 | CVE-2025-48985 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
