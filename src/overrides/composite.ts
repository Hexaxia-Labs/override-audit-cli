import type { OverrideFinding } from "./types.js";

/**
 * Post-detection composite passes:
 *   1. OA005 wins over OA001 for the same package (OA005 is the more specific framing).
 *   2. OA006 (medium) escalates to high when OA008 also fires for the same target:
 *      the parent-coupling risk has materialized as a vulnerable copy on disk.
 */
export function applyComposite(findings: OverrideFinding[]): OverrideFinding[] {
  const oa005Packages = new Set(
    findings.filter((f) => f.ruleId === "OA005").map((f) => f.package.name)
  );
  const oa008Packages = new Set(
    findings.filter((f) => f.ruleId === "OA008").map((f) => f.package.name)
  );

  const deduped = findings.filter(
    (f) => !(f.ruleId === "OA001" && oa005Packages.has(f.package.name))
  );

  return deduped.map((f) => {
    if (
      f.ruleId === "OA006" &&
      f.severity === "medium" &&
      oa008Packages.has(f.package.name)
    ) {
      return {
        ...f,
        severity: "high" as const,
        message:
          "Override fights an exact-pinned parent (vulnerable copy on disk; OA008 confirms)",
      };
    }
    return f;
  });
}
