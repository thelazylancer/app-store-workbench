import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupAppStore } from "../../server/lib/appleLookup";

describe("lookupAppStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps a valid Apple trackId to appleId and omits malformed IDs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              trackId: 6755396077,
              trackName: "Evin",
              sellerName: "A Dev",
              trackViewUrl: "https://apps.apple.com/us/app/evin",
            },
            {
              trackId: "not-a-number",
              trackName: "Broken ID",
              sellerName: "B Dev",
              trackViewUrl: "https://apps.apple.com/us/app/broken-id",
            },
          ],
        }),
      ),
    );

    const results = await lookupAppStore("Evin", "us");

    expect(results[0]?.appleId).toBe(6755396077);
    expect(results[1]).not.toHaveProperty("appleId");
  });
});
