import { JSDOM } from "jsdom";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import type { AppVersionHistoryItem, IapItem } from "../../shared/types";

export type ProductPageDetails = {
  screenshotUrls: string[];
  iapItems: IapItem[];
  versionHistory: AppVersionHistoryItem[];
};

const US_APPLE_STOREFRONT = "143441-1,29";

let browserPromise: Promise<Browser> | null = null;

function dedupe<T>(items: T[]) {
  return [...new Set(items)];
}

function extractFirstSrcsetUrl(srcset: string) {
  return srcset.split(",")[0]?.trim().split(" ")[0] ?? "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractJsonProductData(document: Document): {
  iapItems: IapItem[];
  versionHistory: AppVersionHistoryItem[];
} {
  const rawPayload = document.body?.textContent?.trim();

  if (!rawPayload) {
    return { iapItems: [], versionHistory: [] };
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { iapItems: [], versionHistory: [] };
  }

  const pageData = isRecord(payload) ? payload.pageData : null;
  const addOns = isRecord(pageData) && Array.isArray(pageData.addOns)
    ? pageData.addOns
    : [];
  const versionEntries = isRecord(pageData) && Array.isArray(pageData.versionHistory)
    ? pageData.versionHistory
    : [];

  return {
    iapItems: addOns.flatMap((addOn) => {
      if (
        !isRecord(addOn) ||
        typeof addOn.name !== "string" ||
        typeof addOn.price !== "string"
      ) {
        return [];
      }

      const name = addOn.name.trim();
      const price = addOn.price.trim();

      return name && price ? [{ name, price }] : [];
    }),
    versionHistory: versionEntries.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.versionString !== "string") {
        return [];
      }

      const version = entry.versionString.trim();

      if (!version) {
        return [];
      }

      return [
        {
          version,
          releasedAt: typeof entry.releaseDate === "string" ? entry.releaseDate : null,
          notes: typeof entry.releaseNotes === "string" ? entry.releaseNotes.trim() : "",
        },
      ];
    }),
  };
}

function resolveMacChromiumExecutable() {
  const browsersRoot = join(homedir(), "Library", "Caches", "ms-playwright");

  if (!existsSync(browsersRoot)) {
    return null;
  }

  for (const entry of readdirSync(browsersRoot)) {
    if (!entry.startsWith("chromium-")) {
      continue;
    }

    const candidate = join(
      browsersRoot,
      entry,
      "chrome-mac",
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium",
    );

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveChromiumExecutable() {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }

  const macExecutable = resolveMacChromiumExecutable();

  if (macExecutable) {
    return macExecutable;
  }

  throw new Error(
    "Chromium executable not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.",
  );
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutable(),
    });
  }

  return browserPromise;
}

export function parseProductPageHtml(html: string): ProductPageDetails {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const screenshotUrls = dedupe(
    Array.from(document.querySelectorAll('picture source[type="image/jpeg"][sizes*="230px"]'))
      .map((node) => node.getAttribute("srcset") ?? "")
      .map(extractFirstSrcsetUrl)
      .filter(Boolean),
  );

  const iapItems: IapItem[] = [];
  const terms = Array.from(document.querySelectorAll("dt"));
  const iapTerm = terms.find(
    (node) => node.textContent?.trim().toLowerCase() === "in-app purchases",
  );

  const iapList = iapTerm?.nextElementSibling?.querySelectorAll("li .text-pair");

  if (iapList) {
    for (const pair of iapList) {
      const spans = pair.querySelectorAll("span");
      const name = spans[0]?.textContent?.trim() ?? "";
      const price = spans[1]?.textContent?.trim() ?? "";

      if (!name || !price) {
        continue;
      }

      iapItems.push({ name, price });
    }
  }

  const jsonProductData = extractJsonProductData(document);
  const parsedIapItems = iapItems.length > 0 ? iapItems : jsonProductData.iapItems;

  return {
    screenshotUrls,
    iapItems: parsedIapItems,
    versionHistory: jsonProductData.versionHistory,
  };
}

export async function fetchProductPageDetails(
  appStoreUrl: string,
): Promise<ProductPageDetails> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
      "X-Apple-Store-Front": US_APPLE_STOREFRONT,
    },
  });

  try {
    await page.goto(appStoreUrl, {
      waitUntil: "networkidle",
      timeout: 120_000,
    });

    const html = await page.content();
    return parseProductPageHtml(html);
  } finally {
    await page.close();
  }
}
