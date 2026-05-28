# OWASP Juice Shop Case Study

> Tested with CVE Lite CLI v1.6.0

<p align="center">
  <img src="https://raw.githubusercontent.com/juice-shop/juice-shop/master/frontend/src/assets/public/images/JuiceShop_Logo_400px.png" alt="OWASP Juice Shop logo" width="260"/>
</p>

## Summary

- **Project:** OWASP Juice Shop — intentionally vulnerable Node.js e-commerce application
- **Lockfile:** `package-lock.json` (1601 resolved packages)
- **Revision:** `7ae7184dbf84baae9ee1d85be39f793b777ae996`
- **Baseline findings:** 19 unique vulnerable packages (3 critical · 10 high · 4 medium · 2 low)
- **Direct vs transitive:** 4 direct / 15 transitive
- **Time to first actionable fix command:** under 30 seconds
- **Validated fix commands generated:** 2 (specific versioned targets, not generic `npm audit fix`)
- **After two remediation passes:** reduced from 39 → 18 findings across an earlier study revision

---

## What this case study demonstrates

CVE Lite CLI separates what you control from what you do not. The direct/transitive split (4 direct, 15 transitive in this scan) immediately tells a developer where to start and which problems require parent-chain decisions rather than a simple `npm install`.

Unlike tools that output a flat advisory list, CVE Lite validates each fix target against published version ranges before recommending it. The commands it generates are confirmed non-vulnerable, not just "the next version." For `jsonwebtoken`, it flags the `8.5.1 → 9.0.0` upgrade as a breaking change so the developer knows before running the command.

On transitive findings, it names the parent chain — for example, `crypto-js` is reached through the `crypto-js` direct dependency, and `braces@2.3.2` is flagged with a parent path — so there is no guesswork about where to start.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against the same `package-lock.json` on the same machine.

| Metric | npm audit | CVE Lite CLI v1.6.0 |
|---|---:|---:|
| Total reported findings | 55 | 19 |
| Critical | 7 | 3 |
| High | 31 | 10 |
| Moderate / Medium | 11 | 4 |
| Low | 6 | 2 |
| Direct vs transitive breakdown | ✗ | ✓ (4 / 15) |
| Validated fix targets | ✗ | ✓ |
| Breaking change awareness | ✗ | ✓ |
| Parent chain identified for transitive issues | ✗ | ✓ |
| Specific copy-and-run commands | ✗ | ✓ |

**Why CVE Lite reports fewer findings — and why that is not a coverage gap:**

`npm audit` counts advisories, not packages. A single vulnerable package with three advisories across two dependency paths appears as six entries. CVE Lite counts each unique vulnerable package once, regardless of how many advisories affect it or how many times it appears in the dependency graph. That is why the totals differ: 55 vs 19.

This deduplication is intentional. A developer who sees 55 findings cannot tell at a glance that many of them refer to the same handful of packages. CVE Lite's 19 is a more accurate representation of the actual exposure surface — 19 distinct packages that need attention, not 55 individually actionable tasks.

CVE Lite does not suppress advisories. Every advisory that contributed to a finding is recorded in the `IDs` column of the full table (`--verbose --all`). The deduplication is in the presentation layer, not in the detection layer.

`npm audit`'s fix suggestions are:

```
To address issues that do not require attention, run:
  npm audit fix

To address all issues possible (including breaking changes), run:
  npm audit fix --force
```

CVE Lite generates:

```bash
npm install jsonwebtoken@9.0.0
npm install sanitize-html@2.17.3
```

Each command is a validated non-vulnerable target. `npm audit fix --force` is a blunt instrument that can silently introduce breaking changes across multiple packages. CVE Lite flags the one breaking upgrade explicitly and keeps the others clean.

`npm audit` does not distinguish direct from transitive findings. On a project with 15 transitive issues, that means a developer sees 55 entries without knowing which ones they can act on immediately and which require parent-chain decisions.

---

## Before vs After

Remediation results from the measured workflow documented in this study (earlier revision, v1.5.2):

| Stage | Findings | Critical | High | Medium | Low | Direct | Transitive | Command groups |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 39 | 3 | 1 | 11 | 23 | 10 | 29 | 6 |
| After first direct pass | 27 | 1 | 0 | 10 | 16 | 4 | 23 | 3 |
| After second pass | 18 | 1 | 0 | 5 | 12 | 3 | 15 | 1 |

The finding count dropped from 39 to 18. Critical findings dropped from 3 to 1. The single high-severity finding was cleared. The command surface dropped from 6 groups to 1 — meaning the scanner moved the project through the first two actionable passes and made the remaining blockers explicit rather than mixing them with fixable noise.

---

## Fix Journey

Upgrading once is rarely enough in a mature JavaScript application.

At baseline, the scanner identified 10 directly fixable packages. Applying those upgrades moved the project from 39 findings to 27 — a real improvement, but not done. The reason: upgrading a direct dependency changes what the root project controls, but it does not always clear the transitive copies that other packages are pulling in.

`jsonwebtoken` is a clear example. After upgrading the root project to `9.0.0`, the scanner still showed `jsonwebtoken@8.5.1` present through the `express-jwt` dependency chain. From `npm audit`'s perspective, both versions appear as high-severity findings in the same flat list. CVE Lite separated them: one was a direct upgrade path, one was a parent-chain problem.

