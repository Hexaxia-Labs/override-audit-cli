/**
 * Plan 4.5 sanity test: detector polish - OA002 npm: alias skip + OA005 suggest findings
 *
 * Plan 4.5 delivered:
 *   - OA002 now skips npm: protocol aliases (commit e7780f7, closes #25)
 *   - OA005 suggest findings (.d, .e) now emit fix: undefined (commit 3942ee3, closes #26)
 *
 * This file locks in this surface as regression guards.
 *
 * 3 in-process integration tests:
 *   1. OA002 npm: alias regression guard
 *   2. OA005 suggest finding has fix === undefined
 *   3. Plan 4 dogfood matrix unchanged (Ghost, Prisma, Storybook, bun-simple)
 *
 * Run with: npm test -- tests/sanity/plan-4.5-detector-polish.test.ts
 */

import { existsSync } from "node:fs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

describe("Plan 4.5: detector polish - OA002 npm: alias + OA005 suggest fix", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plan-4.5-detector-"));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe("detector fixes", () => {
    it("test 1: OA002 npm: alias regression guard - zero findings on npm: protocol override", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test-npm-alias",
            overrides: {
              lodash: "npm:lodash@4.17.21",
            },
          },
          null,
          2
        )
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "test-npm-alias" },
            "node_modules/lodash": { version: "4.17.21" },
          },
        })
      );

      const ctx = buildOverrideContext(dir, {
        auditLog: NULL_AUDIT_LOG,
        logger: noop(),
        checkNetwork: false,
      });
      const result = await audit(ctx, { checkNetwork: false });

      const oa002Findings = result.findings.filter((f) => f.ruleId === "OA002");
      expect(oa002Findings).toHaveLength(0);
    });

    it("test 2: OA005 suggest finding has fix === undefined", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify(
          {
            name: "test-oa005-suggest",
            overrides: {
              parent: {
                inner: "^1.0.0",
              },
            },
          },
          null,
          2
        )
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "test-oa005-suggest" },
            "node_modules/parent": {
              version: "1.0.0",
              dependencies: {
                inner: "^1.0.0",
              },
            },
            "node_modules/parent/node_modules/inner": {
              version: "1.5.0",
            },
            "node_modules/inner": {
              version: "1.5.0",
            },
          },
        })
      );

      const ctx = buildOverrideContext(dir, {
        auditLog: NULL_AUDIT_LOG,
        logger: noop(),
        checkNetwork: false,
      });
      const result = await audit(ctx, { checkNetwork: false });

      const oa005Findings = result.findings.filter((f) => f.ruleId === "OA005");
      expect(oa005Findings.length).toBeGreaterThan(0);

      const suggestFinding = oa005Findings.find(
        (f) => f.subRuleId === "OA005.e"
      );
      expect(suggestFinding).toBeDefined();
      expect(suggestFinding!.fix).toBeUndefined();
    });
  });

  describe("Plan 4 dogfood matrix unchanged", () => {
    const GHOST = join(process.cwd(), "cve-lite-ref/examples/ghost");
    const PRISMA = join(process.cwd(), "cve-lite-ref/examples/prisma");
    const STORYBOOK = join(process.cwd(), "cve-lite-ref/examples/storybook");
    const BUN_SIMPLE = join(process.cwd(), "cve-lite-ref/examples/bun-simple");

    it("Ghost (pnpm) still produces 5 findings", async () => {
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
      expect(result.findings.length).toBe(5);
    });

    it("Prisma (pnpm) still produces 1 OA001 finding", async () => {
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
      expect(result.findings.length).toBe(1);
      expect(result.findings[0].ruleId).toBe("OA001");
    });

    it("Storybook (yarn) still produces 7 OA002 findings", async () => {
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
      const oa002Findings = result.findings.filter((f) => f.ruleId === "OA002");
      expect(oa002Findings.length).toBe(7);
    });

    it("bun-simple produces 0 findings", async () => {
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
});
