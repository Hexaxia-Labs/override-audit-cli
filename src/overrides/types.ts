// Override-audit rule identifiers. Spec: docs/merge/2026-05-28-cve-lite-merge-design.md

export type OverrideRuleId =
  | "OA001"   // orphaned target
  | "OA002"   // floating tag
  | "OA003"   // misplaced section
  | "OA004"   // surpassed pin
  | "OA005"   // ineffective nested
  | "OA006"   // parent coupling
  | "OA007"   // registry drift
  | "OA008"   // materialized vulnerable

  ;

export type OverrideSubRuleId =
  | "OA005.a"   // non-npm container
  | "OA005.b"   // orphaned outer
  | "OA005.c"   // orphaned inner
  | "OA005.d"   // leaky
  | "OA005.e"   // suspect

  ;

import type { SeverityLabel } from "../types.js";

/**
 * Override-fix op vocabulary. No longer pure RFC 6902: bare `add` / `copy` / `test`
 * are deliberately absent so a fix can never invent an arbitrary override key. The
 * one sanctioned way to introduce a key is `relocate`, which retires a child override
 * and expresses its constraint as a parent dependency floor (an upgrade, not a new
 * override). The applier enforces this with a chokepoint guard. See
 * docs/merge/2026-06-08-relocate-op-design.md.
 */
export type OverrideFixOp =
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | {
      op: "relocate";
      /** JSON pointer of the child override to retire (e.g. "/pnpm/overrides/binary"). */
      fromChild: string;
      /** Parent package name to carry the constraint as a dependency floor. */
      toParent: string;
      /** Inferred version floor written to /dependencies/<toParent> (e.g. ">=2.0.0"). */
      floor: string;
    };

export interface OverrideFix {
  type: "rfc6902";
  patch: OverrideFixOp[];
  /** Optional runnable command equivalent (e.g., `cve-lite overrides --fix ...`). */
  runnableCommand?: string;
  /**
   * Auto-fix tier. "auto" (default) is pure hygiene safe to apply silently
   * (remove / move / determinate replace). "proposed" writes an inferred value
   * (relocate floor) and is surfaced as a recommendation, not applied by default.
   */
  tier?: "auto" | "proposed";
}

export interface OverrideFinding {
  ruleId: OverrideRuleId;
  subRuleId?: OverrideSubRuleId;
  severity: SeverityLabel;
  package: { name: string; version?: string };
  location: { file: string; jsonPath?: string; line?: number };
  message: string;
  details?: string;
  fix?: OverrideFix;
  references?: string[];
}
