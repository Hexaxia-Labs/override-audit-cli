# Parser Coverage

Supported lockfile formats, known limitations, and edge cases.

## Supported formats

| Lockfile | Package manager | Support level | Notes |
|---|---|---|---|
| `package-lock.json` | npm | Full | v1, v2, and v3 formats supported |
| `pnpm-lock.yaml` | pnpm | Full | v5, v6, and v9 formats supported |
| `yarn.lock` | Yarn | Full | Classic (v1) and Berry (v2/v3) formats supported |
| `bun.lock` | Bun | Full | JSONC format introduced in Bun v1.1.38+ |
| `package.json` | Any | Limited fallback | Only exact pinned direct dependencies (`"1.2.3"`, not `"^1.2.3"`) |

---

## Lockfile selection priority

When multiple lockfiles are present in a project, CVE Lite CLI uses the following priority order:

1. `package-lock.json`
2. `pnpm-lock.yaml`
3. `yarn.lock`
4. `bun.lock`
5. `package.json` (fallback only)

If you want to scan against a specific lockfile type, make sure only that lockfile is present in the project root, or use the tool in a directory where only one lockfile exists.

---

## package.json fallback

The `package.json` fallback is intentionally limited:

- only exact pinned versions are scanned (`"lodash": "4.17.20"`)
- range specifiers (`^`, `~`, `*`, `>=`) are skipped because the resolved version is unknown without a lockfile
- transitive dependencies are not visible — only direct dependencies declared in `dependencies` or `devDependencies`

For accurate transitive visibility and resolved version scanning, always use a lockfile.

---

## Format-specific limitations

Each parser handles some details differently. The behaviors below reflect the current implementation in `src/parsers/`.

### package-lock.json

- **v1, v2, and v3 supported.** v1 uses the legacy nested `dependencies` object; v2 and v3 use the flat `packages` map. Both paths are handled.
- **Entries without a `node_modules/` path are skipped.** Root-level `""` entries that describe the project itself are intentionally ignored.
- **Dev classification comes from the lockfile's `dev` flag.** Packages marked `devOptional` are classified as prod unless `dev: true` is also set.

### pnpm-lock.yaml

- **Lockfile versions v5, v6, and v9+ supported.** v9+ uses the newer `snapshots` model; earlier versions use the legacy `packages` map. The parser branches on `lockfileVersion`.
- **Non-registry resolutions are skipped.** `link:` and `workspace:` prefixes are stripped, and any resulting relative-path reference (`./`, `../`) is not scanned. Tarball URLs and `file:` references without a resolvable version are similarly skipped.
- **Dependency paths are approximated** from importer relationships and package snapshots, not a strict resolution tree.

### yarn.lock

- **Classic (v1) and Berry (v2/v3) formats supported** via `yarn-lockfile`.
- **`--prod-only` has no effect with yarn.lock.** Yarn Classic lockfiles don't record a dev/prod distinction, so every resolved entry is scanned regardless of the flag.
- **Dependency paths are flattened to `project > name`.** Transitive path reconstruction is limited for yarn.lock — this is the MVP behavior noted in the scan output.

### bun.lock

- **JSONC format** (Bun v1.1.38+). Trailing commas are stripped before JSON parsing.
- **Dev inference from workspace sections.** A package is treated as dev-only if its name appears in a workspace's `devDependencies` but not its `dependencies`. Transitive packages default to prod.
- **Dependency paths are flattened to `project > name`** (same as yarn.lock).

### package.json (fallback)

- **Only exact-pinned direct dependencies** are scanned (e.g. `"lodash": "4.17.20"`). Range specifiers (`^`, `~`, `>=`, `*`, `latest`, git/tarball URLs) are skipped and reported.
- **Skipped-dependency report is capped at 50 entries.** In projects with many non-pinned specs, only the first 50 are listed in the report; the scan itself still proceeds.
- **No transitive visibility.** Because no lockfile is present, resolved versions of sub-dependencies cannot be determined.

---

## Known edge cases

**Monorepos and workspaces**

CVE Lite CLI scans the lockfile at the path you provide. In a monorepo, point the scan at the workspace root where the top-level lockfile lives. Scanning individual workspace package directories without their own lockfile will fall back to `package.json` mode.

**Nested node_modules**

Lockfile-based scanning reads resolved versions from the lockfile graph, not from the `node_modules` directory on disk. This means the scan is accurate even if `node_modules` is outdated or missing.

**Optional dependencies**

Optional dependencies resolved in the lockfile are included in the scan. If an optional dependency is not installed (because it failed or was skipped), it may still appear in the lockfile and be scanned.

**Private registries**

Packages resolved from private registries are scanned against OSV advisory data by package name and version. Advisory coverage depends on whether the package name matches an entry in OSV. Packages unique to a private registry with no OSV entry will not produce findings.

---

## Planned parser additions

The following formats are under consideration for Phase 3:

- `deno.lock` (Deno)

See [roadmap.md](roadmap.md) for full phase details.

---

Found a lockfile edge case the parser does not handle? [Open an issue](https://github.com/sonukapoor/cve-lite-cli/issues) with a minimal reproducible lockfile excerpt.
