import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTargetDate, syncCompetitorDay } from "../../server/lib/competitorSync";
import type { DownloadedAsset } from "../../server/lib/assetStore";
import type { CountryHitRow } from "../../server/lib/competitorRepo";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";
import type { BatchRow, PackageRow, VersionRow } from "../../shared/competitorTypes";
import { STORE_COUNTRIES } from "../../shared/types";
import type { LookupCandidate, StoreCountry } from "../../shared/types";

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

function candidate(bundleId: string): LookupCandidate {
  return {
    name: `Real ${bundleId}`,
    developer: "Dev",
    appleId: 42,
    bundleId,
    appStoreUrl: "https://apps.apple.com/us/app/id42",
    iconUrl: "https://cdn.example/icon.png",
    description: "Description",
    screenshotUrls: [],
    category: "Utilities",
    minimumOsVersion: "16.0",
    versionHistory: [{ version: "1.0", releasedAt: null, notes: "" }],
  };
}

function fakeRepo() {
  return {
    upsertBatch: vi.fn(async (_batch: BatchRow) => {}),
    upsertPackage: vi.fn(async (_pkg: PackageRow) => {}),
    upsertCountryHits: vi.fn(async (_code: string, _hits: CountryHitRow[]) => {}),
    upsertAssets: vi.fn(async (_code: string, _assets: DownloadedAsset[]) => {}),
    upsertVersions: vi.fn(async (_code: string, _versions: VersionRow[]) => {}),
  };
}

function fakeDownload() {
  return vi.fn(async (_date: string, _code: string, _icon: string, _shots: string[]) => ({
    assets: [{ type: "icon" as const, sourceUrl: "https://cdn.example/icon.png", localPath: "icon.png" }],
    status: "ok" as const,
  }));
}

