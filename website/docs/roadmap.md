# Roadmap

CVE Lite CLI is evolving from a vulnerability scanner into a more capable remediation-focused developer tool.

## Phase 1: Advanced Remediation Intelligence (Completed)

Phase 1 established the current remediation-oriented foundation of the project.

**Delivered:**

- **Executable direct fix guidance** — the CLI generates copy-and-run remediation commands for supported direct dependency fixes.
- **Transitive dependency path visibility** — the output surfaces dependency paths and parent-upgrade guidance for transitive findings.
- **Conservative direct remediation workflow** — `--fix` applies validated direct dependency upgrades and rescans immediately.

---

## Phase 2: Workflow & Integration (Completed)

Phase 2 expanded the project beyond the core scan-and-fix loop into practical CI and controlled-environment workflows.

**Delivered:**

- **Offline advisory DB workflow** — teams can sync advisories ahead of time and run scans with zero runtime advisory API calls.
- **Workflow integration guidance** — guidance for local scripts, CI usage, offline adoption, and controlled-network environments.
- **First-party GitHub Action** — CVE Lite CLI ships with a reusable GitHub Action and published [Marketplace listing](https://github.com/marketplace/actions/cve-lite-cli) for low-friction CI adoption.

---

## Phase 3: Ecosystem Coverage (In Progress)

- **Expanded lockfile support** — introduce parsers for emerging ecosystems, including `bun.lockb` and `deno.lock`.
- **Parser depth and edge cases** — continue improving lockfile compatibility and real-world edge-case handling across supported package managers.
- **Usage-aware triage research** — explore optional usage evidence hints that help developers prioritize vulnerable dependencies without claiming exploitability proof.

---

## Phase 4: Developer Experience (Future)

- **IDE integration** — develop a lightweight extension to highlight vulnerable packages directly within the code editor.
- **Standardized SBOM support** — add the ability to export findings as an SBOM in CycloneDX or SPDX formats.
- **Community plugin system** — decouple the scanner logic to allow community-contributed data sources and custom security rules.

---

Have ideas for the roadmap? [Open an issue](https://github.com/sonukapoor/cve-lite-cli/issues) with your feedback — especially around output clarity, ecosystem coverage, remediation guidance, and CI usage.
