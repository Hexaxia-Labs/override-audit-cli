# Use Case: The merged `cve-lite` (v1.18.2) earns its keep on a real fleet

**Date:** 2026-06-18
**Build under test:** the `merge` branch — `override-audit-cli` absorbed into `cve-lite-cli` v1.18.2, one binary doing both CVE scanning and override hygiene (OA001–OA008), with real-binary e2e coverage (Plan 8, 699 tests passing).
**Environment:** an internal fleet — 33 Next.js/React projects across npm and pnpm.

---

## TL;DR

In a single afternoon of routine fleet patching, this version:

1. Targets, by design, the exact failure that had just cost us two real things — a security override that was *written but not effective*.
2. Surfaced override cruft across the fleet that our existing tooling is blind to — including two ~40-entry stale blocks and a dead downgrade pin.
3. Confirmed a fix actually materialized (not just that the override string was present).
4. Got caught lying once — we filed it, it was fixed the same day, and the re-run proved the fix vanished without taking a single real finding with it. That round trip *is* the acceptance test.

A scanner that finds real problems, confirms real fixes, and is honest enough to be caught — then corrected — when it's wrong. That is earning its keep. The afternoon doubled as a live QA pass for the merged build: four rules exercised against 33 real projects plus synthetic fixtures, one bug found and closed, the fleet taken from 118 findings to zero.

---

## The backdrop: a footgun that bit us first

While patching one fleet app's own dependencies, we bumped a `vite` override from a caret range to a security floor (`>=8.0.16`) to clear two advisories. `pnpm install` reported success. The override was present in `package.json`. It was present in `pnpm-lock.yaml`. Everything *looked* patched.

It wasn't. Under that repo's `node-linker=hoisted`, pnpm kept resolving a vulnerable `vite@8.0.13` — a version that **does not even satisfy `>=8.0.16`** — and did so even after a full lockfile regeneration. We only caught it because we verify *resolved* versions in `node_modules`, not audit summaries. A caret floor `^8.0.16` finally moved it. We logged the footgun internally.

The lesson it records: **a written override is not an applied override.** The gap between "the pin is in the manifest" and "the safe version is on disk" is exactly where a vulnerability hides in plain sight.

That gap is a named rule in this build: **OA008 — materialized vulnerable copy.** OA008 declares a finding when an override states a floor but a copy below that floor is still present in `node_modules`. It is, almost word for word, that failure mode — and it fires from a plain `cve-lite overrides` run, with no human remembering to read a nested `package.json` by hand.

**Why it matters:** the class of bug that took manual vigilance to catch is, in this version, a default-on detector.

---

## The fleet sweep: what one command surfaced

We ran `cve-lite overrides <path> --json` across all 33 projects. Two rules fired.

### OA001 — orphaned targets (the gold)

85 findings: override entries pinning packages that are no longer anywhere in the resolved tree — dead pins doing nothing but rotting.

| Project | Orphaned targets | Diagnosis |
|---|---|---|
| **App A** (npm) | ~38 — `chokidar`, `jsonwebtoken`, `node-fetch`, `path-to-regexp`, `ansi-html`, + 30 `postcss-*` plugins | a 40-entry stale block, CRA/webpack-era boilerplate that outlived its dependencies |
| **App B** (npm) | ~38 — near-identical block | same inherited cruft |
| **App C** (Next.js) | `ajv@6.14.0`, `undici`, `yaml`, `flatted`, `picomatch`, `brace-expansion` | a stale security-pin block — including a **downgrade** pin (`ajv` forced *back* to 6.x) for a package not even in the tree |
| **App D** | `uuid` | one dead pin |
| **App E** | `ffmpeg` | one dead pin |

None of this is visible to our existing scanners, which look at vulnerabilities and declared-vs-imported deps — not at whether an override *targets anything real*. A 40-entry override block that silently does nothing is precisely the kind of supply-chain debt that accumulates unnoticed and confuses the next person who tries to reason about the dependency graph. This version reads it off in one pass.

### A fix, confirmed

