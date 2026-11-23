import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FirstDeliveryHttpError, fetchFirstDeliveryPackages } from "../../server/lib/firstDeliverySource";

function pageBody(rows: unknown[], meta: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    code: 0,
    message: "ok",
    request_id: "req_test",
    data: rows,
    meta: { page: 1, page_size: 200, total_count: rows.length, ...meta },
  }));
}

describe("fetchFirstDeliveryPackages", () => {
  beforeEach(() => {
    vi.stubEnv("FIRST_DELIVERY_API_URL", "http://source.test");
    vi.stubEnv("FIRST_DELIVERY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("filters by iOS name, de-duplicates, and keeps every team", async () => {
    const fetchSource = vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([
      {
        package_code: "com.example.ios-a", display_name: "iOS-A", team: "Alpha",
        first_ad_date: "2026-11-18", listing_date: "2026-11-01",
        first_100_date: null, offline_date: "2026-12-01",
      },
      {
        package_code: "com.example.ios-a", display_name: "iOS-A duplicate", team: "Alpha",
        first_ad_date: "2026-11-18",
      },
      {
        package_code: "com.example.android-b", display_name: "android-B", team: "Beta",
        first_ad_date: "2026-11-18",
      },
      {
        package_code: "com.example.ios-c", display_name: "iOS-C", team: "灵蜂",
        first_ad_date: "2026-11-18",
      },
      {
        package_code: "com.example.ios-d", display_name: "FunceIOS daily", team: "Delta",
        first_ad_date: "2026-11-18",
      },
      { package_code: "", display_name: "iOS malformed", team: "Alpha", first_ad_date: "2026-11-18" },
    ], {
      sync_id: "sync-1",
      snapshot_id: "snap-1",
      data_updated_at: "2026-11-18T00:47:00Z",
      published_at: "2026-11-18 01:00:00",
      range_complete: false,
      stale: true,
    }));

    const batch = await fetchFirstDeliveryPackages("2026-11-18");

    expect(batch.rows).toEqual([
      {
        packageCode: "com.example.ios-a", displayName: "iOS-A", team: "Alpha",
        firstAdDate: "2026-11-18", listingDate: "2026-11-01",
        first100Date: null, offlineDate: "2026-12-01",
      },
      {
        packageCode: "com.example.ios-c", displayName: "iOS-C", team: "灵蜂",
        firstAdDate: "2026-11-18", listingDate: null,
        first100Date: null, offlineDate: null,
      },
      {
        packageCode: "com.example.ios-d", displayName: "FunceIOS daily", team: "Delta",
        firstAdDate: "2026-11-18", listingDate: null,
        first100Date: null, offlineDate: null,
      },
    ]);
    expect(batch).toMatchObject({
      syncId: "sync-1",
      snapshotId: "snap-1",
      dataUpdatedAt: "2026-11-18T00:47:00.000Z",
      publishedAt: "2026-11-18T01:00:00.000Z",
      rangeComplete: false,
      stale: true,
    });

    const [url, init] = fetchSource.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("http://source.test/api/v1/first-delivery-packages");
    expect(parsed.searchParams.get("start_day")).toBe("2026-11-18");
    expect(parsed.searchParams.get("end_day")).toBe("2026-11-18");
    expect(parsed.searchParams.get("page")).toBe("1");
    expect(parsed.searchParams.get("page_size")).toBe("200");
    expect(parsed.searchParams.has("sync_id")).toBe(false);
    expect(init?.headers).toEqual(expect.objectContaining({ "X-API-Key": "test-key" }));
    expect(init?.signal).toEqual(expect.any(AbortSignal));
  });

  it("follows pagination with the first response's sync id", async () => {
    const fetchSource = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pageBody([
        { package_code: "com.a", display_name: "iOS A", team: "Alpha", first_ad_date: "2026-11-18" },
        { package_code: "com.b", display_name: "iOS B", team: "Beta", first_ad_date: "2026-11-18" },
      ], { page: 1, page_size: 2, total_count: 3, sync_id: "sync-1" }))
      .mockResolvedValueOnce(pageBody([
        { package_code: "com.c", display_name: "iOS C", team: "Gamma", first_ad_date: "2026-11-18" },
      ], { page: 2, page_size: 2, total_count: 3, sync_id: "sync-1" }));

    const batch = await fetchFirstDeliveryPackages("2026-11-18");

    expect(batch.rows.map((row) => row.packageCode)).toEqual(["com.a", "com.b", "com.c"]);
    expect(fetchSource).toHaveBeenCalledTimes(2);
    const secondUrl = new URL(String(fetchSource.mock.calls[1]![0]));
    expect(secondUrl.searchParams.get("page")).toBe("2");
    expect(secondUrl.searchParams.get("sync_id")).toBe("sync-1");
  });

  it("accepts an endpoint that already includes the API path", async () => {
    vi.stubEnv("FIRST_DELIVERY_API_URL", "http://source.test/api/v1/first-delivery-packages/");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([]));

    await fetchFirstDeliveryPackages("2026-11-18");

    const parsed = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(parsed.origin + parsed.pathname).toBe("http://source.test/api/v1/first-delivery-packages");
    expect(parsed.searchParams.get("start_day")).toBe("2026-11-18");
  });

  it("falls back to the base URL when the URL env var is empty", async () => {
    vi.stubEnv("FIRST_DELIVERY_API_URL", "");
    vi.stubEnv("FIRST_DELIVERY_API_BASE_URL", "http://base.test:8001");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([]));

    await fetchFirstDeliveryPackages("2026-11-18");

    const parsed = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(parsed.origin).toBe("http://base.test:8001");
    expect(parsed.pathname).toBe("/api/v1/first-delivery-packages");
  });

  it("rejects missing credentials and upstream failures without leaking them", async () => {
    vi.stubEnv("FIRST_DELIVERY_API_KEY", "");
    await expect(fetchFirstDeliveryPackages("2026-11-18"))
      .rejects.toThrow("FIRST_DELIVERY_API_KEY is not configured");

    vi.stubEnv("FIRST_DELIVERY_API_KEY", "secret-value");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    const error = await fetchFirstDeliveryPackages("2026-11-18").catch((reason: Error) => reason);
    expect(error).toBeInstanceOf(FirstDeliveryHttpError);
    expect((error as FirstDeliveryHttpError).status).toBe(401);
    expect((error as Error).message).toBe("First-delivery request failed with 401");
    expect((error as Error).message).not.toContain("secret-value");
  });

  it("fails fast on a 4xx without retrying", async () => {
    const fetchSource = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    await expect(fetchFirstDeliveryPackages("2026-11-18"))
      .rejects.toThrow("First-delivery request failed with 401");
    expect(fetchSource).toHaveBeenCalledTimes(1);
  });

  it("retries 5xx responses and transient network errors before succeeding", async () => {
    vi.useFakeTimers();
    try {
      const fetchSource = vi.spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(new Response("upstream down", { status: 503 }))
        .mockResolvedValueOnce(pageBody([
          { package_code: "com.a", display_name: "iOS A", team: "Alpha", first_ad_date: "2026-11-18" },
        ]));

      const pending = fetchFirstDeliveryPackages("2026-11-18");
      for (let index = 0; index < 4; index += 1) {
        await vi.advanceTimersByTimeAsync(2_000);
      }

      await expect(pending).resolves.toMatchObject({
        rows: [{ packageCode: "com.a" }],
      });
      expect(fetchSource).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up after three 5xx attempts", async () => {
    vi.useFakeTimers();
    try {
      const fetchSource = vi.spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("upstream down", { status: 500 }));

      const outcome = fetchFirstDeliveryPackages("2026-11-18")
        .then(() => null, (error: Error) => error);
      for (let index = 0; index < 4; index += 1) {
        await vi.advanceTimersByTimeAsync(2_000);
      }

      expect((await outcome)?.message).toBe("First-delivery request failed with 500");
      expect(fetchSource).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
