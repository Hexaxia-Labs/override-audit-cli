# Contributing to CVE Lite CLI

Thanks for your interest in contributing to CVE Lite CLI.

CVE Lite CLI is a lightweight, developer-focused vulnerability scanner for JavaScript and TypeScript projects. The project is intentionally opinionated: it values fast local workflow, understandable output, practical remediation guidance, and a small dependency footprint.

## What kinds of contributions are helpful

Contributions are especially welcome in these areas:

- lockfile parsing edge cases
- npm, pnpm, and Yarn compatibility improvements
- output clarity and readability
- remediation guidance improvements
- JSON output quality
- CI examples and documentation
- performance improvements
- tests and reproducible bug cases
- documentation and onboarding

## Before you start

Please open an issue first for:

- new features
- larger refactors
- behavior changes
- output format changes

This helps keep the project focused and avoids duplicated work.

Small fixes such as typo corrections, tests, and minor docs updates can usually be opened directly as pull requests.

## Development principles

Please keep these project principles in mind:

- local-first workflow
- small runtime dependency footprint
- practical developer usability over complexity
- honest security claims
- clear output over noisy output
- action-oriented remediation guidance

## Coding standards

CVE Lite CLI is written in TypeScript with strict mode enabled. The project's `tsconfig.json` is the canonical style baseline; pull requests must pass strict type-check and the existing test suite before review.

Required checks before opening a pull request:

```bash
npm run build
npm test
```

Conventions used across the codebase:

- ES modules (`import` / `export`), no `require`. Source files end in `.ts` and import other modules with explicit `.js` extensions on relative paths (Node ESM resolution).
- camelCase for functions and variables, PascalCase for types and classes, kebab-case for filenames.
- One concern per file. Modules in `src/` map to a focused responsibility — parser, scanner, remediation step, output formatter — and changes that mix unrelated concerns are typically asked to be split.
- Comments are written only when the *why* is non-obvious: a hidden constraint, a subtle invariant, or a workaround for a specific bug. Comments that just describe what the code does are removed during review.
- Output and security language must be precise. Avoid words like "fully safe", "guaranteed compatible", or "stable version" in user-visible text. Findings are based on advisory data, not exploitability or runtime reachability claims.
- Every finding should aim to produce a runnable command where the data supports it. Vague guidance like "upgrade the parent dependency chain" without naming the parent is treated as a regression.

### Named constants

Magic strings and numbers must not be inlined. Extract them to named constants in `src/constants.ts`:

```typescript
// bad
const results = await queryOsv(packages, 100);

// good
import { DEFAULT_BATCH_SIZE } from "./constants.js";
const results = await queryOsv(packages, DEFAULT_BATCH_SIZE);
```

This applies to repeated flag strings, batch sizes, cache TTLs, depth limits, and any other value that has a name or meaning beyond its raw literal.

### DRY

Repeated logic belongs in a shared utility, not copied across files. If the same string literal, function body, or conditional pattern appears in two or more places, extract it:

- Repeated string literals - extract to a constant
- Repeated utility functions - extract to the appropriate module under `src/utils/`
- Repeated output formatting logic - extract to `src/output/formatters.ts`

Pull requests that duplicate existing logic are asked to consolidate before merge.

### File size and single responsibility

Each file should have one clear purpose. If you cannot describe what a file does in one sentence, it is doing too much.

Keep files focused and small. When a file grows large, extract shared logic into a dedicated utility module rather than continuing to add to it. This applies especially to `src/index.ts`, which is the entry point and should remain a thin orchestration layer.

New output formats (JSON, SARIF, HTML, CycloneDX) each get their own dedicated module following the `html-reporter.ts` pattern. Do not add a new format to an existing formatter file.

Display logic, hint text, and error messages belong in utility modules (`src/utils/`, `src/output/`), not inlined in `src/index.ts`.

### Braces on conditionals

All `if`, `else`, `for`, and `while` blocks must use braces, even for single-line bodies:

```typescript
// bad
if (condition) doSomething();

// good
if (condition) {
  doSomething();
}
```

### Formatting

Code is formatted with [Prettier](https://prettier.io). Run the formatter before opening a pull request:

```bash
npm run format
```

CI will reject pull requests where files are not formatted. The project config is in `.prettierrc` at the repo root.

What gets pushed back during review:

- Refactors bundled into feature work or bug fixes. Open a separate issue and pull request.
- Defensive error handling for cases that cannot occur. Trust internal invariants; only validate at system boundaries (user input, external APIs, file I/O).
- Unsupportable claims in commit messages, release notes, or output text. Commit messages must be factual and scoped to the diff.
- Magic strings or numbers inlined in source code instead of named constants.
- Duplicated logic that already exists in a shared utility.

## Setup

```bash
npm install
npm test
npm run build
```

## Testing expectations

Contributors must run the automated checks before opening a pull request:

```bash
npm test
npm run build
```

### Test policy

Any new feature, behavior change, or bug fix that affects scan logic, parsing, output, or remediation **must** be covered by automated unit tests in the same pull request. The test policy applies to what lands in the pull request, not to the order in which the work is done locally — it is fine to validate a change manually first and add tests before opening the PR.

Practical exceptions:

- Documentation-only changes, repo metadata, and trivial typo fixes do not require tests.
- Changes where automated coverage is genuinely impractical (interactive output, environment-specific behavior, untestable third-party integration points) require a clear written reproduction case in the pull request description and an explicit acknowledgment from the reviewer that tests are not practical.

### Where tests live

- `tests/` directory at the project root.
- Test files mirror the source structure and are named `*.test.ts`.
- Jest is the runner, invoked through `node --experimental-vm-modules` via `npm test`.

### Style

- Assert on a module's public API rather than its internals. Tests should describe behavior the project promises to its users.
- Reuse the existing helpers (`createFinding`, `createScanInputForSource`, and similar) where applicable so test setup stays consistent.
- One concern per `it(...)` block. A test description that needs three "and"s is doing too much.

## Pull request guidelines

Please try to keep pull requests focused.

A good pull request usually includes:

- a clear description of the problem
- the reasoning behind the change
- before/after examples when output changes
- tests for behavior changes, or a clear explanation when tests are not practical
- documentation updates if user-facing behavior changed

## Commit guidance

Clear, plain-English commit messages are preferred.

Examples:

- add pnpm lockfile edge case handling
- improve JSON output structure
- fix direct vs transitive classification for nested paths
- clarify remediation guidance in README

## Reporting bugs

Please include:

- operating system
- Node.js version
- package manager
- lockfile type
- command used
- expected behavior
- actual behavior
- sample lockfile or minimal reproduction if possible

## Security issues

Please do not open public issues for undisclosed security-sensitive problems in the tool itself.

See the [Security Policy](SECURITY.md) for responsible disclosure guidance.

## Code of conduct

This project follows a [Code of Conduct](../../CODE_OF_CONDUCT.md). Please review it before participating.
