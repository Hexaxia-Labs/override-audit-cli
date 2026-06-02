---
title: Case Studies
description: Real-world dependency vulnerability scans of popular open source projects using CVE Lite CLI, with verified before and after findings.
---

# Case Studies

Each study is a real scan of a popular open source project - baseline findings recorded, fix commands run, results rescanned and measured. No estimated numbers.

These studies demonstrate CVE Lite CLI across different package managers, lockfile shapes, and project types: monorepos, transitive-heavy graphs, projects with no direct findings, and projects where the most interesting vulnerability is one npm audit would omit.

CVE Lite CLI is an [OWASP Incubator Project](https://owasp.org/cve-lite-cli/).

---

| Project | Lockfile | Key finding |
|---|---|---|
| [OWASP Juice Shop](./owasp-juice-shop.md) | npm | Multiple critical/high direct findings with copy-and-run fix commands |
| [NestJS](./nestjs.md) | npm | 26 findings, 25 transitive - CVE Lite surfaces the one actionable direct fix |
| [Analog](./analog.md) | pnpm | Angular meta-framework monorepo, pnpm workspace scanning |
| [lint-staged](./lint-staged.md) | npm | `picomatch@2.3.1` direct high dep hidden by `npm audit --omit=dev` |
| [Ghost](./ghost.md) | npm | CMS platform, transitive chain analysis |
| [Astro](./astro.md) | pnpm | Large pnpm monorepo with verified baseline scan documentation |
| [Turborepo](./turborepo.md) | pnpm | Monorepo build tooling, pnpm lockfile |
| [VS Code](./vscode.md) | npm | `@anthropic-ai/sdk@0.81/0.82` as direct Copilot dependencies |
| [Storybook](./storybook.md) | npm | Frontend tooling, large dependency graph |
