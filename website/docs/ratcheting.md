---
title: Ratcheting Mode
description: Use ratcheting to adopt CVE Lite CLI as a hard CI gate on codebases with existing vulnerability debt.
---

# Ratcheting Mode

When adopting CVE Lite CLI as a hard CI gate on a codebase that already has vulnerabilities, `--fail-on` will block every PR until all pre-existing issues are resolved. That is rarely realistic on a production codebase.

Ratcheting lets you accept the current state and only fail on findings introduced above that baseline. Existing vulnerabilities are tracked but do not block - they get cleaned up gradually. Once you fix one, the baseline drops and can never go back up.

---

## Setup

Run once locally to snapshot the current findings:

```bash
cve-lite . --ratchet
```

This creates `.cve-lite/baseline.json` in your project root and exits 0. Commit the file so your whole team and CI share the same baseline.

```bash
git add .cve-lite/baseline.json
git commit -m "chore: establish vulnerability baseline"
```

---

## How it works in CI

No flag changes needed. Once the baseline file exists, every scan automatically suppresses known findings:

```bash
cve-lite . --fail-on high
```

Pre-existing findings are hidden. Only new findings - things introduced above the baseline - trigger failure. Your existing CI commands work exactly as before.

---

## Output

When all findings are suppressed:

```
✓ Scan complete. No known vulnerabilities found.

No new findings above baseline - 7 existing findings suppressed
```

When new findings appear:

```
3 new findings above baseline - 7 existing findings suppressed
```

---

## Updating the baseline

After fixing some vulnerabilities, reset the baseline by running `--ratchet` again:

```bash
cve-lite . --ratchet
git add .cve-lite/baseline.json
git commit -m "chore: update vulnerability baseline"
```

Because the baseline is committed to git, every update is tracked and reversible.

---

## Ignoring the baseline

To run a full scan without suppression, delete or rename `.cve-lite/baseline.json`. No flag needed. The file's presence is what activates ratcheting.

---

## How matching works

A finding is suppressed if every advisory ID on that `name@version` combination was present when the baseline was saved. If a package gains a new advisory ID not in the baseline, that finding surfaces as new - even if the package version itself was already baselined.

This means:
- Same package, same version, same advisory - suppressed
- Same package, same version, new advisory - surfaces as new
- New package not in baseline at all - surfaces as new

---

## See also

- [Workflow Integration](workflow-integration) - pre-commit hooks and GitHub Actions setup
- [How Remediation Works](how-remediation-works) - how fix commands are generated
- [CLI Reference](cli-reference) - full flag documentation