The second pass targeted parent packages — `mocha`, `socket.io-client`, `sqlite3` — which cleared the transitive copies their upgrade chains were pulling in. That dropped the count from 27 to 18 and narrowed the remaining set to structural blockers: packages with no published safe version (`marsdb`, `notevil`) and deep transitive paths not worth chasing in a single pass.

The practical lesson: a developer following the scanner's ordered output would have two productive passes in one sitting rather than one undifferentiated dump to reason about from scratch.

---

## Why this matters

Dependency remediation slows down close to release — not because the fixes are technically hard, but because the signal-to-noise ratio in advisory output is poor.

A raw dump of 55 findings (as `npm audit` produces here) does not tell a developer which 4 are in packages they control directly and can fix in a single command, vs which 15 require parent-chain investigation, vs which ones have no published fix at all. That distinction matters enormously at sprint end, when a team is deciding whether to ship or hold.

CVE Lite's output answers the operational question: what do I do right now, and what do I defer? Two validated fix commands, a breaking change flag on the one that matters, and a structured plan for the transitive work. That is the gap between knowing a problem exists and knowing what to do about it.

---

## Project context

Baseline scan command from the Juice Shop root:

```bash
npx cve-lite-cli . --verbose --all
```

One practical detail mattered during this run: Juice Shop has `package-lock=false` in `.npmrc`. That means a normal `npm install` can update `package.json` and local installs without updating the lockfile snapshot the scanner reads. To keep the case study honest, the lockfile was refreshed after each install batch with:

```bash
npm install --package-lock-only --package-lock true --ignore-scripts
```

That is not a CVE Lite CLI quirk. It is a real-world workflow detail that developers can easily miss when validating remediation against lockfile state.

## Remaining risk after two passes

The second pass left `18` findings in the lockfile:

- `1` critical
- `5` medium
- `12` low

Direct unresolved cases:

- `marsdb@0.6.11` — critical, no published version above the current release
- `notevil@1.3.3` — low severity, no straightforward upgrade path
- `jsonwebtoken@8.5.1` — still present through the `express-jwt` chain even after the root project moved to `9.0.0`

Transitive or structural follow-ups:

- `messageformat@2.3.0` via `i18n`
- multiple `minimatch` findings via `grunt`, `replace`, and another root path
- `tar@4.4.19` via `node-pre-gyp`
- lower-severity transitive packages such as `serialize-javascript`, `vm2`, `lodash`, `lodash.set`, `micromatch`, `got`, `braces`, and `crypto-js`

This is the part of remediation where a maintainer stops asking "what can I bump today?" and starts asking "which dependencies are worth replacing, and which upgrades deserve broader regression testing?"

---

## Baseline findings

Full vulnerable package list at scan time:

| Package | Version | Severity | Relationship | Fix hint | Advisory IDs |
|---|---|---|---|---|---|
| crypto-js | 3.3.0 | critical | transitive | 4.2.0 | GHSA-xwcq-pm8m-c4vf |
| marsdb | 0.6.11 | critical | direct | — | GHSA-5mrr-rgp6-x4gr |
| vm2 | 3.9.17 | critical | transitive | 3.9.18 | GHSA-99p7-6v5w-7xg8, GHSA-cchq-frgv-rjh… |
| braces | 2.3.2 | high | transitive | 3.0.3 | GHSA-grv7-fg5c-xmjg |
| jsonwebtoken | 8.5.1 | high | direct | 9.0.0 | GHSA-8cf7-32gw-wr33, GHSA-hjrf-2m68-595… |
| lodash | 4.17.23 | high | transitive | 4.18.0 | GHSA-f23m-r3pf-42rh, GHSA-r5fr-rjxr-66jc |
| minimatch | 3.0.8 | high | transitive | 3.1.3 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m2… |
| http-cache-semantics | 3.8.1 | high | transitive | 4.1.1 | GHSA-rc47-6667-2j5j |
| lodash.set | 4.3.2 | high | transitive | 4.17.19 | GHSA-p6mc-m468-83gw |
| minimatch | 9.0.3 | high | transitive | 3.1.3 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m2… |
| tar | 4.4.19 | high | transitive | 6.2.1 | GHSA-34x7-hfp2-rc4v, GHSA-83g3-92jg-28c… |
| minimatch | 3.0.5 | high | transitive | 3.1.3 | GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m2… |
| serialize-javascript | 6.0.2 | high | transitive | 7.0.3 | GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v |
| got | 8.3.2 | medium | transitive | 11.8.5 | GHSA-pfrx-2q88-qq97 |
| micromatch | 3.1.10 | medium | transitive | 4.0.8 | GHSA-952p-6rrq-rcjv |
| notevil | 1.3.3 | medium | direct | — | GHSA-8g4m-cjm2-96wq |
| sanitize-html | 2.17.2 | medium | direct | 2.17.3 | GHSA-9mrh-v2v3-xpfm |
| @tootallnate/once | 2.0.0 | low | transitive | 3.0.1 | GHSA-vpq2-c234-7xj6 |
| messageformat | 2.3.0 | low | transitive | 3.0.0-beta.0 | GHSA-xfqm-j7pc-xrfc |

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the [CVE Lite CLI repository](https://github.com/sonukapoor/cve-lite-cli/issues).

Please include:

- the repository link
- why the project would make a useful case study
- whether the dependency graph is publicly reproducible

Not every project will be selected. Preference will go to projects that are publicly useful, technically interesting, and strong examples of realistic dependency remediation workflows.
