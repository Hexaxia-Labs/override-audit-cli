import { renderOverrideFindingsHtml } from "../../src/output/override-findings-html.js";
import type { OverrideFinding } from "../../src/overrides/types.js";

const f = (over: Partial<OverrideFinding> = {}): OverrideFinding => ({
  ruleId: "OA001",
  severity: "high",
  package: { name: "postcss" },
  location: { file: "package.json", jsonPath: "/overrides/postcss" },
  message: "Override target not in resolved tree",
  ...over,
});

describe("renderOverrideFindingsHtml", () => {
  it("returns a section header even with no findings", () => {
    const html = renderOverrideFindingsHtml([]);
    expect(html).toMatch(/Override hygiene/i);
    expect(html).toMatch(/no override hygiene findings/i);
  });

  it("renders rows for each finding", () => {
    const html = renderOverrideFindingsHtml([f(), f({ ruleId: "OA008", severity: "critical", package: { name: "lodash" } })]);
    expect(html).toMatch(/OA001/);
    expect(html).toMatch(/OA008/);
  });

  it("escapes HTML in message", () => {
    const html = renderOverrideFindingsHtml([f({ message: "<script>alert(1)</script>" })]);
    // Use string containment, not a regex, so the assertion does not look like an
    // HTML-filtering regexp to scanners. The escaper works at the character level,
    // so verify the raw delimiters are gone and the entity form is present.
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes upper-case and mixed-case tags too", () => {
    const html = renderOverrideFindingsHtml([f({ message: "<SCRIPT>X</ScRiPt>" })]);
    expect(html).not.toContain("<SCRIPT>");
    expect(html).not.toContain("</ScRiPt>");
    expect(html).toContain("&lt;SCRIPT&gt;");
  });
});
