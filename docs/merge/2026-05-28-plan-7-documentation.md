# Plan 7: Documentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the full documentation lift the merge requires. Three tracks: (a) rewrite OA-side docs into cve-lite's voice/structure, (b) update existing cve-lite docs that the merge affects, (c) create the new docs the merger introduces. After this plan, the cve-lite Docusaurus site, README, CHANGELOG, and root metadata all reflect the merged product, with Aaron's IP visible and attributed.

**Architecture:** Plan 6 already covers the basic mechanical moves (rule docs land in `website/docs/overrides/`, audit-log doc rebadged, OA architecture/usage notes merged at file level). Plan 7 sits on top: rewrites for voice consistency, updates to every cve-lite doc the merge touches, brand-new conceptual docs the merge introduces (the `scan -> fix -> verify` story, the AUTHORS file). The plan is organized as three phases (A: rewrite migrated OA docs; B: update existing cve-lite docs; C: new docs) so the work parallelizes naturally.

**Important note about `--fix` semantics in cve-lite today:** Reading `website/docs/fix-mode.md` (line 8+) confirms cve-lite's `--fix` already calls package-manager commands (`npm install`, `pnpm add`, `yarn add`) and rescans after. This affects how Plan 4's verify hook integrates: verify fires AFTER the package manager has run, against the new on-disk state. The doc updates below reflect this correctly. Cross-reference back to Plan 4 if implementation details need adjusting.

