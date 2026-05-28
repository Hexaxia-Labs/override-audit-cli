
# Getting Started

CVE Lite CLI is a fast, local-first vulnerability scanner for JavaScript and TypeScript projects.

It scans your existing lockfile, identifies known vulnerabilities using the OSV database, and gives you a clear remediation path — without requiring accounts, API keys, or uploading your code.

---

## Install

Install globally using npm:

```bash
npm install -g cve-lite-cli
```

Or run it directly without installing:

```bash
npx cve-lite-cli
```

---

## Run your first scan

Navigate to your project:

```bash
cd your-project
```

Run:

```bash
cve-lite .
```

That’s it.

The CLI will:

* detect your lockfile (npm, pnpm, or Yarn)
* scan dependencies locally
* match vulnerabilities using OSV
* classify issues (direct vs transitive)
* suggest a fix plan when possible

---

## Example output

When you run cve-lite, you don’t just get a list of CVEs — you get a clear, structured view of what actually matters and how to fix it.

Example:

```bash
>_  CVE Lite CLI (1.12.1)
────────────────────────────────
✔ Scan dependencies
✔ Highlight critical issues
✔ Show a clear fix plan

Fast. Local. Developer-first.

Advisory source: OSV (https://api.osv.dev)
Parsed 1092 packages from package-lock (package-lock.json)
Cache: 9454 package match records, 277 advisory detail records
✓ Loaded package matches from cache
✓ Loaded 17 vulnerability detail records
✓ Analyzed vulnerability findings

────────────────────────────────
📦 Vulnerabilities found
────────────────────────────────

HIGH     @angular/compiler@19.2.19
            Direct dependency
            Fix: upgrade to 19.2.20

HIGH     @angular/core@19.2.19
            Direct dependency
            Fix: upgrade to 19.2.20

HIGH     picomatch@4.0.2
            Transitive dependency
            Fix: No dependency path found — inspect lockfile to identify which package pulls in picomatch

────────────────────────────────
🛠  Copy And Run These Fix Commands
────────────────────────────────

Detected package manager: npm (package-lock.json)
2 command groups ready across 3 packages (1 high, 1 medium).
Validation: scanned 10 package versions; 7 are still known vulnerable.

High severity fix commands
> npm install @angular/compiler@19.2.20 @angular/core@19.2.20

Medium severity direct fixes
> npm install postcss@8.5.10

────────────────────────────────
🚀 Top Priority Issue
────────────────────────────────

Upgrade @angular/compiler → 19.2.20
Command:
> npm install @angular/compiler@19.2.20

────────────────────────────────
Summary
────────────────────────────────

11 vulnerable packages
7 high · 3 medium · 1 low
4 direct · 7 transitive

✖ Scan complete. 7 urgent issues found.
Run with --verbose for fix plan, paths, and full table.
```

### What you’re seeing

The output is intentionally structured to help you move from **detection → decision → remediation** quickly.

---

### Vulnerabilities (direct vs transitive)

Each issue is clearly labeled:

* **Direct dependencies** → you can fix these immediately
* **Transitive dependencies** → require deeper inspection

Example:

```bash
HIGH     @angular/compiler@19.2.19
         Direct dependency
         Fix: upgrade to 19.2.20
```

This helps you prioritize what you can fix right away vs what may require dependency chain analysis.

---

### Copy And Run These Fix Commands (key feature)

This is the most important part of the output — and the main difference from most vulnerability scanners.

Instead of forcing you to:

* read logs
* search advisories
* manually figure out versions

CVE Lite CLI generates **ready-to-run commands**:

```bash
High severity fix commands
> npm install @angular/compiler@19.2.20 @angular/core@19.2.20
```

These commands are:

* **validated against known vulnerable versions**
* **grouped by severity**
* **aligned with your package manager**
* **safe upgrade targets where available**

This means:

> You can copy, paste, and fix multiple vulnerabilities in seconds — often without leaving your terminal.

No digging through logs. No guesswork.
No need to manually trace dependency chains or search for safe versions.

---

### Top Priority Issue

The CLI highlights the **single most important fix**:

```bash
Upgrade @angular/compiler → 19.2.20
```

This is useful when:

* you don’t have time to fix everything
* you want the biggest risk reduction first

---

### Summary

At the end, you get a clean overview:

```bash
11 vulnerable packages
7 high · 3 medium · 1 low
4 direct · 7 transitive
```

Along with a final status:

```bash
✖ Scan complete. 7 urgent issues found.
```

---

## From Scan Results to Fixes — Fast

Most tools stop at **telling you what’s wrong**.
CVE Lite CLI focuses on **getting you to a fix**.

* Clear prioritization
* Direct vs transitive visibility
* Actionable fix commands
* Minimal time from scan → fix

---

## Before / After 

```bash
Before:
7 high vulnerabilities

After applying suggested fix commands:
2 high vulnerabilities
```

---

## Fix vulnerabilities

CVE Lite CLI suggests safe upgrade targets where possible.

You can apply fixes manually:

```bash
npm install <package>@<safe-version>
```

Or use the CLI’s fix helper:

```bash
cve-lite --fix
```

---

## Common next commands

After your first scan, these commands help you go deeper, automate checks, and integrate CVE Lite CLI into your workflow.

---

### Generate a shareable report

``` bash
cve-lite --report
```

Creates a local HTML report with:

* vulnerability summary
* direct vs transitive breakdown
* fix suggestions
* clean, readable layout for sharing

Useful for:

* sharing findings with your team
* attaching to GitHub issues
* documenting security reviews

[See more details](./html-report.md)

---

### Show detailed output

```bash
cve-lite --verbose
```
Use this when you want:

* full vulnerability tables
* dependency paths (where available)
* deeper insight into transitive issues

[See more details](./reading-output.md)

---

### Fail builds based on severity

```
cve-lite --fail-on high
```
Common values:

* critical
* high
* medium
* low

Useful for:

* CI pipelines
* enforcing security thresholds before release

[See more details](./workflow-integration.md)

---

### Generate machine-readable output

```bash
cve-lite --json
#cve-lite --sarif (Coming soon)
```

Use this for:

* GitHub code scanning
* automated reporting
* integrating with other tools

[See more details](./workflow-integration.md#offline-scan-with-json-output)

---

### Apply suggested fixes

```bash
cve-lite --fix
```

Uses the CLI’s validated fix plan to guide remediation.

[See more details](./fix-mode.md)

---

### Run in offline mode

```bash
cve-lite --offline
```

Uses cached advisory data.

Useful for:

* restricted environments
* faster repeated scans

[See more details](./offline-advisory-db.md)

## Limitations

CVE Lite CLI focuses on dependency vulnerability scanning.

It does **not** currently provide:

* runtime exploitability analysis
* container or infrastructure scanning
* secrets detection