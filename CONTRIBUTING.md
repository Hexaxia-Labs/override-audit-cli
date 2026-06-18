# Contributing to CVE Lite CLI

CVE Lite CLI is an [OWASP Lab Project](https://owasp.org/cve-lite-cli/) and welcomes contributions from the community.

## Voluntary contributions

All contributions to this project are voluntary and unpaid. By opening a pull request you confirm that you are contributing your work freely under the project's [MIT License](LICENSE). If you propose a paid arrangement in an issue or PR, it will not be accepted.

## Getting started

1. Find an open issue labeled [`good first issue`](https://github.com/OWASP/cve-lite-cli/labels/good%20first%20issue) or [`help wanted`](https://github.com/OWASP/cve-lite-cli/labels/help%20wanted).
2. Comment on the issue to let others know you are working on it.
3. Fork the repo and create a branch: `git checkout -b feature/issue-NNN-short-description`.
4. Make your changes, add tests, and run `npm test` and `npm run build` to verify everything passes.
5. Open a pull request with `Closes #NNN` in the body.

## Code standards

- Run `npm test` and `npm run build` before submitting. PRs with failing tests will not be merged.
- Keep changes tightly scoped to the issue. Do not refactor unrelated code in the same PR.
- New utility functions belong in a focused module under `src/utils/` - not inlined in `src/index.ts`.
- Use `node:fs`, `node:path`, etc. for Node built-in imports.
- Follow the existing code style - TypeScript strict mode, named exports, no default exports.

## Pull request review

- A maintainer will review your PR, typically within a few days.
- If changes are requested, address the feedback and push to the same branch.
- If your branch falls behind main, rebase it: `git fetch origin && git rebase origin/main && git push --force-with-lease`.

## Case studies

Case studies document real-world scans of popular open-source projects. The portfolio covers all major lockfile types (npm, pnpm, Yarn Berry, Bun) and a range of project sizes and sectors.

A new case study proposal is only accepted if it meets at least one of the following:

1. **New lockfile type** - uses a lockfile type not yet covered in the existing portfolio
2. **New sector** - covers a sector genuinely not yet represented, such as government, healthcare, finance, or hardware (a different kind of developer tool or AI framework does not qualify)
3. **Exceptional gap vs native audit** - the scan reveals a meaningful difference compared to the equivalent package manager audit tool (e.g. the native tool returns zero findings and CVE Lite finds something real, or the deduplication difference is dramatic), documented side-by-side in the study

Before opening a case study issue, scan the project locally with `cve-lite . --verbose` and confirm it meets at least one criterion above. Case study PRs must not edit shared files (`website/docs/case-studies/index.md`, `website/sidebars.ts`, `README.md`, `examples/readme.md`, `CHANGELOG.md`) - those are updated by maintainers post-merge.

## Reporting bugs

Use the [bug report template](https://github.com/OWASP/cve-lite-cli/issues/new?template=bug_report.md). Include your Node.js version, package manager, and the full error output.

## Override hygiene subsystem (`src/overrides/`)

The override hygiene subsystem audits `overrides` / `pnpm.overrides` / `resolutions` declarations against the resolved dependency tree. It is a parallel surface to CVE scanning: CVE Lite remediates vulnerabilities by upgrading along the dependency graph, while override-audit keeps the overrides a project already has healthy. The hook never creates new overrides.

### Pipeline

```
buildOverrideContext(projectPath)   reads package.json + lockfile + node_modules ONCE
        -> OverrideContext
detectors/oa00N-*.ts                each returns OverrideFinding[]
        -> applyComposite()         dedup (OA005 > OA001) and escalation (OA006)
        -> audit()                  emits oa.detected per finding
        -> applyFix()               RFC 6902 patches for findings with an auto-fix
        -> verify()                 re-runs OA001 + OA008 on just-patched targets
```

`audit()` and `verify()` are the public entry points in `src/overrides/api.ts`. `verify()` is the post-fix check that closes the loop: after a fix is applied, it confirms the override target is actually present in the resolved tree (OA001) and that no vulnerable copy is still materialized on disk (OA008). A failed verify exits the CLI with code `2`.

### Adding a new OA rule

1. Pick the next free rule ID (OA009+) and write `docs/rules/OA009.md`. The detector's `references:` URL must point at that path (`https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA009.md`).
2. Create `src/overrides/detectors/oa009-short-name.ts` exporting a `detect(ctx): OverrideFinding[]` function matching the existing detectors.
3. Register it in `src/overrides/detectors/index.ts` (`ALL_DETECTORS`, and `VERIFY_DETECTORS` only if it belongs in the post-fix check).
4. Add fixture-driven unit tests under `tests/overrides/detectors/`.
5. If the rule has an auto-fix, return a `fix.patch` (RFC 6902 array of `remove` / `replace` / `move` / `add` ops). Suggest-only findings must emit `fix: undefined`, not an empty patch, so the fixer correctly skips them.
6. Add a sanity assertion under `tests/sanity/` locking in the rule's count on a real dogfood project.

### Testing convention

- Unit tests: `tests/overrides/detectors/<rule>.test.ts`
- Sanity tests: `tests/sanity/plan-N-*.test.ts`, one per change, asserting the dogfood matrix is unchanged
- The audit-log reference doc is `docs/audit-log.md`; the per-rule reference docs are `docs/rules/OA001.md` ... `OA008.md`.

## Questions

Open a [GitHub Discussion](https://github.com/OWASP/cve-lite-cli/discussions) or reach out via the [OWASP Slack](https://owasp.org/slack/invite) in the `#project-cve-lite-cli` channel.
