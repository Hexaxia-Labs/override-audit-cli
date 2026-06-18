# Vulnerable Examples

These example projects are intentionally vulnerable. They exist to test and demonstrate CVE Lite CLI behavior across common dependency-risk scenarios.

Do not use these projects as application starter templates.

## In-repo fixtures

Small curated projects committed to the repository. Clone the repo and scan immediately.

| Folder | Package Manager | Purpose |
|---|---|---|
| `direct-fixable` | npm | Direct vulnerability with a clear upgrade command available. |
| `transitive-path-high` | npm | High-severity transitive dependency path detection. |
| `transitive-only` | npm | Transitive-only vulnerabilities — no directly vulnerable deps. |
| `direct-and-transitive` | npm | Mixed direct and transitive vulnerability output. |
| `deep-chain-no-fix` | npm | 3-level chain where the intermediate parent range does not cover the fix — expects a parent upgrade, not `npm update`. |
| `down-grade` | npm | Advisory where the raw OSV hint is lower than the installed version. |
| `workspace` | npm (workspace) | npm workspace hoisting and multi-package scanning. |
| `yarn-berry` | Yarn Berry (v2+) | Yarn Berry lockfile format parsing (`__metadata:` block). |
| `yarn-classic` | Yarn Classic (v1) | Yarn v1 lockfile format with direct and transitive vulnerabilities. |
| `yarn-within-range` | Yarn Classic (v1) | Deep transitive chain where the parent's range already covers the fix; suggests `yarn upgrade <package>`. |
| `bun-simple` | Bun | Minimal Bun lockfile with a direct and transitive vulnerability. |
| `bun-within-range` | Bun | Transitive follow-redirects fix within axios range — suggests `bun update follow-redirects`. |
| `bun-workspace` | Bun (workspace) | Bun workspace monorepo with workspace-scoped fix commands. |
| `pnpm-simple` | pnpm | Minimal pnpm v9 lockfile with a single direct vulnerability. |
| `pnpm-within-range` | pnpm | Transitive `qs` via `body-parser` where the parent range already covers the fix — expects `pnpm update qs`, not a parent bump. |
| `pnpm-aliased-chain` | pnpm | Deep transitive chain through a pnpm v9 aliased intermediate — path resolution must use the real package name. |
| `pnpm-workspace` | pnpm (workspace) | pnpm workspace monorepo with workspace-scoped fix commands. |
| `wrong-parent` | npm | 3-level transitive chain where the immediate parent's range already covers the fix — expects `npm update js-cookie`, not a parent bump. |
| `no-findings` | npm | Clean project with no known vulnerabilities — demonstrates success output. |
| `dev-only-finding` | npm | Vulnerable package that only appears in devDependencies — classified as a direct finding in full scans and excluded by `--prod-only`. |
| `any fixture` + `.cve-lite/baseline.json` | any | Run `cve-lite . --ratchet` on any fixture to establish a baseline. Rescan without the flag to see only new findings. `.cve-lite/` directories should NOT be committed from example fixtures. |
| `mal-private-registry` | npm | `node-ipc@9.2.3` with `resolved` pointing to a private registry — demonstrates `Unverifiable (private source)` output for MAL- advisories where the artifact origin cannot be confirmed. |
| `pnpm-mal-private-registry` | pnpm v9 | `node-ipc@9.2.3` resolved from a private registry — demonstrates `Unverifiable (private source)` detection for pnpm v9 lockfiles. |
| `pnpm-legacy-mal-private-registry` | pnpm legacy (v6) | `node-ipc@9.2.3` resolved from a private registry — demonstrates `Unverifiable (private source)` detection for pnpm v6/v7/v8 lockfiles. |
| `yarn-classic-mal-private-registry` | Yarn Classic (v1) | `node-ipc@9.2.3` resolved from a private registry — demonstrates `Unverifiable (private source)` detection for Yarn Classic lockfiles. |
| `bun-mal-private-registry` | Bun | `node-ipc@9.2.3` resolved from a private registry — demonstrates `Unverifiable (private source)` detection for Bun lockfiles. |
| `git-source-mal` | npm | `node-ipc@9.2.3` resolved from a git source URL pinned to a commit SHA — demonstrates `Git source (SHA-pinned)` badge for MAL- advisories where the package originates from a git repository rather than the npm registry. |
| `lima-site` | npm | Dev-dependency scanning in a documentation site. |

## In-repo snapshot: Astro

