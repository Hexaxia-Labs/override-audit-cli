# Presenton Case Study

> Verified baseline scan — CVE Lite CLI v1.20.0 · 2026-06-09

<p align="center">
  <img src="/cve-lite-cli/img/presenton-logo.png" alt="Presenton logo" width="320"/>
</p>

## Summary

- **Project:** [Presenton](https://github.com/presenton/presenton) — open-source AI presentation generator and API (~7.7k GitHub stars)
- **Revision:** `493aff5c764c13f7249a9a908fe41aa85c19b7c3`
- **Lockfile scope:** two **npm** lockfiles (JavaScript only — Python/FastAPI server deps are out of scope)
  - **Root orchestrator:** `package-lock.json` (93 resolved packages)
  - **Electron desktop shell:** `electron/package-lock.json` (501 resolved packages)
- **Combined baseline findings:** 9 unique vulnerable packages (0 critical · 6 high · 3 medium · 0 low)
- **OSV advisory matches:** 39 CVE/advisory entries deduplicated into 9 packages
- **Direct vs transitive:** 1 direct / 8 transitive (all on electron lockfile; root is 0 direct / 1 transitive)
- **Validated fix command groups generated:** 5 total (1 root + 4 electron)
- **First-pass coverage:** 9 of 9 findings have confident copy-and-run commands
- **npm audit (same lockfiles):** root 1 high · electron 5 high + 3 moderate (8 total) — aligns with CVE Lite deduplicated counts
- **Remediation applied in this study:** none — baseline scan and generated fix plan only

---

## Lockfile scope

Presenton ships **two independent npm dependency graphs**:

| Lockfile | Role | Packages | Findings | Command groups |
|---|---|---:|---:|---:|
| Root `package-lock.json` | Monorepo orchestrator / workspace tooling | 93 | 1 | 1 |
| `electron/package-lock.json` | Electron desktop application shell | 501 | 8 | 4 |
| **Combined** | JavaScript lockfiles only | **594** | **9** | **5** |

The repository also contains a **Python/FastAPI** server under `servers/`. That stack is **not included** in this fixture or case study — only the committed npm lockfiles above.

Because the root directory has its own `package-lock.json`, CVE Lite does **not** auto-enter multi-folder mode when scanning `examples/presenton/`. Scan each lockfile explicitly (documented below).

---

## What this case study demonstrates

Presenton extends **AI application** coverage in the CVE Lite CLI portfolio — alongside LangChain.js, OpenAI Agents JS, Mastra, and CamoFox Browser — but with a different shape: a **small root orchestrator lockfile** plus a **separate Electron desktop lockfile**, rather than a single large monorepo graph.

**Root lockfile — lean surface, one transitive chain:**

**`axios@1.15.2` — high, transitive via `@llamaindex/liteparse`.** The root graph is only 93 packages. One finding, one fix command:

```bash
npm update @llamaindex/liteparse
```

CVE Lite documents that `@llamaindex/liteparse@1.5.2` already permits `axios@1.17.0+` within range — a within-range lockfile refresh, not a root manifest edit.

**Electron lockfile — desktop packaging graph:**

At **501 packages**, the Electron shell carries the bulk of the vulnerability surface — **8 findings**, including the only **direct** finding in the study:

**`uuid@13.0.0` — medium, direct.** CVE Lite generates:

```bash
npm install uuid@13.0.1
```

**High-severity transitive cluster:** two `minimatch` majors (`3.1.2` via `serve-handler`, `10.1.1` via `electron-builder` → `app-builder-lib`), `@isaacs/brace-expansion`, `axios`, and `tmp` — typical Electron builder / static-server tooling chains.

**Four command groups cover all 8 electron findings:**

```bash
npm install electron-builder@26.8.2 serve-handler@6.1.7
npm update @llamaindex/liteparse && npm update minimatch && npm update tmp
npm install uuid@13.0.1
npm update brace-expansion && npm update follow-redirects
```

**Shared `@llamaindex/liteparse` chain:** both lockfiles pin `@llamaindex/liteparse`, which pulls in vulnerable `axios` — the same within-range refresh pattern appears in both graphs independently.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against each lockfile on the same machine on 2026-06-09.

### Root `package-lock.json`

| Metric | npm audit | CVE Lite CLI v1.20.0 |
|---|---:|---:|
| Packages parsed | 93 | 93 |
| Total reported findings | 1 | 1 |
| High | 1 | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 1) |
| Within-range refresh command | partial | ✓ (`npm update @llamaindex/liteparse`) |

### Electron `package-lock.json`

| Metric | npm audit | CVE Lite CLI v1.20.0 |
|---|---:|---:|
| Packages parsed | 501 | 501 |
| Total reported findings | 8 | 8 |
| High | 5 | 5 |
| Moderate / Medium | 3 | 3 |
| Direct vs transitive breakdown | ✗ | ✓ (1 / 7) |
| Copy-and-run command groups | partial (`npm audit fix`) | ✓ (4 groups) |

