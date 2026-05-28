# Ghost Case Study

> Tested with CVE Lite CLI v1.16.0

<p align="center">
  <img src="https://raw.githubusercontent.com/TryGhost/Ghost/main/ghost/admin/public/assets/img/logos/ghost-logo-black-1.png" alt="Ghost logo" width="260"/>
</p>

## Summary

- **Project:** [Ghost](https://github.com/TryGhost/Ghost) — open source publishing platform powering millions of blogs, newsletters, and membership sites worldwide
- **Revision:** `359e702345304c6328041eb8654e9ea838f7df5f`
- **Lockfile:** `pnpm-lock.yaml` (4,447 resolved packages)
- **Baseline findings:** 26 unique vulnerable packages (2 critical · 16 high · 7 medium · 1 low)
- **Direct vs transitive:** 0 direct / 26 transitive
- **Validated copy-and-run fix commands:** 0 — all 26 findings are transitive; remediation runs through Ghost's own internal packages and upstream toolchain
- **Packages with no known fix:** 3 (`sanitize-html`, `html-minifier`, `elliptic`)
- **Automated dependency management:** Ghost uses [Renovate](https://github.com/renovatebot/renovate) — yet 26 vulnerable packages remain at this revision

---

## What this case study demonstrates

Ghost is a professionally maintained publishing platform with a dedicated security team and active release cadence. Yet a single lockfile scan reveals 26 vulnerable packages — **every one of them transitive**, hidden beneath layers of admin UI frameworks, build toolchain, and legacy infrastructure.

The two most critical findings tell the story of why transitive risk is the hardest class of vulnerability to manage:

**`sanitize-html@2.17.0` — critical XSS.** Ghost uses `sanitize-html` to clean HTML submitted by editors and members before rendering it to readers. A critical XSS vulnerability in the library meant to make user content *safe* is precisely the kind of structural risk that a flat advisory list obscures. CVE Lite flags it immediately as critical with no known fix — telling you before you spend time looking that there is currently no version to upgrade to.

**`babel-traverse@6.26.0` — critical arbitrary code execution.** Six dependency layers deep in Ghost Admin's build toolchain: `@tryghost/ember-promise-modals` → `ember-auto-import` → `babel-core` → `babel-traverse`. An ancient Babel 6.x package from 2017, carrying a critical code execution CVE, present in every installation. A developer reading Ghost's `package.json` would never find it. A lockfile scanner does.

CVE Lite's direct/transitive split makes the remediation landscape immediately legible: 0 direct findings means there is nothing to fix with a simple `pnpm add`. Every issue runs through a parent chain. Knowing this early prevents wasted effort on `pnpm audit fix` and points the remediation work toward Ghost's internal package releases and upstream toolchain updates.

**What Renovate couldn't fix.** Ghost uses [Renovate](https://github.com/renovatebot/renovate) — a widely adopted automated dependency update bot that monitors the repository and opens PRs when newer package versions are available. It is one of the most sophisticated automation tools in the JS ecosystem. Yet at this revision, 26 vulnerable packages remain. Renovate cannot resolve what it cannot install:

- **No version to suggest**: `sanitize-html`, `html-minifier`, `elliptic`, and `express-brute` have no published non-vulnerable version. Renovate can only open PRs for versions that exist.
- **Breaking changes that stall**: `knex` needs to move from `0.x` to `2.4.0` — a major version bump with API-breaking changes. Renovate can open the PR, but it cannot auto-merge a breaking change. Those PRs frequently sit open for months while the vulnerability remains active.
- **Transitive chains outside Renovate's reach**: `babel-traverse@6.26.0` is buried six layers deep inside `ember-auto-import`'s Babel 6 dependency chain — a package Ghost does not directly control. Renovate's scope ends at Ghost's direct dependencies. Lockfile scanning sees the full resolved tree regardless of depth.

A project can be doing everything right with automated update tooling and still carry material vulnerability risk. CVE Lite CLI surfaces that residual surface — and tells you which category each finding falls into.

---

## Comparison Note: CVE Lite CLI vs pnpm audit

Ghost uses pnpm. Both tools were run against the same `pnpm-lock.yaml` on the same machine.

| Metric | pnpm audit | CVE Lite CLI v1.16.0 |
|---|---:|---:|
| Total reported findings | 44 | 26 |
| Critical | 2 | 2 |
| High | 23 | 16 |
| Moderate / Medium | 18 | 7 |
| Low | 1 | 1 |
| Direct vs transitive breakdown | ✗ | ✓ (0 / 26) |
| Packages with no known fix flagged | ✗ | ✓ (3 packages) |
| Priority ordering (criticals first) | ✗ | ✓ |
| Parent chain identified | partial (paths shown) | ✓ |
| Validated fix targets | ✗ | ✓ |
| Specific copy-and-run commands | ✗ | ✓ (0 in this case — all transitive) |

**Why CVE Lite reports fewer findings — and why that is not a coverage gap:**

`pnpm audit` counts vulnerability paths, not packages. A single vulnerable package reached via three different dependency paths contributes three entries. CVE Lite counts each unique vulnerable package once regardless of how many paths reach it. That is why the totals differ: 44 vs 26.

This deduplication is intentional. A developer looking at 44 pnpm audit findings cannot tell how many distinct packages need attention. CVE Lite's 26 is the true exposure surface: 26 packages, each needing exactly one decision.

`pnpm audit`'s output for `sanitize-html`:

```
critical  Apostrophe has default XSS via `xmp` raw-text passthrough in `sanitize-html`
Package   sanitize-html
Patched versions  <0.0.0
```

CVE Lite's output:

```
CRITICAL sanitize-html@2.17.0
            Transitive dependency
            Fix: ⚠ no fix — no non-vulnerable version currently available
```

Both flag the finding. CVE Lite's `⚠ no fix` indicator surfaces immediately in the summary view and is not buried in per-package detail blocks. A developer scanning the output can triage "fixable now" from "wait for upstream" at a glance.

---

## Before vs After

No remediation pass was performed for this study. CVE Lite correctly identified that all 26 findings are transitive with no confident first-pass fix commands — meaning the usual direct-fix workflow does not apply here.

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 26 | 2 | 16 | 7 | 1 | 0 | 26 | 0 |

This result is itself meaningful. When a scanner generates zero copy-and-run commands, it is telling you something important: the remediation work is not in your direct dependency surface. It runs through upstream package releases and parent-chain decisions that require different effort — tracking Ghost's own internal packages, watching for Babel 7 migration in the admin toolchain, and monitoring upstream projects for the three packages that have no fix available at all.

A tool that ignores this distinction and suggests `pnpm audit fix` regardless would send a developer down a path that either fails silently or introduces breaking changes without reducing the underlying vulnerability count.

---

## Fix Journey

Ghost's vulnerability surface is entirely in the transitive layer. The scanner's job here is not to generate install commands — it is to surface the nature of the risk clearly enough that the developer knows *not* to reach for `pnpm audit fix`.

The two critical findings follow different remediation paths:

**`babel-traverse@6.26.0`:** The dependency chain runs through `@tryghost/ember-promise-modals` → `ember-auto-import` → `babel-core`. The fix requires `ember-auto-import` to migrate from Babel 6 to Babel 7 — a change that is controlled by the `ember-auto-import` maintainers, not by Ghost directly. CVE Lite surfaces this as: "Upgrade `babel-plugin-transform-class-properties` — check for a release resolving `babel-traverse` to 7.23.2+". This tells you where to look, not just what the problem is.

**`sanitize-html@2.17.0`:** No fix available. The advisory (`GHSA-rpr9-rxv7-x643`) reflects an XSS vulnerability via `<xmp>` raw-text passthrough that had no published non-vulnerable version at scan time. CVE Lite flags this explicitly with `⚠ no fix` rather than leaving the developer to discover during manual triage that there is nothing to install.

For `knex@0.20.15` and `knex@0.21.21` (SQL injection, high severity), the fix version is `2.4.0` — a major version bump with breaking changes. In a production CMS, this upgrade requires careful coordination with everything in Ghost core that depends on knex.

The correct response to this scan is not an install command. It is a ticket to track: three packages with no fix available to watch for upstream releases, one Babel toolchain migration to follow in `ember-auto-import`, and a knex major-version upgrade to plan for the Ghost core team.

---

## Why this matters

Ghost is not a neglected project. It has a dedicated security team, a published [Security Policy](https://github.com/TryGhost/Ghost/blob/main/SECURITY.md), and a track record of responsible disclosure. Yet a single lockfile scan of its pnpm workspace surfaces 26 vulnerable packages, including a critical XSS vulnerability in the library responsible for making user content safe.

This is not a failure of Ghost's security practices. It is an illustration of the nature of transitive risk in large JavaScript applications. The packages involved are not things Ghost's team chose to add — they are downstream of admin UI frameworks, build systems, and legacy tooling that shipped with different security assumptions.

The finding that matters most here is not any individual CVE. It is the shape of the result: **zero direct vulnerabilities, 26 transitive ones**. That means the risk is invisible to anyone who only reads the project's `package.json`. It is invisible to tools that scan manifest files rather than lockfiles. It is only visible when you scan the full resolved dependency tree — which is exactly what CVE Lite does.

For Ghost's 4,447 resolved packages, the lockfile is the ground truth. And the ground truth has 26 vulnerable packages that a developer reading the source code would never find.

---

## Scan command

Run from the root of a Ghost checkout or from the `examples/ghost` directory in this repository:

```bash
cve-lite . --verbose --all
```

The example lockfile in this repository reflects Ghost at revision `359e702345304c6328041eb8654e9ea838f7df5f`. Ghost releases frequently — running against a more recent checkout may show a different finding count.

---

## Remaining risk

All 26 baseline findings remain open at the time of this study. No remediation was applied.

- **2 critical:** `babel-traverse@6.26.0` (code execution), `sanitize-html@2.17.0` (XSS, no fix)
- **16 high:** including `knex` (SQL injection, 2 versions), `jsonwebtoken` (auth), `@tryghost/members-csv` (CSV injection), `validator` (2 versions), `protobufjs` (2 advisories), `rollup` (XSS, 2 versions), `serialize-javascript` (2 versions), `lodash.template`, `lodash.pick`, `html-minifier` (no fix), `fast-uri`
- **7 medium:** `markdown-it`, `file-type`, `postcss` (2 versions), `request`, `express-brute` (no fix), `@protobufjs/utf8`
- **1 low:** `elliptic` (no fix)

---

## Baseline findings

Full vulnerable package list at scan time (revision `359e702`):

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| babel-traverse | 6.26.0 | critical | transitive | 7.23.2 | GHSA-67hx-6x53-jw92 |
| sanitize-html | 2.17.0 | critical | transitive | ⚠ no fix | GHSA-rpr9-rxv7-x643 |
| @babel/plugin-transform-modules-systemjs | 7.29.0 | high | transitive | 7.29.4 | GHSA-fv7c-fp4j-7gwp |
| @tryghost/members-csv | 2.0.7 | high | transitive | 5.82.0 | GHSA-xgwh-cgv9-783v |
| fast-uri | 3.1.0 | high | transitive | 3.1.1 | GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc |
| html-minifier | 4.0.0 | high | transitive | ⚠ no fix | GHSA-pfq8-rq6v-vf5m |
| jsonwebtoken | 8.5.1 | high | transitive | 9.0.0 | GHSA-8cf7-32gw-wr33, GHSA-hjrf-2m68-5957 |
| knex | 0.20.15 | high | transitive | 2.4.0 | GHSA-4jv9-3563-23j3 |
| knex | 0.21.21 | high | transitive | 2.4.0 | GHSA-4jv9-3563-23j3 |
| lodash.pick | 4.4.0 | high | transitive | 4.17.19 | GHSA-p6mc-m468-83gw |
| lodash.template | 4.5.0 | high | transitive | 4.17.21 | GHSA-35jh-r3h4-6jhm, GHSA-r5fr-rjxr-66jc |
| protobufjs | 7.5.5 | high | transitive | 1.1.1 | GHSA-2pr8-phx7-x9h3, GHSA-66ff-xgx4-vch8 |
| rollup | 0.57.1 | high | transitive | 2.79.2 | GHSA-gcx4-mw62-g8wm, GHSA-mw96-cpmx-2vgc |
| rollup | 1.32.1 | high | transitive | 2.79.2 | GHSA-gcx4-mw62-g8wm, GHSA-mw96-cpmx-2vgc |
| serialize-javascript | 4.0.0 | high | transitive | 7.0.3 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.3 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| validator | 13.12.0 | high | transitive | 13.15.20 | GHSA-9965-vmph-33xx, GHSA-vghf-hv5q-vc2g |
| validator | 7.2.0 | high | transitive | 13.7.0 | GHSA-9965-vmph-33xx, GHSA-qgmg-gppg-76gx |
| @protobufjs/utf8 | 1.1.0 | medium | transitive | 1.1.1 | GHSA-q6x5-8v7m-xcrf |
| express-brute | 1.0.1 | medium | transitive | ⚠ no fix | GHSA-984p-xq9m-4rjw |
| file-type | 16.5.4 | medium | transitive | 21.3.1 | GHSA-5v7r-6r5c-r473 |
| markdown-it | 8.4.2 | medium | transitive | 12.3.2 | GHSA-6vfc-qv3f-vr6c |
| postcss | 7.0.39 | medium | transitive | 8.4.31 | GHSA-7fh5-64p2-3v2j, GHSA-qx2v-qp2m-jg93 |
| postcss | 8.5.6 | medium | transitive | 8.5.10 | GHSA-qx2v-qp2m-jg93 |
| request | 2.88.2 | medium | transitive | 3.0.0 | GHSA-p8p7-x288-28g6 |
| elliptic | 6.6.1 | low | transitive | ⚠ no fix | GHSA-848j-6mx2-7j84 |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/OWASP/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
