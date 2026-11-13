import type { AppVersionHistoryItem, IapItem, StoreCountry } from "../../shared/types";

export type ProductPageDetails = {
  screenshotUrls: string[];
  iapItems: IapItem[];
  versionHistory: AppVersionHistoryItem[];
};

const STOREFRONTS: Record<StoreCountry, number> = {
  us: 143441,
  cn: 143465,
  hk: 143463,
  tw: 143470,
  jp: 143462,
  sg: 143464,
  gb: 143444,
  au: 143460,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProductUrl(value: string) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/([a-z]{2})\/app\/(?:[^/]+\/)?id(\d+)\/?$/i);
  const country = match?.[1]?.toLowerCase() as StoreCountry;
  const appleId = Number(match?.[2]);

  if (url.protocol !== "https:" || url.hostname !== "apps.apple.com"
    || url.username || url.password || url.port || !Object.hasOwn(STOREFRONTS, country)
    || !Number.isSafeInteger(appleId) || appleId <= 0) {
    throw new Error("Invalid App Store product URL");
  }

  return { country, appleId };
}

function materializeMediaUrl(item: unknown): string {
  if (!isRecord(item) || typeof item.url !== "string") return "";
  let url = item.url.trim();

  if (url.includes("{")) {
    const { width, height } = item;
    if (typeof width !== "number" || typeof height !== "number"
      || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      return "";
    }
    url = url.replaceAll("{w}", String(width)).replaceAll("{h}", String(height))
      .replaceAll("{c}", "bb").replaceAll("{f}", "jpg");
  }

  if (/[{}]|%7[bd]/i.test(url)) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export async function fetchProductPageDetails(
  appStoreUrl: string,
): Promise<ProductPageDetails> {
  const { country, appleId } = parseProductUrl(appStoreUrl);
  const response = await fetch(appStoreUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      "X-Apple-Store-Front": `${STOREFRONTS[country]},29`,
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Product page unavailable: ${response.status}`);
  }
  const finalUrl = parseProductUrl(response.url);
  if (finalUrl.country !== country || finalUrl.appleId !== appleId) {
    throw new Error("Product page redirected to another app or storefront");
  }
  if (response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new Error("Product page did not return JSON");
  }

  const payload: unknown = await response.json();
  const platform = isRecord(payload) && isRecord(payload.storePlatformData)
    ? payload.storePlatformData["product-dv"] : null;
  const results = isRecord(platform) && isRecord(platform.results) ? platform.results : null;
  const product = results?.[String(appleId)];
  const pageData = isRecord(payload) ? payload.pageData : null;
  if (!isRecord(product) || Object.keys(product).length === 0
    || !isRecord(pageData) || pageData.componentName !== "software_page") {
    throw new Error("Product page payload is missing app details");
  }
  for (const id of [product.id, pageData.id]) {
    if (id !== undefined && id !== appleId && id !== String(appleId)) {
      throw new Error("Product page payload belongs to another app");
    }
  }
  if (product.url !== undefined) {
    const productUrl = typeof product.url === "string" ? parseProductUrl(product.url) : null;
    if (productUrl?.country !== country || productUrl.appleId !== appleId) {
      throw new Error("Product payload belongs to another app or storefront");
    }
  }
  const metrics = pageData.metricsBase;
  if (isRecord(metrics) && metrics.storeFront !== undefined
    && metrics.storeFront !== STOREFRONTS[country] && metrics.storeFront !== String(STOREFRONTS[country])) {
    throw new Error("Product page payload belongs to another storefront");
  }

  const hasIap = product.hasInAppPurchases;
  const addOns = pageData.addOns;
  if ((hasIap !== undefined && typeof hasIap !== "boolean")
    || (addOns !== undefined && !Array.isArray(addOns))
    || (hasIap === true && (!Array.isArray(addOns) || addOns.length === 0))) {
    throw new Error("Product page in-app purchases are unavailable");
  }
  const iapItems = (addOns ?? []).map((addOn: unknown) => {
    if (!isRecord(addOn) || typeof addOn.name !== "string" || typeof addOn.price !== "string"
      || !addOn.name.trim() || !addOn.price.trim()) {
      throw new Error("Product page in-app purchase is malformed");
    }
    return { name: addOn.name.trim(), price: addOn.price.trim() };
  });

  const galleries = isRecord(product.screenshotsByType)
    ? Object.entries(product.screenshotsByType).flatMap(([type, items]) => {
      if (!Array.isArray(items)) return [];
      const urls = [...new Set(items.map(materializeMediaUrl).filter(Boolean))];
      return urls.length > 0 ? [{ type, urls }] : [];
    }) : [];
  const gallery = galleries.find(({ type }) => type.toLowerCase().startsWith("iphone"))
    ?? galleries.find(({ type }) => type.toLowerCase().startsWith("ipad"))
    ?? galleries[0];
  const versionEntries = Array.isArray(pageData.versionHistory) ? pageData.versionHistory : [];

  return {
    screenshotUrls: gallery?.urls ?? [],
    iapItems,
    versionHistory: versionEntries.flatMap((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.versionString !== "string" || !entry.versionString.trim()) {
        return [];
      }
      return [{
        version: entry.versionString.trim(),
        releasedAt: typeof entry.releaseDate === "string" ? entry.releaseDate : null,
        notes: typeof entry.releaseNotes === "string" ? entry.releaseNotes.trim() : "",
      }];
    }),
  };
}
