import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOfflinePackages } from "../../server/lib/offlineSource";
import { SourceHttpError } from "../../server/lib/sourceApi";

function pageBody(rows: unknown[], meta: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    code: 0,
    message: "ok",
    request_id: "req_test",
    data: rows,
    meta: { page: 1, page_size: 200, total_count: rows.length, ...meta },
  }));
}

describe("fetchOfflinePackages", () => {
  beforeEach(() => {
    vi.stubEnv("FIRST_DELIVERY_API_URL", "http://source.test");
    vi.stubEnv("FIRST_DELIVERY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fetches every page, reusing the first sync id, without a team filter", async () => {
    const fetchSource = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(pageBody([
        { package_code: "com.a", offline_date: "2026-11-20", display_name: "iOS A", team: "Alpha" },
        { package_code: "com.b", offline_date: "2026-11-21", display_name: "安卓 B", team: "Beta" },
      ], { page: 1, page_size: 2, total_count: 3, sync_id: "sync-1" }))
      .mockResolvedValueOnce(pageBody([
        { package_code: "com.c", offline_date: "2026-11-22", display_name: "iOS C", team: "Gamma" },
      ], { page: 2, page_size: 2, total_count: 3, sync_id: "sync-1" }));

    const batch = await fetchOfflinePackages("2026-11-20", "2026-11-22");

    expect(batch.rows).toEqual([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
      { packageCode: "com.b", offlineDate: "2026-11-21" },
      { packageCode: "com.c", offlineDate: "2026-11-22" },
    ]);
    expect(batch).toMatchObject({
      syncId: "sync-1",
      rangeComplete: true,
      stale: false,
      invalid: 0,
    });
    expect(fetchSource).toHaveBeenCalledTimes(2);

    const [firstUrl, firstInit] = fetchSource.mock.calls[0]!;
    const first = new URL(String(firstUrl));
    expect(first.origin + first.pathname).toBe("http://source.test/api/v1/offline-packages");
    expect(first.searchParams.get("start_day")).toBe("2026-11-20");
    expect(first.searchParams.get("end_day")).toBe("2026-11-22");
    expect(first.searchParams.get("page")).toBe("1");
    expect(first.searchParams.get("page_size")).toBe("200");
    expect(first.searchParams.has("sync_id")).toBe(false);
    expect(first.searchParams.has("team")).toBe(false);
    expect(firstInit?.headers).toEqual(expect.objectContaining({
      Accept: "application/json",
      "X-API-Key": "test-key",
    }));

    const second = new URL(String(fetchSource.mock.calls[1]![0]));
    expect(second.searchParams.get("page")).toBe("2");
    expect(second.searchParams.get("sync_id")).toBe("sync-1");
  });

  it("throws a 401 without retrying", async () => {
    const fetchSource = vi.spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const error = await fetchOfflinePackages("2026-11-20", "2026-11-20")
      .catch((reason: Error) => reason);

    expect(error).toBeInstanceOf(SourceHttpError);
    expect((error as SourceHttpError).status).toBe(401);
    expect(fetchSource).toHaveBeenCalledTimes(1);
  });

  it("retries 503 and transient network errors before succeeding", async () => {
    vi.useFakeTimers();
    try {
      const fetchSource = vi.spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(new Response("busy", { status: 503 }))
        .mockResolvedValueOnce(pageBody([
          { package_code: "com.a", offline_date: "2026-11-20" },
        ]));

      const pending = fetchOfflinePackages("2026-11-20", "2026-11-20");
      for (let index = 0; index < 4; index += 1) {
        await vi.advanceTimersByTimeAsync(2_000);
      }

      await expect(pending).resolves.toMatchObject({
        rows: [{ packageCode: "com.a", offlineDate: "2026-11-20" }],
      });
      expect(fetchSource).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts calendar-invalid dates as invalid and keeps time-suffixed dates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([
      { package_code: "com.valid", offline_date: "2026-11-20" },
      { package_code: "com.valid-time", offline_date: "2026-11-21T23:30:00Z" },
      { package_code: "com.bad-month", offline_date: "2026-13-99" },
      { package_code: "com.bad-day", offline_date: "2026-02-31" },
      { package_code: "com.bad-leap", offline_date: "2026-02-29" },
    ]));

    const batch = await fetchOfflinePackages("2026-11-20", "2026-11-22");

    expect(batch.rows).toEqual([
      { packageCode: "com.valid", offlineDate: "2026-11-20" },
      { packageCode: "com.valid-time", offlineDate: "2026-11-21" },
    ]);
    expect(batch.invalid).toBe(3);
  });

  it("counts rows with a null code or malformed date as invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([
      { package_code: null, offline_date: "2026-11-20" },
      { package_code: "   ", offline_date: "2026-11-20" },
      { package_code: "com.valid", offline_date: "2026-11-20" },
      { package_code: "com.bad-date", offline_date: "not-a-date" },
      { package_code: "com.missing-date", offline_date: null },
    ]));

    const batch = await fetchOfflinePackages("2026-11-20", "2026-11-20");

    expect(batch.rows).toEqual([{ packageCode: "com.valid", offlineDate: "2026-11-20" }]);
    expect(batch.invalid).toBe(4);
  });

  it("passes stale and range_complete through unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([], {
      stale: true,
      range_complete: false,
    }));

    const batch = await fetchOfflinePackages("2026-11-20", "2026-11-20");

    expect(batch.stale).toBe(true);
    expect(batch.rangeComplete).toBe(false);
  });

  it("keeps rows whose display name contains an asterisk", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([
      { package_code: "com.star", offline_date: "2026-11-20", display_name: "灵蜂*", team: "灵蜂" },
    ]));

    const batch = await fetchOfflinePackages("2026-11-20", "2026-11-20");

    expect(batch.rows).toEqual([{ packageCode: "com.star", offlineDate: "2026-11-20" }]);
    expect(batch.invalid).toBe(0);
  });

  it("accepts an endpoint that already includes the offline path", async () => {
    vi.stubEnv("FIRST_DELIVERY_API_URL", "http://source.test/api/v1/offline-packages/");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(pageBody([]));

    await fetchOfflinePackages("2026-11-20", "2026-11-22");

    const parsed = new URL(String(vi.mocked(fetch).mock.calls[0]![0]));
    expect(parsed.origin + parsed.pathname).toBe("http://source.test/api/v1/offline-packages");
  });

  it("rejects malformed window days", async () => {
    await expect(fetchOfflinePackages("2026/11/20", "2026-11-22"))
      .rejects.toThrow("Offline day must be YYYY-MM-DD");
    await expect(fetchOfflinePackages("2026-11-20", "tomorrow"))
      .rejects.toThrow("Offline day must be YYYY-MM-DD");
  });
});
