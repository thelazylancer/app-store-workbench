import type { ProductPageDetails } from "./productPage";

export type ProductPageFetcher = (appStoreUrl: string) => Promise<ProductPageDetails>;

export type ProductPageCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

type CacheEntry = {
  expiresAt: number;
  value: Promise<ProductPageDetails>;
};

/**
 * Coalesces concurrent requests and reuses successful product-page payloads for
 * a short window. Failures are never cached, so a transient Apple error does
 * not make every retry fail for the rest of the TTL.
 */
export function createCachedProductPageFetcher(
  fetcher: ProductPageFetcher,
  options: ProductPageCacheOptions = {},
): ProductPageFetcher {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const now = options.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  return async (appStoreUrl) => {
    const currentTime = now();
    const cached = cache.get(appStoreUrl);
    if (cached && cached.expiresAt > currentTime) {
      // Refresh LRU order so frequently used entries survive eviction.
      cache.delete(appStoreUrl);
      cache.set(appStoreUrl, cached);
      return cached.value;
    }
    if (cached) {
      cache.delete(appStoreUrl);
    }

    const value = fetcher(appStoreUrl).catch((error: unknown) => {
      cache.delete(appStoreUrl);
      throw error;
    });
    cache.set(appStoreUrl, { expiresAt: currentTime + ttlMs, value });

    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }

    return value;
  };
}
