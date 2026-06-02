import type { OverrideRuleId, OverrideSubRuleId } from "../../src/overrides/types.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

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

describe("OverrideFinding shape", () => {
  it("carries ruleId, severity, package, location, message", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "Override target not in resolved tree",
    };
    expect(f.ruleId).toBe("OA001");
    expect(f.location.file).toBe("package.json");
  });

  it("optionally carries an RFC 6902 patch fix", () => {
    const f: OverrideFinding = {
      ruleId: "OA001",
      severity: "high",
      package: { name: "postcss" },
      location: { file: "package.json", jsonPath: "/overrides/postcss" },
      message: "x",
      fix: {
        type: "rfc6902",
        patch: [{ op: "remove", path: "/overrides/postcss" }],
      },
    };
    expect(f.fix?.type).toBe("rfc6902");
  });
});
