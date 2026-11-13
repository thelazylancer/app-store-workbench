import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupAppById, lookupAppStore } from "../../server/lib/appleLookup";

describe("lookupAppStore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("looks up the exact app ID in the selected storefront using the same baseline normalization", async () => {
    const fetchApple = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      results: [999, undefined, 123].map((trackId) => ({
        trackId, trackName: "Selected", sellerName: "Own Dev",
        trackViewUrl: "https://apps.apple.com/us/app/selected/id123",
        bundleId: " com.selected.App ", price: 0,
        description: "Own description", version: "1.2", releaseNotes: "Own history",
      })),
    })));
    const app = await lookupAppById(123, "cn");
    expect(app).toMatchObject({
      appleId: 123, bundleId: "com.selected.App", price: 0,
      appStoreUrl: "https://apps.apple.com/cn/app/selected/id123",
      description: "Own description",
      versionHistory: [{ version: "1.2", releasedAt: null, notes: "Own history" }],
    });
    const url = new URL(String(fetchApple.mock.calls[0]![0]));
    expect(url.pathname).toBe("/lookup");
    expect(url.searchParams.get("id")).toBe("123");
    expect(url.searchParams.get("country")).toBe("cn");
    expect(url.searchParams.get("entity")).toBe("software");
  });

  it("preserves trimmed Bundle IDs and omits missing or invalid values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          results: ["  com.Example.Funce  ", "  ", null, 123, undefined].map((bundleId) => ({
            trackName: "Funce",
            sellerName: "A Dev",
            trackViewUrl: "https://apps.apple.com/us/app/funce",
            bundleId,
          })),
        }),
      ),
    );

    const results = await lookupAppStore("Funce", "us");

    expect(results[0]).toHaveProperty("bundleId", "com.Example.Funce");
    for (const result of results.slice(1)) {
      expect(result).not.toHaveProperty("bundleId");
    }
  });

  it("preserves rating and count zeros while omitting invalid review facts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { averageUserRating: 0, userRatingCount: 0 },
          { averageUserRating: 4.75, userRatingCount: 1234 },
          { averageUserRating: -1, userRatingCount: -1 },
          { averageUserRating: 5.1, userRatingCount: 1.5 },
          { averageUserRating: "4.5", userRatingCount: "10" },
          { averageUserRating: null, userRatingCount: Number.MAX_SAFE_INTEGER + 1 },
          {},
        ].map((facts) => ({
          trackName: "Funce",
          sellerName: "A Dev",
          trackViewUrl: "https://apps.apple.com/us/app/funce",
          ...facts,
        })),
      })),
    );

    const results = await lookupAppStore("Funce", "us");

    expect(results[0]).toMatchObject({ averageUserRating: 0, userRatingCount: 0 });
    expect(results[1]).toMatchObject({ averageUserRating: 4.75, userRatingCount: 1234 });
    for (const result of results.slice(2)) {
      expect(result).not.toHaveProperty("averageUserRating");
      expect(result).not.toHaveProperty("userRatingCount");
    }
  });

  it("keeps app acquisition prices numeric and normalizes supplied price labels and currencies", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          { price: 0, formattedPrice: " Free ", currency: " usd " },
          { price: 4.99, formattedPrice: " $4.99 ", currency: " eur " },
          { price: "0", formattedPrice: " ", currency: "US" },
          { price: -1, formattedPrice: null, currency: 123 },
          { price: null },
          {},
        ].map((facts) => ({
          trackName: "Funce",
          sellerName: "A Dev",
          trackViewUrl: "https://apps.apple.com/us/app/funce",
          ...facts,
        })),
      })),
    );

    const results = await lookupAppStore("Funce", "us");

    expect(results[0]).toMatchObject({ price: 0, formattedPrice: "Free", currency: "USD" });
    expect(results[1]).toMatchObject({ price: 4.99, formattedPrice: "$4.99", currency: "EUR" });
    for (const result of results.slice(2)) {
      expect(result).not.toHaveProperty("price");
      expect(result).not.toHaveProperty("formattedPrice");
      expect(result).not.toHaveProperty("currency");
    }
  });

  it("converts digit-only package sizes to safe byte counts without losing zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: ["1250000", 0, "0", " 2000000 ", 123, -1, "-1", "1.5", "1e6", "", null,
          Number.MAX_SAFE_INTEGER + 1, "9007199254740992", undefined].map((fileSizeBytes) => ({
          trackName: "Funce",
          sellerName: "A Dev",
          trackViewUrl: "https://apps.apple.com/us/app/funce",
          fileSizeBytes,
        })),
      })),
    );

    const results = await lookupAppStore("Funce", "us");

    expect(results.slice(0, 5).map((result) => result.fileSizeBytes)).toEqual([1250000, 0, 0, 2000000, 123]);
    for (const result of results.slice(5)) {
      expect(result).not.toHaveProperty("fileSizeBytes");
    }
  });

  it("preserves a trimmed minimum OS version without coercing missing or invalid values", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [" 16.0 ", "  ", 16, null, undefined].map((minimumOsVersion) => ({
          trackName: "Funce",
          sellerName: "A Dev",
          trackViewUrl: "https://apps.apple.com/us/app/funce",
          minimumOsVersion,
        })),
      })),
    );

    const results = await lookupAppStore("Funce", "us");

    expect(results[0]).toHaveProperty("minimumOsVersion", "16.0");
    for (const result of results.slice(1)) {
      expect(result).not.toHaveProperty("minimumOsVersion");
    }
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