**Why the totals align:** On both lockfiles, npm audit and CVE Lite report the **same deduplicated package counts** (1 root, 8 electron). CVE Lite's value is remediation specificity — separating `npm update @llamaindex/liteparse` (within-range axios refresh) from `npm install electron-builder@26.8.2` (partial path coverage on `@isaacs/brace-expansion`) and `npm install uuid@13.0.1` (direct fix), rather than a single blunt `npm audit fix`.

---

## Before vs After

No remediation pass was performed for this study.

| Lockfile | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Root | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 1 |
| Electron | 8 | 0 | 5 | 3 | 0 | 1 | 7 | 4 |
| **Combined** | **9** | **0** | **6** | **3** | **0** | **1** | **8** | **5** |

All **9 of 9** findings have first-pass copy-and-run commands — the ideal outcome for a lean AI-app graph split across two lockfiles.

---

## Fix Journey

These commands were **generated by the scanner but not run** against the upstream Presenton repository.

**Root lockfile** (`examples/presenton/`):

```bash
npm update @llamaindex/liteparse
```

**Electron lockfile** (`examples/presenton/electron/`):

```bash
npm install electron-builder@26.8.2 serve-handler@6.1.7
npm update @llamaindex/liteparse && npm update minimatch && npm update tmp
npm install uuid@13.0.1
npm update brace-expansion && npm update follow-redirects
```

After running electron commands, rescan — `electron-builder@26.8.2` covers **one of three** paths to `@isaacs/brace-expansion@5.0.0`; output notes remaining paths may need separate parent upgrades.

---

## Why this matters

Presenton teams ship both a **web/API orchestrator** and an **Electron desktop shell** — each with its own npm lockfile. Scanning only the root graph misses **8 of 9** findings locked in `electron/package-lock.json`.

CVE Lite makes that split explicit: one command for the root axios chain, four grouped commands for the Electron builder/server graph, and a direct `uuid` upgrade — without conflating the two lockfiles or mixing in Python server dependencies.

---

## Scan command

Run each lockfile separately from the committed fixture:

```bash
# Root orchestrator (93 packages)
cve-lite examples/presenton --verbose --all

# Electron desktop shell (501 packages)
cve-lite examples/presenton/electron --verbose --all
```

The example lockfiles reflect Presenton at revision `493aff5c764c13f7249a9a908fe41aa85c19b7c3`. Presenton releases frequently — re-scanning may show different counts even on the same revision.

---

## Scan verification

Every number in this case study comes from live scans of the committed fixtures in the CVE Lite CLI repository.

| Field | Root | Electron |
|---|---|---|
| Scan date | 2026-06-09 | 2026-06-09 |
| CLI version | v1.20.0 | v1.20.0 |
| CVE Lite command | `node dist/index.js examples/presenton --verbose --all --json` | `node dist/index.js examples/presenton/electron --verbose --all --json` |
| npm audit | 1 high | 5 high · 3 moderate (8 total) |
| Advisory source | OSV (online) | OSV (online) |
| Lockfile source | [presenton/presenton@493aff5](https://github.com/presenton/presenton/commit/493aff5c764c13f7249a9a908fe41aa85c19b7c3) | same revision |
| Packages parsed | 93 | 501 |
| Unique vulnerable packages | 1 | 8 |
| OSV advisory matches | 8 | 31 |
| Fix command groups | 1 | 4 |
| First-pass coverage | 1 / 1 | 8 / 8 |

Reproduce locally:

```bash
npm install && npm run build
node dist/index.js examples/presenton --verbose --all
node dist/index.js examples/presenton/electron --verbose --all
```

---

## Remaining risk

All 9 baseline findings remain open at the time of this study. No remediation was applied.

**Root (1 finding):**
- **1 high:** `axios@1.15.2` (transitive via `@llamaindex/liteparse`)

**Electron (8 findings):**
- **5 high:** `@isaacs/brace-expansion`, two `minimatch` versions, `axios`, `tmp`
- **3 medium:** direct `uuid`, `brace-expansion`, `follow-redirects`

---

## Baseline findings

### Root lockfile (`examples/presenton/`)

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| axios | 1.15.2 | high | transitive | 1.16.0 | GHSA-35jp-ww65-95wh, GHSA-654m-c8p4-x5fp |

### Electron lockfile (`examples/presenton/electron/`)

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| @isaacs/brace-expansion | 5.0.0 | high | transitive | 5.0.1 | GHSA-7h2j-956f-4vf2 |
| axios | 1.14.0 | high | transitive | 1.16.0 | GHSA-35jp-ww65-95wh, GHSA-3g43-6gmg-66jw |
| minimatch | 3.1.2 | high | transitive | 3.1.4 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| minimatch | 10.1.1 | high | transitive | 10.2.3 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 |
| tmp | 0.2.5 | high | transitive | 0.2.6 | GHSA-ph9p-34f9-6g65 |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| uuid | 13.0.0 | medium | direct | 13.0.1 | GHSA-w5hq-g745-h8pq |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
