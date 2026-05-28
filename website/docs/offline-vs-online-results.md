# Offline vs Online Results

CVE Lite CLI is designed so an offline scan and an online scan against the same project return the same answer for the cases where local data is sufficient to prove it. The two modes are not identical, though, and a few differences are intentional rather than bugs.

This page explains where the two advisory sources can diverge, what the CLI does about it, and what to expect when you compare results.

## Contents

- [The two advisory sources](#the-two-advisory-sources)
- [What stays the same](#what-stays-the-same)
- [What can differ](#what-can-differ)
- [Freshness — both modes can be stale](#freshness--both-modes-can-be-stale)
- [How to keep results aligned](#how-to-keep-results-aligned)

---

## The two advisory sources

Online scans query the OSV API at `https://api.osv.dev` using the `/v1/querybatch` endpoint and fetch full vulnerability records from `/v1/vulns/{id}` on demand.

Offline scans (`--offline`, `--offline-db`) read from a local SQLite advisory database that you populate ahead of time with `cve-lite advisories sync`. The sync downloads OSV's `npm/all.zip` bulk export and ingests every record into the local DB.

Both sources are produced by OSV from the same upstream advisory data, but the API and the bulk export are not byte-identical. The API filters some records server-side and the bulk export does not. The CLI applies the same filters at ingest time so the local DB stays consistent with what `querybatch` would return.

## What stays the same

For the same project and the same lockfile, both modes produce identical output for:

- The set of vulnerable packages and versions reported.
- Severity and CVE/GHSA aliases.
- Direct vs transitive classification.
- Dependency paths and primary parents.
- The advisory's `firstFixedVersion` hint shown in the findings table.
- The Suggested Fix Plan for direct upgrades and for transitive findings that can be resolved by updating the parent within its current dependency range.

If you scan the same project online and offline within a few minutes of each other and see different findings beyond the cases below, that is worth investigating.

## What can differ

There are two intentional differences. Both come from the fact that some signals only exist in the npm registry, and the offline path is forbidden from making outbound network calls.

### Registry-validated fix versions

When online, the CLI calls the npm registry to find the lowest published version of a package that is not still flagged as vulnerable, then uses that as the fix target. This catches cases where the advisory's `firstFixedVersion` hint is itself not yet published on npm, or where a higher version is required because intermediate releases are still affected.

Offline, that registry call cannot run. The CLI falls back to the advisory's `firstFixedVersion` hint as the target. In most cases the two values match. When they do not, the online plan will sometimes recommend a slightly different version with a note like "Advisory fixed-version hint is not published on npm; using nearest published version 4.18.0." Offline plans never produce that note.

Practical impact: direct upgrades work correctly in both modes. Online may surface a more accurate target in a few edge cases.

### Transitive parent upgrades that need a newer parent

The CLI distinguishes between two ways to fix a transitive vulnerability:

1. **Update the parent within its current range** — use a child version the parent already allows. This works offline because everything needed lives in the lockfile and the advisory.
2. **Upgrade the parent to a newer version** — required when no in-range child version is safe. This needs the parent's published manifests from the npm registry to figure out which newer parent version stops pulling in the vulnerable child.

The second path runs only online. Offline scans skip it and present the finding without an automatic fix command, falling back to the explanatory text "Upgrade `<parent>` — no safe version was identified automatically." The finding itself is still reported.

Practical impact: in-range parent updates work in both modes. Parent-version upgrades only show up online.

## Freshness — both modes can be stale

Freshness can pull either direction depending on which signal is moving.

**Offline can lag behind.** The local advisory DB is only as fresh as the last `cve-lite advisories sync`. A new advisory published after your last sync will not appear offline until you sync again. Most teams refresh nightly or as part of CI.

**Online can also lag behind.** Online scans persist `npm:<package>@<version>` query results to a local JSON cache (`~/.cache/cve-lite/osv-vulns.json` by default). That cache has no time-based invalidation. If an advisory is added for a package/version that you previously scanned and got an empty result for, the cached empty result keeps being returned until the cache is cleared. Use `--cache-dir` or remove the cache file to force a re-query.

Practical impact: neither mode is automatically more current than the other. The right answer depends on which signal moved most recently.

## How to keep results aligned

A few small habits keep offline and online output close:

1. Sync the local DB regularly (`cve-lite advisories sync`) — at least weekly, ideally as part of a scheduled CI job.
2. Periodically clear or rotate the OSV query cache when running online. There is no flag for this today; deleting `~/.cache/cve-lite/osv-vulns.json` is sufficient.
3. When investigating a discrepancy, compare both the lockfile and the timestamps of your last sync vs. your cache. Most "online and offline disagree" reports come down to one side being stale, not a real divergence.
4. For air-gapped or restricted-network environments, treat the offline DB freshness as your primary SLO. Online output is not available to you anyway, and the cases where online would give a different answer are limited and documented above.

For the full offline workflow, including CI patterns and scheduled refresh, see the [Offline Advisory DB guide](./offline-advisory-db.md).
