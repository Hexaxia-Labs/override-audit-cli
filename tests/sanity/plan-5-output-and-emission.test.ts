/**
 * Plan 5 sanity test: prove output renderers and audit-log emission are stable end-to-end.
 *
 * Plan 5 delivered:
 *   - src/output/override-findings-terminal.ts: renderOverrideFindings for console output
 *   - src/output/override-findings-json.ts: overrideFindingsToJson for JSON key
 *   - src/output/override-findings-sarif.ts: buildOverrideSarifResults for SARIF results
 *   - src/output/override-findings-html.ts: renderOverrideFindingsHtml for HTML section
 *   - src/audit-log: MemoryAuditLog for in-process event capture
 *   - Scan lifecycle events: scan.started, scan.finished, error
 *   - Override findings collection on --check-overrides
 *   - cve.detected per finding, cve.fix.applied per remediation
 *   - End-to-end emission test
 *
 * This file locks in the Plan 5 public surface via in-process API (not spawn/execFile),
 * exercising the core integration paths:
 *
 *   1. Terminal renderer end-to-end: build OverrideContext, run audit(), pipe findings
 *      through renderOverrideFindings, assert output shape and rule id presence
 *   2. JSON output shape: feed findings to overrideFindingsToJson, assert result is
 *      round-trippable JSON with overrideFindings key as array
 *   3. SARIF results shape: feed findings to buildOverrideSarifResults, assert one
 *      result per finding with ruleId and level in {error, warning, note}
 *   4. HTML renderer escapes user-controlled strings: feed malicious message, assert
 *      HTML output contains &lt;script&gt; and not raw <script> tag
 *   5. MemoryAuditLog captures oa.detected events: run audit() with MemoryAuditLog,
 *      read log and assert event type and ruleId are captured
 *   6. Plan 4 dogfood matrix unchanged: Ghost/Prisma/Storybook fixture counts lock in
 *      that Plan 5 output wiring did not affect detector behavior
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { MemoryAuditLog, NULL_AUDIT_LOG } from "../../src/audit-log/index.js";
import { renderOverrideFindings } from "../../src/output/override-findings-terminal.js";
import { overrideFindingsToJson } from "../../src/output/override-findings-json.js";
import { buildOverrideSarifResults } from "../../src/output/override-findings-sarif.js";
import { renderOverrideFindingsHtml } from "../../src/output/override-findings-html.js";

const noop = () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;
const cveRefPath = join(process.cwd(), "cve-lite-ref");

describe("Plan 5: Output and emission stable", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plan-5-output-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe("Renderer public surface", () => {
    it("test 1: terminal renderer includes Override hygiene section header and OA001 rule id", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "with-orphan",
          overrides: { "orphaned-pkg": "1.0.0" },
        })
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "with-orphan" },
            "node_modules/lodash": { version: "4.17.21" },
          },
        })
      );

      const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const result = await audit(ctx, { checkNetwork: false });

      expect(result.findings.length).toBeGreaterThan(0);
      const output = renderOverrideFindings(result.findings);

      expect(output).toContain("Override hygiene");
      expect(output).toContain("OA001");
    });

    it("test 2: JSON output shape has overrideFindings key and is round-trippable", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "for-json",
          overrides: { "gone": "1.0.0" },
        })
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "for-json" },
            "node_modules/other": { version: "1.0.0" },
          },
        })
      );

      const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const result = await audit(ctx, { checkNetwork: false });
      const json = overrideFindingsToJson(result.findings);

      expect(json).toHaveProperty("overrideFindings");
      expect(Array.isArray(json.overrideFindings)).toBe(true);

      const roundTripped = JSON.parse(JSON.stringify(json));
      expect(roundTripped.overrideFindings).toEqual(json.overrideFindings);
    });

    it("test 3: SARIF results have ruleId and level in {error, warning, note}", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "for-sarif",
          overrides: { "missing": "1.0.0" },
        })
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "for-sarif" },
            "node_modules/present": { version: "1.0.0" },
          },
        })
      );

      const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const result = await audit(ctx, { checkNetwork: false });
      const sarifResults = buildOverrideSarifResults(result.findings);

      expect(sarifResults.length).toBeGreaterThan(0);
      for (const r of sarifResults) {
        expect(r.ruleId).toBeDefined();
        expect(["error", "warning", "note"]).toContain(r.level);
      }
    });

    it("test 4: HTML renderer escapes user-controlled message strings", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "for-html",
          overrides: { "xss-test": "1.0.0" },
        })
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "for-html" },
            "node_modules/safe": { version: "1.0.0" },
          },
        })
      );

      const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const result = await audit(ctx, { checkNetwork: false });

      const maliciousFindings = result.findings.map((f) => ({
        ...f,
        message: "<script>alert(1)</script>",
      }));

      const html = renderOverrideFindingsHtml(maliciousFindings);

      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
    });
  });

  describe("Audit-log emission surface", () => {
    it("test 5: MemoryAuditLog captures oa.detected events with ruleId", async () => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({
          name: "for-logging",
          overrides: { "orphan-logged": "1.0.0" },
        })
      );
      writeFileSync(
        join(dir, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { name: "for-logging" },
            "node_modules/present": { version: "1.0.0" },
          },
        })
      );

      const log = new MemoryAuditLog();
      const ctx = buildOverrideContext(dir, { auditLog: log, logger: noop(), checkNetwork: false });
      const result = await audit(ctx, { checkNetwork: false });

      expect(result.findings.length).toBeGreaterThan(0);

      const events = log.events;
      const oaDetectedEvents = events.filter((e) => e.type === "oa.detected");
      expect(oaDetectedEvents.length).toBeGreaterThan(0);

      const hasOA001 = oaDetectedEvents.some((e) => e.ruleId === "OA001");
      expect(hasOA001).toBe(true);
    });
  });

  describe("Plan 4 dogfood matrix unchanged", () => {
    it("test 6: Ghost fixture has 5 findings, Prisma has 1 OA001, Storybook has 7 OA002", async () => {
      const ghostPath = join(cveRefPath, "examples", "ghost");
      const prismaPath = join(cveRefPath, "examples", "prisma");
      const storyookPath = join(cveRefPath, "examples", "storybook");

      if (!existsSync(ghostPath) || !existsSync(prismaPath) || !existsSync(storyookPath)) {
        this.skip();
      }

      const log = new MemoryAuditLog();
      const ghostCtx = buildOverrideContext(ghostPath, { auditLog: log, logger: noop(), checkNetwork: false });
      const ghostResult = await audit(ghostCtx, { checkNetwork: false });

      expect(ghostResult.findings.length).toBe(5);

      const prismaCtx = buildOverrideContext(prismaPath, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const prismaResult = await audit(prismaCtx, { checkNetwork: false });

      const prismaOA001 = prismaResult.findings.filter((f) => f.ruleId === "OA001");
      expect(prismaOA001.length).toBe(1);

      const storyookCtx = buildOverrideContext(storyookPath, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
      const storyookResult = await audit(storyookCtx, { checkNetwork: false });

      const storyookOA002 = storyookResult.findings.filter((f) => f.ruleId === "OA002");
      expect(storyookOA002.length).toBe(7);
    });
  });
});
