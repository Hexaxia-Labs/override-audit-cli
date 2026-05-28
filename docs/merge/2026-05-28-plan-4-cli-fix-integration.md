# Plan 4: CLI subcommand + `--fix` integration + exit code 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `cve-lite overrides [path] [flags]` subcommand, hook `verify()` into the existing `--fix` flow for OA-applied patches, and introduce exit code `2` for "fix applied but did not take." After this plan, the merged CLI is usable end-to-end on a real project: `cve-lite overrides` runs the full audit, and `cve-lite [path] --fix` applies OA fixes and verifies them automatically.

**Architecture:** `src/cli/args.ts` gains a third subcommand branch (joining `advisories sync` and `install-skill`) and the existing positional scan branch grows two new flags (`--audit-log`, `--check-overrides`). The subcommand entry lives at `src/cli/commands/overrides.ts` and reads from `src/overrides/api.ts`. `--fix` integration happens inside `src/index.ts` at the same point the existing CVE fix-command plan is built: after the existing plan, we additionally run an OA audit, apply rfc6902 fixes for any OA finding that has one, then verify those targets. CVE fix commands (still emitted, not applied) are unaffected.

**Tech Stack:** TypeScript. No new runtime deps.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Target Architecture" (`cve-lite overrides`, `--fix`), "Exit codes".

**Prerequisite:** Plans 1, 2, 3 complete. `audit()`, `verify()`, `applyFix()` all work; tests green.

---

## File Structure

Create:
- `src/cli/commands/overrides.ts` - entry for `cve-lite overrides`
- `src/cli/fix-overrides-hook.ts` - the `--fix` integration: apply OA rfc6902 fixes, then run `verify()`
- `tests/cli/overrides-command.test.ts`
- `tests/cli/fix-overrides-hook.test.ts`

