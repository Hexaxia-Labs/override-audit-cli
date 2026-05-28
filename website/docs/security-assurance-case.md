# Security Assurance Case

This page is the project's assurance case: a single, honest argument for why CVE Lite CLI's security properties are credible. It is intentionally not exhaustive — it covers the threats the project takes seriously, the boundaries data crosses, the design principles applied, and the implementation weaknesses actively countered.

The audience is security engineers, OWASP and OpenSSF reviewers, and contributors who want to understand the project's security posture before adopting or extending it.

## Contents

- [Executive summary](#executive-summary)
- [Threat model](#threat-model)
- [Trust boundaries](#trust-boundaries)
- [Secure design principles applied](#secure-design-principles-applied)
- [Common implementation weaknesses countered](#common-implementation-weaknesses-countered)
- [Limitations and explicit non-goals](#limitations-and-explicit-non-goals)

---

## Executive summary

CVE Lite CLI is a developer-time vulnerability scanner for JavaScript and TypeScript projects. It reads a lockfile locally, queries advisory data from OSV, and produces copy-and-run remediation commands. It can also operate fully offline against a synced local advisory database.

This document makes three claims:

1. The CLI does not modify or exfiltrate the user's source code, lockfile, or environment beyond the inputs and outputs documented in the README.
2. Scan results and fix-command output are produced from advisory data and lockfile contents alone, with no opportunity for an attacker on the network path or in OSV's bulk export to inject executable behavior into the user's machine.
3. Release artifacts (the GitHub release tarball and the GPG-signed git tag) are cryptographically verifiable, with no long-lived private signing key on a site that distributes the software.

The scope of these claims is the CLI itself. They do not extend to the security of projects the CLI is used to scan — that depends on the underlying advisory data and on the project author acting on the recommendations.

## Threat model

### Threat actors

| Actor | Goal | Reachable through |
| --- | --- | --- |
| Malicious lockfile author | Trick the scanner into producing wrong results, crashing, or executing attacker-controlled code | Crafted `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, or `package.json` |
| Compromised or impersonated OSV endpoint | Inject false advisories or suppress real ones, or push attacker-controlled data into the local cache | OSV API (`api.osv.dev`), OSV bulk export (`storage.googleapis.com/osv-vulnerabilities/npm/all.zip`) |
| Compromised npm registry response | Inject false fix-version data into remediation suggestions | `registry.npmjs.org` packument fetches during fix-target validation |
| Supply-chain attacker on the build/release pipeline | Replace a release artifact with a malicious one between build and download | GitHub Actions runners, GitHub release uploads, npm registry |
| Local attacker on the developer's machine | Read or modify the local advisory database, OSV cache, or signing keys | Filesystem access |

### Assets

- **Integrity of scan results.** False negatives leave a project exposed; false positives waste developer time and erode trust.
- **Integrity of fix-command output.** Fix commands are presented for the user to copy into a shell; injecting attacker-controlled content into them would be a high-impact compromise.
- **Integrity of release artifacts.** The npm tarball, the GitHub release tarball, and the source git tag must be verifiable as having been produced by the project.
- **The user's source tree and environment.** The CLI must not write to the user's project except in opt-in `--fix` mode, and must never read files outside the scanned project root.

### Out of scope

- Exploitability analysis or runtime reachability proofs. The CLI's `--usage` flag is a best-effort static hint, not a security-grade reachability claim.
- Container, IaC, secret, or binary scanning. The CLI scans dependency lockfiles, nothing else.
- Vulnerabilities that exist in OSV but predate the user's last advisory database sync (offline mode) or last cache invalidation (online mode). Both modes carry their own freshness limits, [documented separately](./offline-vs-online-results.md).
- Attacks against Node.js itself or the operating system on which the CLI runs.

## Trust boundaries

```
       ┌────────────────────────────────────────────────────────────┐
       │                       Developer machine                    │
       │                                                            │
       │   ┌──────────────┐    ┌─────────────┐    ┌─────────────┐   │
       │   │ Lockfile +   │───>│             │<───│ Local       │   │
       │   │ package.json │    │  CVE Lite   │    │ advisory DB │   │
       │   └──────────────┘    │  CLI        │    │ (offline)   │   │
       │                       │             │    └─────────────┘   │
       │   ┌──────────────┐    │             │    ┌─────────────┐   │
       │   │ CLI args     │───>│             │<───│ OSV cache   │   │
       │   └──────────────┘    │             │    │ (online)    │   │
       │                       └──────┬──────┘    └─────────────┘   │
       │                              │                             │
       │                              ▼                             │
       │                        Stdout / report                     │
       └─────────────────────────┬────────────────────────────────-─┘
                                 │ (only outbound: hardcoded endpoints)
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
           api.osv.dev   storage.googleapis  registry.npmjs.org
                         /osv-vulnerabilities
```

**Boundaries and what crosses them:**

| Boundary | Direction | Data | Trust treatment |
| --- | --- | --- | --- |
| User → CLI argument parser | In | Flag names, paths, severity strings | Allowlist on flags; unknown flags rejected (`src/cli/args.ts`). |
| Lockfile / `package.json` → parser | In | JSON, YAML, text | Defensive parse with `try`/`catch`; missing fields handled via optional chaining; version strings filtered through `looksLikeVersion`. |
| OSV API / OSV bulk export → ingest | In | JSON advisory records | Records without an `id` are skipped; records with a `withdrawn` timestamp are skipped at ingest; ranges with non-SEMVER `type` are skipped. |
| npm registry → fix-target validator | In | Packument JSON | Version keys filtered through `looksLikeVersion` and `isPreReleaseVersion` before any comparison. |
| Local advisory SQLite DB → query | In | Stored advisory rows | Parameterized queries via `better-sqlite3`; no string concatenation. |
| GitHub Actions OIDC → Sigstore | Out | OIDC token | Ephemeral; used once per build to mint a Sigstore signing certificate. No long-lived key. |
| Project lead's GPG key → release tag | Out | Signature | Private key remains on the project lead's local machine; only the public key is published. |
| CLI → user terminal | Out | Findings, fix commands | Output is plain text; the CLI does not execute fix commands itself. |
| CLI → user's source tree | Out | None (default), `npm install` invocation in opt-in `--fix` mode | `--fix` is explicit, scoped to the package manager's own command, and rescans afterward. |

## Secure design principles applied

The project applies the [Saltzer and Schroeder](https://en.wikipedia.org/wiki/Saltzer_and_Schroeder%27s_design_principles) principles where they have practical relevance:

- **Economy of mechanism.** Four runtime dependencies. A small, single-purpose tool. The simpler the surface, the fewer places defects can hide. The dependency footprint is checked on every CI run.
- **Fail-safe defaults.** `--fail-on critical` is the default, so a CI integration without explicit configuration still blocks on the most severe findings. Parser errors are surfaced as warnings, not silent skips. Network errors during scans degrade to clearly-labeled "not validated" output rather than fabricating a confident answer.
- **Complete mediation.** Every advisory match goes through the same classification, validation, and remediation pipeline. There is no "fast path" that skips validation, and no advisory source bypasses the same record filters (e.g. the withdrawn-advisory filter applies equally to OSV API and OSV bulk export).
- **Open design.** The codebase is fully open source under the MIT license. Advisory data comes from the public OSV project. Release signatures are publicly verifiable. The security model in this document is itself part of that openness.
- **Separation of privilege.** Three independent signing mechanisms protect releases: the project lead's GPG key (source tag), GitHub Actions Sigstore attestations (release tarball), and the npm registry's automatic signature (npm-installed package). Compromising one does not compromise the others.
- **Least common mechanism.** Local-first scans hold no server-side state. Offline mode in particular is fully isolated — no shared cache, no analytics, no telemetry of any kind.
- **Least privilege.** The CLI does not write to the user's source tree by default. `--fix` mode is explicit, scoped to the package manager's own install command, and rescans afterward. The CLI never opens network connections to anything other than the hardcoded advisory and registry endpoints documented above.
- **Psychological acceptability.** Output is a copy-and-run fix command, not a list of CVE IDs requiring further triage. The tool is meant to be used, not avoided.

## Common implementation weaknesses countered

Mapped against the [OWASP Top 10 (2021)](https://owasp.org/Top10/) — the categories most projects use as a checklist:

| OWASP category | Status | How |
| --- | --- | --- |
| A01: Broken Access Control | Not applicable | The CLI has no authentication or authorization surface. There are no users to authorize. |
| A02: Cryptographic Failures | Countered | No custom cryptography. Release signing uses Sigstore (industry standard) and GPG (for tags). No secrets are stored in source or in CI configuration. The npm registry's automatic signature provides a third independent verification path. |
| A03: Injection | Countered | All SQLite access uses parameterized prepared statements via `better-sqlite3`. The CLI does not construct or execute shell commands from user input — fix commands are printed to stdout for the user to copy. There is no use of `eval`, the `Function` constructor, or template-string-built queries. |
| A04: Insecure Design | Countered | Threat model and trust boundaries are documented (this page). Inputs are allowlisted where they have format restrictions. Defaults fail safe. |
| A05: Security Misconfiguration | Countered | Minimal configuration surface — most behavior is determined by the lockfile and advisory data, not by user knobs. The default severity threshold is conservative. CI workflows pin action versions and use the minimum required permissions. |
| A06: Vulnerable and Outdated Components | Countered | The project scans its own lockfile in CI on every push (the "self-scan" workflow). The runtime dependency footprint is intentionally small. CodeQL static analysis runs on every push and pull request. |
| A07: Identification and Authentication Failures | Not applicable | The CLI has no authentication surface. |
| A08: Software and Data Integrity Failures | Countered | Release tarballs are signed via Sigstore Artifact Attestations. Git tags are GPG-signed by the project lead. Withdrawn OSV advisories are filtered at ingest. Sync replaces the advisory database atomically rather than partially updating it. |
| A09: Security Logging and Monitoring Failures | Partially countered | CodeQL alerts on every push, the self-scan workflow flags new advisories in the project's own dependencies on every push, and the GitHub release workflow emits build provenance. The project does not centrally log scan invocations because none happen on project-controlled infrastructure — scans run on each user's local machine. |
| A10: Server-Side Request Forgery | Countered | The CLI only makes outbound HTTP requests to fixed, hardcoded endpoints: `api.osv.dev`, `storage.googleapis.com/osv-vulnerabilities/...`, and `registry.npmjs.org`. No user-controlled URLs are ever used as request targets. |

## Limitations and explicit non-goals

- This document covers the security properties of the CLI itself, not of projects scanned by it. The CLI cannot make claims about whether a vulnerability is exploitable in the user's specific code; it can only report what advisory data says.
- The `--usage` static-import analysis is best-effort and is not a security-grade reachability claim. A package marked "unused" by the analysis might still be loaded dynamically at runtime.
- The CLI is only as fresh as its data source. In offline mode, the local advisory database lags between syncs. In online mode, the OSV query cache has no time-based invalidation. Both freshness modes are documented in [Offline vs Online Results](./offline-vs-online-results.md).
- The project does not provide a confidentiality argument for the user's project contents because no project data ever leaves the user's machine — there is nothing to keep confidential against the project itself.
- Pre-existing release tags (`v1.11.0`, `v1.12.0`, `v1.12.1`) predate the GPG-signing policy and remain unsigned. Verification of those releases must rely on the npm registry signature or, for `v1.12.1`, the Sigstore tarball attestation.

This assurance case is reviewed at each major release and updated when the threat model, trust boundaries, or applicable design principles change.
