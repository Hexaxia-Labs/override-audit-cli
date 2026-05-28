# Contributing to CVE Lite CLI

CVE Lite CLI is an [OWASP Incubator Project](https://owasp.org/cve-lite-cli/) and welcomes contributions from the community.

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

## Reporting bugs

Use the [bug report template](https://github.com/OWASP/cve-lite-cli/issues/new?template=bug_report.md). Include your Node.js version, package manager, and the full error output.

## Questions

Open a [GitHub Discussion](https://github.com/OWASP/cve-lite-cli/discussions) or reach out via the [OWASP Slack](https://owasp.org/slack/invite) in the `#project-cve-lite-cli` channel.
