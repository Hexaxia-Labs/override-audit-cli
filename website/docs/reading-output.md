---
sidebar_label: Reading the Output
---

# Reading the Output

This guide explains how to read CVE Lite CLI output and turn it into next actions.

---

## Default (compact) output

Running `cve-lite .` without flags gives you a focused view: the top urgent findings, copy-and-run fix commands, and a summary.

**What to read first:**

- The **Vulnerabilities found** block — top critical/high packages with one-line fix guidance each
- The **Copy And Run These Fix Commands** block — grouped, package-manager-native commands ready to execute
- The **Summary** — total count broken down by severity and direct vs transitive

**When to use `--all`:**

Add `--all` to append a full findings table covering every severity level, including low and unknown.

```bash
cve-lite . --all
```

---

## Verbose output

Add `--verbose` for the full picture: severity counts, full fix command tables, complete findings table, and coverage notes.

```bash
cve-lite . --verbose --all
```

The screenshots below use a real OWASP Juice Shop scan.

### 1) Start with the summary

The top of verbose output tells you how much risk you are dealing with and where it sits.

![Juice Shop verbose summary](https://raw.githubusercontent.com/sonukapoor/cve-lite-cli/main/assets/owasp-juice-shop-1.png)

What to read first:

- the severity counts (`Critical`, `High`, `Medium`, `Low`, `Unknown` counts)
- direct vs transitive split in `Quick take`
- unique advisories count

What to do next:

- if `Critical` or `High` is non-zero, move straight to `Copy And Run These Fix Commands`

### 2) Use command groups for first-pass fixes

Verbose mode groups runnable commands by severity and fix type.

![Juice Shop copy-and-run command groups](https://raw.githubusercontent.com/sonukapoor/cve-lite-cli/main/assets/owasp-juice-shop-2.png)

How to use this section:

- run critical/high command groups first
- run direct fix groups next
- rescan after each command group
- check `Breaking?` (⚠) on any target — a flagged version is a major bump and may introduce breaking changes

Why this helps:

- you avoid manual package-by-package trial and error
- you get package-manager-native commands ready to copy and run

### 3) Use the findings table for risk inventory

The main findings table is your full inventory of affected packages, severity, relationship type, fixed-version hints, and advisory IDs.

![Juice Shop findings table](https://raw.githubusercontent.com/sonukapoor/cve-lite-cli/main/assets/owasp-juice-shop-4.png)

How to use this section:

- read `Package` and `Version` to understand what you control
- use `Usage` to quickly identify if the dependency is actually imported or just noise (requires `--usage` flag)
- use `Fixed` to see what the safe target version is

### 4) Review coverage notes

Coverage notes appear below the findings table. They describe what the scan covered and what it did not — useful for understanding gaps before sharing results with a team.

---

## 10-minute workflow

1. Run `cve-lite . --verbose --all`.
2. Apply critical/high command groups.
3. Apply direct fix groups with validated targets.
4. Apply parent-upgrade command groups for transitive paths.
5. Rescan and repeat until urgent findings are reduced.

This approach keeps remediation practical: start with executable commands, then handle deeper dependency decisions with the table as reference.