describe("computeTargetDate", () => {
  it("returns yesterday in UTC regardless of local time", () => {
    expect(computeTargetDate(new Date("2026-11-19T08:00:00+08:00"))).toBe("2026-11-18");
    expect(computeTargetDate(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-31");
  });
});

describe("syncCompetitorDay", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("looks up all eight storefronts in order and writes hits plus enriched packages", async () => {
    const repo = fakeRepo();
    const lookup = vi.fn(async (bundleId: string, country: StoreCountry) => (
      country === "us" || country === "jp" ? candidate(bundleId) : null
    ));

    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => sourceBatch,
      lookupAppByBundleId: lookup,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: fakeDownload(),
      repo,
    });

    expect(report).toEqual({
      targetDate: "2026-11-18", total: 3, hit: 3, missed: 0, offline: 0, failed: 0, status: "ok",
    });
    expect(lookup.mock.calls
      .filter(([bundleId]) => bundleId === "com.a")
      .map(([, country]) => country)).toEqual([...STORE_COUNTRIES]);

    expect(repo.upsertCountryHits).toHaveBeenCalledTimes(3);
    const hits = repo.upsertCountryHits.mock.calls.find(([code]) => code === "com.a")![1];
    expect(hits.map((hit) => [hit.country, hit.status, hit.appleId])).toEqual(
      STORE_COUNTRIES.map((country) => [country, country === "us" || country === "jp" ? "hit" : "not_found", country === "us" || country === "jp" ? 42 : null]),
    );

    const firstPackageCalls = repo.upsertPackage.mock.calls
      .map(([pkg]) => pkg)
      .filter((pkg) => pkg.packageCode === "com.a");
    expect(firstPackageCalls).toHaveLength(2);
    expect(firstPackageCalls[0]).toMatchObject({ lookupStatus: "pending", appStoreJson: {} });
    expect(firstPackageCalls[1]).toMatchObject({
      lookupStatus: "hit",
      assetStatus: "ok",
      category: "Utilities",
      minimumOsVersion: "16.0",
      appVersion: "1.0",
      appStoreJson: expect.objectContaining({ appleId: 42, name: "Real com.a" }),
    });
    expect(repo.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({
      targetDate: "2026-11-18", syncId: "sync-1", snapshotId: "snap-1", status: "ok",
    }));
  });

  it("collapses the same artwork across sizes and keeps the largest", async () => {
    const repo = fakeRepo();
    const download = fakeDownload();
    const lookup = vi.fn(async (bundleId: string) => ({
      ...candidate(bundleId),
      screenshotUrls: [
        "https://cdn.example/shot/a.png/320x480bb.jpg",
        "https://cdn.example/shot/b.png/320x480bb.jpg",
      ],
    }));

    await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => ({ ...sourceBatch, rows: [sourceBatch.rows[0]!] }),
      lookupAppByBundleId: lookup,
      fetchProductPageDetails: async () => ({
        screenshotUrls: [
          "https://cdn.example/shot/a.png/1320x2868bb.jpg",
          "https://cdn.example/shot/b.png/1320x2868bb.jpg",
        ],
        iapItems: [],
        versionHistory: [],
      }),
      downloadAssets: download,
      repo,
    });

    expect(download.mock.calls[0]![3]).toEqual([
      "https://cdn.example/shot/a.png/1320x2868bb.jpg",
      "https://cdn.example/shot/b.png/1320x2868bb.jpg",
    ]);
  });

  it("records bundle_not_found when all storefronts miss", async () => {
    const repo = fakeRepo();
    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => ({ ...sourceBatch, rows: [sourceBatch.rows[0]!] }),
      lookupAppByBundleId: async () => null,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: fakeDownload(),
      repo,
    });

    expect(report).toMatchObject({ total: 1, hit: 0, missed: 1, failed: 0, status: "ok" });
    const finalCall = repo.upsertPackage.mock.calls.at(-1)![0];
    expect(finalCall).toMatchObject({ lookupStatus: "bundle_not_found", appStoreJson: {} });
    expect(repo.upsertCountryHits.mock.calls[0]![1].every((hit) => hit.status === "not_found")).toBe(true);
  });

  it("skips the lookup for packages the source already marks offline", async () => {
    const repo = fakeRepo();
    const lookup = vi.fn(async (bundleId: string) => candidate(bundleId));
    const row = { ...sourceBatch.rows[0]!, offlineDate: "2026-11-17" };

    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => ({ ...sourceBatch, rows: [row] }),
      lookupAppByBundleId: lookup,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: fakeDownload(),
      repo,
    });

    expect(report).toMatchObject({ total: 1, hit: 0, missed: 0, offline: 1, failed: 0, status: "ok" });
    expect(lookup).not.toHaveBeenCalled();
    expect(repo.upsertPackage).toHaveBeenCalledTimes(1);
    expect(repo.upsertPackage.mock.calls[0]![0]).toMatchObject({
      lookupStatus: "offline",
      offlineDate: "2026-11-17",
      appStoreJson: {},
    });
    expect(repo.upsertCountryHits).not.toHaveBeenCalled();
    expect(repo.upsertAssets).not.toHaveBeenCalled();
  });

  it("isolates a single package lookup failure and reports partial completion", async () => {
    const repo = fakeRepo();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const lookup = vi.fn(async (bundleId: string) => {
      if (bundleId === "com.b") throw new Error("Apple unavailable");
      return candidate(bundleId);
    });

    const report = await syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => sourceBatch,
      lookupAppByBundleId: lookup,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: fakeDownload(),
      repo,
    });

    expect(report).toMatchObject({ total: 3, hit: 2, missed: 0, failed: 1, status: "partial" });
    expect(repo.upsertCountryHits).toHaveBeenCalledTimes(2);
    expect(repo.upsertBatch).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("com.b"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Apple unavailable"));
  });

  it("propagates source failures without writing a batch", async () => {
    const repo = fakeRepo();

    await expect(syncCompetitorDay("2026-11-18", {
      fetchSourcePackages: async () => { throw new Error("source down"); },
      lookupAppByBundleId: async () => null,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: fakeDownload(),
      repo,
    })).rejects.toThrow("source down");
    expect(repo.upsertBatch).not.toHaveBeenCalled();
    expect(repo.upsertPackage).not.toHaveBeenCalled();
  });
});
