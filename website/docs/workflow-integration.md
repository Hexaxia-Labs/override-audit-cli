# Workflow Integration

CVE Lite CLI is designed to fit into existing developer workflows without friction. This guide covers local development patterns, CI/CD integration, and controlled-network setups.

## Contents

- [Local development](#local-development)
- [Package scripts](#package-scripts)
- [Git hooks](#git-hooks)
- [CI/CD pipelines](#cicd-pipelines)
- [GitHub Actions](#github-actions)
- [Offline CI workflow](#offline-ci-workflow)
- [Scripted automation](#scripted-automation)
- [Scheduled advisory DB refresh](#scheduled-advisory-db-refresh)
- [Opt-in postinstall usage](#opt-in-postinstall-usage)

---

## Local development

Run it before a release, during dependency cleanup, or after a major package upgrade.

```bash
# Standard online scan
cve-lite .

# Offline scan (after syncing advisories)
cve-lite advisories sync
cve-lite . --offline
```

---

## Package scripts

Add a script to your project so developers have a memorable command:

```json
{
  "scripts": {
    "security:scan": "cve-lite .",
    "security:scan:offline": "cve-lite . --offline"
  }
}
```

This is the best default for most teams. It is visible, easy to document, and easy to reuse in both local development and CI.

---

## Git hooks

For a lightweight local gate before code leaves a workstation:

```bash
cve-lite . --fail-on high
```

This works well in a `pre-push` hook or another team-approved hook to catch high-severity dependency issues before changes are shared.

---

## CI/CD pipelines

### Basic release gate

```bash
cve-lite . --all --verbose --fail-on high
```

Use `--all` so the build log includes every finding regardless of severity threshold. Use `--verbose` so the log includes the full fix plan, dependency paths, detailed table output, and suggested fix commands when a scan fails.

### Controlled or restricted environments

Sync the advisory DB separately, then scan offline:

```bash
cve-lite advisories sync --output ./.cache/advisories.db
cve-lite . --all --offline-db ./.cache/advisories.db --verbose --fail-on high
```

---

## GitHub Actions

CVE Lite CLI ships a first-party GitHub Action available on the [GitHub Marketplace](https://github.com/marketplace/actions/cve-lite-cli).

### Standard online scan

```yaml
name: Dependency Scan

on:
  pull_request:
  push:
    branches: [main]

jobs:
  cve-lite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: OWASP/cve-lite-cli@v1
        with:
          all: "true"
          verbose: "true"
          fail-on: high
```

This repository also uses CVE Lite CLI in its own CI to scan itself. See [`self-scan.yml`](https://github.com/OWASP/cve-lite-cli/blob/main/.github/workflows/self-scan.yml).

### With GitHub Code Scanning

Add `sarif: "true"` and an upload step to surface findings in the **Security → Code scanning** tab and as PR annotations:

```yaml
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      security-events: write  # required for upload-sarif
    steps:
      - uses: actions/checkout@v6
      - uses: OWASP/cve-lite-cli@v1
        with:
          fail-on: high
          sarif: "true"

      - name: Upload to GitHub Code Scanning
        uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: ${{ github.workspace }}
```

:::tip
`security-events: write` is a GitHub platform requirement for any workflow that uploads to Code Scanning — it must be declared on the job, not inside the action.

Use `if: always()` on the upload step so findings are uploaded even when `--fail-on` causes a non-zero exit.
:::

---

## Offline CI workflow

For environments where runtime advisory API calls are restricted or disallowed:

```yaml
name: Offline Dependency Scan

on:
  pull_request:

jobs:
  cve-lite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: OWASP/cve-lite-cli@v1
        with:
          sync-advisories: "true"
          offline: "true"
          offline-db: ./.cache/cve-lite/advisories.db
          all: "true"
          verbose: "true"
          fail-on: high
```

See the [Offline Advisory DB guide](offline-advisory-db.md) for more detail on the offline workflow.

---

## Scripted automation

### JSON output for custom reporting

```bash
cve-lite . --json > cve-lite-report.json
```

### Offline scan with JSON output

```bash
cve-lite advisories sync --output ./.cache/advisories.db
cve-lite . --offline-db ./.cache/advisories.db --json > cve-lite-report.json
```

---

## Scheduled advisory DB refresh

If you use offline mode, keep the advisory DB fresh with a scheduler such as cron, CI, or an internal automation system:

```bash
cve-lite advisories sync --output /path/to/advisories.db
```

This keeps offline scan results current without requiring every developer machine or build runner to make live advisory API calls during the scan itself.

---

## Opt-in postinstall usage

Some teams want dependency scanning to run immediately after packages are installed. CVE Lite CLI supports this as an **explicit opt-in** in the consuming project:

```json
{
  "scripts": {
    "postinstall": "cve-lite . --offline || true"
  }
}
```

This is intentionally opt-in rather than default behavior because:

- install hooks should be visible to the team using them
- controlled environments often prefer offline scanning for install-time checks
- explicit project scripts are easier to review, tune, and disable than implicit package behavior
