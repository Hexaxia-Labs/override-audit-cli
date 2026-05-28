import { chunk, unique, uniquePathArrays } from "../src/utils/array.js";

describe("Jest setup", () => {
  it("runs TypeScript ESM tests against project modules", () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(unique(["a", "a", "b"])).toEqual(["a", "b"]);
    expect(uniquePathArrays([["root", "dep"], ["root", "dep"], ["root", "other"]])).toEqual([
      ["root", "dep"],
      ["root", "other"],
    ]);
  });
});
