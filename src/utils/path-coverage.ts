export type PathCoverage = {
  coverage: "complete" | "partial";
  coveredPaths: string[][];
  remainingPaths: string[][];
};

export function calculatePathCoverage(
  knownPaths: string[][],
  coveredPath: string[] | null | undefined,
): PathCoverage {
  const coveredPaths = coveredPath && coveredPath.length > 0 ? [coveredPath] : [];
  const remainingPaths = knownPaths.filter(path => !coveredPaths.some(covered => pathsEqual(path, covered)));

  return {
    coverage: remainingPaths.length === 0 ? "complete" : "partial",
    coveredPaths,
    remainingPaths,
  };
}

export function formatDependencyPath(path: string[]): string {
  return path.join(" -> ");
}

function pathsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
