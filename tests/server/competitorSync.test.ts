import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTargetDate, syncCompetitorDay } from "../../server/lib/competitorSync";
import type { PackageRow } from "../../shared/competitorTypes";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";

const sourceBatch: SourceBatch = {
  syncId: "sync-1",
  snapshotId: "snap-1",
  dataUpdatedAt: "2026-11-18T00:47:00.000Z",
  publishedAt: "2026-11-18T01:00:00.000Z",
  rangeComplete: true,
  stale: false,
  rows: [
    { packageCode: "com.a", displayName: "iOS A", team: "Alpha", firstAdDate: "2026-11-18", listingDate: null, first100Date: null, offlineDate: null },
    { packageCode: "com.b", displayName: "iOS B", team: "Beta", firstAdDate: "2026-11-18", listingDate: "2026-11-02", first100Date: null, offlineDate: null },
    { packageCode: "com.c", displayName: "iOS C", team: "Gamma", firstAdDate: "2026-11-18", listingDate: null, first100Date: null, offlineDate: null },
  ],
};

describe("computeTargetDate", () => {
  it("returns yesterday in UTC regardless of local time", () => {
    expect(computeTargetDate(new Date("2026-11-19T09:30:00+08:00"))).toBe("2026-11-18");
    expect(computeTargetDate(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-31");
  });
});

describe("syncCompetitorDay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("upserts the batch and every package with initial statuses", async () => {
    const repo = {
      upsertBatch: vi.fn(async () => {}),
      upsertPackage: vi.fn(async (_pkg: PackageRow) => {}),
    };

    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => sourceBatch,
      repo,
    });

    expect(report).toEqual({
      targetDate: "2026-11-18", total: 3, hit: 0, missed: 0, failed: 0, status: "ok",
    });
    expect(repo.upsertPackage).toHaveBeenCalledTimes(3);
    expect(repo.upsertPackage.mock.calls.map(([pkg]) => pkg.packageCode)).toEqual(["com.a", "com.b", "com.c"]);
    for (const [pkg] of repo.upsertPackage.mock.calls) {
      expect(pkg).toMatchObject({
        targetDate: "2026-11-18",
        lookupStatus: "pending",
        enrichStatus: "pending",
        assetStatus: "pending",
        appStoreJson: {},
      });
    }
    expect(repo.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({
      targetDate: "2026-11-18",
      syncId: "sync-1",
      snapshotId: "snap-1",
      status: "ok",
    }));
  });

  it("isolates a single failing package and reports partial completion", async () => {
    const repo = {
      upsertBatch: vi.fn(async () => {}),
      upsertPackage: vi.fn(async (pkg: PackageRow) => {
        if (pkg.packageCode === "com.b") throw new Error("db rejected row");
      }),
    };

    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => sourceBatch,
      repo,
    });

    expect(report).toMatchObject({ total: 3, failed: 1, status: "partial" });
    expect(repo.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
  });

  it("propagates source failures without writing a batch", async () => {
    const repo = {
      upsertBatch: vi.fn(async () => {}),
      upsertPackage: vi.fn(async (_pkg: PackageRow) => {}),
    };

    await expect(syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => { throw new Error("source down"); },
      repo,
    })).rejects.toThrow("source down");
    expect(repo.upsertBatch).not.toHaveBeenCalled();
    expect(repo.upsertPackage).not.toHaveBeenCalled();
  });
});
