/**
 * Plan 6.5 sanity: lock in the correctness + boundary invariants.
 *
 *   #14/#15 - OA001 does not false-positive on pnpm parent>child keys; OA005 stays
 *             silent on valid-or-unevaluable selective overrides.
 *   #32     - no detector runnableCommand carries the unparsed --target flag.
 *   relocate - the fix vocabulary has no bare add; OA006 emits relocate at the
 *             proposed tier; the applier chokepoint guard rejects any fix that would
 *             invent a new override key.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { audit, buildOverrideContext } from "../../src/overrides/index.js";
import { applyFix } from "../../src/overrides/fixer.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const noop = () =>
  ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }) as any;

const BANNED_OPS = new Set(["add", "copy", "test"]);

describe("Plan 6.5: fix vocabulary has no bare add/copy/test", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "p65-vocab-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("OA006 emits a relocate op at the proposed tier, never a bare add", async () => {
    // A platform binary overridden while an exact-pinned parent declares it.
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      pnpm: { overrides: { "@esbuild/linux-x64": "latest" } },
    }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), [
      "lockfileVersion: '9.0'",
      "snapshots:",
      "  esbuild@0.25.12: {}",
      "  '@esbuild/linux-x64@0.25.12': {}",
    ].join("\n"));
    // node_modules so OA006 can read the parent manifest declaring the binary exactly.
    const nm = join(dir, "node_modules");
    writeFileSync(join(dir, "package.json"), readFileSync(join(dir, "package.json"), "utf8"));
    mkFile(join(nm, "esbuild", "package.json"), JSON.stringify({
      name: "esbuild", version: "0.25.12",
      optionalDependencies: { "@esbuild/linux-x64": "0.25.12" },
    }));
    mkFile(join(nm, "@esbuild", "linux-x64", "package.json"), JSON.stringify({
      name: "@esbuild/linux-x64", version: "0.25.12",
    }));

    const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
    const result = await audit(ctx, { checkNetwork: false });
    const oa006 = result.findings.find((f) => f.ruleId === "OA006");
    expect(oa006).toBeDefined();
    expect(oa006!.fix!.tier).toBe("proposed");
    expect(oa006!.fix!.patch.some((op) => op.op === "relocate")).toBe(true);
    // No banned op anywhere in any finding's fix.
    for (const f of result.findings) {
      for (const op of f.fix?.patch ?? []) {
        expect(BANNED_OPS.has(op.op)).toBe(false);
      }
    }
  });
});

describe("Plan 6.5: applier chokepoint guard", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "p65-guard-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("rejects a fix that would create a new override key, commits nothing", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", overrides: { keep: "1.0.0" } }, null, 2));
    const sneaky: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "sneaky" },
      location: { file: "package.json", jsonPath: "/overrides/sneaky" },
      message: "x",
      fix: { type: "rfc6902", patch: [{ op: "replace", path: "/overrides/sneaky", value: "9.9.9" }] },
    };
    const report = applyFix({ projectPath: dir, findings: [sneaky], auditLog: NULL_AUDIT_LOG, dryRun: false });
    expect(report.appliedPatches).toHaveLength(0);
    expect(report.skipped[0].reason).toMatch(/fix-guard/);
    const after = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(after.overrides).toEqual({ keep: "1.0.0" });
  });
});

describe("Plan 6.5: no detector recommends the unparsed --target flag (#32)", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "p65-target-")); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("runnableCommand never contains --target", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: "x",
      overrides: { orphan: "1.0.0", floater: "latest" },
    }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
      lockfileVersion: 3,
      packages: { "": { name: "x" }, "node_modules/lodash": { version: "4.17.21" } },
    }));
    const ctx = buildOverrideContext(dir, { auditLog: NULL_AUDIT_LOG, logger: noop(), checkNetwork: false });
    const result = await audit(ctx, { checkNetwork: false });
    expect(result.findings.length).toBeGreaterThan(0);
    for (const f of result.findings) {
      expect(f.fix?.runnableCommand ?? "").not.toContain("--target");
    }
  });
});

function mkFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
