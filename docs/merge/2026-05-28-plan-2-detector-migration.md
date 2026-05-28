# Plan 2: Detector migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 8 OA detectors and their tests from `_preserved-override-audit/src/detectors/` into `src/overrides/detectors/`, port them to return `OverrideFinding[]` (instead of override-audit's `Finding[]`), and rewire them to consume an `OverrideContext` built from cve-lite's existing parsers. After this plan, all 8 detectors are callable as library functions, with the existing OA test suite migrated and green.

**Architecture:** Detectors stay pure functions: `detect(ctx: OverrideContext): OverrideFinding[]`. A new `buildOverrideContext()` adapter fills `OverrideContext` from cve-lite's parser outputs (`src/parsers/package-json.ts`, `src/parsers/npm-lock-graph.ts`, etc.). Composite logic from the original `_preserved-override-audit/src/scanner.ts` (OA005 vs OA001 dedup, OA006 severity escalation when OA008 confirms) moves into the runner alongside the detectors but stays out of individual detector bodies.

**Tech Stack:** TypeScript, Jest. Adds `semver` (^7.6.0) as a runtime dependency for OA002/OA004 version-range work.

**Spec reference:** `docs/merge/2026-05-28-cve-lite-merge-design.md` sections "Code Organization", "Layering Plan", "Integration Seams".

**Prerequisite:** Plan 1 complete. `src/audit-log/`, `src/overrides/types.ts`, and `OverrideFinding` exist and are tested.

---

## File Structure

