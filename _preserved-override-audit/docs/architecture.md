# Architecture

A reference for contributors and embedders. Explains how a single `override-audit` invocation flows from raw filesystem state to findings, fixes, and change-control records.

## High-level pipeline

```
                    ┌────────────────────────┐
                    │  CLI (src/cli/index.ts)│
                    │  parses argv → run()   │
                    └─────────────┬──────────┘
                                  │
                                  ▼
                      ┌───────────────────────┐
                      │  scanner.ts           │
                      │  builds Context       │  ← reads filesystem ONCE
                      └─────────────┬─────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
        parsers/             detectors/            (optional)
   package-manager.ts        orphan.ts            registry.ts
   package-json.ts           floating-tag.ts      ↑ only when
   lockfile.ts               wrong-section.ts       --with-registry
   node-modules.ts           installed-newer.ts
   installed-tree.ts         nested-override.ts
                             coupled-platform-binary.ts
                             frozen-latest.ts
                             vulnerable-twin.ts
                                    │
                                    ▼
                      ┌──────────────────────────────────────┐
                      │  ScanResult { context, findings[] }  │
                      └─────────────┬────────────────────────┘
                                    │
                                    ▼
             ┌────────────── (branch on --fix) ──────────────┐
             │                                                │
             ▼                                                ▼
     output/human.ts                              fixer/fix.ts
     output/json.ts                                ├─ filter findings
       (renders findings)                          ├─ fixer/apply.ts (RFC 6902)
                                                   ├─ fixer/write.ts (atomic)
                                                   ├─ rescan via scanner.ts
                                                   └─ logging/change-control.ts
                                                       (NDJSON to --log-file)
```

## Design invariants

1. **Detectors are pure.** Every detector has signature `(ctx: Context) => Finding[]`. No I/O. All filesystem reads happen during `Context` construction in `scanner.ts`. This makes detector tests trivial: construct a literal `Context`, call the detector, assert.

2. **Read the filesystem once.** `scanner.ts` reads package.json, the lockfile, top-level node_modules manifests, and (when needed) the recursive `node_modules` tree once per scan. Detectors share that data via `Context`.

3. **Detectors don't know about each other.** Cross-detector logic (OA001 vs OA005 dedup, OA006 vs OA008 severity escalation) lives in `scanner.ts` as a post-processing step. Each detector stays self-contained.

4. **The fixer doesn't re-scan during apply.** It applies patches against an in-memory copy of the parsed package.json, then optionally calls `scan()` once at the end for the post-fix rescan.

5. **The schema is the contract.** `OverrideAuditOutput` is locked by snapshot test (`tests/output-snapshot.test.ts`). Breaking shape changes require deliberate snapshot updates and a CHANGELOG note.

6. **Logging is opt-in.** Detect-only runs and `--fix` runs without `--log-file` emit zero log records. Embedders who don't care never see the logger.

## Key types

```ts
// The thing every detector consumes:
interface Context {
  projectPath: string;
  packageJson: Record<string, unknown>;
  packageJsonRaw: string;                  // for indent detection on write
  packageManager: 'npm' | 'pnpm';
  overrideEntries: OverrideEntry[];        // flattened across containers
  lockfilePackageNames: Set<string>;       // every name in the resolved tree
  installedVersions: Map<string, string>;  // top-level node_modules versions
  installedCopies: Map<string, InstalledCopy[]>;   // every copy, anywhere
  parentDeclarations: Map<string, ParentDeclaration[]>;  // who declares what
  registryDistTags: Map<string, RegistryDistTags>;  // populated under --with-registry
  skippedDetectors: { ruleId: RuleId; reason: string }[];
}

// The thing every detector produces:
interface Finding {
  ruleId: RuleId;
  subRuleId?: SubRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
  package: string;
  overridePath: string[];                  // path into package.json
  pinValue: string | Record<string, unknown>;
  installedVersion?: string;
  packageManager: 'npm' | 'pnpm';
  remediation: {
    action: 'remove' | 'replace' | 'move' | 'suggest';
    patch: RFC6902Patch | null;            // single-op
    patches?: RFC6902Patch[];              // multi-op (OA006 uses this)
    runnableFixCommand?: string;
    explanation: string;
  };
  references: string[];
}
```

## Adding a new detector

1. **Pick a rule id.** Next sequential code: `OA00<N>-<SHORT-NAME>`.
2. **Add to the `RuleId` union** in `src/types.ts`.
3. **Add `Context` fields** if you need new pre-computed state (rare; most detectors use what's already there).
4. **Write the test first.** Construct a `Context` literal, exercise the detector, assert finding shape. Mock data is easier than fixtures here.
5. **Implement the detector** as `(ctx: Context) => Finding[]`.
6. **Wire into `scanner.ts`** in stable order (existing OA001 to OA008 order).
7. **Write the docs:** `docs/rules/OA00<N>.md` following the existing template.
8. **Update** `docs/rules/README.md` table, `src/cli/help.ts` `DETECTORS` section, `CHANGELOG.md`.

## Extending the fixer

The fixer is intentionally simple: it consumes the `patches` field that detectors already emit. To make a `suggest`-only rule auto-fixable:

1. **Emit the patch.** Set `remediation.patch` (single-op) or `remediation.patches` (multi-op array). Change `remediation.action` from `'suggest'` to the appropriate verb.
2. **Test it.** Add a test that exercises the new patch shape; verify `fix.ts` applies it.
3. **Document the upgrade** in the rule's `docs/rules/OA00N.md` and the CHANGELOG.

OA006 is the canonical multi-op example (remove + add). OA008 stays `suggest`-only because no deterministic patch exists; the fix is structural.

## Embedding the library

Embedders should import from `src/index.ts` only. Internal modules can change without notice. See [`docs/change-control-logging.md`](change-control-logging.md) for the log record schema if you're consuming `--log-file` output programmatically.
