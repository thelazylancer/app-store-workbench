import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { lookupAppById, lookupAppStore } from "../../server/lib/appleLookup";
import { buildIapHints } from "../../server/lib/iapHints";

describe("GET /api/app-details/:appleId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects invalid detail identity or country and distinguishes absent apps from upstream failure", async () => {
    const lookup = vi.fn(async (_id: number, _country: string) => null);
    const page = vi.fn(async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }));
    const app = createApp({ lookupAppStore, lookupAppById: lookup, fetchProductPageDetails: page, buildIapHints });
    for (const path of ["0", "-1", "1.5", "1e3", "9007199254740992", "not-an-id", "123?country=de", "123?country=", "123?country=us&country=jp"]) {
      expect((await request(app).get(`/api/app-details/${path}`)).status).toBe(400);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect((await request(app).get("/api/app-details/123")).status).toBe(404);
    expect(lookup.mock.lastCall).toEqual([123, "us"]);
    lookup.mockRejectedValueOnce(new Error("Apple unavailable"));
    expect((await request(app).get("/api/app-details/123?country=cn")).status).toBe(502);
    expect(page).not.toHaveBeenCalled();
  });

  it("preserves the candidate's own lookup facts when page enrichment fails", async () => {
    const app = createApp({
      lookupAppStore,
      lookupAppById: async () => ({
        appleId: 456, name: "Selected", developer: "Own Dev", appStoreUrl: "https://apps.apple.com/us/app/id456",
        iconUrl: "", description: "Own description", screenshotUrls: ["Own screenshot"],
        versionHistory: [{ version: "Own lookup", releasedAt: null, notes: "Own history" }],
      }),
      fetchProductPageDetails: async () => { throw new Error("Page failed"); },
      buildIapHints,
    });
    const response = await request(app).get("/api/app-details/456");
    expect(response.status).toBe(200);
    expect(response.body.app).toMatchObject({
      appleId: 456, description: "Own description", screenshotUrls: ["Own screenshot"], iapItems: [],
      versionHistory: [{ version: "Own lookup", releasedAt: null, notes: "Own history" }],
    });
    expect(response.body.iapHints).toMatchObject({ "4.99": "unavailable", "9.99": "unavailable" });
  });

  it("returns a candidate's own localized detail without inheriting primary facts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [{
      trackId: 456, trackName: "Selected", sellerName: "Selected Dev", bundleId: "com.selected.App",
      trackViewUrl: "https://apps.apple.com/us/app/selected/id456", description: "Selected description",
      version: "1.0", releaseNotes: "Selected lookup history", screenshotUrls: ["https://example.com/selected.png"],
    }] })));
    const page = vi.fn(async (_url: string) => ({
      screenshotUrls: ["https://example.com/selected-page.png"],
      iapItems: [{ name: "Selected pack", price: "¥4.99" }],
      versionHistory: [{ version: "2.0", releasedAt: null, notes: "Selected page history" }],
    }));
    const app = createApp({ lookupAppStore, lookupAppById, fetchProductPageDetails: page, buildIapHints });
    const response = await request(app).get("/api/app-details/456?country=JP");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      country: "jp",
      app: {
        appleId: 456, name: "Selected", bundleId: "com.selected.App", description: "Selected description",
        appStoreUrl: "https://apps.apple.com/jp/app/selected/id456",
        screenshotUrls: ["https://example.com/selected-page.png"],
        iapItems: [{ name: "Selected pack", price: "¥4.99" }],
        versionHistory: [{ version: "2.0", releasedAt: null, notes: "Selected page history" }],
      },
      iapHints: { "4.99": "unavailable", "9.99": "unavailable" },
    });
    expect(page.mock.calls[0]![0]).toBe("https://apps.apple.com/jp/app/selected/id456?l=en");
  });
});

