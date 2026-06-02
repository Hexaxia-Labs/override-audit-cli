import type { OverrideRuleId, OverrideSubRuleId } from "../../src/overrides/types.js";

describe("override rule IDs", () => {
  it("has eight top-level rules OA001 through OA008", () => {
    const ids: OverrideRuleId[] = [
      "OA001", "OA002", "OA003", "OA004",
      "OA005", "OA006", "OA007", "OA008",
    ];
    expect(ids).toHaveLength(8);
  });

  it("has the five OA005 sub-rules", () => {
    const subs: OverrideSubRuleId[] = [
      "OA005.a", "OA005.b", "OA005.c", "OA005.d", "OA005.e",
    ];
    expect(subs).toHaveLength(5);
  });
});
