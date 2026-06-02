import { applyComposite } from "../../src/overrides/composite.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const baseLoc = { file: "package.json", jsonPath: "/overrides/x" };

function make(ruleId: OverrideFinding["ruleId"], pkg: string, sev: OverrideFinding["severity"]): OverrideFinding {
  return { ruleId, severity: sev, package: { name: pkg }, location: baseLoc, message: "x" };
}

describe("applyComposite", () => {
  it("suppresses OA001 when OA005 fires for the same package", () => {
    const findings = [make("OA001", "foo", "high"), make("OA005", "foo", "medium")];
    const out = applyComposite(findings);
    expect(out.map((f) => f.ruleId)).toEqual(["OA005"]);
  });

  it("escalates OA006 to high (with updated message) when OA008 confirms", () => {
    const findings = [make("OA006", "lodash", "medium"), make("OA008", "lodash", "critical")];
    const out = applyComposite(findings);
    const oa6 = out.find((f) => f.ruleId === "OA006")!;
    expect(oa6.severity).toBe("high");
    expect(oa6.message).toMatch(/vulnerable copy on disk|OA008 confirms/i);
  });

  it("leaves unrelated findings alone", () => {
    const findings = [make("OA002", "foo", "medium"), make("OA003", "bar", "high")];
    expect(applyComposite(findings)).toHaveLength(2);
  });
});
