# Use Case: The merged `cve-lite` (v1.18.2) earns its keep on the HexOps fleet

**Date:** 2026-06-18
**Build under test:** the `merge` branch — `override-audit-cli` absorbed into `cve-lite-cli` v1.18.2, one binary doing both CVE scanning and override hygiene (OA001–OA008), with real-binary e2e coverage (Plan 8, 699 tests passing).
**Environment:** the HexOps fleet — 33 registered Next.js/React projects across npm and pnpm.

---

## TL;DR

In a single afternoon of routine fleet patching, this version:

1. Targets, by design, the exact failure that had just cost us two real things — a security override that was *written but not effective*.
2. Surfaced override cruft across the fleet that our existing tooling is blind to — including two ~40-entry stale blocks and a dead downgrade pin.
3. Confirmed a fix actually materialized (not just that the override string was present).
4. Got caught lying once — and that, too, was worth knowing.

A scanner that finds real problems, confirms real fixes, and is honest enough to be caught when it's wrong. That is earning its keep.

---

## The backdrop: a footgun that bit us first

While patching HexOps' own dependencies, we bumped a `vite` override from `^8.0.13` to a security floor `>=8.0.16` to clear two advisories (a `server.fs.deny` bypass and a launch-editor NTLM leak). `pnpm install` reported success. The override was present in `package.json`. It was present in `pnpm-lock.yaml`. Everything *looked* patched.

It wasn't. Under this repo's `node-linker=hoisted`, pnpm kept resolving the vulnerable `vite@8.0.13` — a version that **does not even satisfy `>=8.0.16`** — and did so even after a full lockfile regeneration. We only caught it because we verify *resolved* versions in `node_modules`, not audit summaries. A caret floor `^8.0.16` finally moved it. We filed the footgun as HexOps #126.

The lesson HexOps #126 records: **a written override is not an applied override.** The gap between "the pin is in the manifest" and "the safe version is on disk" is exactly where a vulnerability hides in plain sight.

That gap is a named rule in this build: **OA008 — materialized vulnerable copy.** OA008 declares a finding when an override states a floor but a copy below that floor is still present in `node_modules`. It is, almost word for word, the #126 failure mode — and it fires from a plain `cve-lite overrides` run, with no human remembering to read a nested `package.json` by hand.

**Why it matters:** the class of bug that took manual vigilance to catch is, in this version, a default-on detector.

---

## The fleet sweep: what one command surfaced

We ran `cve-lite overrides <path> --json` across all 33 projects. Two rules fired.

### OA001 — orphaned targets (the gold)

85 findings: override entries pinning packages that are no longer anywhere in the resolved tree — dead pins doing nothing but rotting.

| Project | Orphaned targets | Diagnosis |
|---|---|---|
| **Hexaxia Media** | ~38 — `chokidar`, `jsonwebtoken`, `node-fetch`, `path-to-regexp`, `ansi-html`, + 30 `postcss-*` plugins | a 40-entry stale block, CRA/webpack-era boilerplate that outlived its dependencies |
| **Cordero Group** | ~38 — near-identical block | same inherited cruft |
| **hexaxia.ai (v2)** | `ajv@6.14.0`, `undici`, `yaml`, `flatted`, `picomatch`, `brace-expansion` | a stale security-pin block — including a **downgrade** pin (`ajv` forced *back* to 6.x) for a package not even in the tree |
| **Pax Nocturna** | `uuid` | one dead pin |
| **Ptolemy** | `ffmpeg` | one dead pin |

None of this is visible to HexOps' existing scanners, which look at vulnerabilities and declared-vs-imported deps — not at whether an override *targets anything real*. A 40-entry override block that silently does nothing is precisely the kind of supply-chain debt that accumulates unnoticed and confuses the next person who tries to reason about the dependency graph. This version reads it off in one pass.

### A fix, confirmed

On HexOps and Hexaxia Media, OA008 did **not** fire on `postcss` — and the tool's `node_modules` walk showed `postcss@8.5.15` installed everywhere, exactly the safe version our flat override was supposed to produce. The same machinery that would have flagged #126 confirmed that our intentional postcss-under-Next override genuinely materialized. **Effectiveness, verified — not assumed.**

---

## The honest part: it cried wolf once

OA006 ("override fights an exact-pinned parent") fired on `postcss` in all 32 projects with a `package.json`, at medium severity, claiming the override "cannot replace the parent's pin — npm/pnpm will keep the parent's exact version on disk," and proposing we relocate the pin to override `next` itself.

That is wrong for our setup, and we could prove it: `postcss@8.5.15` is what's actually installed. Flat overrides *do* collapse a transitively exact-pinned package; that is the entire point of overrides. The suggested fix — force-pinning `next` — would have been actively harmful. OA006, as shipped, doesn't consult the materialized tree before firing, the way OA008 does.

This is a finding *against the tool*. But it surfaced only because the merged build is trustworthy enough to run unsupervised across 32 real projects — and because its output is specific enough (exact package, exact jsonPath, exact claim) to be falsified against `node_modules` in seconds. A vaguer tool would have hidden the bug; this one handed us the repro. The fix is obvious and small: OA006 should check the installed version before flagging, exactly as OA008 already does.

**Dogfooding a tool on a real fleet is how you learn whether its rules are calibrated. This version made that cheap.**

---

## Why this version earned its keep

- **It owns a vulnerability-masking class nothing else catches.** OA008 is the codified form of HexOps #126: a floor written but a vulnerable copy still on disk. Audit tools trust the lockfile; HexOps' scanners look at CVEs and imports. Only this rule asks "did the override actually land?" — the one question that mattered.
- **It found real debt fleet-wide.** OA001 surfaced ~80 dead override entries — two large stale blocks and a downgrade pin — that no existing HexOps signal reports.
- **It confirms fixes, not just flags failures.** The `node_modules` walk verified `postcss@8.5.15` everywhere our override was meant to take. Same engine, both directions.
- **Integration cost is near zero.** HexOps already depends on `cve-lite-cli` and runs it as a `ScanSource`. The merge means the *same binary* HexOps already ships now also audits overrides — the embed is a dep bump plus an `overrides` call, emitting `config`-typed findings. It is the natural sibling to HexOps' phantom-dependency scanner: that one catches *undeclared imports*; this one catches *declarations that don't work*. Two halves of dependency hygiene, one binary.
- **It is calibratable in the open.** Running it for real immediately exposed OA006's over-eager heuristic — caught, reproduced, and scoped to a one-line fix in an afternoon, because the merge's real-binary e2e philosophy produced output precise enough to falsify.

## Honest caveats

- **OA006 needs calibration** before HexOps embeds this as a dashboard `ScanSource` — otherwise it shows a false medium on every Next.js project. (Filed as a refinement: consult the materialized version before flagging, like OA008.)
- **The `merge` branch is local-only**, not yet pushed/published against `OWASP/cve-lite-cli`. Landing it is a prerequisite to a clean HexOps dependency bump.

## Bottom line

The merged build was handed a fleet it had never seen and, from a single command, named the exact failure class that had just bitten us, found real cruft no other tool reports, confirmed a fix had genuinely materialized, and exposed one of its own miscalibrations precisely enough to fix it. The unglamorous verdict — and the one that matters — is that **it told the truth about override hygiene, including the truth about itself.** That is what earned its keep.
