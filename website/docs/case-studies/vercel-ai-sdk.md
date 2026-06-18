# Vercel AI SDK Case Study

> Verified baseline scan — CVE Lite CLI v1.18.1 · 2026-05-29

<p align="center">
  <img src="/cve-lite-cli/img/vercel-ai-sdk-logo.svg" alt="Vercel AI SDK logo" width="280"/>
</p>

## Summary

- **Project:** [Vercel AI SDK](https://github.com/vercel/ai) (`vercel/ai`) — provider-agnostic TypeScript toolkit for building AI-powered applications and agents
- **Revision:** `3215032043569f75a97fadf2b08aa38f11b011af`
- **Lockfile:** `pnpm-lock.yaml` (3,570 resolved packages, pnpm 10.33.4)
- **Baseline findings:** 55 unique vulnerable packages (2 critical · 22 high · 27 medium · 4 low)
- **OSV advisory matches:** 163 CVE/advisory entries deduplicated into 55 packages
- **Direct vs transitive:** 3 direct / 52 transitive
- **Validated fix command groups generated:** 5
- **First-pass coverage:** 6 of 55 findings have confident copy-and-run commands
- **pnpm audit (same lockfile):** 162 vulnerability entries (2 critical · 56 high · 82 moderate · 22 low)
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## What this case study demonstrates

The Vercel AI SDK repository is a large **pnpm + Turborepo monorepo** spanning core packages (`ai`, `@ai-sdk/*`), dozens of framework examples (Next.js, Nuxt, Svelte, and more), and integration test workspaces. At **3,570 resolved packages**, it is comparable in scale to the Gatsby Yarn Classic snapshot (3,568) — but uses modern pnpm lockfile semantics with importer-aware path hints.

This case study is **not** the Turborepo build-system snapshot already in this repo (`vercel/turborepo`). It targets **`vercel/ai`** — the AI SDK itself — where risk concentrates in **example apps and dev tooling** (Next.js, Nuxt, OpenTelemetry, Fastify/Hono servers) rather than the published `ai` npm package surface alone.

The direct/transitive split (**3 direct, 52 transitive**) shows where maintainers have root-level leverage:

**`next@15.0.7` — critical, direct.** A legacy Next.js major locked for multiple example workspaces. CVE Lite generates a workspace-scoped upgrade toward **`15.5.18`** across filtered example packages.

**`next@15.5.9` — high, direct.** A newer Next.js line still behind the validated target on middleware and related advisories.

**`turbo@2.4.4` — medium, direct.** The monorepo's own Turborepo CLI version at the root — CVE Lite validates **`2.9.14`** as a direct upgrade.

**`protobufjs@8.0.0` — critical, transitive.** Reached through telemetry and example-server graphs — not a root `package.json` dependency.

The five generated command groups illustrate CVE Lite's strength on pnpm monorepos: **filtered `pnpm add` for Next examples**, **`pnpm update --no-save` for shared toolchain packages**, and **direct `turbo` bumps** — versus `pnpm audit` listing 162 rows without remediation grouping.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-29.

| Metric | pnpm audit (10.33.4) | CVE Lite CLI v1.18.1 |
|---|---:|---:|
| Packages audited / parsed | 3,793 | 3,570 |
| Total reported findings | 162 | 55 |
| Critical | 2 | 2 |
| High | 56 | 22 |
| Moderate / Medium | 82 | 27 |
| Low | 22 | 4 |
| Direct vs transitive breakdown | ✗ | ✓ (3 / 52) |
| Deduplicated package view | ✗ | ✓ |
| Validated fix targets | partial | ✓ |
| Copy-and-run command groups | ✗ | ✓ (5 groups) |
| Skipped findings with reason | ✗ | ✓ (49 entries) |

**Why the totals differ:** `pnpm audit` counts **162 vulnerability entries** (advisory × path rows across example workspaces). CVE Lite reports **55 unique vulnerable package versions** once each. Multiple OpenTelemetry or `undici` paths collapse into single package-level decisions.

**Critical alignment:** Both tools flag **2 critical** severities on this snapshot. CVE Lite identifies them as **`next@15.0.7` (direct)** and **`protobufjs@8.0.0` (transitive)**.

**Fix guidance:**

`pnpm audit` lists advisories but does not produce grouped, workspace-filtered commands. CVE Lite generates five groups, including:

```bash
pnpm update --no-save minimatch
pnpm add turbo@2.9.14
pnpm add --filter ./examples/next --filter ./examples/next-agent … next@15.5.18
```

…covering **6 of 55** findings on first pass. The remaining **49** are skipped with explicit reasons — mostly transitive example-app chains without a safe auto-identified parent upgrade on this lockfile-only snapshot.

---

## Before vs After

No remediation pass was performed for this study. This table records the verified baseline scan only.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline (verified) | 55 | 2 | 22 | 27 | 4 | 3 | 52 | 5 |

---

## Fix Journey

No commands were run for this study.

The instinct on **2 critical** findings is to run `pnpm add next@latest` at the repo root. CVE Lite's output shows why that is insufficient: **`next@15.0.7`** requires **filtered example workspace upgrades**, and **`protobufjs@8.0.0`** has no root-level install path.

For **`turbo@2.4.4`**, the direct command `pnpm add turbo@2.9.14` is immediate and validated.

For **`minimatch`**, **`js-yaml`**, and **`yaml`**, parent-range `pnpm update --no-save` commands address shared toolchain paths without rewriting the entire lockfile in one shot.

---

## Why this matters

AI SDK adoption is exploding — teams clone the monorepo for examples, run integration tests locally, and ship apps built from the same graph. Security triage must cover **example workspaces** (Next.js, Nuxt, Fastify) and **observability stacks** (OpenTelemetry), not only the core `ai` package.

CVE Lite's value here is **actionable grouping on a 3,570-package pnpm graph**: 55 deduplicated findings, **3 direct levers**, **5 command groups**, and **49 skipped findings with reasons** — versus **162 pnpm audit rows** without a remediation plan.

---

## Scan command

Run from the Vercel AI SDK repository root or from the `examples/vercel-ai-sdk` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile reflects `vercel/ai` at revision `3215032043569f75a97fadf2b08aa38f11b011af`. OSV advisory data changes over time — re-scanning may show different counts on the same revision.

---

## Scan verification

Every number in this case study comes from a live scan of the committed fixture at `examples/vercel-ai-sdk/` in the CVE Lite CLI repository.

| Field | Value |
|---|---|
| Scan date | 2026-05-29 |
| CLI version | v1.18.1 |
| CVE Lite command | `node dist/index.js examples/vercel-ai-sdk --verbose --all --json` |
| pnpm audit command | `pnpm audit` / `pnpm audit --json` (pnpm 10.33.4) |
| Advisory source | OSV (`https://api.osv.dev`) — online mode |
| Lockfile source | `examples/vercel-ai-sdk/pnpm-lock.yaml` from [vercel/ai@3215032](https://github.com/vercel/ai/commit/3215032043569f75a97fadf2b08aa38f11b011af) |
| Packages parsed (CVE Lite) | 3,570 |
| Unique vulnerable packages (CVE Lite) | 55 |
| Vulnerability entries (pnpm audit) | 162 |
| Fix command groups (CVE Lite) | 5 |
| First-pass covered findings (CVE Lite) | 6 |
| Skipped findings with reason (CVE Lite) | 49 |

Reproduce CVE Lite locally from the repository root:

```bash
npm install
npm run build
node dist/index.js examples/vercel-ai-sdk --verbose --all
```

Reproduce `pnpm audit` from the example directory (Node.js 22+ recommended):

```bash
cd examples/vercel-ai-sdk
pnpm audit
pnpm audit --json
```

Both tools were run against the same `pnpm-lock.yaml` on the same machine on 2026-05-29.

---

## Remaining risk

All 55 baseline findings remain open at the time of this study. No remediation was applied.

- **2 critical:** `next@15.0.7` (direct), `protobufjs@8.0.0` (transitive)
- **22 high:** including direct `next@15.5.9`, plus `hono`, `fastify`, `devalue`, OpenTelemetry packages, two `undici` versions, `nuxt`, `glob`, `minimatch`, and others
- **27 medium:** including direct `turbo@2.4.4`, four `esbuild` versions, three `file-type` versions, three `qs` versions, three `uuid` versions, `vite`, `webpack-dev-server`
- **4 low:** `cookie`, `diff`, `tsup`, `webpack`

Only **6 findings** have first-pass copy-and-run commands. The other **49** require filtered workspace upgrades, parent-chain decisions, or upstream example-app releases.

---

## Baseline findings

Full vulnerable package list from the verified scan on 2026-05-29 (revision `3215032`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| next | 15.0.7 | critical | direct | 12.3.5 | CVE-2026-44573, CVE-2026-44572… |
| protobufjs | 8.0.0 | critical | transitive | 8.2.0 | CVE-2026-44294, CVE-2026-44293… |
| @hono/node-server | 1.13.7 | high | transitive | 1.19.13 | CVE-2026-39406, CVE-2026-29087 |
| @opentelemetry/auto-instrumentations-node | 0.54.0 | high | transitive | 0.75.0 | CVE-2026-44902 |
| @opentelemetry/exporter-prometheus | 0.210.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.210.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| @opentelemetry/sdk-node | 0.56.0 | high | transitive | 0.217.0 | CVE-2026-44902 |
| devalue | 5.6.3 | high | transitive | 5.8.1 | CVE-2026-42570, CVE-2026-30226 |
| effect | 3.18.4 | high | transitive | 3.20.0 | CVE-2026-32887 |
| fastify | 5.1.0 | high | transitive | 5.8.3 | CVE-2026-3635, CVE-2026-25223… |
| glob | 10.4.5 | high | transitive | 10.5.0 | CVE-2025-64756 |
| hono | 4.6.9 | high | transitive | 4.12.18 | CVE-2026-22818, CVE-2026-29086… |
| js-cookie | 3.0.6 | high | transitive | 3.0.7 | CVE-2026-46625 |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | CVE-2026-27904, CVE-2026-26996… |
| multer | 2.0.2 | high | transitive | 2.1.1 | CVE-2026-3520, CVE-2026-2359… |
| next | 15.5.9 | high | direct | 15.5.18 | CVE-2026-44575, CVE-2026-45109… |
| nuxt | 3.14.159 | high | transitive | 3.21.6 | CVE-2026-45669, CVE-2026-46342… |
| picomatch | 4.0.1 | high | transitive | 4.0.4 | CVE-2026-33672, CVE-2026-33671 |
| tar | 6.2.1 | high | transitive | 7.5.11 | CVE-2026-24842, CVE-2026-26960… |
| tmp | 0.0.33 | high | transitive | 0.2.6 | CVE-2025-54798, CVE-2026-44705 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | CVE-2026-44705 |
| undici | 5.29.0 | high | transitive | 6.24.0 | CVE-2026-1525, CVE-2026-1527… |
| undici | 7.22.0 | high | transitive | 7.24.0 | CVE-2026-1525, CVE-2026-1527… |
| valibot | 1.1.0 | high | transitive | 1.2.0 | CVE-2025-66020 |
| @nestjs/core | 10.4.22 | medium | transitive | 11.1.18 | CVE-2026-35515 |
| @nuxt/devtools | 1.6.3 | medium | transitive | 2.6.4 | CVE-2025-52662 |
| @nuxt/vite-builder | 3.14.159 | medium | transitive | 3.15.3 | CVE-2025-24360 |
| ajv | 8.12.0 | medium | transitive | 8.18.0 | CVE-2025-69873 |
| brace-expansion | 1.1.11 | medium | transitive | 1.1.13 | CVE-2026-33750, CVE-2025-5889 |
| esbuild | 0.18.20 | medium | transitive | 0.25.0 | — |
| esbuild | 0.21.5 | medium | transitive | 0.25.0 | — |
| esbuild | 0.23.1 | medium | transitive | 0.25.0 | — |
| esbuild | 0.24.2 | medium | transitive | 0.25.0 | — |
| file-type | 16.5.4 | medium | transitive | 21.3.1 | CVE-2026-31808 |
| file-type | 18.7.0 | medium | transitive | 21.3.1 | CVE-2026-31808 |
| file-type | 20.4.1 | medium | transitive | 21.3.2 | CVE-2026-31808, CVE-2026-32630 |
| js-yaml | 4.1.0 | medium | transitive | 4.1.1 | CVE-2025-64718 |
| nanotar | 0.1.1 | medium | transitive | 0.2.1 | CVE-2025-69874 |
| phin | 2.9.3 | medium | transitive | 3.7.1 | — |
| postcss | 8.4.31 | medium | transitive | 8.5.10 | CVE-2026-41305 |
| qs | 6.13.0 | medium | transitive | 6.15.2 | CVE-2025-15284, CVE-2026-8723… |
| qs | 6.14.2 | medium | transitive | 6.15.2 | CVE-2026-8723 |
| qs | 6.15.1 | medium | transitive | 6.15.2 | CVE-2026-8723 |
| turbo | 2.4.4 | medium | direct | 2.9.14 | CVE-2026-45772, CVE-2026-45773 |
| unhead | 1.11.20 | medium | transitive | 2.1.13 | CVE-2026-31873, CVE-2026-39315… |
| uuid | 10.0.0 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 8.3.2 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| uuid | 9.0.1 | medium | transitive | 11.1.1 | CVE-2026-41907 |
| vite | 5.4.21 | medium | transitive | 6.4.2 | CVE-2026-39365 |
| webpack-dev-server | 5.2.2 | medium | transitive | 5.2.4 | CVE-2026-6402 |
| yaml | 2.7.0 | medium | transitive | 2.8.3 | CVE-2026-33532 |
| cookie | 0.6.0 | low | transitive | 0.7.0 | CVE-2024-47764 |
| diff | 7.0.0 | low | transitive | 8.0.3 | CVE-2026-24001 |
| tsup | 7.2.0 | low | transitive | 8.3.5 | CVE-2024-53384 |
| webpack | 5.97.1 | low | transitive | 5.104.1 | CVE-2025-68157, CVE-2025-68458 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
