# lint-staged Case Study

> Tested with CVE Lite CLI v1.9.0

## Summary

* **Project:** [lint-staged](https://github.com/lint-staged/lint-staged) — a widely used JavaScript developer workflow tool for running scripts against staged Git files
* **Revision:** `d3251b192d7116f059e7cabeffa3bfd7788dedeb`
* **Lockfile:** `package-lock.json` (417 resolved packages)
* **Baseline findings:** 3 unique vulnerable packages (2 high · 1 medium)
* **Direct vs transitive:** 1 direct / 2 transitive
* **Actionable direct fix:** `picomatch@2.3.1` → `picomatch@2.3.2`
* **Validated fix command generated:** 1
* **Maintainer response:** acknowledged the report and confirmed the dependency would be updated

---

## What this case study demonstrates

lint-staged is a high-usage developer tool with an active maintainer base and a relatively small dependency surface compared to large monorepos.

That makes this case study useful for a different reason: not the number of findings, but **what was missed by standard workflows**.

CVE Lite identified a direct high-severity `picomatch` issue with a validated upgrade target, while clearly separating the remaining transitive issues that do not have an immediate project-level fix.

---

## Comparison Note: CVE Lite CLI vs npm audit

Both tools were run against the same `package-lock.json`.

| Metric                                       | npm audit | CVE Lite CLI v1.6.0 |
| -------------------------------------------- | --------: | ------------------: |
| Total reported findings                      |         4 |                   3 |
| Critical                                     |         0 |                   0 |
| High                                         |         2 |                   2 |
| Moderate / Medium                            |         2 |                   1 |
| Direct vs transitive breakdown               |         ✗ |           ✓ (1 / 2) |
| Validated fix targets                        |         ✗ |                   ✓ |
| Parent chain identified for dependency paths |         ✗ |                   ✓ |
| Clear actionable vs structural separation    |         ✗ |                   ✓ |

The difference here is not coverage. It is visibility and structure.

CVE Lite identifies:

* what is directly actionable
* what is transitive and requires deeper investigation
* what should not be turned into speculative upgrade commands

---

## Fix Journey

The baseline scan found 3 vulnerable packages:

* `picomatch@2.3.1` — high severity, direct, fixable
* `vite@8.0.2` — high severity, transitive / structural
* `brace-expansion@5.0.4` — medium severity, transitive / structural

CVE Lite generated a single direct fix command:

npm install picomatch@2.3.2

This represents the full set of confident first-pass remediation actions.

The remaining issues were correctly identified as structural, with no safe direct upgrade command generated.

---

## What stood out

The most important outcome of this case study came from the maintainer response.

> Turns out npm audit --omit=dev was hiding the picomatch issue, even though it's definitely a production dependency.

This highlights a concrete gap in a common workflow:

* a high-severity vulnerability in a production dependency was present
* the standard audit command used by the maintainer did not surface it
* CVE Lite CLI identified it as a direct dependency with a clear fix

In this case, CVE Lite did not just report vulnerabilities — it surfaced an **actionable fix that was missed in the existing audit workflow**.

---

## Why this matters

This case demonstrates a practical limitation in how dependency audits are commonly run.

Using `npm audit --omit=dev`, a high-severity vulnerability in a production dependency (`picomatch`) was not reported.

CVE Lite CLI, scanning the resolved lockfile directly, was able to:

* identify the vulnerable dependency correctly
* classify it as a direct dependency
* provide a validated upgrade target (`2.3.2`)

The result is not just more visibility, but **a concrete remediation step that would otherwise have been missed**.

For a pre-release check, that difference is critical:

* missing a vulnerability means no action is taken
* surfacing a validated fix enables immediate remediation

This case shows that the value is not only in detection, but in **ensuring actionable issues are not overlooked due to workflow assumptions**.

---

## Maintainer response

The findings were shared in:

https://github.com/lint-staged/lint-staged/issues/1763

The maintainer:

* acknowledged the issue
* confirmed the dependency would be updated
* identified that their existing audit workflow did not surface the vulnerability

---

## Why this matters

This case is not about a large number of vulnerabilities.

It is about **visibility gaps in standard tooling**.

A high-severity vulnerability in a production dependency was not surfaced due to how `npm audit` was executed.

CVE Lite’s value in this case is:

* scanning the resolved lockfile directly
* identifying the issue as a direct dependency
* providing a validated fix target
* separating it from unrelated transitive noise

For a pre-release check, that distinction is what enables action.

---

## Scan command

Run from the lint-staged repository root:

npx cve-lite-cli . --verbose --all

---

## Remaining risk after the first pass

After applying the direct `picomatch` fix, the remaining issues are structural:

* `vite@8.0.2` — high severity, transitive
* `brace-expansion@5.0.4` — medium severity, transitive

These require dependency-chain investigation or upstream updates.

---

## Baseline findings

| Package         | Version | Severity | Relationship | Fix hint | Advisory IDs                                                  |
| --------------- | ------- | -------- | ------------ | -------- | ------------------------------------------------------------- |
| picomatch       | 2.3.1   | high     | direct       | 2.3.2    | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj                      |
| vite            | 8.0.2   | high     | transitive   | 8.0.5    | GHSA-4w7w-66w2-5vf9, GHSA-p9ff-h696-f583, GHSA-v2wj-q39q-566r |
| brace-expansion | 5.0.4   | medium   | transitive   | 5.0.5    | GHSA-f886-m6hf-6m8v                                           |

---

## Want your project reviewed?

If you maintain an interesting JavaScript or TypeScript project and want CVE Lite CLI considered for a public case study, open an issue in the https://github.com/OWASP/cve-lite-cli/issues.
