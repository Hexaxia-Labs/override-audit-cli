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
