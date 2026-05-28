---
sidebar_label: CLI Reference
---

# CLI Reference

```bash
cve-lite [path] [options]
cve-lite advisories sync [options]
cve-lite config <set|unset|show> [key] [value]
cve-lite install-skill
```

`path` defaults to the current directory if omitted.

---

## Scan options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--prod-only` | off | Exclude dev dependencies from the scan | `cve-lite . --prod-only` |
| `--min-severity` | `medium` | Only show findings at or above this severity (`critical`, `high`, `medium`, `low`) | `cve-lite . --min-severity high` |
| `--all` | off | Show all findings including low and unknown; appends a full table in compact mode | `cve-lite . --all` |
| `--search-depth` | `4` | How many directory levels deep to search for a lockfile | `cve-lite . --search-depth 2` |
| `--batch-size` | `100` | Number of packages sent per OSV API request | `cve-lite . --batch-size 50` |

---

## Output options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--verbose` | off | Full output: severity table, fix plan, findings table, coverage notes | `cve-lite . --verbose` |
| `--json` | off | Machine-readable JSON output (suppresses all other output) | `cve-lite . --json` |
| `--sarif` | off | Write SARIF 2.1.0 output to a timestamped `.sarif` file; can be combined with `--json`; cannot be combined with `--report` | `cve-lite . --sarif` |
| `--cdx` | off | Write CycloneDX 1.4 SBOM to a timestamped `.cdx.json` file; can be combined with `--json` and `--sarif`; cannot be combined with `--report` | `cve-lite . --cdx` |
| `--report[=<path>]` | off / `./cve-report` | Generate an HTML report; optional path sets output directory (default `./cve-report`); opens in browser by default; cannot be used with `--json` | `cve-lite . --report`<br/>`cve-lite . --report ./reports` |
| `--no-open` | off | Generate the HTML report without opening it in the browser | `cve-lite . --report --no-open` |

---

## Offline options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--offline` | off | Use the local advisory DB only — no OSV API calls | `cve-lite . --offline` |
| `--offline-db=<path>` | auto | Path to a specific advisory DB file | `cve-lite . --offline-db ./advisories.db` |

Sync the local advisory DB with:

```bash
cve-lite advisories sync
cve-lite advisories sync --output ./advisories.db   # write to a specific path
```

See [Offline Advisory DB](./offline-advisory-db.md) for the full offline workflow.

---

## Network / SSL options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--ca-cert=<path>` | - | Path to a PEM CA certificate file for corporate SSL inspection proxies | `cve-lite . --ca-cert ~/corp-ca.crt` |
| `--osv-url=<url>` | OSV API | Use a custom OSV-compatible endpoint instead of the public API | `cve-lite . --osv-url https://osv.example.com` |

For networks with SSL inspection, save the certificate path once so you do not need to pass the flag on every scan:

```bash
cve-lite config set ca-cert /path/to/corporate-ca.crt
```

See [Corporate SSL Proxy](./corporate-proxy.md) for the full setup workflow.

---

## CI / Automation options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--fail-on` | `critical` | Exit with code `1` if any finding meets or exceeds this severity (`critical`, `high`, `medium`, `low`); exit `0` otherwise | `cve-lite . --fail-on high` |
| `--fix` | off | Auto-apply direct-dependency fix commands (direct deps only, v1); cannot be used with `--json` | `cve-lite . --fix` |
| `--usage` | off | Scan source files to detect which packages are actually imported | `cve-lite . --usage` |
| `--only-used` | off | Show only findings for packages that are imported in source code (implies `--usage`) | `cve-lite . --only-used` |

**Note:** `--usage-hints` is a deprecated alias for `--usage`.

See [Workflow Integration](./workflow-integration.md) for CI/CD patterns and GitHub Actions templates.

---

## Cache options

| Flag | Default | Description | Example |
|---|---|---|---|
| `--cache-dir=<path>` | `~/.cache/cve-lite` | Use a specific directory for the advisory response cache | `cve-lite . --cache-dir ./.cache` |
| `--no-cache` | — | Skip the query cache and fetch fresh results from OSV for this scan | `cve-lite . --no-cache` |

To clear the cache manually, delete `~/.cache/cve-lite/osv-vulns.json`. The next scan will re-fetch advisories from OSV.

Query cache entries expire after 30 minutes. Use `--no-cache` to force a fresh query immediately without waiting for the TTL. See the [Caching guide](./caching.md) for full details including false negative and false positive risk.

---

## Other commands

### `config`

```bash
cve-lite config set ca-cert <path>   # Save a CA certificate path
cve-lite config unset ca-cert        # Remove the saved CA certificate path
cve-lite config show                 # Print current config and config file location
```

Manages persistent CLI configuration stored in `~/.cve-lite-cli/config.json`. Currently supports one key:

| Key | Description |
|---|---|
| `ca-cert` | Path to a PEM CA certificate for corporate SSL inspection proxies |

The file must be a valid PEM certificate (starting with `-----BEGIN CERTIFICATE-----`). CVE Lite CLI validates the file exists and is readable before saving.

See [Corporate SSL Proxy](./corporate-proxy.md) for the full workflow.

---

### `install-skill`

```bash
cve-lite install-skill
```

Writes AI assistant skill files into the current project directory for Claude Code, Codex CLI, Gemini CLI, Cursor, and GitHub Copilot. Commit the generated files to share them with your team.

See the [AI Assistant Integration guide](./ai-assistant-integration.md) for the full workflow.
