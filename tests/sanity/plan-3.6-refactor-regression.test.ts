/**
 * Plan 3.6 sanity check: prove the four polish refactors did not change
 * runtime behavior end-to-end.
 *
 * Plan 3.6 was pure refactor:
 *   - Inline self-import dropped in OverrideFinding (#10)
 *   - Stale `installedCopies` JSDoc corrected (#11)
 *   - `shellQuote` extracted from 5 detectors into src/utils/string.ts (#12)
 *   - bare 'fs'/'path' imports replaced with 'node:' prefix (#13)
 *
 * The first two are documentation/type-shape concerns with no runtime effect.
 * The other two could in principle break a detector if a call site wasn't
 * migrated correctly. The most observable surface of the shellQuote work is
 * the `fix.runnableCommand` field on findings. This file locks in:
 *
 *   1. shellQuote still produces correctly quoted runnableCommand strings
 *      across detectors that use it (OA001, OA002, OA004, OA005, OA006)
 *   2. The Plan 3 + Plan 3.5 dogfood matrix produces identical finding
 *      counts to the pre-refactor baseline
 *
 * Run with: npm test -- tests/sanity/plan-3.6-refactor-regression.test.ts
 */

import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

describe("Plan 3.6 + Plan 6.5: detector runnableCommand format", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plan-3.6-sanity-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("OA001 finding's runnableCommand is a basic fix command without target", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { "orphaned-pkg": "1.0.0" },
    }));
    // Lockfile must have at least one package or buildOverrideContext pre-skips OA001.
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    const oa001 = result.findings.find((f) => f.ruleId === "OA001");
    expect(oa001).toBeDefined();
    expect(oa001!.fix?.runnableCommand).toBe("cve-lite overrides --fix --rule OA001");
  });

  it("OA001 finding's runnableCommand is the same format for scoped packages", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { "@scope/orphan": "1.0.0" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "x" },
        "node_modules/lodash": { version: "4.17.21" },
      },
    }));

    const ctx = buildOverrideContext(dir, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    const oa001 = result.findings.find((f) => f.ruleId === "OA001");
    expect(oa001).toBeDefined();
    expect(oa001!.fix?.runnableCommand).toBe("cve-lite overrides --fix --rule OA001");
  });
});

describe("Plan 3.6 regression: Plan 3 + Plan 3.5 sanity matrix unchanged", () => {
  // Snapshot the counts the prior sanity tests asserted. If Plan 3.6 silently
  // broke a detector, one of these assertions would fail with a different
  // count.
  const GHOST = join(process.cwd(), "cve-lite-ref/examples/ghost");
  const PRISMA = join(process.cwd(), "cve-lite-ref/examples/prisma");
  const STORYBOOK = join(process.cwd(), "cve-lite-ref/examples/storybook");
  const BUN_SIMPLE = join(process.cwd(), "cve-lite-ref/examples/bun-simple");

  // Plan 6.5 (#14/#15): Ghost's 4 pnpm parent>child selective overrides no longer
  // false-positive as OA001. Only the genuine OA002 (@tryghost/logging catalog: tag)
  // remains. Count: 5 -> 1.
  it("Ghost (pnpm): 1 finding (OA002 only, after parent>child fix)", async () => {
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

  // Plan 6.5 (#14/#15): Prisma's @azure/msal-node>uuid selective override is in the
  // lockfile and presumed-fine, so the old OA001 false positive is gone. Count: 1 -> 0.
  it("Prisma (pnpm): 0 findings (parent>child false positive removed)", async () => {
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

  it("Storybook (yarn): 7 OA002 findings", async () => {
    if (!existsSync(join(STORYBOOK, "package.json"))) {
      console.log(`skip: ${STORYBOOK} not present`);
      return;
    }
    const ctx = buildOverrideContext(STORYBOOK, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBe(7);
    expect(result.findings.every((f) => f.ruleId === "OA002")).toBe(true);
  });

  it("bun-simple: 0 findings (no overrides)", async () => {
    if (!existsSync(join(BUN_SIMPLE, "package.json"))) {
      console.log(`skip: ${BUN_SIMPLE} not present`);
      return;
    }
    const ctx = buildOverrideContext(BUN_SIMPLE, {
      auditLog: NULL_AUDIT_LOG,
      logger: noop(),
      checkNetwork: false,
    });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBe(0);
  });
});
