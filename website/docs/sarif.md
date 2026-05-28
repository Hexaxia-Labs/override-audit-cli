---
sidebar_label: SARIF Output
---

# SARIF Output

CVE Lite CLI can write scan results as a [SARIF 2.1.0](https://sarifweb.azurewebsites.net/) file — a standard format supported by GitHub Code Scanning, VS Code, Azure DevOps, and other security tooling.

## Generating SARIF output

```bash
cve-lite . --sarif
```

This writes a timestamped file (`cve-lite-scan-<timestamp>.sarif`) to the current directory and prints the path. Terminal output renders as normal.

## Combining with `--json`

`--sarif` and `--json` can be used together. Both files are written in one scan:

```bash
cve-lite . --sarif --json
```

`--sarif` cannot be combined with `--report`.

## GitHub Code Scanning integration

Upload the SARIF file to GitHub's Security tab using the official action:

```yaml
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      security-events: write  # required for upload-sarif
    steps:
      - uses: actions/checkout@v4

      - name: Scan dependencies
        run: cve-lite . --sarif

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: ${{ github.workspace }}
```

Findings appear in the **Security → Code scanning** tab and as PR annotations.

:::tip
`security-events: write` is a GitHub platform requirement for any workflow that uploads to Code Scanning — it must be declared on the job, not inside the action.

Use `if: always()` on the upload step so findings are uploaded even when `--fail-on` causes a non-zero exit.
:::

## What the SARIF file contains

Each CVE found produces one SARIF result. A package with multiple CVEs produces one result per CVE, allowing per-CVE review and dismissal in GitHub Code Scanning.

| SARIF field | Value |
|---|---|
| `ruleId` | CVE ID (e.g. `CVE-2021-44228`) |
| `level` | `error` (critical/high), `warning` (medium), `note` (low/unknown) |
| `message` | Package, version, severity, and recommended action |
| `locations` | Lockfile path relative to repo root |
| `fixes` | Exact install command when one is available |

## `--fail-on` and exit codes

`--sarif` does not affect exit codes. The `--fail-on` flag continues to control when the process exits with code `1`.
