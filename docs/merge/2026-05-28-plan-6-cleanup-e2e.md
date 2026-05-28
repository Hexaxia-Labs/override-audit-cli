# Plan 6: Cleanup + end-to-end validation + dev-to-test handoff prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the remaining preserved artifacts (test fixtures, rule docs), delete `_preserved-override-audit/`, dogfood the merged CLI against `hexmetrics`, and produce the artifact set Phase 2 needs: a clean diff against `cve-lite-cli@main`, a release-note draft for the cve-lite major bump, and a sign-off checklist.

**Architecture:** This plan is mostly file-move and validation, not new code. The substantive change: rule docs (`OA001.md`...`OA008.md`) move to cve-lite's `src/docs/` (or wherever cve-lite serves docs from), URLs in detector source align with the new docs locations, fixtures move to `tests/overrides/fixtures/`. The dogfood validation runs the merged CLI against two real npm projects and confirms reasonable output.

**Tech Stack:** No new code. Bash for moves, npm for build/test, ad-hoc validation scripts.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Layering Plan", "Phased Migration" (Phase 1 exit criteria, Phase 2 handoff).

**Prerequisite:** Plans 1-5 complete. Full test suite green. Manual smoke against fixtures works. CLI exposes `cve-lite overrides`, `--audit-log`, `--check-network`. Output covers terminal, JSON, SARIF, HTML.

---

## File Structure

Move:
- `_preserved-override-audit/tests/fixtures/` → `tests/overrides/fixtures/`
- `_preserved-override-audit/docs/rules/OA001.md` ... `OA008.md` → `src/docs/overrides/` (or cve-lite's equivalent docs location - confirm by reading cve-lite's existing `src/docs/`)
- `_preserved-override-audit/docs/change-control-logging.md` → `src/docs/audit-log.md` (the new audit-log reference)
- `_preserved-override-audit/docs/architecture.md` content merges into `src/docs/CONTRIBUTING.md` or similar as an "Override hygiene architecture" section
- `_preserved-override-audit/docs/usage.md` content merges into the main README or docs site

Delete:
- `_preserved-override-audit/` (entire directory)

Create:
- `docs/merge/handoff-checklist.md` - sign-off checklist for the dev-to-test transition
- `docs/merge/handoff-release-notes.md` - draft release notes for the cve-lite major version that lands the merge

Modify:
- `src/overrides/detectors/oa*.ts` - confirm the `references:` URLs in each finding point to the migrated rule-doc location (e.g., `https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/overrides/OA001.md` or whatever the actual location ends up being)

---

## Task 1: Confirm cve-lite's docs layout

Before moving rule docs, find where cve-lite serves docs from.

- [ ] **Step 1: Inspect cve-lite's docs layout**

```bash
ls src/docs/
ls website/
cat README.md | head -30
```

- [ ] **Step 2: Decide the destination path**

Based on what you see, choose one:
  - If cve-lite uses `src/docs/`: rule docs go to `src/docs/overrides/OA001.md` ... `OA008.md`.
  - If cve-lite uses Docusaurus at `website/docs/`: rule docs go to `website/docs/overrides/OA001.md` ... `OA008.md`.
  - If both exist: prefer `src/docs/` because the docs-site build copies from it.

Record the chosen path here in your working notes (for reference in later tasks): `src/docs/overrides/` (or whatever you chose).

- [ ] **Step 3: Note the URL pattern for `references:`**

The detector source files currently point to:
`https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/<X>.md`

Adjust to the chosen path. Example: `https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/overrides/<X>.md`.

(No commit yet - this is a planning step.)

---

## Task 2: Migrate test fixtures

**Files:**
- Move: `_preserved-override-audit/tests/fixtures/` → `tests/overrides/fixtures/`

- [ ] **Step 1: Move the directory**

```bash
mkdir -p tests/overrides
git mv _preserved-override-audit/tests/fixtures tests/overrides/fixtures
```

- [ ] **Step 2: Update fixture paths in any tests that reference them**

```bash
grep -rn "_preserved-override-audit/tests/fixtures" tests/ src/
```

For each match, rewrite to `tests/overrides/fixtures/...`.

- [ ] **Step 3: Run the test suite**

