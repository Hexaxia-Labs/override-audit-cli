# Analog Case Study

> Tested with CVE Lite CLI v1.6.0

<p align="center">
  <img src="https://raw.githubusercontent.com/analogjs/analog/main/apps/docs-app/static/img/logos/analog-logo.svg" alt="Analog logo" width="260"/>
</p>

## Summary

- **Project:** [Analog](https://github.com/analogjs/analog) — fullstack Angular meta-framework powered by Vite and Nitro, bringing file-based routing, SSR/SSG, and integrated API routes to the Angular ecosystem
- **Revision:** `3b9463ecf9782dc792a049c2e1741060cfdf2dcc`
- **Lockfile:** `pnpm-lock.yaml` (3,367 resolved packages, lockfileVersion 9.0)
- **Baseline findings:** 37 unique vulnerable packages (1 critical · 19 high · 16 medium · 1 low)
- **Direct vs transitive:** 5 direct / 32 transitive
- **Time to first actionable fix command:** under 30 seconds
- **Validated fix command groups generated:** 3
- **After three remediation passes:** reduced from 37 → 31 findings, direct surface cleared to 0

---

## What this case study demonstrates

Analog is a large, actively maintained monorepo. Its lockfile resolves 3,367 packages — more than twice the size of the NestJS and Juice Shop scans — and it uses pnpm's lockfile v9 format, which is the default for any project created with a current pnpm installation.

The direct/transitive split (5 direct, 32 transitive) tells the story immediately: the vast majority of the risk in this codebase is not in packages the project controls. It lives in the toolchain — the documentation generator, the monorepo orchestrator, the CLI, the test runner, and the SSR framework utilities. A developer running `pnpm audit` sees 85 findings with no guidance on which ones they can act on. CVE Lite surfaces 4 directly fixable packages, 3 copy-and-run command groups, and a clear view of which transitive chains are worth investigating and which are structural.

The most instructive chains here are not obvious ones. `@compodoc/compodoc` — the Angular documentation generator — pulls in `handlebars@4.7.8`, the only critical finding in the scan. `@angular/cli` pulls in `@modelcontextprotocol/sdk`, which carries its own high-severity advisory through `hono`. Neither of these paths would surface in a typical developer's mental model of where their security risk lives.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Both tools were run against the same `pnpm-lock.yaml` on the same machine.

| Metric | pnpm audit | CVE Lite CLI v1.6.0 |
|---|---:|---:|
| Total reported findings | 85 | 37 |
| Critical | 1 | 1 |
| High | 34 | 19 |
| Moderate / Medium | 47 | 16 |
| Low | 3 | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (5 / 32) |
| Validated fix targets | ✗ | ✓ |
| Breaking change awareness | ✗ | ✓ |
| Parent chain identified for transitive issues | ✗ | ✓ |
| Specific copy-and-run commands | ✗ | ✓ |

**Why CVE Lite reports fewer findings — and why that is not a coverage gap:**

`pnpm audit` counts advisories, not packages. A single vulnerable package with multiple advisories, or one that appears in several dependency paths, contributes multiple entries. CVE Lite counts each unique vulnerable package once. That is why the totals differ: 85 vs 37.

This deduplication is intentional. `lodash` appears three times in this lockfile — `4.17.21` via `@docusaurus/core`, `4.17.23` via `@compodoc/compodoc`, and `lodash-es@4.17.23` via `mermaid`. Each version affects two advisories, each appears in multiple paths. `pnpm audit` counts each advisory-path combination separately. CVE Lite surfaces three distinct package versions, each once, with their parent chains — a more accurate representation of the actual exposure surface.

CVE Lite does not suppress advisories. Every advisory that contributed to a finding is recorded in the `IDs` column of the full table (`--verbose --all`). The deduplication is in the presentation layer, not in the detection layer.

`pnpm audit`'s fix guidance:

```
Run "pnpm audit --fix" to fix 0 of 85 vulnerabilities.
85 vulnerabilities require manual review. See the full report for details.
```

CVE Lite generates:

```bash
# High severity direct fixes
pnpm add @angular/platform-server@21.2.9 defu@6.1.5 happy-dom@20.8.9 vite@8.0.5 @vitest/ui@4.1.2 nitropack@2.13.3 nx@22.6.5

# Medium severity direct fix
pnpm add h3@1.15.9

# Medium severity parent upgrades
pnpm add @docusaurus/core@3.9.2-alpha.0 start-server-and-test@3.0.2
```

Each command is a validated non-vulnerable stable target. `pnpm audit --fix` marks all 85 findings as requiring manual review and offers no commands. CVE Lite identifies 10 packages with confident fix targets, groups them by severity, and separates direct upgrades from parent-chain moves.

---

## Before vs After

Remediation results from applying the three command groups documented in this study, measured one group at a time:

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 37 | 1 | 19 | 16 | 1 | 5 | 32 | 3 |
| After high severity direct fixes | 33 | 1 | 15 | 16 | 1 | 1 | 32 | 3 |
| After medium severity direct fix | 32 | 1 | 15 | 15 | 1 | 0 | 32 | 2 |
| After medium severity parent upgrades | 31 | 1 | 15 | 14 | 1 | 0 | 31 | 2 |

The finding count dropped from 37 to 31. High-severity findings dropped from 19 to 15. The direct package surface cleared entirely from 5 to 0 across two passes — no remaining packages the project controls directly have an unaddressed upgrade target. The command surface dropped from 3 groups to 2, and those 2 are parent-chain moves rather than direct installs. The scanner moved the project cleanly out of the confident first-pass tier and into the structural transitive tier after three targeted command groups.

---

## Fix Journey

In a modern Angular monorepo, the instinct is to chase the critical finding first. Here, the critical issue — `handlebars@4.7.8` via `@compodoc/compodoc` — has no direct fix command. CVE Lite makes that explicit: the top priority section flags it as a transitive issue requiring a parent-chain upgrade, and the fix plan separates it from the 5 directly actionable packages.

**Pass 1 — high severity direct fixes** (7 packages): `@angular/platform-server`, `defu`, `happy-dom`, `vite`, `@vitest/ui`, `nitropack`, and `nx`. Applying this group dropped findings from 37 to 33 and reduced high-severity findings from 19 to 15.

**Pass 2 — medium severity direct fix**: `h3@1.15.9` is a clean direct upgrade. Applying it cleared the last direct finding, dropping the total from 33 to 32 and the direct surface from 1 to 0.

**Pass 3 — medium severity parent upgrades**: `@docusaurus/core@3.9.2-alpha.0` and `start-server-and-test@3.0.2` resolve `estree-util-value-to-estree` and `axios` transitive chains. This dropped the total from 32 to 31.

After three passes, the remaining 31 findings are entirely transitive with no stable fix targets remaining. The scanner moved the project cleanly out of the confident first-pass tier. The remaining work requires tooling upgrades or dependency replacement decisions, not confident `pnpm add` commands.

---

## Why this matters

Analog is not a neglected project. It has active maintainers, a growing community, and regular releases. A lockfile scan still surfaces 37 vulnerable packages — 32 of them transitive.

That pattern is consistent across every modern JavaScript framework scan: the risk is not in the application code or the framework's runtime dependencies. It is in the toolchain that developers install, trust, and rarely audit — documentation generators, test runners, monorepo orchestrators, and build utilities.

Two chains in this scan are worth naming specifically:

`@compodoc/compodoc` → `handlebars@4.7.8` (critical). Most Angular developers use `@compodoc` to generate API documentation. It is a devDependency, rarely updated independently, and not a package most teams include in their security review surface. CVE Lite names it as the parent for the only critical finding in the scan.

`@angular/cli` → `@modelcontextprotocol/sdk` → `hono` (high). Angular CLI recently incorporated MCP SDK support. That SDK pulls in `hono`, which carries a high-severity advisory. A developer auditing their Angular application would not think to trace security risk through the CLI tool itself. The parent chain makes this visible.

For a team doing a pre-release check, the operationally useful question is not "how many advisories exist?" It is "what do I do right now, and what is structural?" CVE Lite answers that in under 30 seconds: three command groups for the confident first pass, and a clear separation of the transitive remainder.

---

## Scan command

Run from the Analog repository root:

```bash
npx cve-lite-cli . --verbose --all
```

---

## Remaining risk after the first pass

After applying the three command groups, the structural remainder includes packages with no confident first-pass fix path:

- `handlebars@4.7.8` via `@compodoc/compodoc` — critical, requires a parent-chain upgrade of the documentation generator itself
- `path-to-regexp@0.1.12`, `1.8.0`, `8.3.0` — high, transitive through routing packages
- `picomatch@2.3.1`, `4.0.3` — high, transitive
- `serialize-javascript@6.0.2` — high, transitive
- `node-forge@1.3.3` — high, transitive
- `minimatch@3.0.8` — high, transitive
- `lodash@4.17.21`, `lodash@4.17.23`, `lodash-es@4.17.23` — high, transitive through documentation and diagram tooling
- lower-severity transitive packages: `@hono/node-server`, `ajv`, multiple `brace-expansion` versions, `dompurify`, `file-type`, `follow-redirects`, `mdast-util-to-hast`, `smol-toml`, `yaml@1.10.2`, `yaml@2.8.2`

These require tooling upgrades, dependency replacements, or extended parent-chain investigation — not confident `pnpm add` commands.

---

## Baseline findings

Full vulnerable package list at scan time:

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| handlebars | 4.7.8 | critical | transitive | 4.7.9 | GHSA-q42p-pg8m-cqh6, GHSA-442j-39wm-28r2 |
| @angular/platform-server | 21.2.7 | high | direct | 21.2.9 | GHSA-5pq3-h73f-66hr |
| defu | 6.1.4 | high | direct | 6.1.5 | GHSA-737v-mqg7-c878 |
| flatted | 3.4.1 | high | transitive | 3.4.2 | GHSA-rf6f-7fwh-wjgh |
| happy-dom | 20.8.4 | high | direct | 20.8.8 | GHSA-6q6h-j7hj-3r64, GHSA-w4gp-fjgq-3q4g |
| hono | 4.11.5 | high | transitive | 4.11.7 | GHSA-26pp-8wgv-hjvm, GHSA-458j-xx4x-437… |
| lodash-es | 4.17.23 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| lodash | 4.17.21 | high | transitive | 4.17.23 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| lodash | 4.17.23 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| minimatch | 3.0.8 | high | transitive | 3.1.3 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m2… |
| node-forge | 1.3.3 | high | transitive | 1.4.0 | GHSA-2328-f5f3-gj25, GHSA-5m6q-g25r-mvw… |
| path-to-regexp | 0.1.12 | high | transitive | 0.1.13 | GHSA-37ch-88jc-xwx2 |
| path-to-regexp | 1.8.0 | high | transitive | 0.1.10 | GHSA-9wv6-86v2-598j |
| path-to-regexp | 8.3.0 | high | transitive | 8.4.0 | GHSA-27v5-c462-wpq7, GHSA-j3q9-mxjg-w52f |
| picomatch | 2.3.1 | high | transitive | 2.3.2 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| picomatch | 4.0.3 | high | transitive | 2.3.2 | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.3 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| svgo | 3.3.2 | high | transitive | 2.8.1 | GHSA-xpqw-6gx7-v673 |
| vite | 8.0.0 | high | direct | 6.4.2 | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f58… |
| @hono/node-server | 1.19.11 | medium | transitive | 1.19.13 | GHSA-92pp-h63x-v22m |
| ajv | 8.17.1 | medium | transitive | 6.14.0 | GHSA-2g4f-4pwh-qvx6 |
| axios | 1.13.6 | medium | transitive | 0.31.0 | GHSA-3p68-rc4w-qgx5, GHSA-fvcv-3m26-pcqx |
| brace-expansion | 1.1.12 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 2.0.2 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| brace-expansion | 5.0.4 | medium | transitive | 1.1.13 | GHSA-f886-m6hf-6m8v |
| dompurify | 3.3.3 | medium | transitive | 3.4.0 | GHSA-39q2-94rc-95cp |
| estree-util-value-to-estree | 3.1.1 | medium | transitive | 3.3.3 | GHSA-f7f6-9jq7-3rqj |
| file-type | 20.5.0 | medium | transitive | 21.3.1 | GHSA-5v7r-6r5c-r473, GHSA-j47w-4g3g-c36v |
| follow-redirects | 1.15.11 | medium | transitive | 1.16.0 | GHSA-r4q5-vmmm-2653 |
| h3 | 1.15.6 | medium | direct | 1.15.9 | GHSA-4hxc-9384-m385, GHSA-72gr-qfp7-vwhw |
| mdast-util-to-hast | 13.1.0 | medium | transitive | 13.2.1 | GHSA-4fh9-h7wg-q85m |
| serialize-javascript | 7.0.4 | medium | transitive | 7.0.5 | GHSA-qj8w-gfj5-8c6v |
| smol-toml | 1.6.0 | medium | transitive | 1.6.1 | GHSA-v3rj-xjv7-4jmq |
| yaml | 1.10.2 | medium | transitive | 1.10.3 | GHSA-48c2-rrv3-qjmp |
| yaml | 2.8.2 | medium | transitive | 1.10.3 | GHSA-48c2-rrv3-qjmp |
| @angular/cli | 21.2.6 | low | direct | — | — |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/sonukapoor/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
