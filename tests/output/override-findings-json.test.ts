import { overrideFindingsToJson } from "../../src/output/override-findings-json.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

describe("overrideFindingsToJson", () => {
  it("returns the findings as a plain array under overrideFindings key", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
    };
    const json = overrideFindingsToJson([f]);
    expect(json).toEqual({ overrideFindings: [f] });
  });

  it("returns empty array on no findings", () => {
    expect(overrideFindingsToJson([])).toEqual({ overrideFindings: [] });
  });
});