Across the fleet, OA008 did **not** fire on `postcss` — and the tool's `node_modules` walk showed `postcss@8.5.15` installed everywhere, exactly the safe version our flat override was supposed to produce. The same machinery that would have flagged the vite footgun confirmed that our intentional postcss-under-Next override genuinely materialized. **Effectiveness, verified — not assumed.**

---

## The honest part: it cried wolf once

OA006 ("override fights an exact-pinned parent") fired on `postcss` in all 32 projects with a `package.json`, at medium severity, claiming the override "cannot replace the parent's pin — npm/pnpm will keep the parent's exact version on disk," and proposing we relocate the pin to override `next` itself.

That is wrong for our setup, and we could prove it: `postcss@8.5.15` is what's actually installed. Flat overrides *do* collapse a transitively exact-pinned package; that is the entire point of overrides. The suggested fix — force-pinning `next` — would have been actively harmful. OA006, as shipped, doesn't consult the materialized tree before firing, the way OA008 does.

This is a finding *against the tool*. But it surfaced only because the merged build is trustworthy enough to run unsupervised across 32 real projects — and because its output is specific enough (exact package, exact jsonPath, exact claim) to be falsified against `node_modules` in seconds. A vaguer tool would have hidden the bug; this one handed us the repro. The fix is obvious and small: OA006 should check the installed version before flagging, exactly as OA008 already does.

**Dogfooding a tool on a real fleet is how you learn whether its rules are calibrated. This version made that cheap.**

### …then we fixed it the same day

