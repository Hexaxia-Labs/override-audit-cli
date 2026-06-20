<div align="center">

# override-audit-cli

### This project has merged into **[OWASP CVE Lite CLI](https://github.com/OWASP/cve-lite-cli)**.

Override hygiene is now a built-in part of CVE Lite. This repository is archived.

</div>

---

## Where it went

`override-audit-cli` started as a standalone auditor for npm / pnpm / yarn dependency overrides. That work now lives inside **OWASP/cve-lite-cli**, so dependency hygiene and CVE scanning ship as one tool.

- **New home:** https://github.com/OWASP/cve-lite-cli
- **The merge:** [OWASP/cve-lite-cli#718](https://github.com/OWASP/cve-lite-cli/pull/718) (tracking issue [#717](https://github.com/OWASP/cve-lite-cli/issues/717))

## Use it now

Same eight detectors (OA001-OA008), now under the `cve-lite` command:

```bash
# Audit your overrides directly
cve-lite overrides .

# Or fold override hygiene into a normal vulnerability scan
cve-lite . --check-overrides
```

It catches what a CVE scan alone never will: orphaned override targets, floating-tag pins, misplaced sections, surpassed pins, ineffective nested overrides, parent-binary coupling, registry drift, and on-disk materialized vulnerable copies. With `--fix`, an applied override fix re-runs the relevant detectors to confirm it actually took.

## The old standalone code

The full pre-merge standalone project is preserved on the [`archive/main`](https://github.com/Hexaxia-Labs/override-audit-cli/tree/archive/main) branch. Nothing is lost; new work happens upstream in CVE Lite.

## Why merge

The goal was always to make dependency hygiene the default for every JS/TS developer, not just security teams. Folding it into an established OWASP tool puts it in front of far more people than a separate CLI ever could.

---

<div align="center">

Built by Aaron Lamb ([Hexaxia Labs](https://github.com/Hexaxia-Labs)) · co-developed with [Sonu Kapoor](https://github.com/sonukapoor) · now part of [OWASP CVE Lite CLI](https://github.com/OWASP/cve-lite-cli).

</div>