```bash
npm test
```
Expected: all green. Any failure indicates a fixture path that did not get rewritten.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(merge): move OA test fixtures to tests/overrides/fixtures/"
```

---

## Task 3: Migrate rule docs

**Files:**
- Move: `_preserved-override-audit/docs/rules/OA001.md` ... `OA008.md` → `<chosen-docs-path>/OA001.md` ... `OA008.md`

- [ ] **Step 1: Make the destination directory**

```bash
mkdir -p src/docs/overrides   # adjust if Task 1 picked a different destination
```

- [ ] **Step 2: Move the rule docs**

```bash
git mv _preserved-override-audit/docs/rules/OA001.md src/docs/overrides/OA001.md
git mv _preserved-override-audit/docs/rules/OA002.md src/docs/overrides/OA002.md
git mv _preserved-override-audit/docs/rules/OA003.md src/docs/overrides/OA003.md
git mv _preserved-override-audit/docs/rules/OA004.md src/docs/overrides/OA004.md
git mv _preserved-override-audit/docs/rules/OA005.md src/docs/overrides/OA005.md
git mv _preserved-override-audit/docs/rules/OA006.md src/docs/overrides/OA006.md
git mv _preserved-override-audit/docs/rules/OA007.md src/docs/overrides/OA007.md
git mv _preserved-override-audit/docs/rules/OA008.md src/docs/overrides/OA008.md
```

- [ ] **Step 3: Rewrite reference URLs inside each rule doc**

Each rule doc body may reference internal paths or sibling docs. Skim each:
```bash
grep -l "Hexaxia-Labs\|override-audit-cli" src/docs/overrides/OA*.md
```

For each match, rewrite `Hexaxia-Labs/override-audit-cli` → `OWASP/cve-lite-cli` and `override-audit` (the binary name) → `cve-lite overrides` (the subcommand).

- [ ] **Step 4: Update `references:` in detector sources**

```bash
grep -rn "docs/rules/" src/overrides/detectors/
```

For each match, rewrite the URL fragment to the new docs path (e.g., `docs/rules/OA001.md` → `src/docs/overrides/OA001.md`). Match the URL pattern decided in Task 1.

- [ ] **Step 5: Run tests to catch any reference-URL assertions**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(merge): move OA rule docs into src/docs/overrides/ and update references"
```

---

## Task 4: Migrate the audit-log reference doc

**Files:**
- Move: `_preserved-override-audit/docs/change-control-logging.md` → `src/docs/audit-log.md` (or chosen docs path)

- [ ] **Step 1: Move and update**

```bash
git mv _preserved-override-audit/docs/change-control-logging.md src/docs/audit-log.md
```

Edit `src/docs/audit-log.md` to:
- Retitle from "Change-control logging" to "Audit log".
- Reframe scope from "override-audit's fix lifecycle" to "project-wide opt-in NDJSON change-control".
- Replace `--log-file` with `--audit-log <path>` and document the `CVE_LITE_AUDIT_LOG` env var.
- Update the event vocabulary table to match the canonical list in `src/audit-log/events.ts` (9 event types).
- Note the OWASP Lab framing: "the audit log captures change-control evidence covering scan, fix, and verify across the whole tool, not just override flows."

- [ ] **Step 2: Commit**

```bash
git add src/docs/audit-log.md
git commit -m "docs(audit-log): rebrand change-control doc as audit-log reference"
```

---

## Task 5: Merge override-audit architecture and usage notes

**Files:**
- Read: `_preserved-override-audit/docs/architecture.md`, `_preserved-override-audit/docs/usage.md`
- Modify: relevant cve-lite docs (`README.md`, `src/docs/CONTRIBUTING.md`, or wherever architecture notes belong)

- [ ] **Step 1: Skim the originals**

```bash
cat _preserved-override-audit/docs/architecture.md | head -50
cat _preserved-override-audit/docs/usage.md | head -50
```

- [ ] **Step 2: Lift the useful parts**

Identify content worth preserving:
- Architecture: detector decoupling, the Context shape, the OA001/OA008 verification framing. Add a short "Override hygiene" subsection to cve-lite's existing architecture or CONTRIBUTING doc.
- Usage: example invocations, common-case walkthroughs. Add a "Override hygiene" section to the README or quick-start docs.