Modify:
- `src/cli/args.ts` - add `"overrides"` to `CliCommand`, parse `cve-lite overrides [path]` and its flags
- `src/cli/help.ts` - add `cve-lite overrides` help text
- `src/types.ts` - add `"overrides"` to `CliCommand` union (already partly handled by Plan 1's re-exports; here we extend the union directly)
- `src/index.ts` - branch on `command === "overrides"`, hook fix-overrides into the existing `--fix` flow, return exit code `2` when `verify()` fails

---

## Task 1: Extend `CliCommand` and `ParsedOptions`

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Find the current `CliCommand` definition**

```bash
grep -n "CliCommand\|ParsedOptions" src/types.ts
```

- [ ] **Step 2: Extend the `CliCommand` type**

Edit `src/types.ts` and change:

```ts
export type CliCommand = "scan" | "advisories-sync" | "install-skill";
```
to:
```ts
export type CliCommand = "scan" | "advisories-sync" | "install-skill" | "overrides" | "config";
```

(Note: `config` may already be present depending on cve-lite's `main` state - keep both `config` and `overrides`.)

- [ ] **Step 3: Add the new options to `ParsedOptions`**

Append to the `ParsedOptions` type:
```ts
  /** --audit-log <path> - project-wide opt-in NDJSON change-control stream. */
  auditLog?: string;
  /** --check-overrides - run override hygiene checks as part of `scan` (off by default; spec keeps default scan CVE-only). */
  checkOverrides?: boolean;
  /** --check-network - gates OA007 registry calls inside `cve-lite overrides`. */
  checkNetwork?: boolean;
  /** --rule <id> - filter `overrides` to a single rule (OA001..OA008). */
  rule?: string;
```

- [ ] **Step 4: Verify the project still compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add overrides to CliCommand and new --audit-log / --check-network / --rule options"
```

---

## Task 2: Extend `src/cli/args.ts`

**Files:**
- Modify: `src/cli/args.ts`

- [ ] **Step 1: Add the `overrides` subcommand branch**

In `src/cli/args.ts`, after the `install-skill` branch and before the positional scan branch, insert:

```ts
  if (argv[0] === "overrides") {
    let projectArg: string | undefined;
    for (let i = 1; i < argv.length; i++) {
      const arg = argv[i];
      if (arg === "-h" || arg === "--help") { options.help = true; continue; }
      if (arg === "--json") { options.json = true; continue; }
      if (arg === "--fix") { options.fix = true; continue; }
      if (arg === "--check-network") { options.checkNetwork = true; continue; }
      if (arg === "--audit-log") { options.auditLog = argv[++i]; continue; }
      if (arg.startsWith("--audit-log=")) { options.auditLog = arg.slice("--audit-log=".length); continue; }
      if (arg === "--rule") { options.rule = argv[++i]; continue; }
      if (arg.startsWith("--rule=")) { options.rule = arg.slice("--rule=".length); continue; }
      if (arg === "--fail-on") { options.failOn = argv[++i] ?? options.failOn; continue; }
      if (arg.startsWith("--fail-on=")) { options.failOn = arg.slice("--fail-on=".length); continue; }
      if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
      if (!projectArg) { projectArg = arg; continue; }
      throw new Error(`Unexpected argument: ${arg}`);
    }
    return { command: "overrides", options, projectArg };
  }
```

- [ ] **Step 2: Add the new flags to the positional scan branch**

In the positional scan loop (around line 40 of args.ts), add:
```ts
      if (arg === "--audit-log") { options.auditLog = argv[++i]; continue; }
      if (arg.startsWith("--audit-log=")) { options.auditLog = arg.slice("--audit-log=".length); continue; }
      if (arg === "--check-overrides") { options.checkOverrides = true; continue; }
```

- [ ] **Step 3: Write a test**

`tests/cli/overrides-args.test.ts`:
```ts
import { parseArgs } from "../../src/cli/args.js";

describe("parseArgs - overrides subcommand", () => {
  it("parses `cve-lite overrides .` as command=overrides", () => {
    const { command, projectArg } = parseArgs(["overrides", "."]);
    expect(command).toBe("overrides");
    expect(projectArg).toBe(".");
  });

  it("parses `overrides --json --check-network`", () => {
    const { command, options } = parseArgs(["overrides", ".", "--json", "--check-network"]);
    expect(command).toBe("overrides");
    expect(options.json).toBe(true);
    expect(options.checkNetwork).toBe(true);
  });

  it("parses --audit-log path", () => {
    const { options } = parseArgs(["overrides", ".", "--audit-log", "/tmp/x.ndjson"]);
    expect(options.auditLog).toBe("/tmp/x.ndjson");
  });

  it("parses --rule OA001", () => {
    const { options } = parseArgs(["overrides", ".", "--rule", "OA001"]);
    expect(options.rule).toBe("OA001");
  });
});

describe("parseArgs - scan flags additions", () => {
  it("parses --audit-log on the scan path", () => {
    const { command, options } = parseArgs([".", "--audit-log=/tmp/x.ndjson"]);
    expect(command).toBe("scan");
    expect(options.auditLog).toBe("/tmp/x.ndjson");
  });

  it("parses --check-overrides", () => {
    const { options } = parseArgs([".", "--check-overrides"]);
    expect(options.checkOverrides).toBe(true);
  });
});
```

- [ ] **Step 4: Run the test**

```bash
npm test -- tests/cli/overrides-args.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/args.ts tests/cli/overrides-args.test.ts
git commit -m "feat(cli): parse overrides subcommand + --audit-log/--check-overrides/--rule/--check-network"
```

---

## Task 3: `src/cli/commands/overrides.ts` entry

**Files:**
- Create: `src/cli/commands/overrides.ts`

- [ ] **Step 1: Implement the command entry**

```ts
import { resolve } from "node:path";
import type { ParsedOptions } from "../../types.js";
import { buildOverrideContext } from "../../overrides/index.js";
import { audit, applyFix } from "../../overrides/index.js";
import type { OverrideFinding } from "../../overrides/index.js";
import { createAuditLog } from "../../audit-log/index.js";
import { EXIT_OK, EXIT_FINDINGS, EXIT_ERROR } from "../../types.js";
import { renderOverrideFindings } from "../../output/formatters.js";

interface RunArgs {
  projectArg: string | undefined;
  options: ParsedOptions;
  logger: import("../../utils/chalk.js").Logger;
}

export async function runOverrides({ projectArg, options, logger }: RunArgs): Promise<number> {
  const projectPath = resolve(projectArg ?? ".");
  const auditLog = createAuditLog(options.auditLog ?? process.env.CVE_LITE_AUDIT_LOG);

  try {
    const ctx = buildOverrideContext(projectPath, {
      auditLog,
      logger,
      checkNetwork: options.checkNetwork === true,
    });

    const result = await audit(ctx, { checkNetwork: options.checkNetwork === true });
    let findings = result.findings;

    if (options.rule) {
      findings = findings.filter((f) => f.ruleId === options.rule);
    }

    if (options.fix) {
      const fixable = findings.filter((f) => f.fix?.type === "rfc6902");
      if (fixable.length > 0) {
        const report = applyFix({
          projectPath,
          findings: fixable,
          auditLog,
          dryRun: false,
        });
        if (options.json) {
          process.stdout.write(JSON.stringify({ findings, fixReport: report }, null, 2) + "\n");
        } else {
          logger.info(
            `Applied ${report.appliedPatches.length} fix${report.appliedPatches.length === 1 ? "" : "es"}; skipped ${report.skipped.length}.`
          );
          process.stdout.write(renderOverrideFindings(findings) + "\n");
        }
        return findings.length > 0 && reachedFailOn(findings, options.failOn)
          ? EXIT_FINDINGS
          : EXIT_OK;
      }
    }

    if (options.json) {
      process.stdout.write(JSON.stringify({ findings }, null, 2) + "\n");
    } else {
      process.stdout.write(renderOverrideFindings(findings) + "\n");
    }

    return findings.length > 0 && reachedFailOn(findings, options.failOn)
      ? EXIT_FINDINGS
      : EXIT_OK;
  } catch (err) {
    logger.error(`overrides: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_ERROR;
  } finally {
    auditLog.close();
  }
}

function reachedFailOn(findings: OverrideFinding[], failOn: string): boolean {
  const rank: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const threshold = rank[failOn] ?? rank.critical;
  return findings.some((f) => (rank[f.severity] ?? 0) >= threshold);
}
```

**Note:** `renderOverrideFindings` does not exist yet - it ships in Plan 5. For this plan, stub it in `src/output/formatters.ts` with a minimal implementation:

```ts
// In src/output/formatters.ts, append:
import type { OverrideFinding } from "../overrides/types.js";

export function renderOverrideFindings(findings: ReadonlyArray<OverrideFinding>): string {
  if (findings.length === 0) return "No override hygiene findings.";
  return findings
    .map((f) => `${f.severity.toUpperCase()} ${f.ruleId} ${f.package.name} - ${f.message}`)
    .join("\n");
}
```

Plan 5 replaces this stub with the full formatter.

- [ ] **Step 2: Verify the project compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/commands/overrides.ts src/output/formatters.ts
git commit -m "feat(cli): runOverrides command with --fix, --rule, --audit-log, --check-network"
```

---

## Task 4: Wire `command === "overrides"` into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Locate the command dispatch in `src/index.ts`**

```bash
grep -n 'command === "advisories-sync"\|command === "install-skill"\|command === "config"' src/index.ts
```

- [ ] **Step 2: Add the `overrides` branch**

After the existing `install-skill` branch (or `config` branch, whichever is later), insert:

```ts
    if (command === "overrides") {
      const { runOverrides } = await import("./cli/commands/overrides.js");
      const exitCode = await runOverrides({
        projectArg,
        options,
        logger: createLogger(options),  // use whatever logger factory exists in index.ts
      });
      process.exit(exitCode);
    }
```

If `createLogger` is not the actual function name in cve-lite's index.ts, find the equivalent (e.g., direct use of `console` or a chalk-wrapped logger) and adapt.

- [ ] **Step 3: Write an end-to-end test**

`tests/cli/overrides-command.test.ts`:
```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "../../dist/index.js");

describe("cve-lite overrides (end-to-end)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "overrides-e2e-"));
    // Build first (assumes `npm run build` ran).
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns 0 on a clean project", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));
    const out = execFileSync(process.execPath, [CLI, "overrides", dir, "--json"]);
    const result = JSON.parse(out.toString());
    expect(result.findings).toHaveLength(0);
  });

  it("returns 1 on a project with an orphan override", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [CLI, "overrides", dir, "--json", "--fail-on", "high"]);
    } catch (err: any) {
      exitCode = err.status ?? -1;
    }
    expect(exitCode).toBe(1);
  });
});
```

- [ ] **Step 4: Build and run the test**

```bash
npm run build
npm test -- tests/cli/overrides-command.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/cli/overrides-command.test.ts
git commit -m "feat(cli): dispatch overrides command from src/index.ts"
```

---

## Task 5: `--fix` integration for scan path

When `cve-lite [path] --fix` runs against a project with overrides, OA fixes apply automatically and verify runs. Hook lives in `src/cli/fix-overrides-hook.ts` and is invoked from `src/index.ts` after the existing CVE fix-command plan is built.

**Files:**
- Create: `src/cli/fix-overrides-hook.ts`
- Modify: `src/index.ts` (call the hook from the scan path when `options.fix === true`)
- Test: `tests/cli/fix-overrides-hook.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/cli/fix-overrides-hook.test.ts`:
```ts
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOverridesFixHook } from "../../src/cli/fix-overrides-hook.js";
import { MemoryAuditLog } from "../../src/audit-log/index.js";

