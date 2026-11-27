import { describe, expect, it } from "vitest";
import {
  compactDayDetail,
  compactPackageDetail,
  compactPackageHistory,
} from "../../server/lib/mcpCompact";
import type {
  BatchRow,
  PackageDetail,
  SnapshotEntry,
  VersionEntry,
} from "../../shared/competitorTypes";

// Real App Store keys, matching what competitorSync writes into app_store_json.
const longDescription = "😀".repeat(160) + "tail";

const iapItems = Array.from({ length: 6 }, (_, index) => ({
  name: `IAP ${index}`,
  price: `$${index}.99`,
}));

const versionHistory = Array.from({ length: 7 }, (_, index) => ({
  version: `1.${index}.0`,
  releasedAt: `2026-11-0${index + 1}T00:00:00.000Z`,
  notes: `release notes ${index}`,
}));

const versions: VersionEntry[] = versionHistory.map((entry, index) => ({
  version: entry.version,
  releasedAt: entry.releasedAt,
  notes: entry.notes,
  capturedAt: `2026-11-0${index + 1}T03:00:00.000Z`,
}));

function storeJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Funce",
    developer: "Funce Dev",
    appleId: 123456,
    bundleId: "com.example.funce",
    averageUserRating: 4.6,
    userRatingCount: 1200,
    price: 0,
    formattedPrice: "Free",
    currency: "USD",
    fileSizeBytes: 123456789,
    minimumOsVersion: "15.0",
    appStoreUrl: "https://apps.apple.com/us/app/id123456",
    iconUrl: "https://example.com/icon.png",
    description: longDescription,
    screenshotUrls: ["https://example.com/shot-1.png", "https://example.com/shot-2.png"],
    category: "Games",
    iapItems,
    versionHistory,
    privacy: { privacyPolicyUrl: "https://example.com/privacy" },
    ...overrides,
  };
}

function packageDetail(overrides: Partial<PackageDetail> = {}): PackageDetail {
  return {
    packageCode: "com.example.funce",
    targetDate: "2026-11-23",
    displayName: "Funce",
    team: "Alpha",
    firstAdDate: "2026-11-01",
    listingDate: "2026-11-01",
    first100Date: "2026-11-02",
    offlineDate: null,
    category: "Games",
    minimumOsVersion: "15.0",
    appVersion: "1.6.0",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    attribution: null,
    permissions: null,
    appleId: 123456,
    appStoreJson: storeJson(),
    iconLocalPath: "com.example.funce/icon.png",
    screenshotLocalPaths: ["a.png", "b.png"],
    versions,
    fetchedAt: "2026-11-23T02:00:00.000Z",
    ...overrides,
  };
}

const batch: BatchRow = {
  targetDate: "2026-11-23",
  syncId: "sync-1",
  snapshotId: "snap-1",
  dataUpdatedAt: "2026-11-23T01:00:00.000Z",
  publishedAt: "2026-11-23T01:05:00.000Z",
  rangeComplete: true,
  stale: false,
  status: "ok",
  fetchedAt: "2026-11-23T02:00:00.000Z",
};

