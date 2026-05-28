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
| `down-grade` | npm | Advisory where the raw OSV hint is lower than the installed version. |
| `workspace` | npm (workspace) | npm workspace hoisting and multi-package scanning. |
| `yarn-berry` | Yarn Berry (v2+) | Yarn Berry lockfile format parsing (`__metadata:` block). |
| `yarn-classic` | Yarn Classic (v1) | Yarn v1 lockfile format with direct and transitive vulnerabilities. |
| `bun-simple` | Bun | Minimal Bun lockfile with a direct and transitive vulnerability. |
| `bun-workspace` | Bun (workspace) | Bun workspace monorepo with workspace-scoped fix commands. |
| `pnpm-simple` | pnpm | Minimal pnpm v9 lockfile with a single direct vulnerability. |
| `pnpm-workspace` | pnpm (workspace) | pnpm workspace monorepo with workspace-scoped fix commands. |
| `no-findings` | npm | Clean project with no known vulnerabilities — demonstrates success output. |
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
| `strapi` | yarn | https://github.com/strapi/strapi | Headless CMS — real-world Yarn lockfile scan. |

## Usage

From the repository root:

```bash
# In-repo fixtures
node dist/index.js examples/direct-fixable --verbose
node dist/index.js examples/transitive-path-high --verbose
node dist/index.js examples/transitive-only --verbose
node dist/index.js examples/direct-and-transitive --verbose
node dist/index.js examples/workspace --verbose
node dist/index.js examples/yarn-berry --verbose
node dist/index.js examples/yarn-classic --verbose
node dist/index.js examples/bun-simple --verbose
node dist/index.js examples/bun-workspace --verbose
node dist/index.js examples/pnpm-simple --verbose
node dist/index.js examples/pnpm-workspace --verbose
node dist/index.js examples/no-findings
node dist/index.js examples/lima-site --verbose

# In-repo snapshot: Astro
node dist/index.js examples/astro --verbose --all

# In-repo snapshot: Turborepo
node dist/index.js examples/turborepo --verbose --all

# In-repo snapshot: Visual Studio Code
node dist/index.js examples/vscode --verbose --all

# Local-only (clone first)
node dist/index.js examples/analog --verbose
node dist/index.js examples/nest --verbose
node dist/index.js examples/lint-staged --verbose
node dist/index.js examples/juice-shop --verbose
node dist/index.js examples/ghost --verbose
node dist/index.js examples/prisma --verbose
node dist/index.js examples/strapi --verbose
```
