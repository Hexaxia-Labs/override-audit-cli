---
title: Case Studies
description: Real-world dependency vulnerability scans of popular open source projects using CVE Lite CLI, with verified before and after findings.
---

# Case Studies

Each study is a real scan of a popular open source project - baseline findings recorded, fix commands run, results rescanned and measured. No estimated numbers.

These studies demonstrate CVE Lite CLI across different package managers, lockfile shapes, and project types: monorepos, transitive-heavy graphs, projects with no direct findings, and projects where the most interesting vulnerability is one npm audit would omit.

CVE Lite CLI is an [OWASP Lab Project](https://owasp.org/cve-lite-cli/).

---

| Project | Lockfile | Key finding |
|---|---|---|
| [CamoFox Browser](./camofox-browser.md) | npm | AI agent browser automation — 435 packages, 2 `qs` findings, within-range refresh + express parent upgrade |
| [Ghost](./ghost.md) | npm | CMS platform, transitive chain analysis |
| [lint-staged](./lint-staged.md) | npm | `picomatch@2.3.1` direct high dep hidden by `npm audit --omit=dev` |
| [Lit](./lit.md) | npm | Web components reference implementation — 2,059 packages, 3 direct rollup findings with workspace-scoped fix commands, 5 critical transitive |
| [NestJS](./nestjs.md) | npm | 26 findings, 25 transitive - CVE Lite surfaces the one actionable direct fix |
| [OWASP Juice Shop](./owasp-juice-shop.md) | npm | Multiple critical/high direct findings with copy-and-run fix commands |
| [Payload CMS](./payload.md) | pnpm | TypeScript-first headless CMS — 2,602 packages, 1 direct finding, workspace-scoped remediation |
| [Presenton](./presenton.md) | npm (dual lockfile) | AI presentation generator — dual npm lockfiles (root + Electron), 9 findings, 5 fix groups |
| [Storybook](./storybook.md) | npm | Frontend tooling, large dependency graph |
| [Strapi](./strapi.md) | Yarn Berry | Headless CMS monorepo — 2,887 packages, 2 direct findings (`lodash`, `qs`), 15 transitive |
| [VS Code](./vscode.md) | npm | `@anthropic-ai/sdk@0.81/0.82` as direct Copilot dependencies |
| [Analog](./analog.md) | pnpm | Angular meta-framework monorepo, pnpm workspace scanning |
| [Astro](./astro.md) | pnpm | Large pnpm monorepo with verified baseline scan documentation |
| [LangChain.js](./langchainjs.md) | pnpm | LLM application framework monorepo — 2,174 packages, lean graph, 3 high with validated targets, malicious-package advisory on OpenSearch integration paths |
| [Mastra](./mastra.md) | pnpm | AI agent framework — 4,555 packages, 4 direct findings, workspace-scoped `pnpm add` |
| [n8n](./n8n.md) | pnpm | Workflow automation monorepo — 3,746 packages, 1 direct turbo fix, 4 command groups, 31 transitive |
| [OpenAI Agents SDK (JS)](./openai-agents-js.md) | pnpm | AI agent monorepo — 1,683 packages, 0 direct findings, 31 transitive, one verdaccio parent-upgrade command |
| [Turborepo](./turborepo.md) | pnpm | Monorepo build tooling, pnpm lockfile |
| [Vercel AI SDK](./vercel-ai-sdk.md) | pnpm | AI SDK monorepo — 3 direct findings, 5 workspace-scoped fix command groups |
| [Gatsby](./gatsby.md) | Yarn Classic | Large Yarn v1 monorepo — 3,568 packages, 128 findings, 5 direct |
| [Twenty](./twenty.md) | Yarn Berry | Open-source CRM — 5,451 packages, 105 findings, 0 direct, Nx orchestration layer |
