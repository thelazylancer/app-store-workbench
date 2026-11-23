import cron from "node-cron";
import { describe, expect, it, vi } from "vitest";
import {
  computeTargetDate,
  runScheduledCompetitorSync,
  startCompetitorScheduler,
} from "../../server/lib/competitorScheduler";
import type { CompetitorSyncDeps } from "../../server/lib/competitorSync";
import type { OfflineSyncDeps } from "../../server/lib/offlineSync";

function fakeDeps(): CompetitorSyncDeps {
  return {
    fetchSourcePackages: async () => { throw new Error("unused"); },
    lookupAppByBundleId: async () => null,
    fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
    downloadAssets: async () => ({ assets: [], status: "failed" as const }),
    repo: {
      upsertBatch: async () => {},
      upsertPackage: async () => {},
      upsertCountryHits: async () => {},
      upsertAssets: async () => {},
      upsertVersions: async () => {},
    },
  };
}

function fakeOfflineDeps(): OfflineSyncDeps {
  return {
    fetchOfflinePackages: async () => ({
      syncId: "offline-sync", rangeComplete: true, stale: false, rows: [], invalid: 0,
    }),
    repo: { updateOfflineDates: async () => [] },
  };
}

function emptyReport(targetDate: string) {
  return { targetDate, total: 0, hit: 0, missed: 0, failed: 0, status: "ok" as const };
}

function emptyOfflineReport(start: string, end: string) {
  return { start, end, fetched: 0, matched: 0, updated: 0, unmatched: 0, failed: 0 };
}

describe("competitor scheduler", () => {
  it("computes the previous UTC day from a fixed clock", () => {
    expect(computeTargetDate(new Date("2026-11-19T08:00:00+08:00"))).toBe("2026-11-18");
  });

  it("runs the sync entry point once with yesterday's target date", async () => {
    const deps = fakeDeps();
    const run = vi.fn(async () => emptyReport("2026-11-18"));
    const runOffline = vi.fn(async () => emptyOfflineReport("2026-11-16", "2026-11-18"));

    await runScheduledCompetitorSync(deps, fakeOfflineDeps(), {
      now: () => new Date("2026-11-19T00:00:00Z"),
      run,
      runOffline,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("2026-11-18", deps);
  });

  it("logs and swallows failures so the next day still runs", async () => {
    const deps = fakeDeps();
    const run = vi.fn(async () => { throw new Error("source down"); });
    const log = vi.fn();

    await expect(runScheduledCompetitorSync(deps, fakeOfflineDeps(), {
      now: () => new Date("2026-11-19T00:00:00Z"),
      run,
      log,
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Competitor sync failed: source down");

    const retry = vi.fn(async () => emptyReport("2026-11-19"));
    await runScheduledCompetitorSync(deps, fakeOfflineDeps(), {
      now: () => new Date("2026-11-20T00:00:00Z"), run: retry, log,
    });
    expect(retry).toHaveBeenCalledWith("2026-11-19", deps);
  });

  it("still runs first-delivery when offline sync fails", async () => {
    const deps = fakeDeps();
    const run = vi.fn(async () => emptyReport("2026-11-18"));
    const runOffline = vi.fn(async () => { throw new Error("offline source down"); });
    const log = vi.fn();

    await runScheduledCompetitorSync(deps, fakeOfflineDeps(), {
      now: () => new Date("2026-11-19T00:00:00Z"),
      run,
      runOffline,
      log,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(runOffline).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Offline sync failed: offline source down");
  });

  it("still runs offline sync when first-delivery fails", async () => {
    const deps = fakeDeps();
    const offlineDeps = fakeOfflineDeps();
    const run = vi.fn(async () => { throw new Error("source down"); });
    const runOffline = vi.fn(async () => emptyOfflineReport("2026-11-16", "2026-11-18"));
    const log = vi.fn();

    await runScheduledCompetitorSync(deps, offlineDeps, {
      now: () => new Date("2026-11-19T00:00:00Z"),
      run,
      runOffline,
      log,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Competitor sync failed: source down");
    expect(runOffline).toHaveBeenCalledTimes(1);
  });

  it("passes the Beijing offline window to the offline run", async () => {
    const offlineDeps = fakeOfflineDeps();
    const run = vi.fn(async () => emptyReport("2026-11-18"));
    const runOffline = vi.fn(async () => emptyOfflineReport("2026-11-16", "2026-11-18"));
    const log = vi.fn();

    await runScheduledCompetitorSync(fakeDeps(), offlineDeps, {
      now: () => new Date("2026-11-19T00:00:00Z"),
      run,
      runOffline,
      log,
    });

    expect(runOffline).toHaveBeenCalledWith(
      { start: "2026-11-16", end: "2026-11-18" },
      offlineDeps,
      log,
    );
  });

  it("registers the 09:10 Asia/Shanghai schedule", () => {
    const schedule = vi.spyOn(cron, "schedule");
    const task = startCompetitorScheduler(fakeDeps(), fakeOfflineDeps());
    expect(schedule).toHaveBeenCalledWith("10 9 * * *", expect.any(Function), { timezone: "Asia/Shanghai" });
    task.stop();
    schedule.mockRestore();
  });
});
