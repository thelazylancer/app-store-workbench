import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import { lookupAppByBundleId, lookupAppById, lookupAppStore } from "../../server/lib/appleLookup";
import { buildIapHints } from "../../server/lib/iapHints";
import { fetchProductPageDetails } from "../../server/lib/productPage";

describe("GET /api/app-details/:appleId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects invalid detail identity or country and distinguishes absent apps from upstream failure", async () => {
    const lookup = vi.fn(async (_id: number, _country: string) => null);
    const page = vi.fn(async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }));
    const app = await createTestApp({ lookupAppStore, lookupAppById: lookup, lookupAppByBundleId, fetchProductPageDetails: page, buildIapHints });
    for (const path of ["0", "-1", "1.5", "1e3", "9007199254740992", "not-an-id", "123?country=de", "123?country=", "123?country=us&country=jp"]) {
      expect((await request(app.server).get(`/api/app-details/${path}`)).status).toBe(400);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect((await request(app.server).get("/api/app-details/123")).status).toBe(404);
    expect(lookup.mock.lastCall).toEqual([123, "us"]);
    lookup.mockRejectedValueOnce(new Error("Apple unavailable"));
    expect((await request(app.server).get("/api/app-details/123?country=cn")).status).toBe(502);
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
    const app = await createTestApp({
      lookupAppStore,
      lookupAppByBundleId,
      lookupAppById: async () => ({
        appleId: 456, name: "Selected", developer: "Own Dev", appStoreUrl: "https://apps.apple.com/us/app/id456",
        iconUrl: "", description: "Own description", screenshotUrls: ["Own screenshot"],
        versionHistory: [{ version: "Own lookup", releasedAt: null, notes: "Own history" }],
      }),
      fetchProductPageDetails,
      buildIapHints,
    });
    const response = await request(app.server).get("/api/app-details/456");
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
    const app = await createTestApp({ lookupAppStore, lookupAppById, lookupAppByBundleId, fetchProductPageDetails: page, buildIapHints });
    const response = await request(app.server).get("/api/app-details/456?country=JP");
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