Lockfile-only snapshot from [withastro/astro](https://github.com/withastro/astro) at revision `221bb4b36831f3fc278f05dc40a7498abb864ddf`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. [Case study](../website/docs/case-studies/astro.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `astro` | pnpm | https://github.com/withastro/astro | Modern content/meta-framework monorepo — 2,228 packages, 34 findings. |

## In-repo snapshot: Turborepo

Lockfile-only snapshot from [vercel/turborepo](https://github.com/vercel/turborepo) at revision `c85d4104bdc18df051334210d29c49353c46facf`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. [Case study](../website/docs/case-studies/turborepo.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `turborepo` | pnpm | https://github.com/vercel/turborepo | Monorepo build-system toolchain — 1,776 packages, 13 findings. |

## In-repo snapshot: Visual Studio Code

Lockfile-only snapshot from [microsoft/vscode](https://github.com/microsoft/vscode) at revision `bc678cad02f18de3e2b6bf72a8259e9fb322cdfc`. Commits root `package.json` and `package-lock.json` only — no application source. Scan scope is the root lockfile, not nested folders under `build/` or `extensions/`. [Case study](../website/docs/case-studies/vscode.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `vscode` | npm | https://github.com/microsoft/vscode | Developer-tool root lockfile — 1,374 packages, 9 findings (2 direct). |

## In-repo snapshot: Gatsby

Lockfile-only snapshot from [gatsbyjs/gatsby](https://github.com/gatsbyjs/gatsby) at revision `1f38c85963fd6bcfa9ccee2f925e5e02b00eafbb`. Commits `package.json` and `yarn.lock` only — no application source. [Case study](../website/docs/case-studies/gatsby.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `gatsby` | Yarn Classic | https://github.com/gatsbyjs/gatsby | Large Yarn v1 monorepo — 3,568 packages, 128 findings (5 direct). |

## In-repo snapshot: Vercel AI SDK

Lockfile-only snapshot from [vercel/ai](https://github.com/vercel/ai) at revision `3215032043569f75a97fadf2b08aa38f11b011af`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. Distinct from the [Turborepo](https://github.com/vercel/turborepo) snapshot already in this repo. [Case study](../website/docs/case-studies/vercel-ai-sdk.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `vercel-ai-sdk` | pnpm | https://github.com/vercel/ai | AI SDK monorepo — 3,570 packages, 55 findings (3 direct). |

## In-repo snapshot: Mastra

Lockfile-only snapshot from [mastra-ai/mastra](https://github.com/mastra-ai/mastra) at revision `e9d54b281667477dd97b9dfc166b338f6d097fe8`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. Largest in-repo fixture by resolved package count. [Case study](../website/docs/case-studies/mastra.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `mastra` | pnpm | https://github.com/mastra-ai/mastra | AI agent framework monorepo — 4,555 packages, 64 findings (4 direct). |

## In-repo snapshot: Lit

Lockfile-only snapshot from [lit/lit](https://github.com/lit/lit) at revision `20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6`. Commits `package.json` and `package-lock.json` only — no application source. [Case study](../website/docs/case-studies/lit.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `lit` | npm (workspaces) | https://github.com/lit/lit | Web components monorepo — 2,059 packages, 99 findings (3 direct rollup). |

## In-repo snapshot: LangChain.js

Lockfile-only snapshot from [langchain-ai/langchainjs](https://github.com/langchain-ai/langchainjs) at revision `1503c9beaa6a578f6a30739b2cfc1af9d18dd805`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. [Case study](../website/docs/case-studies/langchainjs.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `langchainjs` | pnpm | https://github.com/langchain-ai/langchainjs | LLM application framework monorepo — 2,174 packages, 13 findings (lean graph, 3 high). |

## In-repo snapshot: OpenAI Agents SDK (JavaScript)

Lockfile-only snapshot from [openai/openai-agents-js](https://github.com/openai/openai-agents-js) at revision `f76fc19fba03dfbecf34ffd92302543b3b1d4890`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. [Case study](../website/docs/case-studies/openai-agents-js.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `openai-agents-js` | pnpm | https://github.com/openai/openai-agents-js | OpenAI Agents SDK monorepo — 1,683 packages, 31 findings (0 direct, transitive parent tracing). |

## In-repo snapshot: n8n

Lockfile-only snapshot from [n8n-io/n8n](https://github.com/n8n-io/n8n) at revision `e2e03948562e1c744be4ef7898b3b754fbdb6cf9`. Commits `package.json` and `pnpm-lock.yaml` only — no application source. [Case study](../website/docs/case-studies/n8n.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `n8n` | pnpm | https://github.com/n8n-io/n8n | Workflow automation monorepo — 3,746 packages, 32 findings (1 direct turbo, 31 transitive). |

## In-repo snapshot: CamoFox Browser

Lockfile-only snapshot from [jo-inc/camofox-browser](https://github.com/jo-inc/camofox-browser) at revision `ce3a3b085aacba73eb8de6c51733c19fb13bfae4`. Commits `package.json` and `package-lock.json` only — no application source. [Case study](../website/docs/case-studies/camofox-browser.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `camofox-browser` | npm | https://github.com/jo-inc/camofox-browser | AI agent browser automation — 435 packages, 2 findings (dual `qs` within-range + parent-upgrade fixes). |

## In-repo snapshot: Storybook

Lockfile-only snapshot from [storybookjs/storybook](https://github.com/storybookjs/storybook) at revision `cc19ae1a2145e8f7cda8dc869f1b90d5346dcedb`. Commits `package.json` and `yarn.lock` only — no application source. [Case study](../website/docs/case-studies/storybook.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `storybook` | Yarn Berry | https://github.com/storybookjs/storybook | Cross-framework UI tooling monorepo — 3,008 packages, 92 findings. |

## In-repo snapshot: Twenty

Lockfile-only snapshot from [twentyhq/twenty](https://github.com/twentyhq/twenty) at revision `fc90b4ba8bb0a5d7c12c846fe9b2305527a0f7a8`. Commits `package.json` and `yarn.lock` only — no application source. [Case study](../website/docs/case-studies/twenty.md).

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `twenty` | Yarn Berry | https://github.com/twentyhq/twenty | Open-source CRM Nx monorepo — 5,451 packages, 105 findings (0 direct). |

## Local-only examples

Full project clones used for real-world testing. Not committed to this repo — clone each separately into `examples/` for local use.

| Folder | Package Manager | Source | Purpose |
|---|---|---|---|
| `analog` | pnpm | https://github.com/analogjs/analog | pnpm lockfile parsing across a real-world Angular monorepo. |
| `nest` | npm | https://github.com/nestjs/nest | Real-world npm monorepo with transitive vulnerability chains. |
| `lint-staged` | npm | https://github.com/lint-staged/lint-staged | Real-world npm project for transitive CVE detection. |
| `juice-shop` | npm | https://github.com/juice-shop/juice-shop | Large real-world project (OWASP Juice Shop) with broad vulnerability surface. |
| `ghost` | pnpm | https://github.com/TryGhost/Ghost | Professional publishing platform — 26 transitive vulnerabilities in 4,447 packages including critical XSS in sanitize-html. |
| `prisma` | pnpm | https://github.com/prisma/prisma | TypeScript ORM — real-world pnpm monorepo scan. |
| `strapi` | Yarn Berry | https://github.com/strapi/strapi | Headless CMS monorepo — 2,887 packages, 2 direct findings (`lodash`, `qs`). |
| `payload` | pnpm | https://github.com/payloadcms/payload | TypeScript-first headless CMS — 2,602 packages, 1 direct finding, workspace-scoped remediation. |
| `presenton` | npm (dual) | https://github.com/presenton/presenton | AI presentation generator — dual lockfiles (root + Electron), 9 findings. |

## Usage

From the repository root:

```bash
# In-repo fixtures
node dist/index.js examples/direct-fixable --verbose
node dist/index.js examples/transitive-path-high --verbose
node dist/index.js examples/transitive-only --verbose
node dist/index.js examples/direct-and-transitive --verbose
node dist/index.js examples/deep-chain-no-fix --verbose
node dist/index.js examples/workspace --verbose
node dist/index.js examples/yarn-berry --verbose
node dist/index.js examples/yarn-classic --verbose
node dist/index.js examples/yarn-within-range --verbose
node dist/index.js examples/bun-simple --verbose
node dist/index.js examples/bun-within-range --verbose
node dist/index.js examples/bun-workspace --verbose
node dist/index.js examples/pnpm-simple --verbose
node dist/index.js examples/pnpm-within-range --verbose
node dist/index.js examples/pnpm-aliased-chain --verbose
node dist/index.js examples/pnpm-workspace --verbose
node dist/index.js examples/wrong-parent --verbose
node dist/index.js examples/no-findings
node dist/index.js examples/dev-only-finding --verbose
node dist/index.js examples/dev-only-finding --verbose --prod-only
node dist/index.js examples/lima-site --verbose

# In-repo snapshot: Astro
node dist/index.js examples/astro --verbose --all

# In-repo snapshot: Turborepo
node dist/index.js examples/turborepo --verbose --all

# In-repo snapshot: Visual Studio Code
node dist/index.js examples/vscode --verbose --all

# In-repo snapshot: Gatsby
node dist/index.js examples/gatsby --verbose --all

# In-repo snapshot: Vercel AI SDK
node dist/index.js examples/vercel-ai-sdk --verbose --all

# In-repo snapshot: Mastra
node dist/index.js examples/mastra --verbose --all

# In-repo snapshot: Lit
node dist/index.js examples/lit --verbose --all

# In-repo snapshot: LangChain.js
node dist/index.js examples/langchainjs --verbose --all

# In-repo snapshot: OpenAI Agents SDK (JavaScript)
node dist/index.js examples/openai-agents-js --verbose --all

# In-repo snapshot: n8n
node dist/index.js examples/n8n --verbose --all

# In-repo snapshot: CamoFox Browser
node dist/index.js examples/camofox-browser --verbose --all

# In-repo snapshot: Storybook
node dist/index.js examples/storybook --verbose --all

# In-repo snapshot: Twenty
node dist/index.js examples/twenty --verbose --all

# Local-only (clone first)
node dist/index.js examples/analog --verbose
node dist/index.js examples/nest --verbose
node dist/index.js examples/lint-staged --verbose
node dist/index.js examples/juice-shop --verbose
node dist/index.js examples/ghost --verbose
node dist/index.js examples/prisma --verbose
node dist/index.js examples/strapi --verbose
```
