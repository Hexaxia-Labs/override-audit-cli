/**
 * Plan 3 sanity check: prove the high-level pipeline (audit() + composite
 * + audit-log emission) produces equivalent findings to the preserved
 * scanner end-to-end, and exercise the new public API against the same
 * real projects Plan 2's dogfood used.
 *
 * Two checks:
 *   1. Pipeline equivalence on Ghost - preserved scan() vs new audit()
 *      finding sets (normalized for shape differences)
 *   2. audit() via barrel against cve-lite-ref/examples/{ghost,prisma}
 *      and ~/Projects/hexmetrics - confirms the new API surface works
 *      against the same matrix Plan 2 used (Ghost already covered by
 *      api-smoke.test.ts; this file adds Prisma and hexmetrics)
 *
 * Run with: npm test -- tests/sanity/plan-3-pipeline.test.ts
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { scan as preservedScan } from "../../_preserved-override-audit/src/scanner.js";

import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { MemoryAuditLog, NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function noop() {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
}

interface NormalizedFinding {
  shortRuleId: string;       // "OA001" etc
  subRule?: string;
  package: string;
}

function shortenOldRuleId(id: string): string {
  const m = id.match(/^(OA\d{3})/);
  return m ? m[1] : id;
}

function shortenOldSubRule(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const m = id.match(/^(OA\d{3}\.[a-e])/);
  return m ? m[1] : id;
}

function normalizeOld(f: any): NormalizedFinding {
  return {
    shortRuleId: shortenOldRuleId(f.ruleId),
    subRule: shortenOldSubRule(f.subRuleId),
    package: f.package as string,
  };
}

function normalizeNew(f: any): NormalizedFinding {
  return {
    shortRuleId: f.ruleId,
    subRule: f.subRuleId,
    package: f.package.name,
  };
}

function sortBy(a: NormalizedFinding, b: NormalizedFinding): number {
  if (a.package !== b.package) return a.package < b.package ? -1 : 1;
  if (a.shortRuleId !== b.shortRuleId) return a.shortRuleId < b.shortRuleId ? -1 : 1;
  const sa = a.subRule ?? "";
  const sb = b.subRule ?? "";
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

const GHOST = join(process.cwd(), "cve-lite-ref/examples/ghost");
const PRISMA = join(process.cwd(), "cve-lite-ref/examples/prisma");
const HEXMETRICS = join(homedir(), "Projects/hexmetrics");

describe("Plan 3 pipeline: new audit() intentionally diverges from preserved on Ghost", () => {
  it("Ghost: new audit() drops the preserved scanner's parent>child false positives (Plan 6.5)", async () => {
    if (!existsSync(join(GHOST, "package.json"))) {
      console.log(`skip: ${GHOST} not present`);
      return;
    }

    const preserved = await preservedScan(GHOST);
    const ctx = buildOverrideContext(GHOST, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const fresh = await audit(ctx, { checkNetwork: false });

    const a = preserved.findings.map(normalizeOld).sort(sortBy);
    const b = fresh.findings.map(normalizeNew).sort(sortBy);

    console.log(`Ghost: preserved=${a.length}, new=${b.length}`);

    // This was an equivalence/superset test that CAUGHT #14: preserved and the
    // pre-6.5 new code both mishandled pnpm `parent>child` selective override
    // keys (preserved's regex masked some, the new bareName mis-stripped others),
    // producing OA001 false positives. Plan 6.5 (#14 + #15) fixed this: OA001 no
    // longer fires on parent>child keys, and OA005 owns them but stays silent on
    // valid-or-unevaluable selective overrides (a hygiene auditor flags proven
    // problems, not maybes). So the new set now CORRECTLY diverges from - and is a
    // strict subset of - the frozen, buggy preserved scanner.
    //
    // Ghost's only genuine finding is OA002 on @tryghost/logging (catalog: tag).
    expect(b.length).toBe(1);
    expect(b[0].shortRuleId).toBe("OA002");

    // Regression guard for #14: no OA001 false positive on any parent>child key.
    expect(b.some((f) => f.shortRuleId === "OA001")).toBe(false);

    // The new set is a strict subset of preserved (we only removed false positives).
    const key = (f: NormalizedFinding) => `${f.shortRuleId}|${f.subRule ?? ""}|${f.package}`;
    const aKeys = new Set(a.map(key));
    for (const f of b) {
      expect(aKeys.has(key(f))).toBe(true);
    }
    expect(b.length).toBeLessThan(a.length);
  });
});

describe("Plan 3 audit() via barrel: full real-project matrix", () => {
  it("Prisma (cve-lite-ref/examples/prisma)", async () => {
    if (!existsSync(join(PRISMA, "package.json"))) {
      console.log(`skip: ${PRISMA} not present`);
      return;
    }
    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(PRISMA, {
      auditLog: log,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    const detected = log.events.filter((e) => e.type === "oa.detected");
    console.log(`Prisma audit(): ${result.findings.length} findings, ${detected.length} oa.detected events`);
    expect(detected.length).toBe(result.findings.length);
  });

  it("hexmetrics (~/Projects/hexmetrics; node_modules present, all 8 detectors run)", async () => {
    if (!existsSync(join(HEXMETRICS, "package.json"))) {
      console.log(`skip: ${HEXMETRICS} not present`);
      return;
    }
    const log = new MemoryAuditLog();
    const ctx = buildOverrideContext(HEXMETRICS, {
      auditLog: log,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    const detected = log.events.filter((e) => e.type === "oa.detected");
    console.log(`hexmetrics audit(): ${result.findings.length} findings, ${detected.length} oa.detected events`);
    expect(detected.length).toBe(result.findings.length);
    expect(ctx.skippedDetectors).toHaveLength(0);
  });
});
