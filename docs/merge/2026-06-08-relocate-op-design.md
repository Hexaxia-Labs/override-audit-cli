# Design: the `relocate` op, the applier chokepoint, and tiered auto-fix

**Status:** Approved in principle (Sonu, 2026-06-08). Implemented as Plan 6.5 Task 4.
**Author:** Aaron Lamb
**Context:** Makes the override-hygiene product boundary load-bearing in code rather than convention.

## The problem

Override hygiene has a hard product boundary: it manages the overrides a project already has. It removes, repins, and moves them. It must never invent a new override out of thin air. CVE remediation is the only thing that changes the dependency graph, and it does so by upgrading, not by writing overrides.

Today that boundary is convention, not code. The fix vocabulary (`src/overrides/types.ts` `RFC6902Op`) includes a bare `add` op, and OA006 uses it: when a coupled platform binary has no existing parent declaration to pin, OA006 emits a `remove` (drop the override) plus a bare `add` (write a parent dependency at an inferred floor). The `add` writes a dependency entry, not an override, so it is within the boundary in spirit. But nothing enforces that. A future detector, or a bad refactor, could emit a bare `add` that writes a brand-new override key, and no code would stop it. The only guard is reviewer discipline.

A boundary that matters should be enforced at a chokepoint in code, not asserted in prose.

## The design

Three coupled moves.

### 1. A first-class `relocate` op

Introduce a domain op that names the one legitimate "introduce a key" intent:

```ts
{ op: "relocate", fromChild: string, toParent: string, floor: string }
```

Semantics: drop the override at `fromChild`, and express its constraint instead as a dependency floor on `toParent`. `fromChild` is the override key being retired; `toParent` is the dependency entry that should carry the constraint; `floor` is the minimum version (e.g. `>=1.2.3`).

This is exactly OA006's coupled-platform-binary fix when there is no existing parent entry: the override is fighting an exact-pinned parent, so the durable fix is to retire the override and let the parent carry a floor.

### 2. Drop bare `add` from the fix vocabulary

The detector-facing `RFC6902Op` (renamed to `OverrideFixOp` to reflect that it is no longer pure RFC 6902) becomes:

```ts
type OverrideFixOp =
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "relocate"; fromChild: string; toParent: string; floor: string };
```

No bare `add`. No `copy`. No `test`. A detector can only: remove an override, replace its value, move it between sections, or relocate it to a parent floor. There is no op that writes an arbitrary new key.

`move` is retained for OA003 (wrong-section): it relocates an existing override between `overrides` / `pnpm.overrides` / `resolutions` without changing the target. It does not create a new target.

### 3. The applier chokepoint guard

The applier (`src/overrides/fixer.ts`) is the single place where the on-disk `package.json` is mutated. It enforces the invariant deterministically:

- Compute the set of top-level override/dependency keys before and after applying a patch.
- The only key that may newly appear is a `relocate`'s `toParent`, and only if that same patch's `fromChild` is being removed.
- Any other newly-appeared key is a violation: reject the patch, apply nothing, and log the violation to the audit log (`error` event, phase `fix-guard`).

This turns "override hygiene never invents an override" into a property the code proves on every fix, regardless of what a detector emitted. A buggy or malicious detector cannot get a stray key past the applier.

## Tiered auto-fix

Not every sanctioned op is equally safe to apply silently. The line is whether the op **guesses at a version**.

**Tier 1 - silent auto-apply.** Pure hygiene with no inferred value:
- `remove` (orphan, ineffective nested, surpassed pin)
- `move` (wrong section)
- `replace` with a determinate value (e.g. OA002 floating tag replaced with the concrete installed version; OA007 frozen-latest replaced with the concrete registry version)

These have exactly one correct result. Applying them under `--fix` is safe.

**Tier 2 - proposed, not applied by default.** Ops that write an inferred value:
- `relocate` (OA006), because `floor` is an inferred minimum, not an observed fact.

A Tier 2 op is surfaced in output and recorded as a recommendation, but `--fix` does not apply it unless the user opts in (future flag, e.g. `--fix-inferred`). The default keeps `--fix` from silently writing a version the tool guessed.

The detector marks the tier on the fix (e.g. `fix.tier: "auto" | "proposed"`), and `runOverrides` / `runOverridesFixHook` apply only Tier 1 by default.

## Enforcement philosophy

This design deliberately puts the boundary in deterministic code at the applier chokepoint, not in a skill, a doc, or detector discipline. A skill is suasion; it advises the agent. The applier guard is enforcement; it cannot be talked out of rejecting a stray key. For an invariant that defines what the product is allowed to do, enforcement belongs in code.

This also retires the earlier "no bare `add` op" convention (which was never written down anywhere and was contradicted by OA006's own code). The convention is replaced by a vocabulary that has no bare `add` and an applier that proves the invariant.

## Migration

1. `src/overrides/types.ts`: rename `RFC6902Op` to `OverrideFixOp`, drop `add` / `copy` / `test`, add `relocate`. Add `fix.tier`.
2. `src/overrides/detectors/oa006-coupled-platform-binary.ts`: replace the `remove` + bare `add` pair with a single `relocate` op; mark `tier: "proposed"`. The existing `remove` + `replace` path (when a parent entry already exists) stays, marked `tier: "auto"` if the replace value is determinate.
3. `src/overrides/fixer.ts`: teach `applyFix` to expand `relocate` into the file mutation, and add the before/after key-set guard. Reject + log on any unsanctioned new key.
4. `runOverrides` / `runOverridesFixHook`: apply only Tier 1 fixes by default; surface Tier 2 as recommendations.
5. Audit log: `oa.fix.applied` patches already carry op + path; extend to represent `relocate`. Add a `fix-guard` `error` event for rejections.

## Test plan

- Unit: `relocate` expands to the correct file mutation (override removed, parent floor written).
- Unit: the applier guard rejects a synthetic patch that introduces an unrelated new key, applies nothing, logs the violation.
- Unit: a `relocate` whose `fromChild` is not removed in the same patch is rejected.
- Tiering: `runOverrides --fix` applies Tier 1 silently and leaves Tier 2 (OA006 relocate) as a recommendation; an opt-in applies Tier 2.
- Dogfood: hexmetrics (which fires OA006) shows the relocate as proposed-not-applied under default `--fix`, and the override is untouched until opt-in.

## Out of scope

- The opt-in flag name for applying Tier 2 (`--fix-inferred` is a placeholder); the default behavior (proposed-not-applied) is what this design fixes.
- Relocate for any detector other than OA006. If a future rule needs to introduce a parent floor, it uses the same op and the same guard.
