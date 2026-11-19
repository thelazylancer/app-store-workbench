import { describe, expect, it, vi } from "vitest";
import type { DownloadedAsset } from "../../server/lib/assetStore";
import type { CountryHitRow } from "../../server/lib/competitorRepo";
import { syncCompetitorDay } from "../../server/lib/competitorSync";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";
import type { BatchRow, PackageRow, VersionRow } from "../../shared/competitorTypes";
import type { LookupCandidate } from "../../shared/types";

const targetDate = "2026-11-18";
const packageCode = "com.example.versions";
const source: SourceBatch = {
  syncId: "sync-versions",
  snapshotId: "snap-versions",
  dataUpdatedAt: "2026-11-18T00:47:00.000Z",
  publishedAt: "2026-11-18T01:00:00.000Z",
  rangeComplete: true,
  stale: false,
  rows: [{
    packageCode, displayName: "iOS-Versions", team: "Alpha",
    firstAdDate: targetDate, listingDate: null, first100Date: null, offlineDate: null,
  }],
};

const candidate: LookupCandidate = {
  name: "Real Versions",
  developer: "Dev",
  appleId: 42,
  bundleId: packageCode,
  appStoreUrl: "https://apps.apple.com/us/app/id42",
  iconUrl: "https://cdn.example/icon.png",
  description: "Description",
  screenshotUrls: ["https://cdn.example/lookup-shot.jpg"],
  category: "Utilities",
  minimumOsVersion: "16.0",
  versionHistory: [{ version: "1.0", releasedAt: null, notes: "" }],
};

function fakeDeps(overrides: {
  productPage?: () => Promise<{
    screenshotUrls: string[];
    iapItems: Array<{ name: string; price: string }>;
    versionHistory: Array<{ version: string; releasedAt: string | null; notes: string }>;
  }>;
} = {}) {
  const repo = {
    upsertBatch: vi.fn(async (_batch: BatchRow) => {}),
    upsertPackage: vi.fn(async (_pkg: PackageRow) => {}),
    upsertCountryHits: vi.fn(async (_code: string, _hits: CountryHitRow[]) => {}),
    upsertAssets: vi.fn(async (_code: string, _assets: DownloadedAsset[]) => {}),
    upsertVersions: vi.fn(async (_code: string, _versions: VersionRow[]) => {}),
  };
  const downloadAssets = vi.fn(async (
    _date: string, _code: string, _icon: string, _shots: string[],
  ) => ({
    assets: [{ type: "icon" as const, sourceUrl: "https://cdn.example/icon.png", localPath: "icon.png" }],
    status: "ok" as const,
  }));
  const deps = {
    fetchSourcePackages: async () => source,
    lookupAppByBundleId: async (bundleId: string) => bundleId === packageCode ? candidate : null,
    fetchProductPageDetails: overrides.productPage ?? (async () => ({
      screenshotUrls: ["https://cdn.example/page-shot.jpg"],
      iapItems: [{ name: "Pack", price: "$4.99" }],
      versionHistory: [{ version: "2.0", releasedAt: "2026-11-01T00:00:00.000Z", notes: "Notes" }],
    })),
    downloadAssets,
    repo,
  };
  return { deps, repo, downloadAssets };
}

describe("competitor version snapshots", () => {
  it("merges product-page screenshots and upserts visible version history", async () => {
    const { deps, repo, downloadAssets } = fakeDeps();

    const report = await syncCompetitorDay(targetDate, deps);

    expect(report).toMatchObject({ hit: 1, missed: 0, failed: 0, status: "ok" });
    expect(downloadAssets.mock.calls[0]).toEqual([
      targetDate,
      packageCode,
      "https://cdn.example/icon.png",
      ["https://cdn.example/lookup-shot.jpg", "https://cdn.example/page-shot.jpg"],
    ]);
    expect(repo.upsertVersions).toHaveBeenCalledWith(packageCode, [{
      version: "2.0",
      releasedAt: "2026-11-01T00:00:00.000Z",
      notes: "Notes",
    }]);

    const finalPackage = repo.upsertPackage.mock.calls.at(-1)![0];
    expect(finalPackage).toMatchObject({
      lookupStatus: "hit",
      enrichStatus: "ok",
      assetStatus: "ok",
      appVersion: "2.0",
    });
    expect(finalPackage.appStoreJson).toMatchObject({
      screenshotUrls: [
        "https://cdn.example/lookup-shot.jpg",
        "https://cdn.example/page-shot.jpg",
      ],
      iapItems: [{ name: "Pack", price: "$4.99" }],
      versionHistory: [{ version: "2.0", releasedAt: "2026-11-01T00:00:00.000Z", notes: "Notes" }],
    });
  });

  it("marks enrich_status failed and continues the batch when the product page fails", async () => {
    const { deps, repo, downloadAssets } = fakeDeps({
      productPage: async () => { throw new Error("product page unavailable"); },
    });

    const report = await syncCompetitorDay(targetDate, deps);

    expect(report).toMatchObject({ hit: 1, failed: 0, status: "ok" });
    expect(repo.upsertVersions).not.toHaveBeenCalled();
    expect(downloadAssets.mock.calls[0]![3]).toEqual(["https://cdn.example/lookup-shot.jpg"]);
    const finalPackage = repo.upsertPackage.mock.calls.at(-1)![0];
    expect(finalPackage).toMatchObject({
      lookupStatus: "hit",
      enrichStatus: "failed",
      appVersion: "1.0",
    });
  });

  it("uses the capture time when a product-page version has no release timestamp", async () => {
    const { deps, repo } = fakeDeps({
      productPage: async () => ({
        screenshotUrls: [],
        iapItems: [],
        versionHistory: [{ version: "3.0", releasedAt: null, notes: "" }],
      }),
    });

    await syncCompetitorDay(targetDate, deps);

    const versions = repo.upsertVersions.mock.calls[0]![1];
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe("3.0");
    expect(versions[0]!.releasedAt).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(versions[0]!.releasedAt))).toBe(false);
  });
});