function noop() { return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any; }

describe("runOverridesFixHook", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fix-hook-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies an OA001 fix and verifies clean", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const log = new MemoryAuditLog();
    const result = await runOverridesFixHook({
      projectPath: dir,
      auditLog: log,
      logger: noop(),
    });

    expect(result.applied).toBeGreaterThan(0);
    expect(result.verifyOk).toBe(true);
    const updated = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(updated.overrides?.gone).toBeUndefined();
  });

  it("returns verifyOk=false when verify fails (OA001 still fires post-fix)", async () => {
    // Construct a scenario where applying the patch does NOT eliminate the orphan:
    // e.g., two orphans, fix only one. (Build the situation that fits OA test conventions.)
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { stillOrphan: "1.0.0", anotherOrphan: "2.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    const log = new MemoryAuditLog();
    const result = await runOverridesFixHook({
      projectPath: dir,
      auditLog: log,
      logger: noop(),
      // Force only the first orphan to be fixed (simulating a partial fix):
      filterFindings: (findings) => findings.slice(0, 1),
    });

    expect(result.applied).toBeGreaterThan(0);
    expect(result.verifyOk).toBe(false);
    expect(result.verifyFailures.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/cli/fix-overrides-hook.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/cli/fix-overrides-hook.ts`**

```ts
import { audit, verify, applyFix, buildOverrideContext } from "../overrides/index.js";
import type { OverrideFinding } from "../overrides/types.js";
import type { AuditLogHandle } from "../audit-log/index.js";

export interface FixHookArgs {
  projectPath: string;
  auditLog: AuditLogHandle;
  logger: import("../utils/chalk.js").Logger;
  /** Optional filter applied before fixing. Useful for tests and --rule. */
  filterFindings?: (findings: OverrideFinding[]) => OverrideFinding[];
}

export interface FixHookResult {
  applied: number;
  skipped: number;
  verifyOk: boolean;
  verifyFailures: ReadonlyArray<{ ruleId: string; package: string; reason: string }>;
}

export async function runOverridesFixHook(args: FixHookArgs): Promise<FixHookResult> {
  const ctx = buildOverrideContext(args.projectPath, {
    auditLog: args.auditLog,
    logger: args.logger,
    checkNetwork: false,
  });

  const auditResult = await audit(ctx, { checkNetwork: false });
  let fixable = auditResult.findings.filter((f) => f.fix?.type === "rfc6902");
  if (args.filterFindings) fixable = args.filterFindings(fixable);

  if (fixable.length === 0) {
    return { applied: 0, skipped: 0, verifyOk: true, verifyFailures: [] };
  }

  const report = applyFix({
    projectPath: args.projectPath,
    findings: fixable,
    auditLog: args.auditLog,
    dryRun: false,
  });

  // Rebuild context after the on-disk package.json changed.
  const ctxAfter = buildOverrideContext(args.projectPath, {
    auditLog: args.auditLog,
    logger: args.logger,
    checkNetwork: false,
  });

  const targets = report.appliedPatches.map((p) => ({ name: p.package }));
  const verifyResult = await verify(targets, ctxAfter);

  return {
    applied: report.appliedPatches.length,
    skipped: report.skipped.length,
    verifyOk: verifyResult.ok,
    verifyFailures: verifyResult.findings.map((f) => ({
      ruleId: f.ruleId,
      package: f.package.name,
      reason: f.message,
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/cli/fix-overrides-hook.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the hook into `src/index.ts` on the scan path**

Find the section of `src/index.ts` that handles `options.fix` for the scan command. After the existing CVE-fix logic completes, add:

```ts
if (options.fix) {
  const { runOverridesFixHook } = await import("./cli/fix-overrides-hook.js");
  const projectPathResolved = path.resolve(projectArg ?? ".");
  const fixResult = await runOverridesFixHook({
    projectPath: projectPathResolved,
    auditLog,                      // the handle created earlier in index.ts (Plan 5 wires this fully; for now use createAuditLog(options.auditLog))
    logger,
  });
  if (!fixResult.verifyOk) {
    logger.error(
      `fix applied but verify failed:\n${fixResult.verifyFailures
        .map((v) => `  ${v.ruleId} ${v.package}: ${v.reason}`)
        .join("\n")}`
    );
    process.exit(2);            // EXIT_VERIFY_FAILED
  }
}
```

If `auditLog` is not yet a variable in `src/index.ts`, create it at the top of the scan branch:
```ts
const auditLog = createAuditLog(options.auditLog ?? process.env.CVE_LITE_AUDIT_LOG);
```
and import `createAuditLog` from `./audit-log/index.js`.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/cli/fix-overrides-hook.ts src/index.ts tests/cli/fix-overrides-hook.test.ts
git commit -m "feat(cli): hook overrides fix+verify into scan --fix path; exit 2 on verify fail"
```

---

## Task 6: Help text

**Files:**
- Modify: `src/cli/help.ts`

- [ ] **Step 1: Find where the existing subcommands are documented**

```bash
grep -n "advisories sync\|install-skill" src/cli/help.ts
```

- [ ] **Step 2: Add a new help section for `cve-lite overrides`**

Add a section to `src/cli/help.ts` matching the established format:

```ts
const overridesHelp = `
cve-lite overrides [path] [flags]
  Audit package.json overrides for hygiene problems (OA001..OA008).

Flags:
  --json                  Emit findings as JSON
  --fix                   Apply RFC 6902 patches for findings with auto-fix
  --rule <id>             Only run a specific rule (OA001..OA008)
  --check-network         Enable OA007 registry drift check (opt-in network)
  --audit-log <path>      Stream NDJSON change-control to <path>
  --fail-on <severity>    Exit non-zero at or above this severity (default: critical)
  -h, --help              Show this help
`;
```

Reference this string in whatever existing help-dispatch function `src/cli/help.ts` uses.

- [ ] **Step 3: Smoke-check `cve-lite overrides --help`**

```bash
npm run build
node dist/index.js overrides --help
```
Expected: help text prints; exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/cli/help.ts
git commit -m "docs(cli): add `cve-lite overrides` to help"
```

---

## Task 7: End-to-end fix → verify exit-code test

**Files:**
- Create: `tests/cli/scan-fix-verify-exitcode.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(__dirname, "../../dist/index.js");

describe("cve-lite [path] --fix exit codes", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "scan-fix-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("returns 0 when --fix applies OA fixes and verify passes", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x", overrides: { gone: "1.0.0" },
    }, null, 2));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3, packages: { "": { name: "x" } },
    }));

    let exitCode = -1;
    try {
      execFileSync(process.execPath, [CLI, dir, "--fix", "--json"]);
      exitCode = 0;
    } catch (err: any) {
      exitCode = err.status;
    }
    expect(exitCode).toBe(0);
  });
});
```

(A targeted failure case to assert exit-code 2 requires inducing a verify failure. The hook test in Task 5 already covers that semantic path; this end-to-end test focuses on the green path. Add a tailored failure-path test later if Phase 2 / Plan 6 reveals a stable trigger.)

- [ ] **Step 2: Build and run**

```bash
npm run build
npm test -- tests/cli/scan-fix-verify-exitcode.test.ts
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/cli/scan-fix-verify-exitcode.test.ts
git commit -m "test(cli): end-to-end scan --fix exit code on clean verify"
```

---

## Task 8: Full-suite gate

- [ ] **Step 1: Run all tests**

```bash
npm test
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke against `_preserved-override-audit/tests/fixtures/`**

Pick a fixture with overrides and run both:
```bash
npm run build
node dist/index.js overrides _preserved-override-audit/tests/fixtures/<one>
node dist/index.js _preserved-override-audit/tests/fixtures/<one> --fix
```
Confirm the output is sensible and exit codes match expectations.

Plan 4 complete when:
- `cve-lite overrides [path]` runs end-to-end.
- `cve-lite [path] --fix` applies OA rfc6902 patches in-process and verifies them.
- Exit code 2 fires when verify fails.
- `--audit-log`, `--check-network`, `--rule` flags all work.
- Help text shows the new subcommand.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| `cve-lite overrides [path]` subcommand | Tasks 2, 3, 4 |
| `cve-lite [path] --fix` runs verify automatically | Task 5 |
| Exit code 2 on verify failure | Task 5 |
| `--audit-log` flag (both surfaces) | Task 2 |
| `--check-network` (gates OA007) | Tasks 2, 3 |
| `--rule` filter | Tasks 2, 3 |
| Help text mentions `overrides` | Task 6 |
| End-to-end test for clean `--fix` path | Task 7 |

## Next plan

Plan 5 (`docs/merge/2026-05-28-plan-5-output-integration.md`) replaces the stub `renderOverrideFindings` with the full terminal renderer, adds OA findings to JSON/SARIF/HTML outputs, and wires the full project-wide audit-log emission set into `src/scanner.ts`, `src/index.ts`, and `src/remediation/fix-commands.ts`.