- [ ] **Step 3: Commit the integrated content**

```bash
git add -A
git commit -m "docs(merge): merge OA architecture and usage notes into cve-lite docs"
```

---

## Task 6: Delete `_preserved-override-audit/`

**Files:**
- Delete: `_preserved-override-audit/` (entire directory)

- [ ] **Step 1: Confirm nothing essential remains**

```bash
ls _preserved-override-audit/
find _preserved-override-audit -type f | wc -l
```

Anything in there now is either already migrated (and the original copy is leftover) or was never going to migrate (CHANGELOG of override-audit, the old README, etc.). Both are deletable.

- [ ] **Step 2: Delete**

```bash
git rm -rf _preserved-override-audit
```

- [ ] **Step 3: Confirm full test suite still passes**

```bash
npm test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(merge): delete _preserved-override-audit/; migration complete"
```

---

## Task 7: Dogfood against `hexmetrics` (npm)

**Files:** none (read-only validation)

- [ ] **Step 1: Locate hexmetrics**

Per the user-memory pointer, hexmetrics lives at `~/Projects/hexmetrics/` (npm-based, canonical dogfood target).

```bash
ls ~/Projects/hexmetrics/package.json
```

- [ ] **Step 2: Run the full audit**

```bash
npm run build
node dist/index.js overrides ~/Projects/hexmetrics --json > /tmp/hexmetrics-overrides.json
node dist/index.js ~/Projects/hexmetrics --check-overrides --audit-log /tmp/hexmetrics-audit.ndjson
```

- [ ] **Step 3: Inspect output**

```bash
jq '.findings | length, .findings[0]' /tmp/hexmetrics-overrides.json
head /tmp/hexmetrics-audit.ndjson
```

- [ ] **Step 4: Record observations**

In your working notes (not a commit yet):
- What rules fired?
- Were any findings surprising / false-positive looking?
- Did the audit log capture `scan.started`, `cve.detected`, `oa.detected`, `scan.finished` cleanly?
- Did `--fix` (if you ran it on a throwaway copy) apply patches as expected and verify clean?

(File any findings as issues on `Hexaxia-Labs/override-audit-cli` - they are real bugs the spec did not anticipate.)

---

## Task 8: Handoff checklist

**Files:**
- Create: `docs/merge/handoff-checklist.md`

- [ ] **Step 1: Write the checklist**

```markdown
# Dev-to-test handoff checklist

Aaron and Sonu both confirm before pushing this branch's content to a
`feat/override-audit-merge` branch on `OWASP/cve-lite-cli`.

## Code

- [ ] All Plan 1-6 commits landed on `merge`.
- [ ] `_preserved-override-audit/` deleted.
- [ ] `npm test` green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds.

## CLI surfaces

- [ ] `cve-lite overrides [path]` runs end-to-end.
- [ ] `cve-lite [path] --fix` applies OA fixes and runs verify.
- [ ] Exit code 2 fires when verify fails.
- [ ] `--audit-log <path>` writes a complete NDJSON stream.
- [ ] `--check-network` enables OA007.

## Output

- [ ] Terminal output renders an "Override hygiene" section.
- [ ] `--json` includes `overrideFindings`.
- [ ] `--sarif` includes the OA tool component with OA001-OA008 rules.
- [ ] `--report` HTML includes an Overrides section.
- [ ] CycloneDX is unchanged (CVE-only).

## Dogfood

- [ ] `cve-lite overrides ~/Projects/hexmetrics` produces reasonable output.
- [ ] No P1 surprises.

## Docs

- [ ] Rule docs OA001-OA008 live in the chosen docs path.
- [ ] `audit-log.md` reference doc lives in the chosen docs path.
- [ ] README mentions the new `cve-lite overrides` subcommand and `--audit-log` flag.

## Handoff artifact

- [ ] `docs/merge/handoff-release-notes.md` drafted.
- [ ] List of touched files compared against `cve-lite-cli@main` (the diff that becomes the cve-lite PR).

Sign-off:
- Aaron: ____________ Date: ____________
- Sonu:  ____________ Date: ____________
```

- [ ] **Step 2: Commit**

