import { shellQuote, pluralize } from "../../src/utils/string.js";

describe("shellQuote", () => {
  it("returns plain identifiers unchanged", () => {
    expect(shellQuote("postcss")).toBe("postcss");
    expect(shellQuote("@scope/pkg")).toBe("@scope/pkg");
    expect(shellQuote("react-router-dom")).toBe("react-router-dom");
  });

  it("quotes names with spaces or special characters", () => {
    expect(shellQuote("foo bar")).toBe(`'foo bar'`);
    expect(shellQuote("a$b")).toBe(`'a$b'`);
  });

  it("escapes single quotes inside the name", () => {
    expect(shellQuote("foo's pkg")).toBe(`'foo'\\''s pkg'`);
  });
});

describe("pluralize (existing - regression check)", () => {
  it("returns singular for count 1", () => {
    expect(pluralize(1, "finding")).toBe("finding");
  });
  it("returns plural for count != 1", () => {
    expect(pluralize(2, "finding")).toBe("findings");
    expect(pluralize(0, "finding")).toBe("findings");
  });
});
