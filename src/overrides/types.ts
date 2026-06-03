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

export type RFC6902Op =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: unknown };

export interface OverrideFix {
  type: "rfc6902";
  patch: RFC6902Op[];
  /** Optional runnable command equivalent (e.g., `cve-lite overrides --fix ...`). */
  runnableCommand?: string;
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
