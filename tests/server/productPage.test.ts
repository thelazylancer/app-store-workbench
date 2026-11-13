import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProductPageDetails } from "../../server/lib/productPage";

const APP_URL = "https://apps.apple.com/us/app/duolingo-learn-languages/id570060128?l=en";

function detailPayload(product: Record<string, unknown> = {}, pageData: Record<string, unknown> = {}) {
  return {
    storePlatformData: {
      "product-dv": { results: { "570060128": { id: "570060128", ...product } } as Record<string, unknown> },
    },
    pageData: { componentName: "software_page", id: "570060128", ...pageData },
  };
}

function detailResponse(payload: unknown, url = APP_URL, status = 200, contentType = "application/json; target=itml; charset=UTF-8") {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": contentType },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("fetchProductPageDetails", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["us", "143441,29"],
    ["cn", "143465,29"],
    ["hk", "143463,29"],
    ["tw", "143470,29"],
    ["jp", "143462,29"],
    ["sg", "143464,29"],
    ["gb", "143444,29"],
    ["au", "143460,29"],
  ])("requests the %s storefront with matching HTTP headers", async (country, storefront) => {
    const url = `https://apps.apple.com/${country}/app/id570060128?l=en`;
    const fetchApple = vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload(), url));

    await expect(fetchProductPageDetails(url)).resolves.toEqual({
      screenshotUrls: [], iapItems: [], versionHistory: [],
    });
    expect(fetchApple).toHaveBeenCalledWith(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "X-Apple-Store-Front": storefront,
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects invalid app URLs before making an HTTP request", async () => {
    const fetchApple = vi.spyOn(globalThis, "fetch");
    for (const url of [
      "not a URL", "http://apps.apple.com/us/app/id123", "https://example.com/us/app/id123",
      "https://apps.apple.com.evil.example/us/app/id123", "https://user:secret@apps.apple.com/us/app/id123",
      "https://apps.apple.com:8443/us/app/id123", "https://apps.apple.com/de/app/id123",
      "https://apps.apple.com/us/iphone/today", "https://apps.apple.com/us/app/id0",
      "https://apps.apple.com/us/app/id-1", "https://apps.apple.com/us/app/id1.5",
      "https://apps.apple.com/us/app/id1e3", "https://apps.apple.com/us/app/id9007199254740992",
      "https://apps.apple.com/us/app/id123/another-page", "https://apps.apple.com/app/id123",
    ]) {
      await expect(fetchProductPageDetails(url)).rejects.toThrow();
    }
    expect(fetchApple).not.toHaveBeenCalled();
  });

  it("selects the requested app, resolves its iPhone gallery before iPad, and preserves IAP and history", async () => {
    const payload = detailPayload({
      hasInAppPurchases: true,
      artwork: { url: "https://example.com/icon.jpg" },
      videoPreviewByType: { iphone_6_5: [{ url: "https://example.com/preview.mp4" }] },
      screenshotsByType: {
        ipadPro_2018: [{ url: "https://example.com/tablet/{w}x{h}bb.{f}", width: 2048, height: 2732 }],
        iphone_6_5: [
          { url: "https://example.com/phone/{w}x{h}{c}.{f}", width: 1242, height: 2688 },
          { url: "https://example.com/phone/{w}x{h}{c}.{f}", width: 1242, height: 2688 },
          { url: "https://example.com/phone-two.jpg" },
          { url: "https://example.com/missing-dimensions/{w}x{h}bb.{f}", width: 1242 },
          { url: "https://example.com/invalid-dimensions/{w}x{h}bb.{f}", width: -1, height: 2688 },
          { url: "https://example.com/fractional/{w}x{h}bb.{f}", width: 1.5, height: 2688 },
          { url: "https://example.com/zero/{w}x{h}bb.{f}", width: 0, height: 2688 },
          { url: "https://example.com/string-width/{w}x{h}bb.{f}", width: "1242", height: 2688 },
          { url: "https://example.com/unresolved/{unknown}.jpg", width: 1242, height: 2688 },
          { url: "https://example.com/encoded/%7Bw%7D.jpg" },
          { url: "data:image/png;base64,AA==" }, { url: "/relative.jpg" }, null,
        ],
        iphone_d73: [{ url: "https://example.com/other-phone-size.jpg" }],
      },
    }, {
      addOns: [
        { name: "Barrel of Gems (1200)", price: "$4.99" },
        { name: "Super Duolingo", price: "$9.99" },
        { name: "  Localized pack  ", price: "  ¥1,200  " },
      ],
      versionHistory: [
        { versionString: "7.148.1", releaseDate: "2026-11-11T15:39:36Z", releaseNotes: "Bug fixes\n\nMore news." },
        { versionString: "1.0", releaseDate: null, releaseNotes: null },
        { versionString: " 0.9 ", releaseNotes: "  Early release  " },
        { versionString: " " }, { versionString: 2 }, null, [],
      ],
    });
    payload.storePlatformData["product-dv"].results = {
      "123": { id: "123", screenshotsByType: { iphone: [{ url: "https://example.com/wrong-app.jpg" }] } },
      ...payload.storePlatformData["product-dv"].results,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(payload));

    await expect(fetchProductPageDetails(APP_URL)).resolves.toEqual({
      screenshotUrls: ["https://example.com/phone/1242x2688bb.jpg", "https://example.com/phone-two.jpg"],
      iapItems: [
        { name: "Barrel of Gems (1200)", price: "$4.99" },
        { name: "Super Duolingo", price: "$9.99" },
        { name: "Localized pack", price: "¥1,200" },
      ],
      versionHistory: [
        { version: "7.148.1", releasedAt: "2026-11-11T15:39:36Z", notes: "Bug fixes\n\nMore news." },
        { version: "1.0", releasedAt: null, notes: "" },
        { version: "0.9", releasedAt: null, notes: "Early release" },
      ],
    });
  });

  it.each([
    {
      label: "iPad when the iPhone gallery is unusable",
      screenshotsByType: {
        desktop: [{ url: "https://example.com/desktop.jpg" }],
        iphone_d73: [{ url: "https://example.com/phone/{w}x{h}bb.{f}" }],
        ipadPro_2018: [{ url: "https://example.com/tablet/{w}x{h}bb.{f}", width: 2048, height: 2732 }],
      },
      expected: ["https://example.com/tablet/2048x2732bb.jpg"],
    },
    {
      label: "another screenshot gallery when phone and tablet are absent",
      screenshotsByType: { desktop: [{ url: "http://example.com/desktop.jpg" }] },
      expected: ["http://example.com/desktop.jpg"],
    },
    { label: "no gallery for malformed screenshots", screenshotsByType: ["https://example.com/not-a-gallery.jpg"], expected: [] },
  ])("uses $label", async ({ screenshotsByType, expected }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload({ screenshotsByType }, { versionHistory: {} })));
    const details = await fetchProductPageDetails(APP_URL);
    expect(details.screenshotUrls).toEqual(expected);
    expect(details.versionHistory).toEqual([]);
  });

  it.each([
    { product: {}, pageData: {} },
    { product: { hasInAppPurchases: false }, pageData: {} },
    { product: {}, pageData: { addOns: [] } },
  ])("accepts a verified product with no IAP catalog", async ({ product, pageData }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload(product, pageData)));
    expect((await fetchProductPageDetails(APP_URL)).iapItems).toEqual([]);
  });

  it.each([
    null, {}, "unreadable", [null], [{}],
    [{ name: "Pack", price: 4.99 }], [{ name: " ", price: "$4.99" }], [{ name: "Pack", price: " " }],
    [{ name: "Valid pack", price: "$4.99" }, { name: "Missing price" }],
  ].map((addOns) => ({ addOns })))("rejects a malformed IAP catalog instead of reporting missing prices: $addOns", async ({ addOns }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload({}, { addOns })));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow("in-app purchase");
  });

  it.each([
    { product: { hasInAppPurchases: true }, pageData: {} },
    { product: { hasInAppPurchases: true }, pageData: { addOns: [] } },
    { product: { hasInAppPurchases: "true" }, pageData: {} },
  ])("rejects an unreadable catalog when purchase metadata is inconsistent", async ({ product, pageData }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload(product, pageData)));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow("in-app purchases");
  });

  it.each([
    null, [], {},
    { pageData: { componentName: "software_page", id: "570060128" } },
    { storePlatformData: { "product-dv": { results: [] } }, pageData: { componentName: "software_page" } },
    { storePlatformData: { "product-dv": { results: { "123": { id: "123" } } } }, pageData: { componentName: "software_page" } },
    { ...detailPayload(), storePlatformData: { "product-dv": { results: { "570060128": {} } } } },
    { ...detailPayload(), pageData: null },
    { ...detailPayload(), pageData: [] },
    { ...detailPayload(), pageData: {} },
    { ...detailPayload(), pageData: { componentName: "today" } },
    detailPayload({ id: "123" }), detailPayload({}, { id: 123 }),
    detailPayload({ id: null }), detailPayload({}, { id: {} }),
  ].map((payload) => ({ payload })))("rejects missing, malformed, or wrong-app payloads: $payload", async ({ payload }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(payload));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow();
  });

  it.each([
    detailPayload({ url: "https://apps.apple.com/us/app/id123" }),
    detailPayload({ url: "https://apps.apple.com/jp/app/id570060128" }),
    detailPayload({}, { metricsBase: { storeFront: "143462" } }),
  ])("rejects app or storefront mismatches inside the selected payload", async (payload) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(payload));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow();
  });

  it.each([
    "https://apps.apple.com/jp/app/id570060128", "https://apps.apple.com/us/app/id123",
    "https://apps.apple.com/cn/iphone/today", "https://example.com/us/app/id570060128",
    "http://apps.apple.com/us/app/id570060128",
  ])("rejects a successful HTTP response redirected to %s", async (url) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload(), url));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow();
  });

  it("accepts a canonical slug and query redirect for the same app and storefront", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(
      detailPayload({ id: 570060128 }, { id: 570060128 }),
      "https://apps.apple.com/us/app/new-slug/id570060128?ign-mpt=uo%3D4",
    ));
    await expect(fetchProductPageDetails(APP_URL)).resolves.toEqual({ screenshotUrls: [], iapItems: [], versionHistory: [] });
  });

  it.each([404, 503])("rejects HTTP %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(detailResponse(detailPayload(), APP_URL, status));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow(String(status));
  });

  it("propagates transport failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Connection unavailable"));
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow("Connection unavailable");
  });

  it("rejects HTML with HTTP 200 and invalid JSON with a JSON content type", async () => {
    const html = detailResponse("<html><title>Today</title></html>", APP_URL, 200, "text/html");
    const invalidJson = new Response("{broken", { headers: { "Content-Type": "application/json" } });
    Object.defineProperty(invalidJson, "url", { value: APP_URL });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(html).mockResolvedValueOnce(invalidJson);
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow("JSON");
    await expect(fetchProductPageDetails(APP_URL)).rejects.toThrow();
  });

  it.each(["request", "body"])("keeps the finite timeout active during the %s", async (phase) => {
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(10));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, options) => {
      const signal = options?.signal;
      if (!signal) throw new Error("Missing timeout signal");
      if (phase === "request") {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      const response = new Response(new ReadableStream({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      }), { headers: { "Content-Type": "application/json" } });
      Object.defineProperty(response, "url", { value: APP_URL });
      return response;
    });

    await expect(fetchProductPageDetails(APP_URL)).rejects.toMatchObject({ name: "TimeoutError" });
    expect(timeout).toHaveBeenCalledWith(15_000);
  });
});
