import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "../../server/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("preserves input order while bounding the number of in-flight tasks", async () => {
    let inFlight = 0;
    let maximumInFlight = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return value * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maximumInFlight).toBe(2);
  });

  it("returns an empty array without starting workers", async () => {
    let calls = 0;
    await expect(mapWithConcurrency([], 3, async () => {
      calls += 1;
      return null;
    })).resolves.toEqual([]);
    expect(calls).toBe(0);
  });

  it("clamps the limit to at least one and at most the item count", async () => {
    const results = await mapWithConcurrency([1, 2], 0, async (value) => value);
    expect(results).toEqual([1, 2]);
  });
});
