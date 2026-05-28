# Troubleshooting

Common issues and how to resolve them.

## Contents

- [No lockfile found](#no-lockfile-found)
- [Scan returns zero results](#scan-returns-zero-results)
- [SSL certificate errors (corporate proxy)](#ssl-certificate-errors-corporate-proxy)
- [Advisory sync is slow](#advisory-sync-is-slow)
- [Offline scan fails or returns stale results](#offline-scan-fails-or-returns-stale-results)
- [--fix does not apply a fix](#--fix-does-not-apply-a-fix)
- [CI build fails unexpectedly](#ci-build-fails-unexpectedly)
- [Permission errors on install](#permission-errors-on-install)

---

## No lockfile found

**Symptom:** CVE Lite CLI exits with a message that no supported lockfile was found.

**Cause:** The tool looks for `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock` in the project directory. If none is present, it falls back to exact pinned versions in `package.json`.

**Fix:**
- Make sure you are pointing the scan at the root of the project, not a subdirectory.
- Run `npm install`, `pnpm install`, or `yarn install` to generate a lockfile before scanning.
- If your project intentionally has no lockfile, the `package.json` fallback only covers exact pinned direct dependencies.

---

## Scan returns zero results

**Symptom:** The scan completes but reports no vulnerabilities even though you expect some.

**Possible causes and fixes:**

- **Lockfile not at the expected path** — confirm the project path passed to the CLI is correct.
- **Advisory data is stale (offline mode)** — run `cve-lite advisories sync` to refresh the local advisory DB.
- **Packages are genuinely not in OSV** — not all packages have advisory entries. The scan only reports what OSV knows about.
- **Cache is serving old results** — clear the local cache directory (default: `~/.cache/cve-lite`) and rescan.

---

## SSL certificate errors (corporate proxy)

**Symptom:** The scan or advisory sync fails with an error containing `SELF_SIGNED_CERT_IN_CHAIN`, `CERT_UNTRUSTED`, `unable to verify the first certificate`, or similar SSL errors.

**Cause:** Your network uses a corporate SSL inspection proxy that presents its own certificate for outbound HTTPS connections. Node.js does not trust the proxy's CA certificate by default.

**Fix:** Save your corporate CA certificate path once:

```bash
cve-lite config set ca-cert /path/to/corporate-ca.crt
```

All subsequent scans and advisory syncs will use it automatically. To pass it for a single run only:

```bash
cve-lite . --ca-cert /path/to/corporate-ca.crt
```

The certificate must be a PEM file (plain text, starting with `-----BEGIN CERTIFICATE-----`). Your IT team can provide it, or you can export it from your system keychain or browser.

See [Corporate SSL Proxy](./corporate-proxy.md) for the full setup and export instructions.

---

## Advisory sync is slow

**Symptom:** `cve-lite advisories sync` takes a very long time.

**Cause:** The first sync downloads the full OSV npm advisory dump (~200K+ records). Subsequent syncs are faster because of bulk SQLite ingestion optimizations.

**Fix:**
- Let the first sync complete. On a typical machine it runs in under 10 seconds after the download.
- If the download itself is slow, check your network connection or consider running the sync during off-peak hours and caching the result.

---

## Offline scan fails or returns stale results

**Symptom:** Offline scan exits with an error or the advisory DB freshness warning appears.

**Possible causes and fixes:**

- **No local DB exists** — run `cve-lite advisories sync` first before using `--offline`.
- **DB is stale** — run `cve-lite advisories sync` to refresh it. The scan warns when the DB has not been updated recently.
- **Wrong DB path** — if using `--offline-db`, verify the path points to a valid `.db` file produced by `cve-lite advisories sync --output`.

---

## --fix does not apply a fix

**Symptom:** Running `--fix` reports that no fixes were applied, or skips a finding you expected it to fix.

**Cause:** `--fix` only applies fixes for direct dependencies with a validated lowest known non-vulnerable version. It does not auto-apply transitive overrides.

**Fix:**
- Check the scan output for the `skipped` section to see why a finding was not auto-fixed.
- For transitive issues, follow the parent-upgrade guidance in the verbose output instead.
- Run `cve-lite /path/to/project --verbose` to see the full fix plan including manual steps.

---

## CI build fails unexpectedly

**Symptom:** A CI job using `--fail-on` fails even though you believe the project is clean.

**Possible causes and fixes:**

- **New advisory published** — OSV may have added a new advisory since the last scan. Review the findings in the CI log and apply the suggested fix.
- **Lockfile changed** — a dependency update may have introduced a new vulnerable transitive package. Run the scan locally with `--verbose` to identify it.
- **Severity threshold too low** — check the `--fail-on` value in your CI config. `--fail-on high` will fail on high and critical findings; adjust if needed.

---

## Permission errors on install

**Symptom:** `npm install -g cve-lite-cli` fails with a permissions error.

**Fix:** Avoid using `sudo` with npm. Instead, configure npm to use a directory you own:

```bash
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
npm install -g cve-lite-cli
```

Or use a Node version manager (nvm, fnm, volta) which installs to user-owned directories by default.

---

Still stuck? [Open an issue](https://github.com/sonukapoor/cve-lite-cli/issues) with your lockfile type, Node version, and the full error output.
