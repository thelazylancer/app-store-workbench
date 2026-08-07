import { describe, expect, it } from "vitest";
import { buildIapHints } from "../../server/lib/iapHints";

describe("buildIapHints", () => {
  it("returns unavailable when product-page pricing is not available", async () => {
    await expect(buildIapHints(null)).resolves.toEqual({
      "4.99": "unavailable",
      "9.99": "unavailable",
      source: "best_effort",
    });
  });

  it("marks watched prices as found or not_found when product-page pricing is available", async () => {
    await expect(
      buildIapHints([
        { name: "Pack A", price: "$4.99" },
        { name: "Pack B", price: "$7.99" },
      ]),
    ).resolves.toEqual({
      "4.99": "found",
      "9.99": "not_found",
      source: "rendered_page",
    });
  });
});