```bash
git add docs/merge/handoff-checklist.md
git commit -m "docs(merge): dev-to-test handoff checklist"
```

---

## Task 9: Draft release notes

**Files:**
- Create: `docs/merge/handoff-release-notes.md`

- [ ] **Step 1: Write the draft**

```markdown
# cve-lite-cli vNext - release notes (draft)

## Highlights

- **Override hygiene built in.** `cve-lite overrides [path]` runs the eight OA detectors (OA001-OA008) over your project's `overrides` / `pnpm.overrides` / `resolutions`. Detects orphaned targets, floating tags, misplaced sections, surpassed pins, ineffective nested overrides, parent-binary coupling, registry drift, and on-disk materialized vulnerable copies.
- **`--fix` closes the loop with verify.** When `cve-lite [path] --fix` applies an override fix, it automatically runs OA001 + OA008 against the just-patched targets to confirm the fix actually took. New exit code `2` distinguishes "fix applied but did not work" from regular findings.
- **Project-wide audit log (opt-in).** Pass `--audit-log <path>` to stream NDJSON change-control events (`scan.started`, `cve.detected`, `oa.fix.applied`, `verify.passed`, etc.) for the full scan/fix/verify lifecycle. Off by default; zero cost when unused.

## Breaking changes

- New exit code `2` on `--fix` verify failure. CI flows that special-cased `1` may want to handle `2` distinctly.
- SARIF output now includes a sibling `toolComponent` for OA rules. Consumers that assumed a single component should iterate `runs[0].tool.driver` and `runs[0].tool.extensions`.

## Acknowledgements

- Override-audit IP merged from `@hexaxia-labs/override-audit-cli` (Aaron Lamb).
- Co-developed with Sonu Kapoor.

See `docs/merge/` for the design spec and per-plan implementation history.
```

- [ ] **Step 2: Commit**

```bash
git add docs/merge/handoff-release-notes.md
git commit -m "docs(merge): draft cve-lite vNext release notes"
```

---

## Task 10: Final gate

- [ ] **Step 1: Final test run**

```bash
npm test
```
Expected: green.

- [ ] **Step 2: Final TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Final build**

```bash
npm run build
```

- [ ] **Step 4: Verify no orphaned files**

```bash
ls _preserved-override-audit 2>&1 | head
```
Expected: "No such file or directory".

- [ ] **Step 5: Verify branch is ready**

```bash
git status
git log --oneline main..merge | wc -l
git log --oneline main..merge | tail -20
```

- [ ] **Step 6: Sign the checklist**

Aaron and Sonu both go through `docs/merge/handoff-checklist.md`, run the manual validations, and tick boxes.

Plan 6 complete when the checklist is fully signed.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `_preserved-override-audit/` deleted | Task 6 |
| Test fixtures migrated | Task 2 |
| Rule docs migrated (OA001..OA008) | Task 3 |
| Audit-log reference doc migrated | Task 4 |
| Architecture / usage merged into cve-lite docs | Task 5 |
| Dogfood validation against hexmetrics | Task 7 |
| Phase 1 exit criteria satisfied | Tasks 10, 8 |
| Handoff artifact for Phase 2 | Tasks 8, 9 |

## What happens next (Phase 2)

The dev-to-test handoff. Concretely:

1. Open `feat/override-audit-merge` on `OWASP/cve-lite-cli`.
2. Apply the content of `merge`'s post-baseline commits to that branch. Two mechanisms:
   - **Content rsync + single commit**: `rsync -a --exclude='.git' --exclude='_preserved-override-audit' --exclude='cve-lite-ref' --exclude='docs/merge' --exclude='docs/superpowers' <override-audit-cli> <cve-lite-cli>` then commit the diff as one or a few focused commits.
   - **Cherry-pick + format-patch**: `git format-patch` each commit on `merge` and `git am` on the cve-lite branch - preserves attribution but is sensitive to baseline drift.
3. Group testing: OWASP reviewers, Sonu, Aaron, early users.
4. PR merges to `OWASP/cve-lite-cli` `main`.
5. Cut the cve-lite major release.
6. Archive `Hexaxia-Labs/override-audit-cli`.

Aaron's name carries over via merge commit (preserved history), AUTHORS, README contributor section, and OWASP project page.
