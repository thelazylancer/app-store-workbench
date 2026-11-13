import { describe, expect, it, vi } from "vitest";
import { createCachedProductPageFetcher } from "../../server/lib/productPageCache";
import type { ProductPageDetails } from "../../server/lib/productPage";

function details(url: string): ProductPageDetails {
  return { screenshotUrls: [url], iapItems: [], versionHistory: [] };
}

describe("createCachedProductPageFetcher", () => {
  it("reuses successful payloads within the TTL and caches each URL separately", async () => {
    let currentTime = 0;
    const fetcher = vi.fn(async (url: string) => details(url));
    const cached = createCachedProductPageFetcher(fetcher, { ttlMs: 1000, now: () => currentTime });

    await expect(cached("https://apps.apple.com/us/app/id1")).resolves.toMatchObject({
      screenshotUrls: ["https://apps.apple.com/us/app/id1"],
    });
    await cached("https://apps.apple.com/us/app/id1");
    expect(fetcher).toHaveBeenCalledTimes(1);

    await cached("https://apps.apple.com/us/app/id2");
    expect(fetcher).toHaveBeenCalledTimes(2);

    currentTime = 1001;
    await cached("https://apps.apple.com/us/app/id1");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("coalesces concurrent requests for the same URL", async () => {
    let release!: (value: ProductPageDetails) => void;
    const fetcher = vi.fn(() => new Promise<ProductPageDetails>((resolve) => {
      release = resolve;
    }));
    const cached = createCachedProductPageFetcher(fetcher);

    const first = cached("https://apps.apple.com/us/app/id1");
    const second = cached("https://apps.apple.com/us/app/id1");
    expect(fetcher).toHaveBeenCalledTimes(1);

    release(details("shared"));
    await expect(first).resolves.toMatchObject({ screenshotUrls: ["shared"] });
    await expect(second).resolves.toMatchObject({ screenshotUrls: ["shared"] });
  });

  it("does not cache failures", async () => {
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("Apple unavailable"))
      .mockResolvedValueOnce(details("recovered"));
    const cached = createCachedProductPageFetcher(fetcher);

    await expect(cached("https://apps.apple.com/us/app/id1")).rejects.toThrow("Apple unavailable");
    await expect(cached("https://apps.apple.com/us/app/id1")).resolves.toMatchObject({
      screenshotUrls: ["recovered"],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used entry when full", async () => {
    const fetcher = vi.fn(async (url: string) => details(url));
    const cached = createCachedProductPageFetcher(fetcher, { maxEntries: 2 });

    await cached("a");
    await cached("b");
    await cached("c");
    await cached("a");

    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