describe("compactPackageDetail", () => {
  it("keeps parsed permissions and the not-analyzed state", () => {
    expect(compactPackageDetail(packageDetail()).permissions).toBeNull();
    const keys = ["NSCameraUsageDescription", "NSPhotoLibraryUsageDescription"];
    expect(compactPackageDetail(packageDetail({ permissions: keys })).permissions).toEqual(keys);
  });

  it("truncates description by code point without splitting surrogate pairs", () => {
    const compact = compactPackageDetail(packageDetail());

    expect(compact.store?.description).toBe("😀".repeat(160));
    expect([...(compact.store?.description ?? "")]).toHaveLength(160);
    expect(compact.store?.descriptionTruncated).toBe(true);
  });

  it("does not add a truncation marker when description is exactly 160 code points", () => {
    const exact = "😀".repeat(160);
    const compact = compactPackageDetail(packageDetail({
      appStoreJson: storeJson({ description: exact }),
    }));

    expect(compact.store?.description).toBe(exact);
    expect(compact.store).not.toHaveProperty("descriptionTruncated");
  });

  it("keeps the first five IAP items and marks the truncation", () => {
    const compact = compactPackageDetail(packageDetail());

    expect(compact.store?.iapItems).toEqual(iapItems.slice(0, 5));
    expect(compact.store?.iapItemsTruncated).toBe(true);
  });

  it("keeps exactly five IAP items without a marker", () => {
    const compact = compactPackageDetail(packageDetail({
      appStoreJson: storeJson({ iapItems: iapItems.slice(0, 5) }),
    }));

    expect(compact.store?.iapItems).toHaveLength(5);
    expect(compact.store).not.toHaveProperty("iapItemsTruncated");
  });

  it("keeps the latest five versions without notes and marks the truncation", () => {
    const compact = compactPackageDetail(packageDetail());

    expect(compact.latestVersions).toEqual(
      versions.slice(0, 5).map(({ version, releasedAt }) => ({ version, releasedAt })),
    );
    expect(compact.latestVersions?.[0]).not.toHaveProperty("notes");
    expect(compact.versionsTruncated).toBe(true);
    expect(compact.versionCount).toBe(7);
  });

  it("omits versionsTruncated at exactly five versions", () => {
    const compact = compactPackageDetail(packageDetail({ versions: versions.slice(0, 5) }));

    expect(compact.latestVersions).toHaveLength(5);
    expect(compact).not.toHaveProperty("versionsTruncated");
  });

  it("omits the store key entirely for a missed package", () => {
    const compact = compactPackageDetail(packageDetail({
      lookupStatus: "bundle_not_found",
      appleId: null,
      appStoreJson: {},
    }));

    expect(compact).not.toHaveProperty("store");
    expect(JSON.stringify(compact)).not.toContain("appStoreJson");
  });
});

describe("compactDayDetail", () => {
  it("passes the batch through and projects every package", () => {
    const day = compactDayDetail({
      date: "2026-11-23",
      dateKind: "first_ad",
      batch,
      packages: [
        packageDetail(),
        packageDetail({ packageCode: "com.example.miss", lookupStatus: "offline", appStoreJson: {} }),
      ],
    });

    expect(day.batch).toBe(batch);
    expect(day.packages).toHaveLength(2);
    expect(day.packages[0]).toMatchObject({
      packageCode: "com.example.funce",
      hasIcon: true,
      screenshotCount: 2,
      versionCount: 7,
    });
    expect(day.packages[1]).not.toHaveProperty("store");
  });

  it("never emits the raw store payload or per-package asset paths", () => {
    const day = compactDayDetail({
      date: "2026-11-23",
      dateKind: "first_ad",
      batch,
      packages: [packageDetail()],
    });
    const text = JSON.stringify(day);

    expect(text).not.toContain("appStoreJson");
    expect(text).not.toContain("screenshotLocalPaths");
    expect(text).not.toContain("versionHistory");
    expect(day.packages[0]).not.toHaveProperty("latestVersions");
    expect(day.packages[0]).not.toHaveProperty("fetchedAt");
    expect(day.packages[0]).not.toHaveProperty("first100Date");
  });
});

describe("compactPackageHistory", () => {
  const snapshots: SnapshotEntry[] = [
    {
      targetDate: "2026-11-23",
      team: "Alpha",
      lookupStatus: "hit",
      enrichStatus: "ok",
      assetStatus: "ok",
      category: "Games",
      minimumOsVersion: "15.0",
      appVersion: "1.6.0",
      appStoreJson: storeJson(),
      fetchedAt: "2026-11-23T02:00:00.000Z",
    },
    {
      targetDate: "2026-11-22",
      team: "Alpha",
      lookupStatus: "bundle_not_found",
      enrichStatus: "pending",
      assetStatus: "skipped",
      category: null,
      minimumOsVersion: null,
      appVersion: null,
      appStoreJson: {},
      fetchedAt: "2026-11-22T02:00:00.000Z",
    },
  ];

  it("keeps exactly the whitelisted fields plus store for hits", () => {
    const history = compactPackageHistory({ packageCode: "com.example.funce", snapshots });

    expect(history.packageCode).toBe("com.example.funce");
    expect(Object.keys(history.snapshots[0]).sort()).toEqual([
      "appVersion",
      "assetStatus",
      "category",
      "enrichStatus",
      "lookupStatus",
      "minimumOsVersion",
      "store",
      "targetDate",
      "team",
    ]);
    expect(history.snapshots[0].store?.descriptionTruncated).toBe(true);
    expect(history.snapshots[0]).not.toHaveProperty("appStoreJson");
    expect(history.snapshots[0]).not.toHaveProperty("fetchedAt");
    expect(history.snapshots[1]).not.toHaveProperty("store");
  });
});
