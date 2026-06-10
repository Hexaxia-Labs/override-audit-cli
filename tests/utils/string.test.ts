import { pluralize } from "../../src/utils/string.js";

describe("pluralize (existing - regression check)", () => {
  it("returns singular for count 1", () => {
    expect(pluralize(1, "finding")).toBe("finding");
  });
  it("returns plural for count != 1", () => {
    expect(pluralize(2, "finding")).toBe("findings");
    expect(pluralize(0, "finding")).toBe("findings");
  });
});
