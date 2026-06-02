import {
  coerceVersion,
  satisfiesRange,
  isValidRange,
  majorVersion,
} from "../../src/utils/version.js";

describe("majorVersion", () => {
  it("returns the leading integer", () => {
    expect(majorVersion("4.17.21")).toBe(4);
    expect(majorVersion("0.25.12-beta.1")).toBe(0);
  });
  it("returns null for non-versions", () => {
    expect(majorVersion("latest")).toBeNull();
    expect(majorVersion("")).toBeNull();
  });
});

describe("coerceVersion", () => {
  it("returns concrete versions unchanged", () => {
    expect(coerceVersion("1.2.3")).toBe("1.2.3");
  });
  it("expands short forms to X.Y.Z", () => {
    expect(coerceVersion("1")).toBe("1.0.0");
    expect(coerceVersion("1.2")).toBe("1.2.0");
  });
  it("strips range operators", () => {
    expect(coerceVersion("^1.2.3")).toBe("1.2.3");
    expect(coerceVersion("~2.4")).toBe("2.4.0");
    expect(coerceVersion(">=3.1.0")).toBe("3.1.0");
  });
  it("returns null for non-numeric input", () => {
    expect(coerceVersion("latest")).toBeNull();
    expect(coerceVersion("")).toBeNull();
  });
});

describe("isValidRange", () => {
  it("accepts plain versions", () => {
    expect(isValidRange("1.2.3")).toBe(true);
  });
  it("accepts caret, tilde, comparators", () => {
    expect(isValidRange("^1.2.3")).toBe(true);
    expect(isValidRange("~1.2")).toBe(true);
    expect(isValidRange(">=2.0.0")).toBe(true);
    expect(isValidRange("<3.0.0")).toBe(true);
    expect(isValidRange("=1.0.0")).toBe(true);
  });
  it("rejects garbage and tags", () => {
    expect(isValidRange("latest")).toBe(false);
    expect(isValidRange("")).toBe(false);
    expect(isValidRange("not-a-version")).toBe(false);
  });
});

describe("satisfiesRange", () => {
  it("exact match", () => {
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
  });
  it("caret: same major, >= specified", () => {
    expect(satisfiesRange("1.2.3", "^1.2.0")).toBe(true);
    expect(satisfiesRange("1.9.9", "^1.2.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfiesRange("1.1.0", "^1.2.0")).toBe(false);
  });
  it("tilde: same major.minor, >= specified patch", () => {
    expect(satisfiesRange("1.2.5", "~1.2.3")).toBe(true);
    expect(satisfiesRange("1.3.0", "~1.2.3")).toBe(false);
  });
  it("comparators", () => {
    expect(satisfiesRange("2.0.0", ">=1.0.0")).toBe(true);
    expect(satisfiesRange("0.9.0", ">=1.0.0")).toBe(false);
    expect(satisfiesRange("0.5.0", "<1.0.0")).toBe(true);
    expect(satisfiesRange("1.0.0", "<1.0.0")).toBe(false);
  });
  it("returns false on invalid version", () => {
    expect(satisfiesRange("not-a-version", "^1.0.0")).toBe(false);
  });
});
