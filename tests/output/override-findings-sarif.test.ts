import { buildOverrideSarifComponent, buildOverrideSarifResults } from "../../src/output/override-findings-sarif.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

describe("override-findings-sarif", () => {
  it("buildOverrideSarifComponent registers OA001..OA008 rules", () => {
    const c = buildOverrideSarifComponent();
    const ruleIds = (c as any).rules?.map((r: any) => r.id);
    expect(ruleIds).toEqual(
      expect.arrayContaining(["OA001", "OA002", "OA003", "OA004", "OA005", "OA006", "OA007", "OA008"])
    );
  });

  it("buildOverrideSarifResults emits one result per finding with ruleId set", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
    };
    const results = buildOverrideSarifResults([f]);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("OA001");
    expect(results[0].level).toMatch(/error|warning|note/);
  });
});
