# Output before/after: #304 reduce verbose duplication

Project scanned: `vulnerable-examples/transitive-path-high` (react-router-dom → react-router → path-to-regexp@1.7.0)
Command: `cve-lite <path> --offline` and `cve-lite <path> --verbose --offline`

---

## Default output (no --verbose)

### Before

```
>_  CVE Lite CLI (1.12.1)
────────────────────────────────
✔ Scan dependencies
✔ Highlight critical issues
✔ Show a clear fix plan

Fast. Local. Developer-first.

Offline mode: enabled (no external advisory calls will be made)
Advisory source: local advisory database
Advisory DB freshness: synced 2 days ago
Parsed 18 packages from package-lock (package-lock.json)
Cache: 9464 package match records, 280 advisory detail records

────────────────────────────────
📦 Vulnerabilities found
────────────────────────────────

HIGH     path-to-regexp@1.7.0
            Transitive dependency
            Fix: Upgrade react-router-dom — check for release resolving path-to-regexp to 0.1.10+

────────────────────────────────
🚀 Top Priority Issue
────────────────────────────────

Upgrade react-router-dom to resolve path-to-regexp
No confident automatic command is available for this issue yet.

────────────────────────────────
Summary
────────────────────────────────

1 vulnerable packages
1 high
0 direct · 1 transitive

✖ Scan complete. 1 urgent issue found.
Run with --verbose for fix plan, paths, and full table.
```

### After

```
>_  CVE Lite CLI (1.12.1)
────────────────────────────────
✔ Scan dependencies
✔ Highlight critical issues
✔ Show a clear fix plan

Fast. Local. Developer-first.

Offline mode: enabled (no external advisory calls will be made)
Advisory source: local advisory database
Advisory DB freshness: synced 2 days ago
Parsed 18 packages from package-lock (package-lock.json)
Cache: 9464 package match records, 280 advisory detail records

────────────────────────────────
📦 Vulnerabilities found
────────────────────────────────

HIGH     path-to-regexp@1.7.0
            Transitive dependency
            Fix: Upgrade react-router-dom — check for release resolving path-to-regexp to 0.1.10+

────────────────────────────────
Summary
────────────────────────────────

1 vulnerable packages
1 high
0 direct · 1 transitive

✖ Scan complete. 1 urgent issue found.
Run with --verbose for fix plan, paths, and full table.
```

**Removed:** "🚀 Top Priority Issue" block — it repeated the finding already shown above it with no additional information.

---

## Verbose output (--verbose)

### Before

```
✗ Found 1 package(s) with known OSV matches from package-lock
  critical: 0  high: 1  medium: 0  low: 0  unknown: 0

Quick take
- 0 vulnerable packages look directly fixable in this project.
- 1 issue come through other dependencies.
- 1 unique advisories matched overall.
- 1 package include a fixed-version hint from OSV.

🚀 Top priority fixes
- path-to-regexp@1.7.0 (high, transitive)
  Risk: Transitive issue. Look for a parent dependency upgrade that pulls in 0.1.10+
  Parent: react-router-dom
  Next: Upgrade react-router-dom — no safe version identified. Find a release resolving path-to-regexp to 0.1.10+.

📋 Suggested fix plan
2) Review these urgent transitive issues next:
   - path-to-regexp@1.7.0: Upgrade react-router-dom — no safe version was identified automatically. Check for a release that resolves path-to-regexp to 0.1.10+.

Coverage notes
• Scanned resolved dependency versions from package-lock.json.
• Dependency paths are derived from lockfile package locations.
• [... 5 more boilerplate lines ...]

Where the issues are
- Direct dependencies: 0
- Transitive dependencies: 1

┌────────────────┬─────────┬──────────┬────────────┬───────┬────────┬─────────────────────┐
│ Package        │ Version │ Severity │ Type       │ Usage │ Fixed  │ IDs                 │
├────────────────┼─────────┼──────────┼────────────┼───────┼────────┼─────────────────────┤
│ path-to-regexp │ 1.7.0   │ high     │ transitive │ n/a   │ 0.1.10 │ GHSA-9wv6-86v2-598j │
└────────────────┴─────────┴──────────┴────────────┴───────┴────────┴─────────────────────┘

Dependency paths to inspect
- path-to-regexp@1.7.0
  project -> react-router-dom -> react-router -> path-to-regexp

────────────────────────────────
✖ Scan complete. 1 issue found (0 critical, 1 high). Start with the priority fixes above.
```

### After

```
✗ Found 1 package(s) with known OSV matches from package-lock
  critical: 0  high: 1  medium: 0  low: 0  unknown: 0

Quick take
- 0 vulnerable packages look directly fixable in this project.
- 1 issue come through other dependencies.
- 1 unique advisories matched overall.
- 1 package include a fixed-version hint from OSV.

Coverage notes
• Scanned resolved dependency versions from package-lock.json.
• Dependency paths are derived from lockfile package locations.
• [... 5 more boilerplate lines ...]

┌────────────────┬─────────┬──────────┬────────────┬───────┬────────┬─────────────────────┐
│ Package        │ Version │ Severity │ Type       │ Usage │ Fixed  │ IDs                 │
├────────────────┼─────────┼──────────┼────────────┼───────┼────────┼─────────────────────┤
│ path-to-regexp │ 1.7.0   │ high     │ transitive │ n/a   │ 0.1.10 │ GHSA-9wv6-86v2-598j │
└────────────────┴─────────┴──────────┴────────────┴───────┴────────┴─────────────────────┘

Dependency paths to inspect
- path-to-regexp@1.7.0
  project -> react-router-dom -> react-router -> path-to-regexp

────────────────────────────────
✖ Scan complete. 1 issue found (0 critical, 1 high). Start with the priority fixes above.
```

**Removed:**
- "🚀 Top priority fixes" — repeated findings already visible in the fix-commands table and the findings table
- "📋 Suggested fix plan" — same guidance a third time, grouped by severity
- "Where the issues are" — direct/transitive counts already shown in "Quick take" above and in the table "Type" column