describe("POST /api/search-apps", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches and enriches the selected country without applying US price bands", async () => {
    const fetchApple = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ results: [{
        trackId: 123,
        trackName: "Funce",
        sellerName: "A Dev",
        trackViewUrl: "https://apps.apple.com/us/app/funce/id123?uo=4",
      }] })),
    );
    const fetchProductPageDetails = vi.fn(async (_url: string) => ({
      screenshotUrls: [],
      iapItems: [{ name: "Pack", price: "¥4.99" }],
      versionHistory: [],
    }));
    const app = createApp({ lookupAppById, lookupAppStore, fetchProductPageDetails, buildIapHints });

    const response = await request(app).post("/api/search-apps")
      .send({ names: ["Funce"], country: "JP" });

    expect(response.status).toBe(200);
    expect(response.body.country).toBe("jp");
    const providerUrl = new URL(String(fetchApple.mock.calls[0]![0]));
    expect(providerUrl.searchParams.get("country")).toBe("jp");
    expect(providerUrl.searchParams.get("limit")).toBe("200");
    const productUrl = new URL(fetchProductPageDetails.mock.calls[0]![0] as string);
    expect(productUrl.pathname).toBe("/jp/app/funce/id123");
    expect(productUrl.searchParams.get("l")).toBe("en");
    expect(response.body.results[0].app.iapItems).toEqual([{ name: "Pack", price: "¥4.99" }]);
    expect(response.body.results[0].iapHints).toMatchObject({
      "4.99": "unavailable", "9.99": "unavailable",
    });
  });

  it("accepts all eight countries and defaults omitted country to US before rejecting invalid values", async () => {
    const lookup = vi.fn(async (_query: string, _country: string) => []);
    const app = createApp({
      lookupAppById,
      lookupAppStore: lookup,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      buildIapHints,
    });
    for (const country of [undefined, "US", "cn", "HK", "tw", "JP", "sg", "GB", "au"]) {
      const response = await request(app).post("/api/search-apps").send({ names: ["Funce"], country });
      expect(response.status).toBe(200);
      expect(response.body.country).toBe(country?.toLowerCase() ?? "us");
      expect(lookup.mock.lastCall?.[1]).toBe(country?.toLowerCase() ?? "us");
    }
    lookup.mockClear();
    for (const country of ["de", "", null, 123, ["us"], {}]) {
      const response = await request(app).post("/api/search-apps").send({ names: ["Funce"], country });
      expect(response.status).toBe(400);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    { query: "Duvae", status: "no_match" },
    { query: "Duva", status: "matched" },
    { query: "Duva Daily", status: "uncertain_match" },
  ])("retains every provider suggestion in order for $status", async ({ query, status }) => {
    const candidates = ["DUVA: Sleep & Recovery", "Duva", "Duva Daily Journal", "Duva Daily Planner", "Weather", "Music", "Notes"]
      .map((name, index) => ({
        name, developer: `Dev ${index}`, appleId: 100 + index,
        appStoreUrl: `https://apps.apple.com/us/app/id${100 + index}`,
        iconUrl: "", description: `${name} description`, screenshotUrls: [],
        versionHistory: [{ version: `1.${index}`, releasedAt: null, notes: "Own release" }],
      }));
    const app = createApp({
      lookupAppById,
      lookupAppStore: async () => candidates,
      fetchProductPageDetails: async () => ({
        screenshotUrls: [], iapItems: [{ name: "Primary pack", price: "$4.99" }],
        versionHistory: [{ version: "Enriched primary", releasedAt: null, notes: "Primary only" }],
      }),
      buildIapHints,
    });
    const response = await request(app).post("/api/search-apps").send({ names: [query] });
    expect(response.status).toBe(200);
    expect(response.body.results[0].status).toBe(status);
    expect(response.body.results[0].candidates).toEqual(candidates);
    expect(JSON.stringify(response.body.results[0].candidates)).not.toContain("normalizedName");
  });

  it("keeps missing-ID candidates at their supplied baseline without URL enrichment", async () => {
    const page = vi.fn(async (_url: string) => ({
      screenshotUrls: ["Wrong page"], iapItems: [{ name: "Wrong pack", price: "$4.99" }], versionHistory: [],
    }));
    const app = createApp({
      lookupAppById,
      lookupAppStore: async () => [{
        name: "Missing ID", developer: "Own Dev", appStoreUrl: "https://example.com/arbitrary",
        iconUrl: "", description: "Own description", screenshotUrls: ["Own screenshot"],
      }],
      fetchProductPageDetails: page, buildIapHints,
    });
    const response = await request(app).post("/api/search-apps").send({ names: ["Missing ID"] });
    expect(response.body.results[0].app).toMatchObject({
      description: "Own description", screenshotUrls: ["Own screenshot"], iapItems: [],
    });
    expect(page).not.toHaveBeenCalled();
    expect(response.body.results[0].iapHints).toMatchObject({ "4.99": "unavailable", "9.99": "unavailable" });
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
      lookupAppById,
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
      lookupAppById,
      lookupAppStore: async (query) => {
        if (query === "Funce") {
          return [
            {
              name: "Funce",
              developer: "A Dev",
              appleId: 123,
              appStoreUrl: "https://apps.apple.com/us/app/id123",
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
      lookupAppById,
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
        candidates: [],
        alternates: [],
        iapHints: null,
        message: "Search failed",
      },
    ]);
  });
});
