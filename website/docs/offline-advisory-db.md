# Offline Advisory DB

CVE Lite CLI supports a local advisory database workflow for teams that cannot allow runtime outbound advisory API calls during scans.

For a side-by-side comparison of offline and online output and the cases where they can diverge, see [Offline vs Online Results](./offline-vs-online-results.md).

## Contents

- [How it works](#how-it-works)
- [Why it matters](#why-it-matters)
- [Workflow modes](#workflow-modes)
- [Advisory DB freshness](#advisory-db-freshness)
- [Detecting malicious package incidents](#detecting-malicious-package-incidents)

---

## How it works

You sync the OSV advisory data ahead of time into a local SQLite database. After that, scans run entirely against that local database with zero runtime advisory API calls.

```bash
# Step 1: build the local advisory database
cve-lite advisories sync

# Step 2: scan using the local DB
cve-lite /path/to/project --offline

# Or point to a specific DB file
cve-lite /path/to/project --offline-db /path/to/advisories.db
```

You can also write the database to a specific path during sync:

```bash
cve-lite advisories sync --output /path/to/advisories.db
```

---

## Why it matters

For many teams, "works locally" is not enough. They also need a scanner that fits into environments where runtime outbound calls are restricted, reviewed closely, or disallowed entirely.

Offline advisory DB support makes CVE Lite CLI practical for:

- enterprise environments with strict network controls
- regulated teams that need explicit advisory data handling
- internal CI systems that should not depend on public runtime API access
- air-gapped or partially connected workflows

This is one of the clearest differentiators in the project: it improves both trust and adoptability, not just convenience.

---

## Workflow modes

### 1. Standard online scan

Use the default OSV-backed mode when runtime advisory API access is acceptable:

```bash
cve-lite /path/to/project
```

### 2. Advisory DB sync

Build or refresh the local advisory database ahead of time:

```bash
cve-lite advisories sync
```

In a local benchmark on the same machine, syncing the OSV npm dump (~217,065 advisory records) improved from `87.53s` to `8.84s` after bulk SQLite ingestion optimizations — roughly **9.9x faster** end-to-end. Results will vary by machine and network conditions.

### 3. Offline local DB scan

Scan against the local advisory DB with zero runtime advisory API calls:

```bash
cve-lite /path/to/project --offline
```

### 4. Custom advisory endpoint

Use an internal proxy or mirror for the advisory API:

```bash
cve-lite /path/to/project --osv-url https://security.company.internal/osv
```

---

## Advisory DB freshness

The local advisory DB is only as current as the last successful sync.

Offline scans report advisory DB freshness and warn when the local DB appears stale or is missing sync metadata.

The recommended model is:

1. sync the advisory DB on a schedule (cron, CI, or another automation system)
2. distribute the refreshed DB where needed
3. run offline scans against that updated DB

This keeps offline scan results current without requiring developers to manually track advisory update cadence.

Example scheduled sync:

```bash
cve-lite advisories sync --output /path/to/advisories.db
```

---

## Detecting malicious package incidents

CVE Lite CLI can help detect malicious package incidents and supply-chain compromises **once the affected versions are represented in OSV or equivalent advisory data available through the configured advisory endpoint**.

In practice, the tool can catch incidents such as a compromised npm package **when the exact malicious version appears in your lockfile** and the advisory data has already been published and indexed.

Important scope notes:

- CVE Lite CLI is **advisory-driven**, not a behavioral malware detector
- it does **not** perform static malware analysis on package contents
- it does **not** detect a package compromise before advisory intelligence exists for it
- it works best with lockfiles because they capture the exact resolved version that was actually installed

The practical model is: **local lockfile scan + advisory matching**. When malicious versions are published to OSV or mirrored through a compatible internal endpoint, CVE Lite CLI can flag those exact versions during a scan.

If a malicious package was installed and executed, upgrading or removing the dependency may not be sufficient on its own. Treat that as a potential security incident and follow your incident-response process.
