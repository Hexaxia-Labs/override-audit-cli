/**
 * Plan 2 sanity check: run the ported ALL_DETECTORS against real projects
 * sitting in this workspace, print a structured summary, and assert the
 * detectors fire on at least the projects we expect findings from.
 *
 * Targets:
 *   - cve-lite-ref/examples/ghost     (pnpm; many overrides, nested entries
 *                                       like `ember-svg-jar>cheerio` that
 *                                       Sonu flagged on 2026-06-01)
 *   - cve-lite-ref/examples/prisma    (pnpm; ~10 range-pinned overrides)
 *   - ~/Projects/hexmetrics            (pnpm; 2 overrides; has node_modules
 *                                       so OA004/OA006/OA008 can run)
 *
 * This test prints findings via console.log for human inspection. It does
 * not strictly assert specific rule IDs or packages because the on-disk
 * state of these projects can drift between runs. The assertions are
 * loose: "Ghost should fire at least one OA finding" / "the harness
 * returns without throwing."
 *
 * Run with:  npm test -- tests/sanity/dogfood.test.ts
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { buildOverrideContext } from "../../src/overrides/context-builder.js";
import { ALL_DETECTORS } from "../../src/overrides/detectors/index.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any;

interface DogfoodReport {
  projectPath: string;
  packageManager: string;
  overrideEntryCount: number;
  lockfilePackageCount: number;
  nodeModulesPresent: boolean;
  skippedDetectors: Array<{ ruleId: string; reason: string }>;
  findingsByRule: Record<string, number>;
  topFindings: Array<{ ruleId: string; subRuleId?: string; severity: string; package: string; message: string }>;
  totalFindings: number;
}

function runDogfood(projectPath: string): DogfoodReport {
  const ctx = buildOverrideContext(projectPath, {
    auditLog: NULL_AUDIT_LOG,
    logger: noopLogger,
    checkNetwork: false,
  });

  const findings: OverrideFinding[] = [];
  for (const { detect } of ALL_DETECTORS) {
    findings.push(...detect(ctx));
  }

  const findingsByRule: Record<string, number> = {};
  for (const f of findings) {
    findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] ?? 0) + 1;
  }

  return {
    projectPath,
    packageManager: ctx.packageManager,
    overrideEntryCount: ctx.overrideEntries.length,
    lockfilePackageCount: ctx.lockfilePackageNames.size,
    nodeModulesPresent: existsSync(join(projectPath, "node_modules")),
    skippedDetectors: ctx.skippedDetectors,
    findingsByRule,
    topFindings: findings.slice(0, 10).map((f) => ({
      ruleId: f.ruleId,
      subRuleId: f.subRuleId,
      severity: f.severity,
      package: f.package.name,
      message: f.message,
    })),
    totalFindings: findings.length,
  };
}

function printReport(name: string, r: DogfoodReport): void {
  console.log(`\n=== ${name} ===`);
  console.log(`  path: ${r.projectPath}`);
  console.log(`  packageManager: ${r.packageManager}`);
  console.log(`  overrideEntries: ${r.overrideEntryCount}`);
  console.log(`  lockfilePackageNames: ${r.lockfilePackageCount}`);
  console.log(`  node_modules present: ${r.nodeModulesPresent}`);
  if (r.skippedDetectors.length > 0) {
    console.log(`  pre-skipped detectors:`);
    for (const s of r.skippedDetectors) {
      console.log(`    - ${s.ruleId}: ${s.reason}`);
    }
  }
  console.log(`  total findings: ${r.totalFindings}`);
  if (r.totalFindings > 0) {
    console.log(`  findings by rule:`);
    for (const [rule, count] of Object.entries(r.findingsByRule)) {
      console.log(`    ${rule}: ${count}`);
    }
    console.log(`  top findings (up to 10):`);
    for (const f of r.topFindings) {
      const sub = f.subRuleId ? ` (${f.subRuleId})` : "";
      console.log(`    - ${f.ruleId}${sub} [${f.severity}] ${f.package}: ${f.message}`);
    }
  }
}

describe("Plan 2 dogfood: ALL_DETECTORS against real projects", () => {
  const GHOST = join(process.cwd(), "cve-lite-ref/examples/ghost");
  const PRISMA = join(process.cwd(), "cve-lite-ref/examples/prisma");
  const HEXMETRICS = join(homedir(), "Projects/hexmetrics");

  it("runs cleanly on cve-lite examples/ghost (pnpm, many overrides, nested entries)", () => {
    if (!existsSync(join(GHOST, "package.json"))) {
      console.log(`skip: ${GHOST} not present`);
      return;
    }
    const r = runDogfood(GHOST);
    printReport("Ghost (cve-lite-ref/examples/ghost)", r);
    expect(r.packageManager).toBe("pnpm");
    expect(r.overrideEntryCount).toBeGreaterThan(10);
    // Loose assertion: Ghost has many overrides; we expect SOMETHING to fire
    // (Sonu reported orphaned nested Cheerio overrides on 2026-06-01).
    // If totalFindings is zero, the harness is silently broken.
    expect(r.totalFindings).toBeGreaterThan(0);
  });

  it("runs cleanly on cve-lite examples/prisma (pnpm, range-pinned overrides)", () => {
    if (!existsSync(join(PRISMA, "package.json"))) {
      console.log(`skip: ${PRISMA} not present`);
      return;
    }
    const r = runDogfood(PRISMA);
    printReport("Prisma (cve-lite-ref/examples/prisma)", r);
    expect(r.packageManager).toBe("pnpm");
    expect(r.overrideEntryCount).toBeGreaterThan(0);
    // No strict count assertion - Prisma's overrides are range-pinned and may
    // all be valid. Findings count is informational.
  });

  it("runs cleanly on hexmetrics (pnpm + node_modules; all 8 detectors run)", () => {
    if (!existsSync(join(HEXMETRICS, "package.json"))) {
      console.log(`skip: ${HEXMETRICS} not present`);
      return;
    }
    const r = runDogfood(HEXMETRICS);
    printReport("hexmetrics (~/Projects/hexmetrics)", r);
    expect(r.packageManager).toBe("pnpm");
    expect(r.overrideEntryCount).toBeGreaterThan(0);
    // hexmetrics has node_modules, so OA001/OA004/OA006/OA008 should NOT be pre-skipped.
    expect(r.nodeModulesPresent).toBe(true);
    expect(r.skippedDetectors.length).toBe(0);
  });
});
