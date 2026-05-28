---
sidebar_label: Caching
---

# Caching

CVE Lite CLI caches OSV advisory results locally so that repeated scans — common in the scan-fix-rescan workflow and CI retry loops — complete in milliseconds rather than seconds.

---

## What is cached

Two separate caches share a single file at `~/.cache/cve-lite/osv-vulns.json`:

| Cache | Key | Value | TTL |
|---|---|---|---|
| **Query cache** (`queryEntries`) | `ecosystem:package@version` | List of matching advisory IDs | 30 minutes |
| **Advisory detail cache** (`entries`) | Advisory ID (e.g. `GHSA-...`) | Full advisory record | No expiry |

The **query cache** is the one that affects scan results. It records which advisories matched a given package version. After 30 minutes, any entry in this cache is treated as stale and re-queried from OSV — regardless of whether the previous result was empty or not.

The **advisory detail cache** stores the full advisory record for each ID. These records are stable once published and are not expired.

---

## The 30-minute TTL

Every query cache entry carries a `cachedAt` timestamp. On each scan, CVE Lite CLI checks whether the entry is older than 30 minutes. If it is, the package is re-queried from OSV even if the previous result was clean.

This applies to **all entries** — both packages that had vulnerabilities and packages that were clean. A clean result is never assumed to be permanently safe.

:::warning[Cache staleness can cause false negatives and false positives]

**False negatives (most common risk):** If a new CVE is published for a package after it was scanned and cached as clean, CVE Lite CLI will not report it until the 30-minute TTL expires. During that window, the package appears safe even though it is not.

**False positives (less common):** If an advisory is withdrawn or corrected after a matching result was cached, the finding may still appear in scan output until the TTL expires and OSV is re-queried.

Both risks are bounded by the 30-minute TTL window. If you need results that reflect the current state of OSV right now, use `--no-cache`.

:::

---

## `--no-cache`

The `--no-cache` flag bypasses the query cache entirely for a single scan, forcing a fresh OSV query for every package regardless of what is in the cache:

```bash
cve-lite . --no-cache
```

Results are still **written back to cache** after the scan. The next scan (without `--no-cache`) will benefit from the freshly populated entries.

**When to use `--no-cache`:**

- You just heard about a new CVE and want to check immediately without waiting for the TTL to expire
- You are running a pre-release scan and want the highest possible confidence in the result
- You suspect the cache may have been populated during a network issue or partial sync
- CI pipelines where scan accuracy matters more than speed

`--no-cache` cannot be combined with `--offline` or `--offline-db` — those modes have no cache to bypass.

---

## `--cache-dir`

By default the cache file is written to `~/.cache/cve-lite/osv-vulns.json`. Use `--cache-dir` to override the directory:

```bash
cve-lite . --cache-dir ./.cache
```

This is useful for:

- **CI environments** where the home directory is not writable or you want a project-scoped cache
- **Shared network paths** where a team cache can be pre-warmed
- **Sandboxed environments** where you need to control exactly where files are written

---

## Clearing the cache manually

Delete the cache file and the next scan will re-fetch all advisory results from OSV:

```bash
rm ~/.cache/cve-lite/osv-vulns.json
```

If you are using a custom `--cache-dir`:

```bash
rm /your/custom/path/osv-vulns.json
```

The directory itself is preserved. The next scan recreates the file automatically.

---

## Cache in CI

For most CI pipelines the default behaviour — 30-minute TTL, cache written between runs — is appropriate. The cache prevents redundant API calls across retry loops and parallel jobs that share a cache directory.

If your pipeline requires a guaranteed-fresh result on every run, add `--no-cache`:

```yaml
- run: cve-lite . --no-cache --fail-on high
```

See [Workflow Integration](./workflow-integration.md) for full CI/CD patterns.
