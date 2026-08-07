import { describe, expect, it } from "vitest";
import { parseQueries } from "../../src/lib/parseQueries";

describe("parseQueries", () => {
  it("preserves order and duplicates while trimming empty items", () => {
    expect(parseQueries(" Funce ,\n\nFunce\nAnother App ")).toEqual([
      "Funce",
      "Funce",
      "Another App",
    ]);
  });
});
