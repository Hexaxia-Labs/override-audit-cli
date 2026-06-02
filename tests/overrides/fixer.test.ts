import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyFix } from "../../src/overrides/fixer.js";
import type { OverrideFinding } from "../../src/overrides/types.js";
import { NULL_AUDIT_LOG } from "../../src/audit-log/index.js";

function findingOf(
  ruleId: OverrideFinding["ruleId"],
  pkg: string,
  patch: OverrideFinding["fix"]["patch"]
): OverrideFinding {
  return {
    ruleId,
    severity: "high",
    package: { name: pkg },
    location: { file: "package.json", jsonPath: `/overrides/${pkg}` },
    message: "x",
    fix: { type: "rfc6902", patch },
  };
}

describe("applyFix (RFC 6902 to package.json)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fixer-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("applies a remove patch to package.json", () => {
    const pkgPath = join(dir, "package.json");
    writeFileSync(
      pkgPath,
      JSON.stringify({ name: "x", overrides: { gone: "1.0.0" } }, null, 2)
    );

    const finding = findingOf("OA001", "gone", [
      { op: "remove", path: "/overrides/gone" },
    ]);

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: false,
    });

    expect(report.appliedPatches).toHaveLength(1);
    const updated = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(updated.overrides?.gone).toBeUndefined();
  });

  it("dryRun does not modify the file", () => {
    const pkgPath = join(dir, "package.json");
    const before = JSON.stringify(
      { name: "x", overrides: { gone: "1.0.0" } },
      null,
      2
    );
    writeFileSync(pkgPath, before);

    const finding = findingOf("OA001", "gone", [
      { op: "remove", path: "/overrides/gone" },
    ]);

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: true,
    });

    expect(report.appliedPatches).toHaveLength(1);
    expect(report.dryRun).toBe(true);
    expect(readFileSync(pkgPath, "utf8")).toBe(before);
  });

  it("skips findings without a fix and reports them", () => {
    const pkgPath = join(dir, "package.json");
    writeFileSync(pkgPath, JSON.stringify({ name: "x" }, null, 2));

    const finding: OverrideFinding = {
      ruleId: "OA002",
      severity: "medium",
      package: { name: "react" },
      location: { file: "package.json", jsonPath: "/overrides/react" },
      message: "tag pin",
    };

    const report = applyFix({
      projectPath: dir,
      findings: [finding],
      auditLog: NULL_AUDIT_LOG,
      dryRun: false,
    });
    expect(report.appliedPatches).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0].reason).toMatch(/no fix/i);
  });
});
