import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { lookupAppStore } from "../../server/lib/appleLookup";
import { buildIapHints } from "../../server/lib/iapHints";

describe("POST /api/search-apps", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retains primary and alternate comparison facts when product-page enrichment fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        results: [
          {
            trackName: "Funce AI",
            sellerName: "A Dev",
            trackViewUrl: "https://apps.apple.com/us/app/funce-ai",
            bundleId: " com.example.FunceAI ",
            averageUserRating: 0,
            userRatingCount: 0,
            price: 0,
            formattedPrice: "Free",
            currency: "USD",
            fileSizeBytes: "0",
            minimumOsVersion: "16.0",
          },
          {
            trackName: "Funce Daily",
            sellerName: "B Dev",
            trackViewUrl: "https://apps.apple.com/us/app/funce-daily",
            bundleId: "com.example.FunceDaily",
            averageUserRating: 4.75,
            userRatingCount: 1234,
            price: 2.99,
            formattedPrice: "$2.99",
            currency: "USD",
            fileSizeBytes: "1250000",
            minimumOsVersion: "17.0",
          },
        ],
      })),
    );
    const app = createApp({
      lookupAppStore,
      fetchProductPageDetails: async () => {
        throw new Error("Product page unavailable");
      },
      buildIapHints,
    });

    const response = await request(app).post("/api/search-apps").send({ names: ["Funce"] });

    expect(response.status).toBe(200);
    expect(response.body.results[0]).toMatchObject({
      status: "uncertain_match",
      app: {
        bundleId: "com.example.FunceAI",
        averageUserRating: 0,
        userRatingCount: 0,
        price: 0,
        formattedPrice: "Free",
        currency: "USD",
        fileSizeBytes: 0,
        minimumOsVersion: "16.0",
      },
      alternates: [{
        bundleId: "com.example.FunceDaily",
        averageUserRating: 4.75,
        userRatingCount: 1234,
        price: 2.99,
        formattedPrice: "$2.99",
        currency: "USD",
        fileSizeBytes: 1250000,
        minimumOsVersion: "17.0",
      }],
      iapHints: { "4.99": "unavailable", "9.99": "unavailable" },
    });
  });
  it("returns one result per input name in the same order", async () => {
    const app = createApp({
      lookupAppStore: async (query) => {
        if (query === "Funce") {
          return [
            {
              name: "Funce",
              developer: "A Dev",
              appStoreUrl: "https://a",
              iconUrl: "https://i",
              description: "desc",
              screenshotUrls: [],
            },
          ];
        }

        return [];
      },
      fetchProductPageDetails: async () => ({
        screenshotUrls: ["https://example.com/funce-1.jpg"],
        iapItems: [
          { name: "Funce Get 1198 coins", price: "$4.99" },
          { name: "Funce Get 2498 coins", price: "$9.99" },
        ],
        versionHistory: [
          {
            version: "2.0.0",
            releasedAt: "2026-02-01T00:00:00Z",
            notes: "New release",
          },
        ],
      }),
      buildIapHints: async (items) => ({
        "4.99": items?.some((item) => item.price === "$4.99") ? "found" : "unavailable",
        "9.99": items?.some((item) => item.price === "$9.99") ? "found" : "unavailable",
        source: items ? "rendered_page" : "best_effort",
      }),
    });

    const response = await request(app)
      .post("/api/search-apps")
      .send({ names: ["Funce", "Missing App"] });

    expect(response.status).toBe(200);
    expect(response.body.results.map((item: { query: string }) => item.query)).toEqual([
      "Funce",
      "Missing App",
    ]);
    expect(response.body.results.map((item: { status: string }) => item.status)).toEqual([
      "matched",
      "no_match",
    ]);
    expect(response.body.results[0].app.screenshotUrls).toEqual([
      "https://example.com/funce-1.jpg",
    ]);
    expect(response.body.results[0].app.iapItems).toEqual([
      { name: "Funce Get 1198 coins", price: "$4.99" },
      { name: "Funce Get 2498 coins", price: "$9.99" },
    ]);
    expect(response.body.results[0].app.versionHistory).toEqual([
      {
        version: "2.0.0",
        releasedAt: "2026-02-01T00:00:00Z",
        notes: "New release",
      },
    ]);
    expect(response.body.results[0].iapHints).toEqual({
      "4.99": "found",
      "9.99": "found",
      source: "rendered_page",
    });
  });

  it("returns search_failed when the lookup dependency throws", async () => {
    const app = createApp({
      lookupAppStore: async () => {
        throw new Error("forced failure");
      },
      fetchProductPageDetails: async () => ({
        screenshotUrls: [],
        iapItems: [],
        versionHistory: [],
      }),
      buildIapHints: async () => ({
        "4.99": "unavailable" as const,
        "9.99": "unavailable" as const,
        source: "best_effort" as const,
      }),
    });

    const response = await request(app)
      .post("/api/search-apps")
      .send({ names: ["Funce"] });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        query: "Funce",
        status: "search_failed",
        app: null,
        alternates: [],
        iapHints: null,
        message: "Search failed",
      },
    ]);
  });
});