**Tech Stack:** Docusaurus 2 (per `website/sidebars.ts`), Markdown + MDX, standard `sidebar_label` frontmatter convention.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md`. Plan 6 covers prerequisite migrations (Tasks 2, 3, 4, 5 there).

**Prerequisite:** Plans 1-5 complete; Plan 6 Tasks 1-5 complete (basic doc migration done) OR Plan 7 is executed alongside Plan 6 and replaces those mechanical tasks with the richer rewrites below.

---

## Scope Inventory

### Category A: OA docs to migrate (Plan 6 moves files; Plan 7 rewrites them)

| OA source | cve-lite destination | Disposition |
|---|---|---|
| `_preserved-override-audit/docs/rules/OA001.md` ... `OA008.md` | `website/docs/overrides/oa001.md` ... `oa008.md` | Rewrite each: cve-lite voice, Docusaurus frontmatter, drop Hexaxia branding, point to new CLI surface (`cve-lite overrides --fix --rule OAxxx`) |
| `_preserved-override-audit/docs/rules/README.md` | `website/docs/overrides/index.md` | Rewrite as Docusaurus landing page for the Override Hygiene category |
| `_preserved-override-audit/docs/change-control-logging.md` | `website/docs/audit-log.md` | Rewrite as project-wide audit-log reference (not just OA fix lifecycle) |
| `_preserved-override-audit/docs/architecture.md` | content folded into `website/docs/how-it-works.md` + new `website/docs/overrides/architecture.md` | Two destinations: project-level architecture summary in `how-it-works.md`, full design rationale in the new overrides architecture page |
| `_preserved-override-audit/docs/usage.md` | content folded into `website/docs/getting-started.md`, `website/docs/cli-reference.md`, `website/docs/overrides/index.md` | Examples redistributed to the appropriate spots; no standalone usage doc in cve-lite |
| `_preserved-override-audit/docs/lessons/` | stays in `docs/lessons/` of this repo | Per user-memory preference: lessons are durable and tracked in `docs/lessons/`, separate from `docs/superpowers/`. Does not migrate to cve-lite. |
| `_preserved-override-audit/docs/assets/HL_logo.png` | DROP | Hexaxia Labs branding does not transfer to OWASP. Attribution goes to AUTHORS file. |
| `_preserved-override-audit/docs/superpowers/` | DROP | OA's local spec/plan working drafts; already gitignored. |

### Category B: existing cve-lite docs to update

| File | Update | Why |
|---|---|---|
| `README.md` (root) | Add "Override hygiene" to features; mention `cve-lite overrides` subcommand and `--audit-log` | Primary user-facing pitch must surface the new capability |
| `CHANGELOG.md` | Draft cve-lite vNext entry (the major bump that lands the merge) | Released notes (Plan 6 Task 9 drafts the release notes file; this commits them to CHANGELOG when the version is cut) |
| `website/docs/index.md` | Update landing pitch to include override hygiene | Docs site landing page |
| `website/docs/getting-started.md` | Add `cve-lite overrides` quick example next to the scan example | First contact for new users |
| `website/docs/cli-reference.md` | Add `overrides` subcommand row to the synopsis, document its flags; add new global flags `--audit-log`, `--check-overrides` to the scan-options table | **Critical canonical CLI doc** |
| `website/docs/fix-mode.md` | Add "Override hygiene fixes" section; document the verify pass and exit code `2`; explain that verify runs after the package manager has run | Existing `--fix` doc must explain the new sub-behavior |
| `website/docs/reading-output.md` | Add "Override hygiene" section; document `overrideFindings` JSON key | Terminal and JSON output shape |
| `website/docs/sarif.md` | Document the OA tool component, the `OA001`-`OA008` rule namespace, severity mapping | SARIF consumers need to know |
| `website/docs/cyclonedx.md` | Add a short note: "Override findings are not represented in CycloneDX; CycloneDX is the vulnerability-bill-of-materials standard, scoped to CVEs" | Pre-empt the "where are my OA findings?" question |
| `website/docs/html-report.md` | Document the Overrides section, screenshots if practical | HTML report users |
| `website/docs/remediation-strategy.md` | Add override-style remediation as a complementary track to CVE remediation; explain when each applies | Remediation philosophy doc; merger changes the picture |
| `website/docs/parser-coverage.md` | Add a row for overrides extraction (npm `overrides`, `pnpm.overrides`, `resolutions`) and which package-managers support what | Parser support matrix |
| `website/docs/roadmap.md` | Mark "override hygiene" delivered; identify next-up override work (e.g., more sub-rules, CycloneDX extension proposal) | Roadmap maintenance |
| `website/docs/comparison.md` | Add override hygiene as a cve-lite differentiator vs other scanners | Comparison page must mention the new capability |
| `website/docs/workflow-integration.md` | Mention `--fix` exit code `2` as a CI signal; add override-audit example workflow | CI integration |
| `website/docs/security-assurance-case.md` | **Strongly update.** The audit log + override verification + scan-fix-verify loop directly supports OWASP Lab-tier assurance claims. Add a "Change-control evidence" section. | OWASP positioning: explicitly Lab promotion material |
| `website/docs/troubleshooting.md` | Add OA-specific troubleshooting (e.g., "OA007 disabled by default; pass `--check-network`"; "verify failed on a clean tree: try `--fix` again after `npm install`") | Common pitfalls |
| `website/sidebars.ts` | Add an "Override Hygiene" category between "Fix Issues" and "Integrate"; include the new overrides landing page, OA001-OA008 rule pages, audit-log reference | Sidebar navigation |
| `action.yml` (root) | Update `description` field to mention override hygiene; add any new GitHub Action inputs (e.g., `audit-log`, `check-overrides`) | GitHub Action surface |
| `package.json` (root) | Update `description` field to mention override hygiene | npm registry surface |

### Category C: brand-new docs

| File | Purpose |
|---|---|
| `website/docs/scan-fix-verify.md` | New conceptual doc explaining the closed loop: scan -> fix -> verify. The merge's headline narrative; cross-linked from `fix-mode.md` and the overrides index |
| `website/docs/audit-log.md` | Project-wide audit log reference (rewritten from OA's change-control-logging.md; lands here as a new cve-lite doc) |
| `website/docs/overrides/index.md` | Override Hygiene landing page; lists OA001-OA008 with one-liner summaries |
| `website/docs/overrides/oa001.md` through `oa008.md` | Per-rule reference pages (8 files; rewrites from OA preserved) |
| `website/docs/overrides/architecture.md` | Override-hygiene architecture rationale (rewritten from OA `architecture.md`) |
| `AUTHORS` (root) | Formal contributor list. Includes Sonu Kapoor (cve-lite-cli creator) and Aaron Lamb (override-audit IP) | New file required by Phase 3 attribution requirements |
| `docs/lessons/2026-XX-XX-merge-retrospective.md` | Lessons from the merge process itself; durable retrospective (per user-memory preference: lessons live in tracked `docs/lessons/`) | Written after Phase 1 completes |

### Category D: cve-lite docs NOT affected (leave alone)

| File | Reason untouched |
|---|---|
| `website/docs/caching.md` | OSV cache; CVE-only concern |
| `website/docs/offline-advisory-db.md` | OSV-specific |
| `website/docs/offline-vs-online-results.md` | OSV-specific (could cross-link to OA007 network opt-in but not required) |
| `website/docs/corporate-proxy.md` | Proxy behavior unchanged |
| `website/docs/press.md` | Historical |
| `website/docs/ai-assistant-integration.md` | AI integration unchanged (could be updated later with override-aware prompts) |
| `website/docs/case-studies/*` (8 files) | Existing case studies remain accurate; new override-focused case studies are Phase 3+ work |
| `src/docs/CONTRIBUTING.md` | Contributor workflow unchanged |
| `src/docs/SECURITY.md` | Security disclosure unchanged |
| `CODE_OF_CONDUCT.md` | Unchanged |

---

## File Structure (summary)

Touched in Plan 7:
- 8 OA rule pages rewritten (`website/docs/overrides/oaNNN.md`)
- 1 overrides landing page rewritten (`website/docs/overrides/index.md`)
- 1 overrides architecture page (`website/docs/overrides/architecture.md`)
- 1 audit-log doc rewritten (`website/docs/audit-log.md`)
- 1 new conceptual doc (`website/docs/scan-fix-verify.md`)
- 17 existing cve-lite docs updated (README, CHANGELOG, 15 website/docs/*)
- 1 sidebar config updated (`website/sidebars.ts`)
- 2 metadata files updated (action.yml, package.json)
- 1 new AUTHORS file
- 1 new lessons retrospective (written near end)

Total: ~30 files touched.

---

## Phase A: Migrate + rewrite OA docs to cve-lite voice

### Task 1: Rewrite the 8 OA rule pages

**Files:**
- `website/docs/overrides/oa001.md` (rewritten from `_preserved-override-audit/docs/rules/OA001.md`)
- ... through `oa008.md`

For each of OA001-OA008:

- [ ] **Step 1: Add Docusaurus frontmatter**

```markdown
---
sidebar_label: OAxxx <one-line title>
title: OAxxx <full title>
---
```

(`xxx` = `001` through `008`.)

- [ ] **Step 2: Drop Hexaxia branding**

Replace any reference to `Hexaxia-Labs/override-audit-cli` with `OWASP/cve-lite-cli`. Replace `override-audit` (the binary name) with `cve-lite overrides` (the subcommand).

- [ ] **Step 3: Update example invocations**

Replace `override-audit --fix --rule OAxxx` with `cve-lite overrides --fix --rule OAxxx`. Replace any other CLI snippets accordingly.

- [ ] **Step 4: Match cve-lite's voice**

cve-lite docs are direct, second-person, example-heavy. Compare against `website/docs/fix-mode.md` and `website/docs/remediation-strategy.md` for tone. Tighten any OA-specific verbosity.

- [ ] **Step 5: Add severity callout per spec**

At the top of each rule page, after the title, add:

```markdown
:::info
**Severity:** <high|medium|low|critical> &nbsp; **Auto-fix:** <yes / no / partial>
:::
```

Severity values per spec section "OA severity mapping":
- OA001 high, fix yes
- OA002 medium, fix no (advisory)
- OA003 high, fix yes (move)
- OA004 low, fix yes (remove)
- OA005 medium, fix conditional per sub-rule
- OA006 medium (high when escalated), fix conditional
- OA007 low, fix no (advisory)
- OA008 critical, fix no (signals that another fix did not take)

- [ ] **Step 6: Commit per rule**

```bash
git add website/docs/overrides/oaNNN.md
git commit -m "docs(overrides): rewrite OAxxx rule reference for cve-lite docs"
```

Eight commits total (one per rule).

### Task 2: Rewrite overrides landing page

**Files:**
- `website/docs/overrides/index.md` (rewritten from `_preserved-override-audit/docs/rules/README.md`)

- [ ] **Step 1: Frontmatter and intro**

```markdown
---
sidebar_label: Overrides
title: Override Hygiene
---

# Override Hygiene

`cve-lite overrides` audits the `overrides`, `pnpm.overrides`, and `resolutions` blocks in your `package.json` for eight failure modes that turn an override into a silent no-op or a security regression.

If you maintain a `package.json` `overrides` block to keep a transitive dependency at a non-vulnerable version, this is for you.
```

- [ ] **Step 2: Add a rules table linking to per-rule pages**

```markdown
| Rule | Failure mode | Severity |
|---|---|---|
| [OA001](./oa001) | Override target not in resolved tree | high |
| [OA002](./oa002) | Pin uses a moving tag (`latest`, `next`) | medium |
| [OA003](./oa003) | Override in unrecognised package-manager section | high |
| [OA004](./oa004) | Installed version surpasses the pin | low |
| [OA005](./oa005) | Nested override has no effective scope | medium |
| [OA006](./oa006) | Override fights an exact-pinned parent | medium |
| [OA007](./oa007) | "latest" tag has moved (registry drift) | low |
| [OA008](./oa008) | Vulnerable copy still on disk | critical |
```

- [ ] **Step 3: Quickstart section**

```markdown
## Quickstart

```bash
# Audit overrides
cve-lite overrides .

# Apply auto-fixes
cve-lite overrides . --fix

# Filter to one rule
cve-lite overrides . --rule OA001

# Opt in to registry drift checks (OA007)
cve-lite overrides . --check-network
```
```

(Double-check escape of inner code blocks; Docusaurus typically uses single backtick fences.)

- [ ] **Step 4: Architecture and audit-log cross-links**

Add at the bottom:
```markdown
## See also

- [Architecture](./architecture) - design rationale behind the eight detectors
- [Audit log](../audit-log) - opt-in NDJSON change-control stream
- [Scan -> fix -> verify](../scan-fix-verify) - how overrides plug into cve-lite's remediation loop
```

- [ ] **Step 5: Commit**

```bash
git add website/docs/overrides/index.md
git commit -m "docs(overrides): rewrite landing page for cve-lite docs"
```

### Task 3: Rewrite audit-log reference

**Files:**
- `website/docs/audit-log.md` (rewritten from `_preserved-override-audit/docs/change-control-logging.md`)

- [ ] **Step 1: Frontmatter**

```markdown
---
sidebar_label: Audit Log
title: Audit Log
---
```

- [ ] **Step 2: Reframe scope**

The OA original framed this as "fix lifecycle logging." Rewrite the intro as project-wide change-control:

```markdown
# Audit Log

cve-lite supports an opt-in NDJSON audit log that records every action the tool takes during a scan, fix, or verify run. When enabled, the log is written to a file you specify, one JSON event per line, append-only.

Use it for:
- supply-chain change-control evidence (OWASP Lab-grade)
- orchestrator integration (e.g., HexOps)
- forensics: "what did cve-lite see and do on 2026-05-28?"

Off by default. Zero cost when disabled.
```

- [ ] **Step 3: Enable**

```markdown
## Enable

```bash
cve-lite . --audit-log /var/log/cve-lite/audit.ndjson
cve-lite overrides . --audit-log audit.ndjson
```

Or via environment variable:
```bash
export CVE_LITE_AUDIT_LOG=/var/log/cve-lite/audit.ndjson
cve-lite .
```
```

- [ ] **Step 4: Event vocabulary table**

Match the table to `src/audit-log/events.ts` exactly. Nine events:
- `scan.started`, `scan.finished`
- `cve.detected`, `cve.fix.applied`
- `oa.detected`, `oa.fix.applied`
- `verify.passed`, `verify.failed`
- `error`

For each: one row with type, emitted-by, payload fields.

- [ ] **Step 5: Schema versioning note**

```markdown
## Schema versioning

Every event carries `schemaVersion: 1`. New event types may be added in future releases additively (existing event shapes do not change without a major version bump). Consumers should filter unknown event types defensively.
```

- [ ] **Step 6: OWASP Lab framing callout**

```markdown
:::tip OWASP Lab assurance
The audit log records change-control evidence covering scan, fix, and verify across the whole tool - not just override flows. This supports OWASP Lab-tier assurance claims when integrated into a supply-chain compliance pipeline.
:::
```

- [ ] **Step 7: Commit**

```bash
git add website/docs/audit-log.md
git commit -m "docs(audit-log): rewrite as project-wide change-control reference"
```

### Task 4: Overrides architecture page

**Files:**
- `website/docs/overrides/architecture.md` (rewritten from `_preserved-override-audit/docs/architecture.md`)

- [ ] **Step 1: Read the OA original**

```bash
cat _preserved-override-audit/docs/architecture.md
```

- [ ] **Step 2: Rewrite with frontmatter and cve-lite voice**

```markdown
---
sidebar_label: Architecture
title: Override Hygiene Architecture
---

# Override Hygiene Architecture

Eight detectors cover the failure modes a `package.json` override can hit. Each detector is a pure function over a shared `OverrideContext` and returns a list of `OverrideFinding`.
```

Continue by lifting the OA design rationale: why eight rules, the static + post-install split, the composite logic (OA005 wins over OA001, OA006 escalates when OA008 confirms), the verify-after-fix loop.

- [ ] **Step 3: Cross-link to the integration seams**

End with:
```markdown
## See also

- [Scan -> fix -> verify](../scan-fix-verify) - how the API plugs into cve-lite's remediation
- [Audit log](../audit-log) - event vocabulary covering OA detection and fixes
```

- [ ] **Step 4: Commit**

```bash
git add website/docs/overrides/architecture.md
git commit -m "docs(overrides): architecture rationale rewritten for cve-lite docs"
```

---

## Phase B: Update existing cve-lite docs

### Task 5: README.md

**Files:**
- `README.md` (root)

- [ ] **Step 1: Update the feature pitch**

The current README features card (around the three-column table near the top) should add a fourth highlight or replace one slot:

```markdown
<td align="center" width="25%"><p>🛡️</p><strong>Override hygiene</strong><br/><sub>Catches dead overrides, drifted pins, and<br/>vulnerable copies that bypass your override floor</sub></td>
```

(Adjust to 4-column layout, or pick best fit.)

- [ ] **Step 2: Add overrides to the synopsis**

Where the README shows quick CLI examples, add:
```bash
# Audit package.json overrides
cve-lite overrides .
```

- [ ] **Step 3: Update the "What it does" section**

Add a paragraph summarising the scan -> fix -> verify loop and pointing at `website/docs/scan-fix-verify.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add override hygiene to features and quick-start"
```

### Task 6: CHANGELOG.md

**Files:**
- `CHANGELOG.md` (root)

- [ ] **Step 1: Add the cve-lite vNext entry**

Use the draft from `docs/merge/handoff-release-notes.md` (Plan 6 Task 9) as source. Add at the top of CHANGELOG.md following cve-lite's existing format:

```markdown
## [vX.0.0] - 2026-XX-XX

### Added
- `cve-lite overrides [path]` subcommand running the eight OA detectors over `overrides`, `pnpm.overrides`, and `resolutions`.
- `--fix` now applies override-style RFC 6902 patches in-process and runs a verify pass (OA001 + OA008) against the just-touched targets.
- New exit code `2`: "fix applied but verify failed" - distinct from `1` (findings present).
- `--audit-log <path>` (and `CVE_LITE_AUDIT_LOG` env var): opt-in project-wide NDJSON change-control stream. See [Audit Log](https://owasp.org/cve-lite-cli/docs/audit-log).
- SARIF output gains an Override Hygiene tool component (rule IDs OA001-OA008).
- HTML report gains an Override Hygiene section.

### Changed
- `--json` output now includes an `overrideFindings` field alongside the existing CVE findings (additive).

### Acknowledgements
- Override hygiene IP merged from `@hexaxia-labs/override-audit-cli` (Aaron Lamb).
```

(Pick the right version number when actually cutting the release; Plan 6 Task 9's release-note draft is the source.)

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): vNext entry for cve-lite override merge"
```

### Task 7: website/docs/index.md

**Files:**
- `website/docs/index.md`

- [ ] **Step 1: Update landing pitch**

Read the current landing copy. Update the lead so it mentions both CVE scanning AND override hygiene:

```markdown
cve-lite scans your lockfile for known CVEs and audits your `package.json` overrides for hygiene problems. Every fix is verified before the tool exits.
```

- [ ] **Step 2: Add a "What's new" callout**

```markdown
:::info Override hygiene is now built in
`cve-lite overrides` runs eight checks on your `overrides` block. See [Override Hygiene](./overrides) to get started.
:::
```

- [ ] **Step 3: Commit**

```bash
git add website/docs/index.md
git commit -m "docs(landing): add override hygiene to lead pitch"
```

### Task 8: website/docs/getting-started.md

**Files:**
- `website/docs/getting-started.md`

- [ ] **Step 1: Add overrides example after the scan example**

Find the section that introduces `cve-lite [path]`. After it, add:

```markdown
## Audit `overrides`

If your `package.json` has an `overrides` block (or `pnpm.overrides`, or `resolutions`), audit it:

```bash
cve-lite overrides .
```

This runs eight checks (OA001-OA008) covering dead overrides, drifted pins, misplaced sections, and vulnerable copies that bypass your override floor. See [Override Hygiene](./overrides) for the full reference.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/getting-started.md
git commit -m "docs(getting-started): add cve-lite overrides quickstart"
```

### Task 9: website/docs/cli-reference.md

**Files:**
- `website/docs/cli-reference.md`

This is the canonical CLI doc. It must be exhaustive.

- [ ] **Step 1: Add `overrides` to the synopsis block**

```bash
cve-lite [path] [options]
cve-lite overrides [path] [options]
cve-lite advisories sync [options]
cve-lite config <set|unset|show> [key] [value]
cve-lite install-skill
```

- [ ] **Step 2: Add new global flags to the "Scan options" table**

| Flag | Default | Description | Example |
|---|---|---|---|
| `--audit-log <path>` | `(off)` | Stream NDJSON change-control events to `<path>`. See [Audit Log](./audit-log). | `--audit-log audit.ndjson` |
| `--check-overrides` | `false` | Run override hygiene as part of `cve-lite [path]` (default scan stays CVE-only). | `--check-overrides` |

- [ ] **Step 3: Add a new "Overrides options" section**

Following the existing "Scan options" section:

```markdown
## Overrides options

Used with `cve-lite overrides [path]`.

| Flag | Default | Description | Example |
|---|---|---|---|
| `--json` | `false` | Emit findings as JSON | `--json` |
| `--fix` | `false` | Apply RFC 6902 patches for findings with auto-fix | `--fix` |
| `--rule <id>` | `(all)` | Only run a specific rule (OA001-OA008) | `--rule OA001` |
| `--check-network` | `false` | Enable OA007 registry-drift check (opt-in network call) | `--check-network` |
| `--audit-log <path>` | `(off)` | Stream NDJSON change-control events | `--audit-log audit.ndjson` |
| `--fail-on <severity>` | `critical` | Exit non-zero at or above this severity | `--fail-on high` |
```

- [ ] **Step 4: Document exit codes**

Add a new section if not present, or update the existing one:

```markdown
## Exit codes

| Code | Meaning |
|---|---|
| 0 | No findings above `--fail-on` threshold |
| 1 | Findings present (CVE or OA) above threshold |
| 2 | `--fix` applied but `verify()` detected the fix did not take |
| 3 | Tool error |
```

- [ ] **Step 5: Commit**

```bash
git add website/docs/cli-reference.md
git commit -m "docs(cli-reference): add overrides subcommand, new global flags, exit codes"
```

### Task 10: website/docs/fix-mode.md

**Files:**
- `website/docs/fix-mode.md`

- [ ] **Step 1: Add an "Override hygiene fixes" section**

After the existing "What `--fix` does in v1" section, append:

```markdown
## Override hygiene fixes

When `--fix` runs against a project with `overrides`, it also applies RFC 6902 patches for any OA finding that has an auto-fix:

- OA001 orphaned target -> `remove`
- OA003 misplaced section -> `move`
- OA004 surpassed pin -> `remove`
- Others -> advisory (manual fix)

After fixes are applied (both CVE-side via `npm install`/`pnpm add`/`yarn add` AND override-side via patches), cve-lite runs a verify pass: OA001 and OA008 against the just-touched packages. If verify fails, cve-lite exits with code `2` to signal "fix applied but did not take" - operationally distinct from "you have findings" (exit `1`).

See [Scan -> fix -> verify](./scan-fix-verify) for the full loop.
```

- [ ] **Step 2: Update the exit codes section if present**

Document the new exit code `2`.

- [ ] **Step 3: Commit**

```bash
git add website/docs/fix-mode.md
git commit -m "docs(fix-mode): document override fixes and verify pass"
```

### Task 11: website/docs/reading-output.md

**Files:**
- `website/docs/reading-output.md`

- [ ] **Step 1: Add an "Override hygiene" section**

After the CVE findings section, add:

```markdown
## Override hygiene findings

When `cve-lite overrides` runs (or `cve-lite [path] --check-overrides`), the output includes a parallel "Override hygiene" section:

```text
Override hygiene
================

CRITICAL (1)
------------
  OA008  lodash
    package.json/overrides/lodash
    Override target has a vulnerable copy still on disk
    fix: applyable patch (1 op)

HIGH (2)
--------
  OA001  postcss
    ...
```

Findings group by severity, critical first. Each finding shows:
- Rule ID and package name
- Location (`package.json` plus JSON pointer)
- Message
- Whether a fix patch is attached

In JSON output (`--json`), the same data is in the new `overrideFindings` key alongside the existing CVE-findings keys.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/reading-output.md
git commit -m "docs(reading-output): describe override hygiene section + overrideFindings JSON"
```

### Task 12: website/docs/sarif.md

**Files:**
- `website/docs/sarif.md`

- [ ] **Step 1: Add a section for the Override Hygiene tool component**

```markdown
## Override hygiene tool component

cve-lite SARIF output registers two tool components:

1. **`cve-lite-cli`** (driver) - CVE findings with their CVE / GHSA rule IDs.
2. **`cve-lite-cli-overrides`** (extension) - Override hygiene findings with rule IDs `OA001`-`OA008`.

Consumers (GitHub Advanced Security, third-party SARIF viewers) can scope by tool component to filter views.

### OA rule namespace

| Rule ID | Name | SARIF level |
|---|---|---|
| OA001 | OrphanedTarget | error |
| OA002 | FloatingTag | warning |
| OA003 | WrongSection | error |
| OA004 | SurpassedPin | note |
| OA005 | NestedIneffective | warning |
| OA006 | CoupledPlatformBinary | warning |
| OA007 | FrozenLatest | note |
| OA008 | MaterializedVulnerable | error |
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/sarif.md
git commit -m "docs(sarif): document override hygiene tool component"
```

### Task 13: website/docs/cyclonedx.md

**Files:**
- `website/docs/cyclonedx.md`

- [ ] **Step 1: Add a "Scope" callout**

```markdown
:::note Override findings are not represented in CycloneDX
CycloneDX is the vulnerability-bill-of-materials standard. cve-lite emits CycloneDX for CVE findings only. Override hygiene findings are not vulnerabilities in the CycloneDX sense - they describe metadata-level hygiene problems with your `package.json`. To export override findings, use `--json` or `--sarif` instead.
:::
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/cyclonedx.md
git commit -m "docs(cyclonedx): note that override findings are not in CycloneDX scope"
```

### Task 14: website/docs/html-report.md

**Files:**
- `website/docs/html-report.md`

- [ ] **Step 1: Add an "Override hygiene section" subsection**

```markdown
## Override hygiene section

When the project has `overrides`, the HTML report includes an Override Hygiene section after the CVE section. Same visual language: severity-grouped rows, color-coded by severity.

Each row shows: rule ID, package, location (`package.json` + JSON pointer), and message.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/html-report.md
git commit -m "docs(html-report): document override hygiene section"
```

### Task 15: website/docs/remediation-strategy.md

**Files:**
- `website/docs/remediation-strategy.md`

- [ ] **Step 1: Add an "Override-style remediation" section**

```markdown
## Override-style remediation

CVE remediation upgrades a dependency. Override-style remediation fixes the override expression itself - removing dead overrides, moving misplaced ones, fixing nested ineffective patterns.

Use override fixes when:
- A `package.json` `overrides` block accumulated stale entries
- An override target was renamed or removed upstream
- An override sits in the wrong section (npm vs pnpm)

Override fixes apply in-process as RFC 6902 patches. The verify pass confirms the fix took before cve-lite exits.

See [Override Hygiene](./overrides) for the eight rules and what each can fix.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/remediation-strategy.md
git commit -m "docs(remediation): add override-style remediation track"
```

### Task 16: website/docs/parser-coverage.md

**Files:**
- `website/docs/parser-coverage.md`

- [ ] **Step 1: Add a row to the coverage matrix**

The doc currently covers lockfile parser support per package manager. Add a row for overrides extraction:

| Capability | npm | pnpm | yarn | bun |
|---|---|---|---|---|
| Lockfile parsing | yes | yes | yes | yes |
| `overrides` (npm-style) | yes | n/a | n/a | n/a |
| `pnpm.overrides` | n/a | yes | n/a | n/a |
| `resolutions` | n/a | n/a | yes | yes |

(Adjust to fit the doc's actual layout.)

- [ ] **Step 2: Commit**

```bash
git add website/docs/parser-coverage.md
git commit -m "docs(parser-coverage): add override-block extraction coverage"
```

### Task 17: website/docs/roadmap.md

**Files:**
- `website/docs/roadmap.md`

- [ ] **Step 1: Mark override hygiene delivered**

Move "override hygiene" (if present) from upcoming to delivered. If not present, add a delivered entry referencing the cve-lite vNext major release.

- [ ] **Step 2: Identify next-up override work**

Suggested upcoming entries:
- More OA sub-rules (e.g., `resolutions` deep-merge semantics)
- CycloneDX extension proposal for override findings (long-term)
- Override-focused case studies

- [ ] **Step 3: Commit**

```bash
git add website/docs/roadmap.md
git commit -m "docs(roadmap): mark override hygiene delivered; identify next-up override work"
```

### Task 18: website/docs/comparison.md

**Files:**
- `website/docs/comparison.md`

- [ ] **Step 1: Add an "Override hygiene" row to the comparison matrix**

Most CVE scanners do not audit `overrides` hygiene. Show this as a cve-lite differentiator.

```markdown
| Capability | cve-lite | Snyk | Dependabot | npm audit |
|---|---|---|---|---|
| ... | | | | |
| Override hygiene (OA001-OA008) | yes | no | no | no |
| Override fix verification | yes | no | no | no |
| Project-wide audit log | yes | no | no | no |
```

(Update to match the doc's existing competitor list and format.)

- [ ] **Step 2: Commit**

```bash
git add website/docs/comparison.md
git commit -m "docs(comparison): add override hygiene as cve-lite differentiator"
```

### Task 19: website/docs/workflow-integration.md

**Files:**
- `website/docs/workflow-integration.md`

- [ ] **Step 1: Add CI signal note**

```markdown
## CI signal: exit code 2

When `cve-lite --fix` runs in CI, exit code `2` indicates "fix applied but did not work" - operationally different from exit `1` ("findings present"). Treat exit `2` as a hard failure: the dependency is in a worse state than before the run.

Example GitHub Actions step:

```yaml
- name: Apply fixes and verify
  run: cve-lite . --fix --audit-log audit.ndjson
- name: Upload audit log
  uses: actions/upload-artifact@v4
  with:
    name: cve-lite-audit
    path: audit.ndjson
```

If `cve-lite` exits 2, the action fails. The uploaded audit log captures exactly which targets were attempted and why verify failed.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/workflow-integration.md
git commit -m "docs(workflow): document exit 2 as a CI signal; audit-log upload example"
```

### Task 20: website/docs/security-assurance-case.md

**Files:**
- `website/docs/security-assurance-case.md`

This doc supports cve-lite's OWASP positioning. The audit-log + verify capability strengthens the assurance case substantially.

- [ ] **Step 1: Add a "Change-control evidence" section**

```markdown
## Change-control evidence (Lab-tier)

With `--audit-log <path>` enabled, every cve-lite run captures a complete NDJSON record of what was seen and done: scan started, every CVE detected, every fix applied, every verify pass or failure, every error. The log is append-only, line-per-event, and schema-versioned.

For supply-chain compliance pipelines (SLSA Build L3+, SSDF PO.4, OWASP Lab assurance), the audit log provides:

- Auditable evidence of dependency-vulnerability detection at a given timestamp
- Proof that remediation was applied (or attempted) per target
- Verification that fixes took effect (exit code 2 captured when they did not)
- Replayable, parseable record that fits into existing log-aggregation pipelines

This is opt-in; off by default. When disabled, the emission code is a zero-cost no-op.

See [Audit Log](./audit-log) for the event vocabulary and integration guide.
```

- [ ] **Step 2: Add override-hygiene to the assurance case**

Reference override hygiene as a complementary control: CVE detection covers known-vulnerable versions; override hygiene catches cases where remediation was attempted via `overrides` but did not effectively prevent vulnerable code from being installed.

- [ ] **Step 3: Commit**

```bash
git add website/docs/security-assurance-case.md
git commit -m "docs(assurance): add change-control evidence and override-hygiene as Lab-tier controls"
```

### Task 21: website/docs/troubleshooting.md

**Files:**
- `website/docs/troubleshooting.md`

- [ ] **Step 1: Add common OA-specific entries**

```markdown
## Override hygiene

### "OA007 disabled - frozen-latest check needs network"

By default, `cve-lite overrides` runs offline. OA007 (frozen-latest) requires a registry call to compare your `latest` pin against the published `latest` tag. Pass `--check-network` to enable.

### "Verify failed on a clean tree"

After `--fix` applies OA patches, cve-lite runs OA001 and OA008 against the just-touched packages. If verify reports failures on what looks like a clean tree, two common causes:

1. **`node_modules` is stale.** The fix changed `package.json` but did not run `npm install`. Run `npm install` and re-scan.
2. **Vulnerable copy nested deep.** OA008 walks the full on-disk tree. A grandchild dependency may carry its own copy of the package. Check `node_modules/<parent>/node_modules/<target>`.

### "Override target shows OA001 but I'm using it"

OA001 fires when the target name does not appear in the lockfile's resolved tree. Two common causes:

1. **Typo in the override key.** `lodahs` will be reported as orphan.
2. **Workspace package.** If the override is for a workspace local, it may not be in the root lockfile's package list. Audit per-workspace instead.
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/troubleshooting.md
git commit -m "docs(troubleshooting): add override hygiene Q&A"
```

### Task 22: sidebars.ts

**Files:**
- `website/sidebars.ts`

- [ ] **Step 1: Read the current sidebar config**

```bash
cat website/sidebars.ts
```

- [ ] **Step 2: Add an "Override Hygiene" category**

Position between "Fix Issues" and "Integrate":

```ts
    {
      type: 'category',
      label: 'Override Hygiene',
      collapsed: true,
      items: [
        'overrides/index',
        'overrides/oa001',
        'overrides/oa002',
        'overrides/oa003',
        'overrides/oa004',
        'overrides/oa005',
        'overrides/oa006',
        'overrides/oa007',
        'overrides/oa008',
        'overrides/architecture',
      ],
    },
```

Also add `audit-log` and `scan-fix-verify` to the appropriate existing categories (likely "Integrate" for audit-log, "Fix Issues" for scan-fix-verify).

- [ ] **Step 3: Build the site to verify**

```bash
cd website && npm install && npm run build
```
Expected: build succeeds, no broken links to the new doc paths.

- [ ] **Step 4: Commit**

```bash
git add website/sidebars.ts
git commit -m "docs(sidebar): add Override Hygiene category and audit-log entry"
```

### Task 23: action.yml description

**Files:**
- `action.yml` (root)

- [ ] **Step 1: Update the `description` field**

```yaml
description: "Run CVE Lite CLI in GitHub Actions for JS/TS dependency vulnerability scanning and package.json overrides hygiene auditing."
```

- [ ] **Step 2: Add new optional inputs if useful**

Consider adding:
```yaml
inputs:
  check-overrides:
    description: "Also audit package.json overrides (OA001-OA008)"
    required: false
    default: "false"
  audit-log:
    description: "Path to write NDJSON change-control log (off when empty)"
    required: false
    default: ""
```

Pass these through to the CLI invocation later in the action.

- [ ] **Step 3: Commit**

```bash
git add action.yml
git commit -m "docs(action): mention override hygiene; add check-overrides and audit-log inputs"
```

### Task 24: package.json description

**Files:**
- `package.json` (root)

- [ ] **Step 1: Update the `description` field**

```json
"description": "Developer-friendly CLI for scanning JS/TS projects for dependency vulnerabilities and auditing package.json overrides hygiene. Uses local lockfiles and OSV."
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "docs(package): mention overrides hygiene in description"
```

---

## Phase C: New docs

### Task 25: scan-fix-verify.md (the headline narrative)

**Files:**
- Create: `website/docs/scan-fix-verify.md`

- [ ] **Step 1: Write the doc**

```markdown
---
sidebar_label: Scan -> Fix -> Verify
title: Scan -> Fix -> Verify
---

# Scan -> Fix -> Verify

cve-lite is built around a single closed loop:

1. **Scan** - read the lockfile, check every package against OSV, surface CVEs.
2. **Fix** - apply remediation: upgrade vulnerable packages via the package manager, apply RFC 6902 patches to override entries that need updating.
3. **Verify** - re-check the just-touched packages to confirm the fix actually took.

If verify fails, cve-lite exits with code `2`: distinct from "you have findings" (`1`). This distinction matters because "the fix did not take" is a categorically different failure mode in CI - it means the dependency tree is in a worse state than before the run.

## What verify does

Verify runs two override-hygiene detectors against the packages that were just patched:

- **OA001 orphaned target** - confirms the override target is present in the resolved tree
- **OA008 materialized vulnerable** - walks `node_modules/` and confirms no vulnerable copy is still on disk

It does not re-run the full CVE scan. The full scan ran in step 1; verify is scoped to confirming the targeted fix landed.

## When does verify run?

Every time `--fix` does anything substantive. Specifically:

- After `npm install` / `pnpm add` / `yarn add` for a CVE upgrade
- After applying an override RFC 6902 patch

Verify writes `verify.passed` or `verify.failed` to the [audit log](./audit-log) if enabled.

## Why does this matter?

Standard CVE tools tell you what is vulnerable and suggest a fix. They do not confirm the fix worked. Three common failure modes:

1. **The fix runs but `node_modules/` was not refreshed.** Package manager command succeeds; on-disk state still has the vulnerable copy.
2. **The override targets the wrong key.** Override is silently ignored; vulnerable package still resolves at its original version.
3. **A nested override carries the vulnerable copy.** Top-level package upgrades correctly; a transitive grandchild still carries the vulnerable version.

Verify catches all three.

## See also

- [Fix mode](./fix-mode) - what `--fix` does end-to-end
- [Override hygiene](./overrides) - the eight detectors the verify pass draws from
- [Audit log](./audit-log) - record of every verify pass or failure
```

- [ ] **Step 2: Commit**

```bash
git add website/docs/scan-fix-verify.md
git commit -m "docs(scan-fix-verify): new headline doc for the closed remediation loop"
```

### Task 26: AUTHORS file

**Files:**
- Create: `AUTHORS` (root)

- [ ] **Step 1: Write it**

```
# cve-lite-cli Authors

## Project lead

Sonu Kapoor <sonu.kapoor@example.com>
  Created cve-lite-cli; maintains the project under OWASP.

## Significant contributors

Aaron Lamb <aaron.lamb@hexaxia.tech>
  Authored @hexaxia-labs/override-audit-cli; merged into cve-lite-cli vNext as the
  override-hygiene subsystem (src/overrides/, src/audit-log/, OA001-OA008 rule set).

# Contributing

For a full list of contributors, see the GitHub contributors page:
https://github.com/OWASP/cve-lite-cli/graphs/contributors
```

(Confirm Sonu's email format or contact preference before committing.)

- [ ] **Step 2: Commit**

```bash
git add AUTHORS
git commit -m "docs(authors): formal contributor list including override hygiene IP attribution"
```

### Task 27: Merge retrospective lesson

**Files:**
- Create: `docs/lessons/<date>-cve-lite-merge-retrospective.md`

Written near the end of Plan 6 / handoff. Per user-memory preference, lessons live in tracked `docs/lessons/`.

- [ ] **Step 1: Write after Phase 1 ends**

Template:

```markdown
# Lesson: merging override-audit-cli into OWASP/cve-lite-cli

## Context

Phase 1 of the cve-lite + override-audit merge ran from 2026-05-28 through <end date>. This retrospective captures what we learned during the work that future merges of separate tools can use.

## What worked

- ...

## What surprised us

- ...

## What we would do differently

- ...

## Process notes

- Treating `Hexaxia-Labs/override-audit-cli`'s `merge` branch as a working mirror of `OWASP/cve-lite-cli` worked: the dev-to-test handoff was content-only and reviewable as a normal feature diff.
- ...
```

- [ ] **Step 2: Commit**

```bash
git add docs/lessons/<date>-cve-lite-merge-retrospective.md
git commit -m "docs(lessons): retrospective on the cve-lite + override-audit merge"
```

---

## Task 28: Final pass

- [ ] **Step 1: Verify every cross-link resolves**

```bash
cd website && npm run build
```
Expected: no broken-link warnings.

- [ ] **Step 2: Spell-check the new and updated docs**

```bash
# If a spell checker is configured in cve-lite, run it.
# Otherwise visual scan key landing pages.
```

- [ ] **Step 3: Final consistency check**

- All references to `Hexaxia-Labs/override-audit-cli` either removed or pointed at the AUTHORS attribution.
- All references to the `override-audit` binary updated to `cve-lite overrides`.
- All references to `--log-file` (override-audit flag) updated to `--audit-log` (cve-lite flag).
- All OA rule IDs render as `OA001`...`OA008` (not `OA001-ORPHAN-TARGET`).

- [ ] **Step 4: Commit any cleanup**

```bash
git add -A
git commit -m "docs(merge): final consistency pass" 
```

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| Rule docs OA001-OA008 in cve-lite docs site | Task 1 |
| Overrides landing page | Task 2 |
| Audit log reference | Task 3 |
| Override architecture rationale preserved | Task 4 |
| README mentions override hygiene | Task 5 |
| CHANGELOG vNext entry | Task 6 |
| Docs site landing updated | Task 7 |
| Getting started includes override example | Task 8 |
| CLI reference exhaustive (overrides command + new flags + exit codes) | Task 9 |
| Fix-mode doc covers override fixes + verify | Task 10 |
| Reading-output doc covers OA section + JSON | Task 11 |
| SARIF doc covers OA tool component | Task 12 |
| CycloneDX doc explains override scope | Task 13 |
| HTML report doc covers Overrides section | Task 14 |
| Remediation strategy doc covers override track | Task 15 |
| Parser coverage doc updated | Task 16 |
| Roadmap updated | Task 17 |
| Comparison page differentiates on overrides | Task 18 |
| Workflow integration covers exit-2 CI signal | Task 19 |
| Security assurance case strengthened with audit-log evidence | Task 20 |
| Troubleshooting covers OA Q&A | Task 21 |
| Docusaurus sidebar updated | Task 22 |
| action.yml updated | Task 23 |
| package.json description updated | Task 24 |
| Scan-fix-verify conceptual doc created | Task 25 |
| AUTHORS file with attribution | Task 26 |
| Merge retrospective lesson | Task 27 |
| Final consistency pass | Task 28 |

## Sequencing

Recommended order if executing inline:

1. **Phase A first (Tasks 1-4)** - migrated content stabilizes before any update doc tries to cross-link.
2. **Phase C central (Tasks 25, 26)** - `scan-fix-verify.md` and AUTHORS exist before Phase B tries to link them.
3. **Phase B (Tasks 5-24)** - update existing docs once destination docs (Phase A, C) exist.
4. **Sidebar (Task 22) last among Phase B** - so it can list all the new doc paths.
5. **Retrospective (Task 27)** - written after Phase 1 execution wraps; not before.
6. **Final pass (Task 28)** - end of plan.

## Out of scope for this plan

- New case studies featuring override hygiene (Phase 3+ work after the merge ships and projects adopt).
- Translation of docs into other languages.
- Substantive rewrites of unrelated cve-lite docs (caching, OSV, corporate proxy, etc.).
- Marketing collateral, blog posts, announcement content (Phase 3+).

## Next steps

After Plan 7 completes, the docs are merge-ready. Phase 2 (push to `OWASP/cve-lite-cli` branch) carries the doc work along with the code. Phase 3 (cve-lite vNext release) publishes the merged docs site.
