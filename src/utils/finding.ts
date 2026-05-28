import type { Finding } from "../types.js";

export function getPrimaryParent(finding: Finding): string | null {
  const firstPath = finding.dependencyPaths?.[0];
  if (!firstPath || firstPath.length < 3) return null;
  return firstPath[1] ?? null;
}
