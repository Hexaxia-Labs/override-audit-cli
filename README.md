
[![OWASP Incubator Project](https://img.shields.io/badge/OWASP-Incubator%20Project-48A646?logo=owasp)](https://owasp.org/cve-lite-cli)
[![npm version](https://img.shields.io/npm/v/cve-lite-cli)](https://www.npmjs.com/package/cve-lite-cli)
[![npm downloads](https://img.shields.io/npm/dm/cve-lite-cli)](https://www.npmjs.com/package/cve-lite-cli)
[![CI](https://img.shields.io/github/actions/workflow/status/OWASP/cve-lite-cli/ci.yml?branch=main)](https://github.com/OWASP/cve-lite-cli/actions)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-CVE%20Lite%20CLI-blue)](https://github.com/marketplace/actions/cve-lite-cli)
[![License](https://img.shields.io/github/license/OWASP/cve-lite-cli)](https://github.com/OWASP/cve-lite-cli/blob/main/LICENSE)
[![Protected by CVE Lite CLI](https://img.shields.io/badge/Protected_by-CVE_Lite_CLI-brightgreen)](https://github.com/OWASP/cve-lite-cli)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12731/badge)](https://www.bestpractices.dev/projects/12731)

<div align="center">
  <a href="https://owasp.org/cve-lite-cli">
    <img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/logos-combined.svg" alt="CVE Lite CLI — An OWASP Foundation Project" width="500"/>
  </a>

  <h1>CVE Lite CLI</h1>

  **🏆 Officially recognized as an [OWASP Incubator Project](https://owasp.org/cve-lite-cli)**

  <p>Vulnerability scanning that belongs in your terminal — not your CI pipeline.<br/>Scan your lockfile, get copy-and-run fix commands, and ship clean code.</p>

  <strong>Scan. Understand. Fix.</strong>

  <br/>

  <table>
    <tr>
      <td align="center" width="33%"><p>🏆</p><strong>OWASP Incubator Project</strong><br/><sub>Peer-reviewed by the org behind the OWASP Top 10 —<br/>the security standard followed by millions of developers</sub></td>
      <td align="center" width="33%"><p>🎯</p><strong>Remediation-first</strong><br/><sub>Validated fix commands + parent-aware<br/>transitive guidance — not just CVE IDs</sub></td>
      <td align="center" width="33%"><p>🔒</p><strong>Runs locally</strong><br/><sub>Nothing leaves your machine — not your<br/>code, not your dependency tree</sub></td>
    </tr>
  </table>

  <br/>

  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#usage">Usage</a> •
    <a href="#what-it-looks-like">Screenshots</a> •
    <a href="https://owasp.org/cve-lite-cli/docs/html-report">HTML Report</a> •
    <a href="https://owasp.org/cve-lite-cli/docs/comparison">Compare</a> •
    <a href="https://owasp.org/cve-lite-cli/docs/roadmap">Roadmap</a> •
    <a href="https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/CONTRIBUTING.md">Contributing</a>  •
    <a href="https://owasp.org/slack/invite">Join Slack</a>
  </p>
</div>

---

<div align="center">

**Package Managers**

<table border="0" cellspacing="0" cellpadding="12">
<tr>
<td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/npm/npm-original-wordmark.svg" width="48" height="48" alt="npm"/><br/><sub><b>npm</b></sub></td>
<td align="center"><img src="https://cdn.simpleicons.org/pnpm" width="48" height="48" alt="pnpm"/><br/><sub><b>pnpm</b></sub></td>
<td align="center"><img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/yarn/yarn-original.svg" width="48" height="48" alt="Yarn"/><br/><sub><b>Yarn</b></sub></td>
<td align="center"><img src="https://cdn.simpleicons.org/bun" width="48" height="48" alt="Bun"/><br/><sub><b>Bun</b></sub></td>
</tr>
</table>

</div>

---

## The problem with how security scanning works today

Most security tooling is designed around pipelines, not people.

Dependabot files PRs you'll get to eventually. CI scanners block merges hours after the fact. Security dashboards surface a list of CVE IDs with no clear path to resolving them. By the time a developer is looking at a scan result, the code has already been reviewed and is waiting to ship.

The feedback loop is too slow to be useful, and too noisy to be trusted. Developers learn to ignore it.

There is also a more fundamental problem: these tools tell you what is vulnerable. Very few tell you what to actually do about it. The result is a gap between detection and remediation that security teams paper over with manual triage, and developers experience as alert fatigue.

## A different model

CVE Lite CLI is built around a different idea: **vulnerability scanning belongs at the developer's terminal, not at the end of a pipeline.**

It reads your lockfile locally, queries [OSV](https://osv.dev) for advisory data, and produces a concrete remediation plan — not a list of identifiers. You get copy-and-run `npm install`, `pnpm add`, `yarn add`, or `bun add` commands scoped to your package manager. You see exactly which packages are directly installed versus pulled in transitively. You can scan with no internet connection in restricted-network environments.

The tool is designed for the moment right before you push: fast, honest, and actionable.

## Quick start

```bash
npm install -g cve-lite-cli
cve-lite /path/to/project
```

Or one-off with `npx`:

```bash
npx cve-lite-cli /path/to/project
```

No account. No configuration. No source code leaves your machine.

## What it does

- **Produces copy-and-run fix commands** — every finding comes with a package-manager-aware install command you can run immediately
- **Distinguishes direct from transitive risk** — shows whether the vulnerability is in something you installed or buried three levels deep in a dependency chain
- **Explains parent update paths** — for transitive npm findings, recommends `npm update <parent>` when the current parent range can resolve a known non-vulnerable child, or a parent upgrade when the range itself must change
- **Usage-aware reachability** — optionally uses static analysis to detect whether vulnerable packages are actually imported in your code, cutting noise with `--usage` and `--only-used`
- **Offline advisory DB** — sync advisory data ahead of time and scan with zero runtime API calls, designed for enterprise and air-gapped environments
- **Interactive HTML report** — generate a self-contained dashboard with severity cards, a searchable findings table, and copy-ready fix commands (`--report`)
- **Auto-fix mode** — apply validated direct dependency fixes and rescan automatically (`--fix`)
- **CI-ready** — `--fail-on high` exits non-zero on findings at or above a severity threshold; a first-party [GitHub Action](https://github.com/marketplace/actions/cve-lite-cli) is available on the Marketplace; `--sarif` writes SARIF 2.1.0 output for direct upload to GitHub Code Scanning; `--cdx` writes a CycloneDX 1.4 SBOM for Dependency-Track and compliance artifacts; `--json` integrates with SIEM tools and dashboards
- **Minimal footprint** — four runtime dependencies, intentionally kept small for a security tool

## What it looks like

<table>
  <tr>
    <th align="center">Terminal output</th>
    <th align="center">HTML dashboard (<code>--report</code>)</th>
  </tr>
  <tr>
    <td align="center">
      <a href="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/default-output.png">
        <img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/default-output.png" alt="CVE Lite CLI terminal output" width="440"/>
      </a>
    </td>
    <td align="center">
      <a href="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/html-report-dashboard.png">
        <img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/html-report-dashboard.png" alt="CVE Lite CLI HTML dashboard" width="440"/>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><sub>Default scan output · <a href="https://owasp.org/cve-lite-cli/docs/reading-output">output guide</a></sub></td>
    <td align="center"><sub>Generated with <code>--report</code> · <a href="https://owasp.org/cve-lite-cli/docs/html-report">HTML report guide</a></sub></td>
  </tr>
</table>

<details>
<summary>Verbose terminal output — includes the full fix plan</summary>
<p align="center">
  <a href="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-1.png"><img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-1.png" alt="Verbose output part 1" width="280"/></a>
  <a href="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-2.png"><img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-2.png" alt="Verbose output part 2" width="280"/></a>
  <a href="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-3.png"><img src="https://raw.githubusercontent.com/OWASP/cve-lite-cli/main/assets/verbose-output-3.png" alt="Verbose output part 3" width="280"/></a>
</p>
</details>

## Workflow integration

CVE Lite CLI fits at every stage of the development workflow, not just CI.

**Local development** — run a scan before opening a PR. The default output is fast and minimal. `--verbose` adds the full fix plan with dependency paths and prioritized remediation commands. `--report` opens an interactive HTML dashboard.

**CI pipelines** — use `--fail-on high` to gate builds on severity. JSON output (`--json`) integrates with SIEM, dashboards, and custom automation. SARIF output (`--sarif`) writes a SARIF 2.1.0 file for direct upload to GitHub Code Scanning — findings appear in the Security tab and annotate PRs.

**Restricted and enterprise environments** — sync the advisory database ahead of time with `cve-lite advisories sync`, then scan offline with `--offline`. No runtime outbound calls during the scan. Syncing ~217,065 advisory records completes in under 9 seconds.

**GitHub Actions** — a first-party action is available on the Marketplace:

```yaml
- uses: OWASP/cve-lite-cli@v1
  with:
    verbose: "true"
    fail-on: high
    sarif: "true"

- name: Upload to GitHub Code Scanning
  uses: github/codeql-action/upload-sarif@v4
  if: always()
  with:
    sarif_file: ${{ github.workspace }}
```

> **Note:** `if: always()` is required on the upload step. Without it, the upload is skipped when `--fail-on` exits non-zero — losing your findings in Code Scanning exactly when they matter most.

CVE Lite CLI scans its own dependencies in CI. See [`self-scan.yml`](https://github.com/OWASP/cve-lite-cli/blob/main/.github/workflows/self-scan.yml).

For full CI patterns including offline workflows, git hooks, and scripted automation, see the [CI and Workflow Integration guide](https://owasp.org/cve-lite-cli/docs/ci-integration).

## How it compares

No other free tool combines all of the following: lockfile scanning across npm, pnpm, Yarn, and Bun; parent-aware transitive remediation that tells you which package to upgrade (not just which one is vulnerable); fix version validation before suggesting an upgrade; and a fully offline advisory DB for restricted environments.

| Capability | CVE Lite CLI | npm audit | OSV-Scanner | Snyk CLI | Socket CLI |
|---|:---:|:---:|:---:|:---:|:---:|
| JS/TS lockfile scanning | ✅ | ✅ | ✅ | ✅ | ✅ |
| npm + pnpm + Yarn + Bun support | ✅ | ❌ | ✅ | ✅ | ✅ |
| No account required | ✅ | ✅ | ✅ | ❌ | ❌ |
| Free to use | ✅ | ✅ | ✅ | ❌ | ❌ |
| Usage-aware reachability scanning | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Direct vs transitive visibility | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Copy-and-run fix commands | ✅ | ❌ | ❌ | ✅ | ⚠️ |
| Transitive parent update guidance | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ |
| Suggested remediation plan | ✅ | ❌ | ⚠️ | ✅ | ⚠️ |
| JSON output | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offline/local advisory DB | ✅ | ❌ | ⚠️ | ❌ | ❌ |

<sub>✅ = built-in strength · ⚠️ = partial or workflow-dependent · ❌ = not a core strength</sub>

The transitive parent guidance is a key difference: CVE Lite CLI avoids recommending direct installs for packages that are only present transitively. For npm lockfiles, it can identify when `npm update <parent>` is enough to re-resolve a known non-vulnerable child within the current parent range, and when the parent package itself needs an upgrade.

### About Socket CLI
Socket provides deep supply-chain analysis (malware, typosquatting, maintainer risk) but requires a paid account for full features. CVE Lite CLI remains one of the few fully free, offline, and account-free options with strong transitive analysis.

For detailed per-tool analysis, see [Comparison with other tools](https://owasp.org/cve-lite-cli/docs/comparison).

## Real-world validation

CVE Lite CLI has been evaluated against real open-source projects to verify that it surfaces meaningful issues — including non-obvious transitive vulnerabilities and complex upgrade paths — not just low-signal advisory matches.

- [OWASP Juice Shop](https://owasp.org/cve-lite-cli/docs/case-studies/owasp-juice-shop) — scanning a deliberately vulnerable application with known dependency issues
- [NestJS](https://owasp.org/cve-lite-cli/docs/case-studies/nestjs) — working through a real transitive dependency remediation sequence across a widely-used Node.js framework
- [Analog](https://owasp.org/cve-lite-cli/docs/case-studies/analog) — scanning a modern pnpm v9 Angular monorepo (3,367 packages) with unexpected toolchain vulnerabilities
- [Ghost](https://owasp.org/cve-lite-cli/docs/case-studies/ghost) — 26 vulnerable packages across 4,447 resolved in a professionally maintained CMS — every one transitive, including a critical XSS in the library responsible for making user content safe
- [Astro](https://owasp.org/cve-lite-cli/docs/case-studies/astro) — verified baseline scan of a modern pnpm monorepo (2,228 packages, 34 findings at revision `221bb4b`) with a critical transitive SDK chain and four generated fix command groups
- [Turborepo](https://owasp.org/cve-lite-cli/docs/case-studies/turborepo) — verified baseline scan of a build-system pnpm monorepo (1,776 packages, 13 findings at revision `c85d410`) with a critical no-fix sandbox beta, all-transitive risk, and zero auto-generated fix commands on this snapshot
- [Visual Studio Code](https://owasp.org/cve-lite-cli/docs/case-studies/vscode) — verified baseline scan of the VS Code root npm lockfile (1,374 packages, 9 findings at revision `bc678ca`) with two direct Anthropic SDK advisories, a high-severity gulp toolchain chain, and two generated fix command groups

In-repo lockfile fixtures for Astro, Turborepo, and Visual Studio Code live under [`examples/`](examples/readme.md) — clone the repo and scan immediately without downloading full upstream checkouts.

These are not demos. They are documented scans against real codebases with real findings, recorded before and after applying fix commands.

If you maintain an open-source JavaScript or TypeScript project and want CVE Lite CLI evaluated on it, open an issue and share the repository. Strong candidates may be turned into future public case studies.

## Press

- **[OWASP Adopts CVE Lite CLI to Boost Dependency Scanning](https://devops.com/owasp-adopts-cve-lite-cli-to-boost-dependency-scanning/)** — DevOps.com, May 2026
- **[CVE Lite CLI repère les dépendances à risque](https://www.lemondeinformatique.fr/actualites/lire-cve-lite-cli-repere-les-dependances-a-risque-100270.html)** — Le Monde Informatique (France), May 2026
- **[Lieferketten-Angriff: 5.500 GitHub-Repos in 6 Stunden kompromittiert](https://www.ad-hoc-news.de/wissenschaft/lieferketten-angriff-5-500-github-repos-in-6-stunden-kompromittiert/69418833)** — ad-hoc-news (Germany), May 2026 (references CVE Lite CLI)
- **[AIがコーディングを加速する中、CVE Lite CLIはセキュリティを意図的にAI無しに保つ](https://blackhatnews.tokyo/archives/104903)** — TokyoBlackHatNews (Japan), May 2026
- **[The postcss That Would Not Die, and How CVE Lite Ended My Override Grind](https://labs.hexaxia.tech/blog/hexops-cve-lite-integration/)** — Hexaxia Labs (Aaron Lamb), May 2026
- **[As AI speeds coding, CVE Lite CLI keeps security deliberately AI-free](https://www.csoonline.com/article/4176701/as-ai-speeds-coding-cve-lite-cli-keeps-security-deliberately-ai-free.html)** — CSO Online (Shweta Sharma), May 2026
- **[CVE Lite CLI: The Dependency Scanner That Actually Tells You What to Run](https://medium.com/@techlatest.net/cve-lite-cli-the-dependency-scanner-that-actually-tells-you-what-to-run-not-just-whats-broken-f6b518199981)** — Medium (TechLatest.Net), May 2026
- **[AI Security Is Changing Fast — These 6 Open-Source Tools Prove It](https://medium.com/@techlatest.net/ai-security-is-changing-fast-these-6-open-source-tools-prove-it-5c5c9081cff7)** — Medium (TechLatest.Net), May 2026
- **[Hottest cybersecurity open-source tools of the month: May 2026](https://www.helpnetsecurity.com/2026/05/28/hottest-cybersecurity-open-source-tools-of-the-month-may-2026/)** — Help Net Security Monthly Roundup, May 2026
- **[CVE Lite CLI: Open-source dependency vulnerability scanner](https://www.helpnetsecurity.com/2026/05/20/cve-lite-cli-open-source-dependency-vulnerability-scanner/)** — Help Net Security, May 2026
- **[Review of CVE Lite CLI](https://developmentcurated.com/testing-and-security/review-of-cve-lite-cli/)** — Development Curated (Sebastian Raiffen, IT Security Consultant), April 2026

## Recognized by OWASP

OWASP (Open Web Application Security Project) is the globally recognized nonprofit behind the security standards followed by millions of developers worldwide — most notably the [OWASP Top 10](https://owasp.org/www-project-top-ten/), the most widely cited web application security reference in the industry. Organizations from startups to Fortune 500 companies use OWASP guidelines as the foundation of their security programs.

CVE Lite CLI is an [OWASP Incubator Project](https://owasp.org/cve-lite-cli) — reviewed and accepted by the OWASP community as a vendor-neutral, open source security tool. Being part of OWASP means:

- **Peer-reviewed** by security professionals
- **Community-driven** development and governance
- **Vendor-neutral** with no commercial platform required
- **Open source** with transparent security practices and a minimal dependency footprint

**Where it fits in the OWASP ecosystem:**

CVE Lite CLI fills a specific gap — fast, local-first JS/TS dependency scanning close to release time — that broader OWASP tools are not optimized for:

| Tool | Focus |
|---|---|
| CVE Lite CLI | Lockfile-first, local developer CLI, remediation-focused, JS/TS |
| OWASP Dependency-Check | Multi-language, SAST-style, broader ecosystem |
| OWASP dep-scan | Multi-language and environment, SBOM and cloud-native |
| OWASP Dependency-Track | Platform and SBOM management, not a local CLI |

CVE Lite CLI complements these tools. It is not a replacement for continuous monitoring or full SBOM management — it is the fast local check you run before pushing.

## Philosophy

Security tooling has optimized heavily for breadth of detection and compliance reporting. That is useful at the platform level. It is the wrong model for the individual developer trying to ship clean code before end of day.

Detection without remediation creates work without resolution. A vulnerability report that ends with a list of CVE IDs shifts the burden entirely onto the developer: look up each advisory, figure out which version is safe, work out whether it is a direct or transitive dependency, and construct the right install command by hand. That friction is why security findings go unresolved.

CVE Lite CLI is built on the premise that **the closer a security tool is to the developer's natural workflow, the more likely it is to be used** — and that a tool that surfaces a problem alongside the fix is more valuable than one that only surfaces the problem.

## What's next

The CLI is the foundation. The model — local-first, actionable, developer-native — extends naturally beyond the terminal.

JSON and SARIF outputs make findings consumable by editors, dashboards, and automated workflows today. The next phase of the project is oriented around tighter developer integration: surfacing vulnerabilities at the point of dependency installation, not just at scan time; deeper IDE integration; and team-level visibility without requiring a cloud platform.

See the [Roadmap](https://owasp.org/cve-lite-cli/docs/roadmap) for the current plan.

## Usage

```bash
# Basic scan
cve-lite /path/to/project

# Show all findings
cve-lite /path/to/project --all

# Focus on urgent findings only
cve-lite /path/to/project --min-severity high

# Full output: fix plan, paths, and complete table
cve-lite /path/to/project --verbose

# Apply validated direct dependency fixes and rescan
cve-lite /path/to/project --fix

# Production dependencies only (where supported by the lockfile)
cve-lite /path/to/project --prod-only

# Fail a build on high severity and above
cve-lite /path/to/project --fail-on high

# JSON output
cve-lite /path/to/project --json

# SARIF output for GitHub Code Scanning and other SARIF-compatible tools
cve-lite /path/to/project --sarif

# Generate an HTML vulnerability dashboard (opens in browser automatically)
cve-lite /path/to/project --report
cve-lite /path/to/project --report ./my-report --no-open

# Scan project source files to check if vulnerable dependencies are actually imported
cve-lite /path/to/project --usage

# Filter out noise by only showing vulnerabilities in packages that are imported in your source code
cve-lite /path/to/project --usage --only-used

# Sync the local advisory DB for offline scans
cve-lite advisories sync

# Scan with zero runtime advisory API calls
cve-lite /path/to/project --offline

# Use a specific local advisory DB file
cve-lite /path/to/project --offline-db /path/to/advisories.db

# Use a custom advisory endpoint
cve-lite /path/to/project --osv-url https://security.company.internal/osv

# Show version
cve-lite --version

# Install AI assistant skill files for Claude Code, Codex CLI, Gemini CLI, Cursor, and GitHub Copilot
cve-lite install-skill
```

### Why is `--usage` an opt-in flag?

CVE Lite CLI is designed to be fast. Scanning a lockfile is nearly instantaneous, whereas running static reachability analysis across thousands of source files takes significantly more time. Static analysis can also produce false negatives when packages are used in build scripts or dynamically imported at runtime. Making `--usage` opt-in ensures the default lockfile scan remains instant and strictly reflects your dependency graph, while giving you the option to aggressively filter out unreachable noise when triaging findings.

## Auto-fix mode (`--fix`)

`--fix` applies validated direct dependency fixes using your project's package manager, then rescans automatically.

In the current version it:
- applies only direct dependency fixes with a validated lowest known non-vulnerable target
- uses `npm install`, `pnpm add`, `yarn add`, or `bun add` based on your lockfile
- rescans automatically after applying fixes
- does **not** auto-apply transitive overrides or guarantee application compatibility

```bash
npx cve-lite-cli /path/to/project --fix
```

See the [Fix mode guide](https://owasp.org/cve-lite-cli/docs/fix-mode) for output details and interpretation.

For a deeper explanation of how the CLI chooses direct upgrades, parent upgrades, and npm `update` recommendations for transitive findings, see the [Remediation Strategy guide](https://owasp.org/cve-lite-cli/docs/remediation-strategy).

## AI assistant integration (`install-skill`)

CVE Lite CLI can teach your AI coding assistant how to analyze scan results and produce a prioritized remediation plan. Run this once in your project root:

```bash
cve-lite install-skill
```

This writes skill files for Claude Code, Codex CLI, Gemini CLI, Cursor, and GitHub Copilot into the current directory. Commit them so every developer on your team gets the context automatically.

Once installed, the workflow is:

```bash
# 1. Scan and save results to a JSON file
cve-lite . --json

# 2. Ask your AI assistant to analyze findings
# In Claude Code: /cve-lite
# In other tools: the skill is picked up automatically
```

The AI assistant reads the JSON output, prioritizes findings by severity and relationship, checks whether vulnerable packages are actually imported in your source code, and produces a concrete remediation plan with the exact commands to run.

See the [AI Assistant Integration guide](https://owasp.org/cve-lite-cli/docs/ai-assistant-integration) for the full workflow and what the skill teaches the assistant.

## HTML vulnerability report (`--report`)

Generate a self-contained HTML dashboard from any scan — severity cards, an interactive findings table with search, copy-ready fix commands, and breaking-change indicators on upgrades — all written to a local directory and opened automatically in your browser.

```bash
cve-lite /path/to/project --report
cve-lite /path/to/project --report ./my-report --no-open
```

See the [HTML Report guide](https://owasp.org/cve-lite-cli/docs/html-report) for the full option reference and output details.

## Offline support

For teams in enterprise, restricted-network, or air-gapped environments:

```bash
# Sync advisory data locally
cve-lite advisories sync

# Scan with no runtime API calls
cve-lite . --offline
```

Syncing ~217,065 advisory records runs in under 9 seconds after bulk SQLite ingestion optimizations — roughly **9.9x faster** than the initial implementation.

See the [Offline Advisory DB guide](https://owasp.org/cve-lite-cli/docs/offline-advisory-db) for the full workflow including CI, scheduled refresh, and controlled-network patterns.

## Who uses it

CVE Lite CLI is the only free, OWASP-recognized vulnerability scanner purpose-built for JavaScript and TypeScript that combines validated fix commands, parent-aware transitive remediation, and offline scanning in a single lightweight CLI.

It is a good fit for:

- **Independent developers and OSS maintainers** — quick pre-release check without any platform overhead or cost
- **Startups and small teams** — lightweight CI gate at no cost, with fix commands ready to run immediately
- **Consultants** — scan a client project in seconds and hand over a concrete, copy-and-run remediation plan
- **Enterprise teams with restricted networks** — offline advisory DB removes the need for runtime outbound calls during scans
- **Teams running npm, pnpm, Yarn, and Bun** — unified scanning across all four package managers in one tool

See the [CI and Workflow Integration guide](https://owasp.org/cve-lite-cli/docs/ci-integration) for concrete patterns across these scenarios.

Using CVE Lite CLI at your company or in your projects? [Share your use case in the community thread](https://github.com/OWASP/cve-lite-cli/discussions/481) - we'd love to hear about it.

## Current limitations

- does not detect malicious packages before they appear in advisory data
- does not perform behavioral malware detection or package content analysis
- does not prove exploitability or verify runtime reachability
- does not scan container images, binaries, secrets, or IaC
- does not replace a full application security program
- currently focused on JS/TS dependency scanning
- local advisory sync performance will need continued optimization as the advisory dataset grows

## Dependency footprint

**Runtime:** `yaml` · `yarn-lockfile` · `better-sqlite3` · `fflate`

**Dev only:** `@types/node` · `tsx` · `typescript`

This is intentional. Because CVE Lite CLI is a security-oriented tool, runtime dependencies are kept minimal and reviewable.

## Roadmap

See the [Roadmap](https://owasp.org/cve-lite-cli/docs/roadmap) for the full plan. Phases 1 and 2 are complete. Phase 3 (ecosystem coverage: Bun, Deno, parser improvements) is in progress.

## Troubleshooting

See the [Troubleshooting guide](https://owasp.org/cve-lite-cli/docs/troubleshooting) for common issues: no lockfile found, zero results, slow advisory sync, offline DB errors, `--fix` skipping findings, and CI failures.

## Parser coverage

See the [Parser Coverage guide](https://owasp.org/cve-lite-cli/docs/parser-coverage) for supported lockfile formats, selection priority, the `package.json` fallback, and known edge cases including monorepos and private registries.

See the [Remediation Strategy guide](https://owasp.org/cve-lite-cli/docs/remediation-strategy) for how CVE Lite CLI chooses package upgrade targets and parent update paths.

## Website

The public documentation site is published at [owasp.org/cve-lite-cli](https://owasp.org/cve-lite-cli/) and is built with Docusaurus from [`website/`](website/). All public guides and case studies live under [`website/docs/`](website/docs/) — that folder is the single source of truth for user-facing documentation.

```bash
cd website
npm install
npm run build
```

## Governance

CVE Lite CLI is an OWASP Incubator Project maintained by Sonu Kapoor as project lead. The project follows a single-maintainer (benevolent dictator) governance model. The project lead makes final decisions on scope, design direction, and releases after considering input from contributors and the wider community.

### Roles

- **Project lead** — currently Sonu Kapoor. Owns the roadmap, sets release cadence, reviews and merges pull requests, and acts as the OWASP project leader for the Foundation.
- **Contributors** — anyone who opens an issue, proposes a pull request, or improves the documentation. No prior commit history is required to contribute, and contributions are welcome from outside OWASP.

### Decision-making

- Significant changes (new features, breaking changes, scope decisions) start as a GitHub issue so the design can be discussed in public before code is written.
- Pull requests are reviewed by the project lead. Small fixes can land directly. Larger changes may require revision or follow-up issues.
- Releases are cut by the project lead when accumulated changes warrant a version bump, following the process in [CONTRIBUTING.md](https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/CONTRIBUTING.md).

### Dispute resolution

Technical disagreements are resolved by the project lead after weighing contributor input. Disputes that relate to community standards or [Code of Conduct](https://github.com/OWASP/cve-lite-cli/blob/main/CODE_OF_CONDUCT.md) enforcement can be escalated to the OWASP Foundation, which acts as a backstop for the project's community norms.

This governance model may evolve as the contributor base grows. Any change to the model will be documented here and announced via the GitHub repository.

## Security and verification

CVE Lite CLI signs both the source code release and the build artifact for each release. Either signature is sufficient on its own.

**Source code (signed git tags).** Starting with releases after v1.12.1, every release tag is a GPG-signed annotated tag. The project lead's public key is published at [`https://github.com/sonukapoor.gpg`](https://github.com/sonukapoor.gpg). The private key is held only on the project lead's local machine — not on GitHub, not on the npm registry, not in CI. Verify with:

```bash
curl -sSL https://github.com/sonukapoor.gpg | gpg --import
git tag -v vX.Y.Z
```

**Release tarball (Sigstore Artifact Attestations).** Each GitHub release attaches an `cve-lite-cli-X.Y.Z.tgz` asset signed at build time via [GitHub Artifact Attestations](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds). The signing keys are ephemeral OIDC-issued keys generated per build, providing SLSA Level 2 equivalent build provenance. Verify with:

```bash
gh attestation verify cve-lite-cli-X.Y.Z.tgz --repo OWASP/cve-lite-cli
```

**npm-installed package.** The npm registry adds an ECDSA signature to every published package, independent of the project's own signing keys above:

```bash
npm audit signatures
```

For full verification details, fingerprints, and security issue reports, see [SECURITY.md](https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/SECURITY.md). For the project's threat model, trust boundaries, and how common implementation weaknesses are countered, see the [Security Assurance Case](https://owasp.org/cve-lite-cli/docs/security-assurance-case).

## Contributing

Feedback on output clarity, remediation guidance, ecosystem coverage, and CI usage is especially valuable.

See [CONTRIBUTING.md](https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/CONTRIBUTING.md) to get started.

## Add a badge to your project

If you use CVE Lite CLI in your project, add this badge to your README:

```markdown
[![Protected by CVE Lite CLI](https://img.shields.io/badge/Protected_by-CVE_Lite_CLI-brightgreen)](https://github.com/OWASP/cve-lite-cli)
```

[![Protected by CVE Lite CLI](https://img.shields.io/badge/Protected_by-CVE_Lite_CLI-brightgreen)](https://github.com/OWASP/cve-lite-cli)

## Community and support

For bug reports and feature requests: [GitHub Issues](https://github.com/OWASP/cve-lite-cli/issues)

Helpful feedback includes reproducible bug reports, real-world lockfile edge cases, ideas for clearer output and remediation guidance, and CI or JSON workflow examples.

For security-related reporting: [SECURITY.md](https://github.com/OWASP/cve-lite-cli/blob/main/src/docs/SECURITY.md)

This project follows a [Code of Conduct](https://github.com/OWASP/cve-lite-cli/blob/main/CODE_OF_CONDUCT.md). Please review it before participating.

If CVE Lite CLI helps your release workflow, a [GitHub star](https://github.com/OWASP/cve-lite-cli) helps more developers find it.

---

*Most tools tell you what's wrong. CVE Lite CLI tells you what to run.*

## License

MIT — built in public and maintained as an OWASP Foundation Project by Sonu Kapoor.
