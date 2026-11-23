import { describe, expect, it, vi } from "vitest";
import type { OfflineDateUpdate } from "../../server/lib/competitorRepo";
import type { OfflineSourceBatch } from "../../server/lib/offlineSource";
import {
  beijingToday,
  collapseOfflineDates,
  computeBackfillWindow,
  computeOfflineWindow,
  syncOfflinePackages,
  type OfflineSyncDeps,
} from "../../server/lib/offlineSync";

function batch(
  rows: OfflineSourceBatch["rows"],
  overrides: Partial<OfflineSourceBatch> = {},
): OfflineSourceBatch {
  return {
    syncId: "sync-1",
    rangeComplete: true,
    stale: false,
    rows,
    invalid: 0,
    ...overrides,
  };
}

function emptyDeps(updatedCodes: string[] = []) {
  return {
    fetchOfflinePackages: vi.fn(async (_startDay: string, _endDay: string) => batch([])),
    repo: {
      updateOfflineDates: vi.fn(async (_entries: OfflineDateUpdate[]) => updatedCodes),
    },
  } satisfies OfflineSyncDeps;
}

describe("Beijing window helpers", () => {
  it("rolls over to the next day at 16:00 UTC", () => {
    expect(beijingToday(new Date("2026-11-23T15:59:59Z"))).toBe("2026-11-23");
    expect(beijingToday(new Date("2026-11-23T16:00:00Z"))).toBe("2026-11-24");
  });

  it("computes the inclusive three-day window ending yesterday", () => {
    expect(computeOfflineWindow(new Date("2026-11-23T00:00:00Z"))).toEqual({
      start: "2026-11-20",
      end: "2026-11-22",
    });
  });

  it("computes a backfill window of N days ending today", () => {
    expect(computeBackfillWindow(new Date("2026-11-23T00:00:00Z"), 30)).toEqual({
      start: "2026-10-25",
      end: "2026-11-23",
    });
    expect(computeBackfillWindow(new Date("2026-11-23T00:00:00Z"), 1)).toEqual({
      start: "2026-11-23",
      end: "2026-11-23",
    });
  });

  it("rejects non-positive or fractional day counts", () => {
    expect(() => computeBackfillWindow(new Date(), 0)).toThrow("days must be a positive integer");
    expect(() => computeBackfillWindow(new Date(), -3)).toThrow("days must be a positive integer");
    expect(() => computeBackfillWindow(new Date(), 1.5)).toThrow("days must be a positive integer");
  });
});

describe("collapseOfflineDates", () => {
  it("keeps the largest date per code in first-seen order", () => {
    expect(collapseOfflineDates([
      { packageCode: "com.b", offlineDate: "2026-11-10" },
      { packageCode: "com.a", offlineDate: "2026-11-05" },
      { packageCode: "com.b", offlineDate: "2026-11-20" },
      { packageCode: "com.a", offlineDate: "2026-11-03" },
      { packageCode: "com.c", offlineDate: "2026-11-15" },
    ])).toEqual([
      { packageCode: "com.b", offlineDate: "2026-11-20" },
      { packageCode: "com.a", offlineDate: "2026-11-05" },
      { packageCode: "com.c", offlineDate: "2026-11-15" },
    ]);
  });
});

describe("syncOfflinePackages", () => {
  const window = { start: "2026-11-20", end: "2026-11-22" };

  it("reports fetched, matched, updated, unmatched and failed consistently", async () => {
    const deps = emptyDeps(["com.a", "com.b"]);
    deps.fetchOfflinePackages.mockResolvedValue(batch([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
      { packageCode: "com.b", offlineDate: "2026-11-21" },
      { packageCode: "com.missing", offlineDate: "2026-11-22" },
    ], { invalid: 1 }));

    const report = await syncOfflinePackages(window, deps);

    expect(report).toEqual({
      start: "2026-11-20",
      end: "2026-11-22",
      fetched: 4,
      matched: 2,
      updated: 2,
      unmatched: 1,
      failed: 1,
    });
    expect(report.fetched).toBe(report.matched + report.unmatched + report.failed);
    expect(deps.repo.updateOfflineDates).toHaveBeenCalledWith([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
      { packageCode: "com.b", offlineDate: "2026-11-21" },
      { packageCode: "com.missing", offlineDate: "2026-11-22" },
    ]);
  });

  it("collapses duplicate codes before writing", async () => {
    const deps = emptyDeps(["com.a"]);
    deps.fetchOfflinePackages.mockResolvedValue(batch([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
      { packageCode: "com.a", offlineDate: "2026-11-22" },
    ]));

    await syncOfflinePackages(window, deps);

    expect(deps.repo.updateOfflineDates).toHaveBeenCalledWith([
      { packageCode: "com.a", offlineDate: "2026-11-22" },
    ]);
  });

  it("keeps fetched = matched + unmatched + failed when a code repeats", async () => {
    const deps = emptyDeps(["com.a"]);
    deps.fetchOfflinePackages.mockResolvedValue(batch([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
      { packageCode: "com.a", offlineDate: "2026-11-22" },
      { packageCode: "com.missing", offlineDate: "2026-11-21" },
    ], { invalid: 1 }));

    const report = await syncOfflinePackages(window, deps);

    expect(report).toEqual({
      start: "2026-11-20",
      end: "2026-11-22",
      fetched: 3,
      matched: 1,
      updated: 1,
      unmatched: 1,
      failed: 1,
    });
    expect(report.fetched).toBe(report.matched + report.unmatched + report.failed);
  });

  it("propagates fetch failures so the scheduler can isolate them", async () => {
    const deps = emptyDeps();
    deps.fetchOfflinePackages.mockRejectedValue(new Error("source down"));

    await expect(syncOfflinePackages(window, deps)).rejects.toThrow("source down");
    expect(deps.repo.updateOfflineDates).not.toHaveBeenCalled();
  });

  it("warns on stale or incomplete data but still writes", async () => {
    const deps = emptyDeps(["com.a"]);
    deps.fetchOfflinePackages.mockResolvedValue(batch([
      { packageCode: "com.a", offlineDate: "2026-11-20" },
    ], { stale: true, rangeComplete: false }));
    const log = vi.fn();

    await syncOfflinePackages(window, deps, log);

    expect(log).toHaveBeenCalledWith("Offline sync warning: stale=true range_complete=false");
    expect(deps.repo.updateOfflineDates).toHaveBeenCalledTimes(1);
  });

  it("returns a zero report without touching the repo when there are no valid rows", async () => {
    const deps = emptyDeps();
    deps.fetchOfflinePackages.mockResolvedValue(batch([], { invalid: 2 }));

    const report = await syncOfflinePackages(window, deps);

    expect(deps.repo.updateOfflineDates).not.toHaveBeenCalled();
    expect(report).toEqual({
      start: "2026-11-20",
      end: "2026-11-22",
      fetched: 2,
      matched: 0,
      updated: 0,
      unmatched: 0,
      failed: 2,
    });
  });
});
