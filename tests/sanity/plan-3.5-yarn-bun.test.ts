/**
 * Plan 3.5 sanity check: run audit() against real yarn and bun example
 * projects, confirm sensible findings, and confirm the Plan 3 sanity matrix
 * (Ghost/Prisma/hexmetrics) is unchanged.
 *
 * Targets:
 *   - cve-lite-ref/examples/storybook (yarn classic, many resolutions
 *     including "latest" floating tags - OA002 should fire)
 *   - cve-lite-ref/examples/strapi (yarn classic, several pinned resolutions)
 *   - cve-lite-ref/examples/bun-simple (bun, no overrides - clean run)
 *
 * Run with: npm test -- tests/sanity/plan-3.5-yarn-bun.test.ts
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { MemoryAuditLog, NULL_AUDIT_LOG } from "../../src/audit-log/index.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

interface DogfoodReport {
  projectPath: string;
  packageManager: string;
  overrideEntryCount: number;
  lockfilePackageCount: number;
  findingsByRule: Record<string, number>;
  totalFindings: number;
  detectedEventCount: number;
}

async function runDogfood(projectPath: string): Promise<DogfoodReport> {
  const log = new MemoryAuditLog();
  const ctx = buildOverrideContext(projectPath, {
    auditLog: log,
    logger: noop(),
    checkNetwork: false,
  });
  const result = await audit(ctx, { checkNetwork: false });

  const findingsByRule: Record<string, number> = {};
  for (const f of result.findings) {
    findingsByRule[f.ruleId] = (findingsByRule[f.ruleId] ?? 0) + 1;
  }

  return {
    projectPath,
    packageManager: ctx.packageManager,
    overrideEntryCount: ctx.overrideEntries.length,
    lockfilePackageCount: ctx.lockfilePackageNames.size,
    findingsByRule,
    totalFindings: result.findings.length,
    detectedEventCount: log.events.filter((e) => e.type === "oa.detected").length,
  };
}

function printReport(name: string, r: DogfoodReport): void {
  console.log(`\n=== ${name} ===`);
  console.log(`  pm: ${r.packageManager}; overrideEntries: ${r.overrideEntryCount}; lockfile: ${r.lockfilePackageCount}`);
  console.log(`  totalFindings: ${r.totalFindings}; oa.detected events: ${r.detectedEventCount}`);
  if (r.totalFindings > 0) {
    console.log(`  findings by rule:`);
    for (const [rule, count] of Object.entries(r.findingsByRule)) {
      console.log(`    ${rule}: ${count}`);
    }
  }
}

const STORYBOOK = join(process.cwd(), "cve-lite-ref/examples/storybook");
const STRAPI = join(process.cwd(), "cve-lite-ref/examples/strapi");
const BUN_SIMPLE = join(process.cwd(), "cve-lite-ref/examples/bun-simple");

describe("Plan 3.5: real-project dogfood via audit()", () => {
  it("yarn-storybook: many resolutions including `latest` floating tags", async () => {
    if (!existsSync(join(STORYBOOK, "package.json"))) {
      console.log(`skip: ${STORYBOOK} not present`);
      return;
    }
    const r = await runDogfood(STORYBOOK);
    printReport("Storybook (yarn)", r);

    expect(r.packageManager).toBe("yarn");
    expect(r.overrideEntryCount).toBeGreaterThan(5);
    // Storybook's resolutions include `"@babel/runtime": "latest"` etc.
    // OA002 floating-tag should fire on the `latest` values.
    expect(r.findingsByRule["OA002"] ?? 0).toBeGreaterThan(0);
    // Every finding is announced via the audit log.
    expect(r.detectedEventCount).toBe(r.totalFindings);
  });

  it("yarn-strapi: several pinned resolutions", async () => {
    if (!existsSync(join(STRAPI, "package.json"))) {
      console.log(`skip: ${STRAPI} not present`);
      return;
    }
    const r = await runDogfood(STRAPI);
    printReport("Strapi (yarn)", r);

    expect(r.packageManager).toBe("yarn");
    expect(r.overrideEntryCount).toBeGreaterThan(0);
    expect(r.detectedEventCount).toBe(r.totalFindings);
  });

  it("bun-simple: no overrides, clean run", async () => {
    if (!existsSync(join(BUN_SIMPLE, "package.json"))) {
      console.log(`skip: ${BUN_SIMPLE} not present`);
      return;
    }
    const r = await runDogfood(BUN_SIMPLE);
    printReport("bun-simple", r);

    expect(r.packageManager).toBe("bun");
    expect(r.overrideEntryCount).toBe(0);
    // No overrides means no findings of any kind.
    expect(r.totalFindings).toBe(0);
    expect(r.detectedEventCount).toBe(0);
  });
});

describe("Plan 3.5 regression check: Plan 3 sanity matrix unchanged", () => {
  // The Plan 3 sanity matrix was: Ghost preserved=3 / new=5; Prisma 1; hexmetrics 1.
  // Plan 6.5 (#14/#15) later corrected the pnpm parent>child false positives:
  // Ghost new=1, Prisma=0. Plan 3.5 (yarn / bun) does not affect these counts.

  const GHOST = join(process.cwd(), "cve-lite-ref/examples/ghost");
  const PRISMA = join(process.cwd(), "cve-lite-ref/examples/prisma");

  // Plan 6.5 (#14/#15): Ghost 5 -> 1, Prisma 1 -> 0 after the pnpm parent>child fix.
  it("Ghost (pnpm) produces 1 finding (OA002 only) after the parent>child fix", async () => {
    if (!existsSync(join(GHOST, "package.json"))) {
      console.log(`skip: ${GHOST} not present`);
      return;
    }
    const ctx = buildOverrideContext(GHOST, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBe(1);
    expect(result.findings[0].ruleId).toBe("OA002");
  });

  it("Prisma (pnpm) produces 0 findings after the parent>child fix", async () => {
    if (!existsSync(join(PRISMA, "package.json"))) {
      console.log(`skip: ${PRISMA} not present`);
      return;
    }
    const ctx = buildOverrideContext(PRISMA, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBe(0);
  });
});
