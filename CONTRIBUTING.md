# Contributing

Thanks for considering a contribution to `override-audit-cli`. This document covers how to set up the project, how the codebase is organised, and how to add or modify rules.

## Setup

```bash
git clone git@github.com:Hexaxia-Labs/override-audit-cli.git
cd override-audit-cli
npm install
npm test
npm run build
./dist/cli/index.js --help
```

Requires **Node ≥ 18**. The CI matrix tests against Node 18.x, 20.x, and 22.x.

## Project layout

```
src/
  index.ts                    Public library entrypoint (re-exports)
  types.ts                    Shared types — the contract everything depends on
  scanner.ts                  Orchestrator: builds Context, runs all detectors, dedups
  parsers/
    package-manager.ts        Detects npm vs pnpm by lockfile mtime
    package-json.ts           Reads package.json + flattens overrides into entries
    lockfile.ts               Extracts package names from lockfile (npm + pnpm v6/v9)
    node-modules.ts           Reads installed versions and manifests
  detectors/
    orphan.ts                 OA001 — pure function (ctx: Context) => Finding[]
    floating-tag.ts           OA002
    wrong-section.ts          OA003
    installed-newer.ts        OA004
    nested-override.ts        OA005 (five sub-codes in one detector)
  output/
    human.ts                  Plain-text terminal renderer
    json.ts                   schemaVersion: '1' renderer (consumed by HexOps)
  fixer/
    json-pointer.ts           RFC 6901 path encoding (used by detector patches)
  cli/
    args.ts                   Hand-rolled arg parser (no commander/yargs)
    help.ts                   Static HELP_TEXT
    index.ts                  Bin entrypoint — run(argv, io)
tests/
  parsers/        detectors/        output/        cli/
  fixtures/       __snapshots__/    *.test.ts
docs/
  rules/                      Per-rule reference docs (OA001.md … OA005.md)
```

## The detector contract

Every detector is a **pure function** with the same signature:

```ts
import type { Context, Finding } from '../types.js';
export function detect(ctx: Context): Finding[];
```

A `Context` is built once per scan by `src/scanner.ts` and contains everything every detector needs: the parsed `package.json`, override entries (already flattened), the lockfile's package name set, installed versions, and per-detector skip notes.

Detectors **must not read the filesystem directly**. All filesystem access lives in `src/parsers/`. This keeps detectors trivially testable — every detector test constructs a `Context` literal in memory and asserts the finding shape.

## Adding a new rule

1. Pick a stable rule id with the next sequential number: `OA00<N>-<SHORT-NAME>`.
2. Add it to the `RuleId` union in `src/types.ts`.
3. Create `src/detectors/<rule-name>.ts`.
4. Create `tests/detectors/<rule-name>.test.ts` first — write tests against a mock Context **before** implementing the detector.
5. Wire the detector into `src/scanner.ts` in stable order.
6. Add a `docs/rules/OA00<N>.md` doc following the existing template (severity, action, what it catches, example, why it matters, how to fix, references).
7. Update `src/cli/help.ts` and `docs/rules/README.md`.
8. Add an entry to the CHANGELOG.

## Testing

```bash
npm test                                  # full suite
npm test -- floating-tag                  # one test file
npm run test:watch                        # watch mode
```

The CI build runs `npm run build` before `npm test` because the `cli-integration.test.ts` suite spawns the built bin as a child process.

### Snapshot test

`tests/output-snapshot.test.ts` locks the v1 JSON output schema. Any change to the `OverrideAuditOutput` shape will fail the snapshot. **Don't auto-update it** — the schema is the contract HexOps will consume in Plan 3. Breaking shape changes need a deliberate snapshot review.

## Running against a real project

```bash
npm run build
./dist/cli/index.js /path/to/some/repo
./dist/cli/index.js --json /path/to/some/repo | jq .
./dist/cli/index.js --severity info --include-sub-suspect /path/to/some/repo
```

When in doubt about what the tool should do on a given project, dogfood it before tagging a release.

## Commits and releases

- **Conventional Commits.** Examples: `feat(detectors): …`, `fix(parsers): …`, `docs: …`, `test: …`, `chore: …`.
- Don't include `Co-Authored-By:` trailers unless someone other than the author actually co-authored the commit.
- Releases are tagged `vX.Y.Z`. The CHANGELOG should be updated as part of the release commit.

```bash
# Example release
npm version 0.2.0 --no-git-tag-version    # bumps package.json only
# update CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.2.0"
git tag v0.2.0 -m "v0.2.0 — Fix"
git push && git push --tags
```

## Issue triage

- **Bug reports** — include `override-audit --version`, `node --version`, the project's `package.json` overrides block, and the output (with `--json` if practical).
- **New rule proposals** — describe the failure mode in the wild before proposing the detector. Most good rules come from "we saw this break X in production" rather than "this seems suspect in theory".

## Code style

The TypeScript config is strict (`"strict": true`) and ESM (`"module": "NodeNext"`). There's no separate formatter — `tsc` is the only build step. Match the surrounding style; small files; no defensive checks for impossible states.
