# Frozen snapshot - DO NOT EDIT, DO NOT SHIP

This directory holds a **frozen, trimmed snapshot** of the original standalone
`override-audit-cli` (pre-merge, v0.3.0). It is kept for exactly one reason:

**It is the baseline for the port-equivalence sanity tests.**

`tests/sanity/port-equivalence.test.ts` and `tests/sanity/plan-3-pipeline.test.ts`
import the old detectors and scanner from `src/` here and assert that the merged
`src/overrides/` detectors produce equivalent findings. That proof only works
while the old implementation is importable, so this `src/` tree stays.

## What is here

- `src/` only - the original detectors, scanner, parsers, types.

## What was removed

Everything else from the original repo: `node_modules/`, `dist/`, `tests/`,
`.github/`, `docs/` (rule docs migrated to `/docs/rules/`, the change-control
doc rewritten as `/docs/audit-log.md`, lessons moved to `/docs/lessons/`), and
all build config. This is not a runnable project; it is a reference snapshot.

## Heads-up for reviewers

This tree is **not** the live code. The shipping override hygiene implementation
is at the repo root under `src/overrides/`. If a grep lands you here (old file
names like `orphan.ts`, `floating-tag.ts`, `vulnerable-twin.ts`), you are reading
the frozen pre-merge source, not the current detectors.

When the merge lands on `OWASP/cve-lite-cli` and the port-equivalence tests are
retired, this entire directory should be deleted.