Create:
- `src/overrides/context.ts` - `OverrideContext` interface + helper types
- `src/overrides/context-builder.ts` - `buildOverrideContext()` using cve-lite parsers
- `src/overrides/parsing/json-pointer.ts` - RFC 6901 helper (port from preserved)
- `src/overrides/parsing/package-json.ts` - override-entry extraction (port from preserved; cve-lite's package-json parser does not cover this shape)
- `src/overrides/parsing/installed-tree.ts` - node_modules walk (port; cve-lite's npm-lock-graph is lockfile-only, OA006/OA008 need on-disk traversal)
- `src/overrides/parsing/registry.ts` - dist-tags fetch for OA007 (port from preserved)
- `src/overrides/detectors/oa001-orphaned-target.ts`
- `src/overrides/detectors/oa002-floating-tag.ts`
- `src/overrides/detectors/oa003-wrong-section.ts`
- `src/overrides/detectors/oa004-surpassed-pin.ts`
- `src/overrides/detectors/oa005-nested-ineffective.ts`
- `src/overrides/detectors/oa006-coupled-platform-binary.ts`
- `src/overrides/detectors/oa007-frozen-latest.ts`
- `src/overrides/detectors/oa008-materialized.ts`
- `src/overrides/detectors/index.ts` - registry of all detectors
- `tests/overrides/detectors/<one per detector>.test.ts` (8 files)
- `tests/overrides/context-builder.test.ts`

Modify:
- `package.json` - add `semver` to dependencies (verify it's not already there from cve-lite)
- `src/overrides/index.ts` - re-export the detector registry and `OverrideContext`

Reference (read-only, do not modify):
- `_preserved-override-audit/src/detectors/*.ts` - source-of-truth detector logic
- `_preserved-override-audit/tests/detectors/*.test.ts` - source-of-truth test fixtures
- `_preserved-override-audit/src/parsers/*.ts` - original parsers (port what cve-lite cannot cover)
- `cve-lite-ref/src/parsers/package-json.ts`, `npm-lock-graph.ts` - cve-lite's parsers we reuse where possible

---

## Task 1: Verify `semver` dependency status

**Files:** `package.json`

- [ ] **Step 1: Check current deps**

```bash
node -e "const p=require('./package.json'); console.log('dep:', p.dependencies?.semver, 'devDep:', p.devDependencies?.semver)"
```

- [ ] **Step 2: If semver is not listed in dependencies, install it**

```bash
npm install semver@^7.6.0 @types/semver@^7.5.6 --save
```

If already present, skip the install but note the version. Detectors assume `semver` >= 7.6.

- [ ] **Step 3: Commit (only if install happened)**

```bash
git add package.json package-lock.json
git commit -m "feat(overrides): add semver dep for range work in OA002/OA004"
```

---

## Task 2: `OverrideContext` interface

**Files:**
- Create: `src/overrides/context.ts`

- [ ] **Step 1: Implement `src/overrides/context.ts`**

```ts
// Single context object built once per scan/audit and consumed by every
// detector. Filled by buildOverrideContext() from cve-lite's parser outputs.

import type { Logger } from "../utils/chalk.js";          // cve-lite logger
import type { AuditLogHandle } from "../audit-log/index.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun" | "unknown";

/** A package.json override entry (preserves nested shape). */
export type OverrideValue = string | { [key: string]: OverrideValue };

export interface OverrideEntry {
  /** Original key as written: "postcss" or "react@>=18". */
  key: string;
  /** Bare package name (key with any `@>=...` specifier stripped). */
  packageName: string;
  value: OverrideValue;
  /** Path through package.json: ["overrides","postcss"] or ["pnpm","overrides","react"]. */
  path: string[];
  container: "overrides" | "pnpm.overrides" | "resolutions";
}

/** A package installed under node_modules somewhere. */
export interface InstalledCopy {
  name: string;
  path: string;            // absolute path to the copy's directory
  version: string;
}

/** Parent declaration of a target - for OA006 platform-binary coupling. */
export interface ParentDeclaration {
  parentName: string;
  parentVersion: string;
  declaredIn: "dependencies" | "optionalDependencies" | "peerDependencies";
  declaredValue: string;
  exactVersion: boolean;
}

/** Registry dist-tags response subset - for OA007. */
export interface RegistryDistTags {
  latest?: string;
  next?: string;
  [tag: string]: string | undefined;
}

/** Reason a detector was pre-emptively skipped (e.g., missing node_modules). */
export interface SkippedDetector {
  ruleId: string;
  reason: string;
}

export interface OverrideContext {
  projectPath: string;
  packageJson: Record<string, unknown>;
  packageJsonRaw: string;
  packageManager: PackageManager;
  /** Flattened overrides across npm/pnpm/yarn-resolutions containers. */
  overrideEntries: OverrideEntry[];
  /** Bare package names present anywhere in the resolved lockfile tree. */
  lockfilePackageNames: Set<string>;
  /** name -> installed version (top-level node_modules only). */
  installedVersions: Map<string, string>;
  /** name -> every installed copy in the tree (lazy; OA006/OA008 fill this). */
  installedCopies: Map<string, InstalledCopy[]>;
  /** name -> parents that declare it. */
  parentDeclarations: Map<string, ParentDeclaration[]>;
  /** name -> registry dist-tags (only populated when --check-network). */
  registryDistTags: Map<string, RegistryDistTags>;
  /** Detectors the runner pre-skipped (lockfile missing, etc.). */
  skippedDetectors: SkippedDetector[];
  auditLog: AuditLogHandle;
  logger: Logger;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors. If cve-lite's `Logger` type lives at a different path, adjust the import; check `cve-lite-ref/src/utils/` for the source location and update.

- [ ] **Step 3: Commit**

```bash
git add src/overrides/context.ts
git commit -m "feat(overrides): OverrideContext interface"
```

---

## Task 3: Port supporting helpers (json-pointer, package-json, installed-tree, registry)

**Files:**
- Create: `src/overrides/parsing/json-pointer.ts`
- Create: `src/overrides/parsing/package-json.ts`
- Create: `src/overrides/parsing/installed-tree.ts`
- Create: `src/overrides/parsing/registry.ts`

These are direct ports from `_preserved-override-audit/src/`. The fixer also uses `json-pointer.ts` (relocated to `src/overrides/parsing/` so detectors and fixer share it).

- [ ] **Step 1: Copy each helper from preserved**

```bash
cp _preserved-override-audit/src/fixer/json-pointer.ts src/overrides/parsing/json-pointer.ts
cp _preserved-override-audit/src/parsers/package-json.ts src/overrides/parsing/package-json.ts
cp _preserved-override-audit/src/parsers/installed-tree.ts src/overrides/parsing/installed-tree.ts
cp _preserved-override-audit/src/parsers/registry.ts src/overrides/parsing/registry.ts
```

- [ ] **Step 2: Update import paths in each copied file**

In each file under `src/overrides/parsing/`, find imports of `../types.js` and adjust to `../context.js` (the OverrideEntry, InstalledCopy, etc. types now live there). Example for `package-json.ts`:

Before:
```ts
import type { OverrideEntry, OverrideValue } from '../types.js';
```

After:
```ts
import type { OverrideEntry, OverrideValue } from "../context.js";
```

Apply the equivalent rewrite to `installed-tree.ts` (uses `InstalledCopy`, `ParentDeclaration`) and `registry.ts` (uses `RegistryDistTags`).

- [ ] **Step 3: Verify compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Port their tests**

```bash
cp _preserved-override-audit/tests/parsers/installed-tree.test.ts tests/overrides/parsing/installed-tree.test.ts
cp _preserved-override-audit/tests/parsers/package-json.test.ts tests/overrides/parsing/package-json.test.ts
cp _preserved-override-audit/tests/parsers/registry.test.ts tests/overrides/parsing/registry.test.ts
# json-pointer tests live with fixer in the preserved tree; copy from there:
cp _preserved-override-audit/tests/fixer/json-pointer.test.ts tests/overrides/parsing/json-pointer.test.ts
mkdir -p tests/overrides/parsing
```

In each test file, update the import paths to point at the new locations (e.g., `'../../src/parsers/X.js'` becomes `'../../../src/overrides/parsing/X.js'`).

- [ ] **Step 5: Run the migrated parser tests**

```bash
npm test -- tests/overrides/parsing/
```
Expected: all PASS. If a test fails because of fixture-path differences, copy the relevant fixture into `tests/overrides/fixtures/` and adjust paths.

- [ ] **Step 6: Commit**

```bash
git add src/overrides/parsing/ tests/overrides/parsing/
git commit -m "feat(overrides): port json-pointer, package-json, installed-tree, registry helpers"
```

---

## Task 4: `buildOverrideContext()` adapter

**Files:**
- Create: `src/overrides/context-builder.ts`
- Test: `tests/overrides/context-builder.test.ts`

This is the bridge between cve-lite's existing parsers and `OverrideContext`. Where cve-lite's parsers cover what we need (lockfile package names), use them. Where they do not (overrides extraction, on-disk tree walk, registry), use the helpers from Task 3.

- [ ] **Step 1: Write the failing test (golden-path build)**

`tests/overrides/context-builder.test.ts`:
```ts
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function makeNoopLogger() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
}

describe("buildOverrideContext", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ctx-build-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("builds context for an npm project with one override", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { postcss: "8.5.15" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/postcss": { version: "8.5.15" },
      },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: makeNoopLogger() as any,
      checkNetwork: false,
    });

    expect(ctx.projectPath).toBe(dir);
    expect(ctx.packageManager).toBe("npm");
    expect(ctx.overrideEntries).toHaveLength(1);
    expect(ctx.overrideEntries[0].packageName).toBe("postcss");
    expect(ctx.lockfilePackageNames.has("postcss")).toBe(true);
  });

  it("flags OA001/OA004/OA006/OA008 as skipped when node_modules is absent", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { postcss: "8.5.15" },
    }));
    // No lockfile, no node_modules.

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: makeNoopLogger() as any,
      checkNetwork: false,
    });

    const ids = ctx.skippedDetectors.map((s) => s.ruleId);
    expect(ids).toEqual(expect.arrayContaining(["OA001", "OA004", "OA006", "OA008"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/overrides/context-builder.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/overrides/context-builder.ts`**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OverrideContext, PackageManager, SkippedDetector } from "./context.js";
import type { AuditLogHandle } from "../audit-log/index.js";
import { extractOverrideEntries } from "./parsing/package-json.js";
import { walkInstalledTree } from "./parsing/installed-tree.js";

// We reuse cve-lite's lockfile readers where they cover us. For the simple
// "what bare package names are in the resolved tree" question, the package-lock
// reader and pnpm-lock reader both already enumerate them in cve-lite. Hook in
// to whichever is appropriate based on package-manager detection.
import { readPackageLockNames } from "../parsers/package-lock.js";
import { readPnpmLockNames } from "../parsers/pnpm-lock.js";

export interface BuildOptions {
  auditLog: AuditLogHandle;
  logger: import("../utils/chalk.js").Logger;
  /** True when --check-network is set (gates OA007). */
  checkNetwork: boolean;
}

export function buildOverrideContext(
  projectPath: string,
  opts: BuildOptions
): OverrideContext {
  const pkgJsonPath = join(projectPath, "package.json");
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`buildOverrideContext: no package.json at ${projectPath}`);
  }
  const raw = readFileSync(pkgJsonPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const overrideEntries = extractOverrideEntries(parsed);
  const packageManager = detectPackageManager(projectPath);

  const lockfilePackageNames = readLockfileNames(projectPath, packageManager);
  const nodeModulesExists = existsSync(join(projectPath, "node_modules"));

  const skipped: SkippedDetector[] = [];
  if (lockfilePackageNames.size === 0 && overrideEntries.length > 0) {
    skipped.push({ ruleId: "OA001", reason: "lockfile missing or empty" });
  }
  if (!nodeModulesExists && overrideEntries.length > 0) {
    skipped.push({ ruleId: "OA004", reason: "node_modules missing" });
    skipped.push({ ruleId: "OA006", reason: "node_modules missing" });
    skipped.push({ ruleId: "OA008", reason: "node_modules missing" });
  }

  // installedVersions: top-level node_modules/<name>/package.json reads.
  const installedVersions = new Map<string, string>();
  if (nodeModulesExists) {
    for (const e of overrideEntries) {
      const v = readInstalledVersionTopLevel(projectPath, e.packageName);
      if (v) installedVersions.set(e.packageName, v);
      if (typeof e.value === "object" && e.value) {
        for (const innerKey of Object.keys(e.value)) {
          const iv = readInstalledVersionTopLevel(projectPath, innerKey);
          if (iv) installedVersions.set(innerKey, iv);
        }
      }
    }
  }

  const tree = nodeModulesExists
    ? walkInstalledTree(projectPath)
    : { installedCopies: new Map(), parentDeclarations: new Map() };

  // OA007 registry: only when --check-network. Empty otherwise.
  const registryDistTags: OverrideContext["registryDistTags"] = new Map();

  return {
    projectPath,
    packageJson: parsed,
    packageJsonRaw: raw,
    packageManager,
    overrideEntries,
    lockfilePackageNames,
    installedVersions,
    installedCopies: tree.installedCopies,
    parentDeclarations: tree.parentDeclarations,
    registryDistTags,
    skippedDetectors: skipped,
    auditLog: opts.auditLog,
    logger: opts.logger,
  };
}

function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lock"))) return "bun";
  if (existsSync(join(projectPath, "package-lock.json"))) return "npm";
  return "unknown";
}

function readLockfileNames(projectPath: string, pm: PackageManager): Set<string> {
  try {
    if (pm === "pnpm") return new Set(readPnpmLockNames(projectPath));
    if (pm === "npm") return new Set(readPackageLockNames(projectPath));
    // yarn, bun, unknown - fall through to empty; detectors that need this set
    // will get pre-skipped.
    return new Set();
  } catch {
    return new Set();
  }
}

function readInstalledVersionTopLevel(projectPath: string, name: string): string | null {
  const p = join(projectPath, "node_modules", ...name.split("/"), "package.json");
  try {
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
    return typeof j.version === "string" ? j.version : null;
  } catch {
    return null;
  }
}
```

**Note:** This task assumes cve-lite exposes `readPackageLockNames` and `readPnpmLockNames`. If those exports do not exist with those exact names, find the equivalents in `src/parsers/package-lock.ts` and `src/parsers/pnpm-lock.ts` and adjust the imports. If cve-lite's parser API returns a graph rather than a name list, derive the name set from the graph in `readLockfileNames`.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/context-builder.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/overrides/context-builder.ts tests/overrides/context-builder.test.ts
git commit -m "feat(overrides): buildOverrideContext adapter over cve-lite parsers"
```

---

## Task 5: Port OA001 (orphaned target) - full template

This task is the template for tasks 6 through 12. Every later detector follows the same shape: write the test, port the source, rebadge ruleId and references, adjust to `OverrideFinding`, verify.

**Files:**
- Create: `src/overrides/detectors/oa001-orphaned-target.ts`
- Create: `tests/overrides/detectors/oa001.test.ts`

- [ ] **Step 1: Migrate the test**

```bash
cp _preserved-override-audit/tests/detectors/orphan.test.ts tests/overrides/detectors/oa001.test.ts
```

Then edit `tests/overrides/detectors/oa001.test.ts`:

1. Update the import: `from '../../src/detectors/orphan.js'` becomes `from '../../../src/overrides/detectors/oa001-orphaned-target.js'`.
2. Update the type import: `Context, OverrideEntry` from `'../../src/types.js'` becomes `OverrideContext, OverrideEntry` from `'../../../src/overrides/context.js'`.
3. Update the `ctxOf` helper: rename `Context` to `OverrideContext`, add `auditLog: NULL_AUDIT_LOG` and `logger: noopLogger` to the returned object (use the imports `import { NULL_AUDIT_LOG } from "../../../src/audit-log/index.js"` and a tiny `noopLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any`).
4. Update assertions: `ruleId: 'OA001-ORPHAN-TARGET'` becomes `ruleId: 'OA001'`. `remediation: { action: 'remove' }` becomes `fix: { type: 'rfc6902', patch: [{ op: 'remove', path: '/overrides/gone-pkg' }] }`.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/overrides/detectors/oa001.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Create the detector**

```bash
cp _preserved-override-audit/src/detectors/orphan.ts src/overrides/detectors/oa001-orphaned-target.ts
```

Then edit `src/overrides/detectors/oa001-orphaned-target.ts`:

```ts
import type { OverrideContext } from "../context.js";
import type { OverrideFinding } from "../types.js";
import { jsonPointer } from "../parsing/json-pointer.js";

const RULE_ID = "OA001" as const;

export function detect(ctx: OverrideContext): OverrideFinding[] {
  if (ctx.skippedDetectors.some((s) => s.ruleId === RULE_ID)) return [];
  if (ctx.lockfilePackageNames.size === 0) return [];

  const findings: OverrideFinding[] = [];
  for (const entry of ctx.overrideEntries) {
    if (ctx.lockfilePackageNames.has(entry.packageName)) continue;
    findings.push({
      ruleId: RULE_ID,
      severity: "high",
      package: { name: entry.packageName },
      location: { file: "package.json", jsonPath: jsonPointer(entry.path) },
      message: "Override target not in resolved tree",
      details:
        `${entry.packageName} is declared in ${entry.container} but no package depends on it. ` +
        `The override has no effect.`,
      fix: {
        type: "rfc6902",
        patch: [{ op: "remove", path: jsonPointer(entry.path) }],
        runnableCommand: `cve-lite overrides --fix --rule OA001 --target ${shellQuote(entry.packageName)}`,
      },
      references: [
        "https://github.com/OWASP/cve-lite-cli/blob/main/docs/rules/OA001.md",
      ],
    });
  }
  return findings;
}

function shellQuote(s: string): string {
  return /[^A-Za-z0-9_@./:-]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
}
```

**Severity change note:** Preserved source had OA001 at `severity: 'low'`. Per the spec's severity table, OA001 is `high` (orphan = dead override on a still-live vuln). Update the test's expected severity accordingly.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/overrides/detectors/oa001.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/overrides/detectors/oa001-orphaned-target.ts tests/overrides/detectors/oa001.test.ts
git commit -m "feat(overrides): port OA001 orphaned-target detector"
```

---

## Tasks 6-12: Port remaining 7 detectors

Each task follows the **exact template from Task 5**:

1. Copy the test from `_preserved-override-audit/tests/detectors/<X>.test.ts` to `tests/overrides/detectors/<oaNNN>.test.ts`.
2. Rewrite imports and assertion shapes (Context -> OverrideContext, ruleId rebadge, remediation -> fix, severity adjustment).
3. Run the test, confirm it fails.
4. Copy the detector from `_preserved-override-audit/src/detectors/<X>.ts` to `src/overrides/detectors/<oaNNN>-<name>.ts`.
5. Rewrite imports, rebadge ruleId, swap Finding -> OverrideFinding shape, update references URL to `OWASP/cve-lite-cli`, adjust runnableCommand to `cve-lite overrides ...`.
6. Run the test, confirm it passes.
7. Commit.

The per-detector specifics - source filenames, severities, sub-rules - are listed below.

### Task 6: OA002 floating-tag

**Files:**
- Source: `_preserved-override-audit/src/detectors/floating-tag.ts`
- Test: `_preserved-override-audit/tests/detectors/floating-tag.test.ts`
- New: `src/overrides/detectors/oa002-floating-tag.ts`
- New: `tests/overrides/detectors/oa002.test.ts`

**Severity:** medium (spec table).
**Spec details:** flags string pins matching `/^(latest|next|tag-name)$/i` patterns. Uses `semver` to distinguish a concrete pin from a tag.
**No special context fields needed beyond `overrideEntries`.**

Commit message: `feat(overrides): port OA002 floating-tag detector`.

### Task 7: OA003 wrong-section

**Files:**
- Source: `_preserved-override-audit/src/detectors/wrong-section.ts`
- Test: `_preserved-override-audit/tests/detectors/wrong-section.test.ts`
- New: `src/overrides/detectors/oa003-wrong-section.ts`
- New: `tests/overrides/detectors/oa003.test.ts`

**Severity:** high (preserved already had high; spec confirms).
**Spec details:** detects npm-style override under `pnpm.overrides`, or pnpm-style under `overrides`. Emits a `move` patch.

Commit message: `feat(overrides): port OA003 wrong-section detector`.

### Task 8: OA004 surpassed-pin (installed-newer)

**Files:**
- Source: `_preserved-override-audit/src/detectors/installed-newer.ts`
- Test: `_preserved-override-audit/tests/detectors/installed-newer.test.ts`
- New: `src/overrides/detectors/oa004-surpassed-pin.ts`
- New: `tests/overrides/detectors/oa004.test.ts`

**Severity:** low (spec table).
**Special:** uses `ctx.installedVersions` and `semver.gt()` to detect when the installed version surpasses the pinned override (override is obsolete).
**Skip behavior:** detector returns `[]` when `ctx.skippedDetectors` contains `OA004`.

Commit message: `feat(overrides): port OA004 surpassed-pin detector`.

### Task 9: OA005 nested-ineffective (with sub-rules)

**Files:**
- Source: `_preserved-override-audit/src/detectors/nested-override.ts`
- Test: `_preserved-override-audit/tests/detectors/nested-override.test.ts`
- New: `src/overrides/detectors/oa005-nested-ineffective.ts`
- New: `tests/overrides/detectors/oa005.test.ts`

**Severity:** medium (per top-level rule); sub-rules may carry their own internal weighting. Keep the preserved sub-rule sub-codes (`OA005.a`-`OA005.e`) and surface them via `subRuleId`.
**Important:** OA005 fires both per outer key and per inner key. Preserved scanner.ts dedups OA005 vs OA001 (OA005 wins). That dedup logic moves into the runner (Plan 3), not this detector - keep the detector pure.

Commit message: `feat(overrides): port OA005 nested-ineffective detector`.

### Task 10: OA006 coupled-platform-binary

**Files:**
- Source: `_preserved-override-audit/src/detectors/coupled-platform-binary.ts`
- Test: `_preserved-override-audit/tests/detectors/coupled-platform-binary.test.ts`
- New: `src/overrides/detectors/oa006-coupled-platform-binary.ts`
- New: `tests/overrides/detectors/oa006.test.ts`

**Severity:** medium (per spec). Composite severity escalation (`medium -> high` when OA008 also fires for the same target) is runner logic, deferred to Plan 3.
**Special:** consumes `ctx.parentDeclarations`. Pre-skipped when `node_modules` is missing.

Commit message: `feat(overrides): port OA006 coupled-platform-binary detector`.

### Task 11: OA007 frozen-latest

**Files:**
- Source: `_preserved-override-audit/src/detectors/frozen-latest.ts`
- Test: `_preserved-override-audit/tests/detectors/frozen-latest.test.ts`
- New: `src/overrides/detectors/oa007-frozen-latest.ts`
- New: `tests/overrides/detectors/oa007.test.ts`

**Severity:** low (spec table; opt-in network).
**Special:** consumes `ctx.registryDistTags`. The detector itself is offline-safe: it only fires when the map is non-empty. The actual registry calls happen in the context builder when `checkNetwork: true`. The `buildOverrideContext` task (Task 4) leaves `registryDistTags` empty by default; a follow-up in Plan 3 wires up the actual fetch when `audit()` is called with `checkNetwork: true`.

Commit message: `feat(overrides): port OA007 frozen-latest detector`.

### Task 12: OA008 materialized-vulnerable (vulnerable-twin)

**Files:**
- Source: `_preserved-override-audit/src/detectors/vulnerable-twin.ts`
- Test: `_preserved-override-audit/tests/detectors/vulnerable-twin.test.ts`
- New: `src/overrides/detectors/oa008-materialized.ts`
- New: `tests/overrides/detectors/oa008.test.ts`

**Severity:** **critical** (spec - fix did not take).
**Special:** consumes `ctx.installedCopies`. Walks the on-disk tree to find any copy of the target whose `version` does not satisfy the override pin. Pre-skipped when `node_modules` missing.

Commit message: `feat(overrides): port OA008 materialized detector`.

---

## Task 13: Detector registry

**Files:**
- Create: `src/overrides/detectors/index.ts`

- [ ] **Step 1: Write the registry**

```ts
import type { OverrideContext } from "../context.js";
import type { OverrideFinding, OverrideRuleId } from "../types.js";

import { detect as detectOA001 } from "./oa001-orphaned-target.js";
import { detect as detectOA002 } from "./oa002-floating-tag.js";
import { detect as detectOA003 } from "./oa003-wrong-section.js";
import { detect as detectOA004 } from "./oa004-surpassed-pin.js";
import { detect as detectOA005 } from "./oa005-nested-ineffective.js";
import { detect as detectOA006 } from "./oa006-coupled-platform-binary.js";
import { detect as detectOA007 } from "./oa007-frozen-latest.js";
import { detect as detectOA008 } from "./oa008-materialized.js";

export type DetectorFn = (ctx: OverrideContext) => OverrideFinding[];

export const ALL_DETECTORS: ReadonlyArray<{
  ruleId: OverrideRuleId;
  detect: DetectorFn;
}> = [
  { ruleId: "OA001", detect: detectOA001 },
  { ruleId: "OA002", detect: detectOA002 },
  { ruleId: "OA003", detect: detectOA003 },
  { ruleId: "OA004", detect: detectOA004 },
  { ruleId: "OA005", detect: detectOA005 },
  { ruleId: "OA006", detect: detectOA006 },
  { ruleId: "OA007", detect: detectOA007 },
  { ruleId: "OA008", detect: detectOA008 },
];

/** Verify subset - just OA001 and OA008 - for the post-fix verify path. */
export const VERIFY_DETECTORS: ReadonlyArray<{
  ruleId: OverrideRuleId;
  detect: DetectorFn;
}> = [
  { ruleId: "OA001", detect: detectOA001 },
  { ruleId: "OA008", detect: detectOA008 },
];
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Update `src/overrides/index.ts` to re-export the registry**

Append to `src/overrides/index.ts`:
```ts
export type { OverrideContext } from "./context.js";
export { buildOverrideContext } from "./context-builder.js";
export { ALL_DETECTORS, VERIFY_DETECTORS, type DetectorFn } from "./detectors/index.js";
```

- [ ] **Step 4: Commit**

```bash
git add src/overrides/detectors/index.ts src/overrides/index.ts
git commit -m "feat(overrides): detector registry (ALL_DETECTORS, VERIFY_DETECTORS)"
```

---

## Task 14: Full-suite gate

- [ ] **Step 1: Run all tests**

```bash
npm test
```
Expected: all green. No regressions in cve-lite's pre-existing tests, all migrated OA detector tests pass.

- [ ] **Step 2: Run TypeScript**

```bash
npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Confirm structure**

```bash
ls src/overrides/detectors
ls tests/overrides/detectors
```
Expected: 8 detector files (oa001 through oa008) plus `index.ts`. 8 test files (oa001 through oa008).

- [ ] **Step 4: Smoke test against `_preserved-override-audit/tests/fixtures/`**

Pick one fixture and confirm the migrated detectors handle it as expected:
```bash
node -e "
  const { buildOverrideContext } = require('./dist/overrides/context-builder.js');
  const { ALL_DETECTORS } = require('./dist/overrides/detectors/index.js');
  const { NULL_AUDIT_LOG } = require('./dist/audit-log/index.js');
  const path = require('path');
  // Pick a known fixture path here:
  const fixture = path.join('_preserved-override-audit/tests/fixtures', '<a real fixture name>');
  const ctx = buildOverrideContext(fixture, { auditLog: NULL_AUDIT_LOG, logger: console, checkNetwork: false });
  const findings = ALL_DETECTORS.flatMap(d => d.detect(ctx));
  console.log('findings:', findings.length, findings.map(f => f.ruleId));
"
```

Build first if needed:
```bash
npm run build
```

If the smoke test surfaces a runtime mismatch (e.g., `readPackageLockNames` does not exist in cve-lite at the assumed path), fix the import in `context-builder.ts` and re-run.

Plan 2 complete when all 8 detectors port cleanly, all tests pass, the registry is in place, and one fixture-based smoke test runs end-to-end.

---

## Spec coverage check

| Spec requirement | Covered by |
|---|---|
| All 8 OA detectors live under `src/overrides/detectors/` | Tasks 5-12 |
| Detectors consume cve-lite parsers via `OverrideContext` | Tasks 2-4 |
| Detectors return `OverrideFinding[]` | Tasks 5-12 |
| OA005 sub-rules represented | Task 9 |
| Pre-skip behavior (lockfile/node_modules missing) | Task 4 |
| Reference URLs point at OWASP/cve-lite-cli | Tasks 5-12 |
| Runnable fix commands use `cve-lite overrides` | Tasks 5-12 |
| Registry (`ALL_DETECTORS`, `VERIFY_DETECTORS`) ready for API consumption | Task 13 |
| Validation gate: parser API mismatches caught and resolved per detector | Task 4 (build), Task 14 (smoke test) |
| `semver` runtime dep available | Task 1 |

## Next plan

Plan 3 (`docs/merge/2026-05-28-plan-3-overrides-api.md`) wires `audit()` and `verify()` on top of the registry, including composite logic (OA005 vs OA001 dedup, OA006 severity escalation) and OA007 network fetch when `checkNetwork: true`.