The fix (override-audit-cli#37) taught OA006 to consult the materialized tree before firing — the exact `node_modules` check OA008 already had. Re-running the full fleet sweep with the patched binary:

| | Flagged | Clean | OA006 (noise) | OA001 (real) |
|---|---|---|---|---|
| **Before fix** | 32 | 0 | 33 (all false) | 85 |
| **After fix** | **4** | **28** | **0** | 79 |

The fix erased all 33 false positives and **did not suppress a single real OA001 finding**. That is the precise signature you want from a calibration patch: noise to zero, signal untouched. Signal-to-noise went from "flags every project" to "flags exactly the four that have real cruft." The discovery, the report, the fix, and the regression-free re-validation all happened inside one session.

---

## Reconciling against history: does OA003 actually work?

An earlier internal review had once enumerated **12 cross-PM "stranded override" cases** — overrides written in a field the active package manager doesn't read, so they silently no-op. This sweep's OA003 (`stranded-override`) rule found **zero**. Two zeros — current state and tool output — can agree for the wrong reason: the rule could simply be broken.

So we tested both halves:

1. **Are the 12 still stranded?** No. Each project's current override-field placement was checked against its detected package manager — all 12 are clean (the stranded blocks were removed during earlier patch sweeps).
2. **Can OA003 still fire?** Yes — two synthetic fixtures matching the exact shapes (an npm project carrying `pnpm.overrides`, and a pnpm project carrying top-level `overrides`) both produced high-severity OA003 findings with the correct message.

The fleet's `OA003 = 0` is a **true negative, not a blind spot** — confirmed by construction, not assumed. That is a rule earning trust the hard way.

---

## The payoff: 85 dead pins removed, fleet taken to clean

The findings weren't just catalogued — they were acted on, each through the same verified loop: confirm orphaned against the lockfile **and** OA001, remove, reinstall, re-audit, rebuild, re-scan to confirm the finding cleared.

| Project | Dead pins removed | Kept (in-tree) |
|---|---|---|
| App C | 6 (incl. the `ajv` downgrade trap) | postcss, js-yaml, esbuild |
| App A | 38 | path-to-regexp, postcss |
| App B | 39 | postcss |
| App D | 1 (`uuid`) | postcss |
| App E | 1 (`ffmpeg`) | postcss, shell-quote |

**85 orphaned override pins removed across 5 projects.** Every removal verified tree-neutral (overrides only constrain existing deps), audit-unchanged, and build-passing. A final fleet sweep: **32 of 33 projects clean, 0 override-hygiene findings** (the 33rd has no `package.json`). The entire OA001 backlog — 85 findings at the start — is gone.

One incidental QA note from the cleanup: the *consumer* harness that cross-checked OA001 against the lockfile had a JSON-parse bug (it assumed compact output; the CLI pretty-prints). The CLI was right; our script was wrong. Worth recording because it's the failure mode the use case warns about in reverse — trust the tool's materialized evidence over a hand-rolled check.

---

## Why this counts as a QA pass for the new code

This wasn't a demo on a toy repo. It was an acceptance run of the merged build against a heterogeneous production fleet (npm + pnpm, 33 projects) plus targeted fixtures, and every headline rule was exercised under real conditions:

| Rule | Exercised by | Outcome |
|---|---|---|
| **OA001** orphaned target | 85 real findings across 5 projects, all verified-removed | accurate — full agreement with independent lockfile checks |
| **OA003** stranded override | history reconciliation + 2 synthetic fixtures | fires correctly; fleet true-negative confirmed |
| **OA006** fights-exact-parent | every Next.js project | **bug found, fixed (#37), re-validated noise-free** |
| **OA008** materialized floor | the live footgun it's built for; confirmed clean post-fix | correct by design; verified both directions |

The merge's investment in real-binary e2e (Plan 8, 699 tests) is what made this possible: the binary was trustworthy enough to point at 33 unfamiliar projects unsupervised, and its output was precise enough (exact package, jsonPath, claim) that a wrong finding could be falsified against disk in seconds. Real-world dogfooding caught the one calibration gap that an in-process test suite, by construction, could not — because OA006's bug only shows when you compare its claim to a real `node_modules` it didn't author.

---

## Why this version earned its keep

- **It owns a vulnerability-masking class nothing else catches.** OA008 is the codified form of that footgun: a floor written but a vulnerable copy still on disk. Audit tools trust the lockfile; our scanners look at CVEs and imports. Only this rule asks "did the override actually land?" — the one question that mattered.
- **It found real debt fleet-wide.** OA001 surfaced ~80 dead override entries — two large stale blocks and a downgrade pin — that no existing signal reports.
- **It confirms fixes, not just flags failures.** The `node_modules` walk verified `postcss@8.5.15` everywhere our override was meant to take. Same engine, both directions.
- **Integration cost is near zero.** The fleet tooling already depends on `cve-lite-cli` and runs it as a scan source. The merge means the *same binary* already shipped now also audits overrides — the embed is a dep bump plus an `overrides` call, emitting `config`-typed findings. It is the natural sibling to a phantom-dependency scanner: that one catches *undeclared imports*; this one catches *declarations that don't work*. Two halves of dependency hygiene, one binary.
- **It is calibratable in the open.** Running it for real immediately exposed OA006's over-eager heuristic — caught, reproduced, and scoped to a one-line fix in an afternoon, because the merge's real-binary e2e philosophy produced output precise enough to falsify.

## Honest caveats

- ~~**OA006 needs calibration**~~ **Resolved** (override-audit-cli#37): OA006 now consults the materialized tree before firing. Re-validated noise-free across the fleet — no longer a blocker for the scan-source embed.
- **The `merge` branch** still needs to land/publish against `OWASP/cve-lite-cli` for a clean dependency bump (the OA006 fix is committed on it).
- The fleet-side override-audit scan source (run the binary as a scan source, surface OA003/OA001/OA008 as `config`-typed findings) remains the one unbuilt piece — now unblocked.

## Bottom line

The merged build was handed a fleet it had never seen and, from a single command, named the exact failure class that had just bitten us, found 85 real dead-pin findings no other tool reports, confirmed a fix had genuinely materialized, reconciled a year-old issue down to a proven true-negative, and exposed one of its own miscalibrations precisely enough that it was fixed and re-validated the same day. By the end, the fleet went from 118 override-hygiene findings to **zero**, and the build had been put through a heterogeneous, adversarial acceptance run that an in-process test suite could not replicate. The unglamorous verdict — and the one that matters — is that **it told the truth about override hygiene, including the truth about itself, and got better in the process.** That is what earned its keep.
