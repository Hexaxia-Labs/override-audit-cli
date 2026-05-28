# Fix Mode Guide (`--fix`)

`--fix` is a conservative auto-remediation mode for CVE Lite CLI.

It is intended to reduce manual install-scan-repeat loops while keeping behavior explicit and predictable.

## What `--fix` does in v1

- applies fixes for **direct dependencies only**
- requires a validated **lowest known non-vulnerable version** target
- uses package-manager-native commands:
  - `npm install`
  - `pnpm add`
  - `yarn add`
- rescans automatically after fixes are applied
- prints a concise summary:
  - applied fixes
  - skipped findings
  - findings before/after fix
  - remaining severity mix

## What `--fix` does not do in v1

- does not auto-apply transitive override/resolution rules
- does not guarantee compatibility with your codebase
- does not perform exploitability or runtime reachability analysis

## Basic usage

```bash
npx cve-lite-cli /path/to/project --fix
```

## Typical output flow

1. scan starts and loads advisory matches
2. `Applying fixes (--fix)` section begins
3. direct package fixes are applied with progress (for example `Applying direct fix 3/7: npm install pkg@version`)
4. scan reruns automatically
5. concise fix summary is printed

## How to interpret skipped findings

- `Transitive (v1 skip)` means a parent upgrade path may exist, but `--fix` intentionally does not auto-apply it in v1.
- `No validated direct target` means a direct dependency did not have a safe validated target for automatic remediation.

For full diagnostic context, run a separate verbose scan:

```bash
npx cve-lite-cli /path/to/project --verbose
```

## Recommended workflow

1. run `--fix` for fast direct remediation
2. review remaining findings in summary
3. run `--verbose` when you need full parent-path and table-level detail
4. test your project after dependency updates
