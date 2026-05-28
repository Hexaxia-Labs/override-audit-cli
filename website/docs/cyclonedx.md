---
sidebar_label: CycloneDX SBOM
---

# CycloneDX SBOM Output

CVE Lite CLI can write a [CycloneDX 1.4](https://cyclonedx.org/) Software Bill of Materials (SBOM) — a standard format supported by Dependency-Track, GitHub, Azure DevOps, and many enterprise security platforms.

## Generating a CycloneDX SBOM

```bash
cve-lite . --cdx
```

This writes a timestamped file (`cve-lite-scan-<timestamp>.cdx.json`) to the current directory. Terminal output renders as normal.

## What the SBOM contains

The BOM includes **all packages** from the scanned lockfile as components — not just vulnerable ones. This makes it useful as a compliance artifact even on a clean scan.

Vulnerability data is attached for any packages with CVE findings:

| CycloneDX field | Value |
|---|---|
| `components[].purl` | `pkg:npm/<name>@<version>` |
| `vulnerabilities[].id` | CVE ID |
| `vulnerabilities[].ratings[].severity` | `critical`, `high`, `medium`, `low`, or `unknown` |
| `vulnerabilities[].affects[].ref` | Component purl |
| `vulnerabilities[].recommendation` | Runnable fix command or recommended action |

One vulnerability entry is emitted per CVE ID. If multiple packages share a CVE, a single entry with multiple `affects` references is produced.

## Combining with other outputs

`--cdx` can be combined with `--json` and `--sarif`. All files are written in one scan:

```bash
cve-lite . --cdx --sarif --json
```

`--cdx` cannot be combined with `--report`.

## GitHub Actions integration

```yaml
- uses: OWASP/cve-lite-cli@v1
  with:
    cdx: "true"
    fail-on: high

- name: Upload SBOM artifact
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: cyclonedx-sbom
    path: cve-lite-scan-*.cdx.json
```

## Dependency-Track integration

Import the `.cdx.json` file directly into [Dependency-Track](https://dependencytrack.org/) (also an OWASP project) for centralised vulnerability management and policy enforcement across multiple projects.
