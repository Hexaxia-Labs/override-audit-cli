import fs from "node:fs";
import path from "node:path";
import type { Baseline, Finding } from "../types.js";

const BASELINE_DIR = ".cve-lite";
const BASELINE_FILE = "baseline.json";

function baselinePath(projectRoot: string): string {
  return path.join(projectRoot, BASELINE_DIR, BASELINE_FILE);
}

export function readBaseline(projectRoot: string): Baseline | null {
  const filePath = baselinePath(projectRoot);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Baseline;
  } catch {
    return null;
  }
}

export function writeBaseline(projectRoot: string, findings: Finding[]): void {
  const dir = path.join(projectRoot, BASELINE_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const baseline: Baseline = {
    version: 1,
    createdAt: new Date().toISOString(),
    findings: findings.map(f => ({
      name: f.pkg.name,
      version: f.pkg.version,
      advisoryIds: f.vulnerabilities.map(v => v.id),
    })),
  };
  fs.writeFileSync(baselinePath(projectRoot), JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

export function filterNewFindings(
  findings: Finding[],
  baseline: Baseline,
): { newFindings: Finding[]; suppressedCount: number } {
  const baselineMap = new Map<string, Set<string>>();
  for (const entry of baseline.findings) {
    baselineMap.set(`${entry.name}@${entry.version}`, new Set(entry.advisoryIds));
  }

  const newFindings: Finding[] = [];
  let suppressedCount = 0;

  for (const finding of findings) {
    const key = `${finding.pkg.name}@${finding.pkg.version}`;
    const baselineAdvisories = baselineMap.get(key);
    if (!baselineAdvisories) {
      newFindings.push(finding);
      continue;
    }
    const allKnown = finding.vulnerabilities.every(v => baselineAdvisories.has(v.id));
    if (allKnown) {
      suppressedCount++;
    } else {
      newFindings.push(finding);
    }
  }

  return { newFindings, suppressedCount };
}
