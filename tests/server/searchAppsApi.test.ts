import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import { lookupAppById, lookupAppStore } from "../../server/lib/appleLookup";
import { buildIapHints } from "../../server/lib/iapHints";
import { fetchProductPageDetails } from "../../server/lib/productPage";
import type { LookupCandidate, SearchResult } from "../../shared/types";

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

  it.each(["transport failure", "malformed IAP catalog"])("preserves lookup facts and unknown IAP after real HTTP client %s", async (failure) => {
    const fetchApple = vi.spyOn(globalThis, "fetch");
    if (failure === "transport failure") {
      fetchApple.mockRejectedValue(new Error("Connection unavailable"));
    } else {
      const page = new Response(JSON.stringify({
        storePlatformData: { "product-dv": { results: { "456": { id: "456", hasInAppPurchases: true } } } },
        pageData: { componentName: "software_page", id: "456", addOns: [{ name: "Unreadable price" }] },
      }), { headers: { "Content-Type": "application/json" } });
      Object.defineProperty(page, "url", { value: "https://apps.apple.com/us/app/id456?l=en" });
      fetchApple.mockResolvedValue(page);
    }
    const app = createApp({
      lookupAppStore,
      lookupAppById: async () => ({
        appleId: 456, name: "Selected", developer: "Own Dev", appStoreUrl: "https://apps.apple.com/us/app/id456",
        iconUrl: "", description: "Own description", screenshotUrls: ["Own screenshot"],
        versionHistory: [{ version: "Own lookup", releasedAt: null, notes: "Own history" }],
      }),
      fetchProductPageDetails,
      buildIapHints,
    });
    const response = await request(app).get("/api/app-details/456");
    expect(response.status).toBe(200);
    expect(response.body.app).toMatchObject({
      appleId: 456, description: "Own description", screenshotUrls: ["Own screenshot"], iapItems: [],
      versionHistory: [{ version: "Own lookup", releasedAt: null, notes: "Own history" }],
    });
    expect(response.body.iapHints).toEqual({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" });
    expect(fetchApple).toHaveBeenCalledWith("https://apps.apple.com/us/app/id456?l=en", expect.objectContaining({ signal: expect.any(AbortSignal) }));
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

  it("rejects malformed or ambiguous requests before any lookup or enrichment", async () => {
    const lookup = vi.fn(async () => []);
    const page = vi.fn(async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }));
    const app = createApp({ lookupAppById, lookupAppStore: lookup, fetchProductPageDetails: page, buildIapHints });
    const invalidRequests = [
      {},
      { queries: null },
      { queries: "Funce" },
      { queries: ["Funce"] },
      { queries: [null] },
      { queries: [{}] },
      { queries: [{ name: 123 }] },
      { queries: [{ name: " \t " }] },
      { queries: [{ bundleId: "com.example.Funce" }] },
      { queries: [{ name: "Funce", bundleId: 123 }] },
      { queries: [{ name: "Funce", bundleId: null }] },
      { queries: [{ name: "Funce" }, { name: "" }] },
      { queries: [{ name: "Funce" }], names: ["Funce"] },
      { queries: [{ name: "Funce" }], country: "de" },
      { names: null },
      { names: ["Funce", 123] },
    ];

    for (const body of invalidRequests) {
      const response = await request(app).post("/api/search-apps").send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(page).not.toHaveBeenCalled();
  });

  it("keeps repeated structured queries in order and enriches each row's exact Bundle selection", async () => {
    const candidates: LookupCandidate[] = ["Funce", "Weather", "Notes", "Music", "Localized title"]
      .map((name, index) => ({
        name, developer: `Dev ${index}`, appleId: 100 + index,
        bundleId: index === 4 ? "com.example.Target" : `com.example.App${index}`,
        appStoreUrl: `https://apps.apple.com/us/app/id${100 + index}`,
        iconUrl: "", description: `Description ${index}`, screenshotUrls: [`Baseline ${index}`],
      }));
    const lookup = vi.fn(async (_query: string, _country: string) => candidates);
    const page = vi.fn(async (url: string) => ({
      screenshotUrls: [`Page ${new URL(url).pathname}`],
      iapItems: [{ name: "Pack", price: "¥4.99" }],
      versionHistory: [],
    }));
    const app = createApp({ lookupAppById, lookupAppStore: lookup, fetchProductPageDetails: page, buildIapHints });

    const response = await request(app).post("/api/search-apps").send({
      queries: [
        { name: "Funce", bundleId: " COM.EXAMPLE.Target " },
        { name: "Funce", bundleId: "com.example.App0" },
        { name: "Funce", bundleId: " \t " },
        { name: "Funce" },
      ],
      country: "JP",
    });
    const results = response.body.results as SearchResult[];

    expect(response.status).toBe(200);
    expect(response.body.country).toBe("jp");
    expect(lookup.mock.calls).toEqual(Array.from({ length: 4 }, () => ["Funce", "jp"]));
    expect(results.map((result) => [result.query, result.requestedBundleId, result.status, result.app?.appleId])).toEqual([
      ["Funce", "COM.EXAMPLE.Target", "matched", 104],
      ["Funce", "com.example.App0", "matched", 100],
      ["Funce", undefined, "matched", 100],
      ["Funce", undefined, "matched", 100],
    ]);
    expect(page.mock.calls.map(([url]) => url)).toEqual([
      "https://apps.apple.com/jp/app/id104?l=en",
      ...Array.from({ length: 3 }, () => "https://apps.apple.com/jp/app/id100?l=en"),
    ]);
    for (const [index, result] of results.entries()) {
      expect(result.candidates).toEqual(candidates);
      expect(result.app).toMatchObject({
        description: index === 0 ? "Description 4" : "Description 0",
        screenshotUrls: [`Page /jp/app/id${index === 0 ? 104 : 100}`],
        iapItems: [{ name: "Pack", price: "¥4.99" }],
      });
      expect(result.iapHints).toMatchObject({ "4.99": "unavailable", "9.99": "unavailable" });
    }
    expect(results[2]).not.toHaveProperty("requestedBundleId");
    expect(results[3]).not.toHaveProperty("requestedBundleId");
  });

  it.each([false, true])("preserves the supplied-Bundle no-match message in another country (candidates: %s)", async (hasCandidates) => {
    const candidates: LookupCandidate[] = hasCandidates ? [{
      name: "Funce", bundleId: "com.example.Target.extra", developer: "Own Dev", appleId: 123,
      appStoreUrl: "https://apps.apple.com/us/app/id123", iconUrl: "", description: "Own description", screenshotUrls: [],
    }] : [];
    const page = vi.fn(async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }));
    const app = createApp({
      lookupAppById, lookupAppStore: async () => candidates, fetchProductPageDetails: page, buildIapHints,
    });

    const response = await request(app).post("/api/search-apps").send({
      queries: [{ name: "Funce", bundleId: " com.example.Target " }], country: "cn",
    });

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([{
      query: "Funce", requestedBundleId: "com.example.Target", status: "no_match",
      app: null, candidates, alternates: [], iapHints: null,
      message: "No App Store candidate matched the supplied Bundle ID",
    }]);
    expect(page).not.toHaveBeenCalled();
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

  it.each([
    { label: "legacy names", body: { names: ["Funce"] }, identity: {} },
    { label: "structured query", body: { queries: [{ name: "Funce", bundleId: " com.example.Funce " }] }, identity: { requestedBundleId: "com.example.Funce" } },
    { label: "blank Bundle ID", body: { queries: [{ name: "Funce", bundleId: " \t " }] }, identity: {} },
  ])("returns search_failed with the request identity for $label when lookup throws", async ({ body, identity }) => {
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
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        query: "Funce",
        ...identity,
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
