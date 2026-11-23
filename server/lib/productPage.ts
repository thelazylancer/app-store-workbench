import type { AppVersionHistoryItem, IapItem, StoreCountry } from "../../shared/types";

export type PrivacyGroup = { label: string; categories: string[] };
export type PrivacyInfo = { policyUrl: string | null; notCollected: boolean; groups: PrivacyGroup[] };

export type ProductPageDetails = {
  screenshotUrls: string[];
  iapItems: IapItem[];
  versionHistory: AppVersionHistoryItem[];
  privacy?: PrivacyInfo;
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

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const PRIVACY_GROUPS: Record<string, string> = {
  "Data Used to Track You": "用于追踪你的数据",
  "Data Linked to You": "与你关联的数据",
  "Data Not Linked to You": "未与你关联的数据",
  "用于追踪你的数据": "用于追踪你的数据",
  "与你关联的数据": "与你关联的数据",
  "未与你关联的数据": "未与你关联的数据",
};

const PRIVACY_CATEGORIES: Record<string, string> = {
  "Contact Info": "联系信息",
  "Health & Fitness": "健康与健身",
  "Financial Info": "财务信息",
  "Location": "位置",
  "Sensitive Info": "敏感信息",
  "Contacts": "联系人",
  "User Content": "用户内容",
  "Browsing History": "浏览历史",
  "Search History": "搜索历史",
  "Identifiers": "标识符",
  "Purchases": "购买项目",
  "Usage Data": "使用数据",
  "Diagnostics": "诊断",
  "Other Data": "其他数据",
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, entity: string) => ENTITIES[entity] ?? "");
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * App Privacy categories only exist in the rendered App Store HTML; the JSON
 * payload carries the developer's policy URL but no declared data types.
 */
function parsePrivacyHtml(html: string): PrivacyGroup[] {
  const groups: PrivacyGroup[] = [];
  for (const match of html.matchAll(/<div class="container ([^"]*)" aria-label="([^"]+)">/g)) {
    const label = PRIVACY_GROUPS[decodeEntities(match[2] ?? "").trim()];
    if (!label || match[1]?.includes("is-detail-view")) continue;
    const start = (match.index ?? 0) + match[0].length;
    const listStart = html.indexOf("<ul", start);
    if (listStart < 0 || listStart - start > 2000) continue;
    const listEnd = html.indexOf("</ul>", listStart);
    if (listEnd < 0) continue;
    const categories = new Set<string>();
    for (const item of html.slice(listStart, listEnd).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
      const name = cleanText(item[1] ?? "");
      if (name) categories.add(PRIVACY_CATEGORIES[name] ?? name);
    }
    if (categories.size > 0 && !groups.some((group) => group.label === label)) {
      groups.push({ label, categories: [...categories] });
    }
  }
  return groups;
}

async function fetchPrivacy(appStoreUrl: string, appleId: number, policyUrl: string | null): Promise<PrivacyInfo | null> {
  try {
    const headers = { "User-Agent": USER_AGENT, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" };
    const signal = AbortSignal.timeout(15_000);
    let response = await fetch(appStoreUrl, { headers, signal });
    if (response.ok) {
      const finalUrl = new URL(response.url);
      if (!new RegExp(`/id${appleId}/?$`).test(finalUrl.pathname)) {
        // Apple geolocates a mismatched storefront URL to the local home page.
        // Retry on the visitor's storefront, forcing English labels we can parse.
        const geo = finalUrl.pathname.split("/")[1];
        if (/^[a-z]{2}$/.test(geo ?? "")) {
          response = await fetch(`https://apps.apple.com/${geo}/app/id${appleId}?l=en`, { headers, signal });
        } else {
          return policyUrl ? { policyUrl, notCollected: false, groups: [] } : null;
        }
      }
    }
    if (!response.ok) return policyUrl ? { policyUrl, notCollected: false, groups: [] } : null;
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    const html = contentType === "text/html" ? await response.text() : "";
    const notCollected = /aria-label="(?:Data Not Collected|未收集数据)"/.test(html);
    const groups = parsePrivacyHtml(html);
    return policyUrl || notCollected || groups.length > 0
      ? { policyUrl, notCollected, groups }
      : null;
  } catch {
    // Privacy is enrichment: a failed HTML fetch must not lose screenshots or IAP data.
    return policyUrl ? { policyUrl, notCollected: false, groups: [] } : null;
  }
}

export async function fetchProductPageDetails(
  appStoreUrl: string,
): Promise<ProductPageDetails> {
  const { country, appleId } = parseProductUrl(appStoreUrl);
  const response = await fetch(appStoreUrl, {
    headers: {
      "User-Agent": USER_AGENT,
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

  const softwareInfo = isRecord(product.softwareInfo) ? product.softwareInfo : null;
  const privacy = await fetchPrivacy(appStoreUrl, appleId, safeHttpUrl(softwareInfo?.privacyPolicyUrl));

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
    ...(privacy ? { privacy } : {}),
  };
}
