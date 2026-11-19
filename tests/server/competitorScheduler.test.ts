import { describe, expect, it, vi } from "vitest";
import {
  computeTargetDate,
  runScheduledCompetitorSync,
  startCompetitorScheduler,
} from "../../server/lib/competitorScheduler";
import type { CompetitorSyncDeps } from "../../server/lib/competitorSync";

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

describe("competitor scheduler", () => {
  it("computes the previous UTC day from a fixed clock", () => {
    expect(computeTargetDate(new Date("2026-11-19T09:30:00+08:00"))).toBe("2026-11-18");
  });

  it("runs the sync entry point once with yesterday's target date", async () => {
    const deps = fakeDeps();
    const run = vi.fn(async () => ({
      targetDate: "2026-11-18", total: 0, hit: 0, missed: 0, failed: 0, status: "ok" as const,
    }));

    await runScheduledCompetitorSync(deps, {
      now: () => new Date("2026-11-19T01:30:00Z"),
      run,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("2026-11-18", deps);
  });

  it("logs and swallows failures so the next day still runs", async () => {
    const deps = fakeDeps();
    const run = vi.fn(async () => { throw new Error("source down"); });
    const log = vi.fn();

    await expect(runScheduledCompetitorSync(deps, {
      now: () => new Date("2026-11-19T01:30:00Z"),
      run,
      log,
    })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("Competitor sync failed: source down");

    const retry = vi.fn(async () => ({
      targetDate: "2026-11-19", total: 0, hit: 0, missed: 0, failed: 0, status: "ok" as const,
    }));
    await runScheduledCompetitorSync(deps, { now: () => new Date("2026-11-20T01:30:00Z"), run: retry, log });
    expect(retry).toHaveBeenCalledWith("2026-11-19", deps);
  });

  it("registers the 09:30 Asia/Shanghai schedule", () => {
    const task = startCompetitorScheduler(fakeDeps());
    expect(task).toBeDefined();
    task.stop();
  });
});
