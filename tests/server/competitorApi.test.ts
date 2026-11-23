import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import type { DateKind, DayDetail, PackageDetail } from "../../shared/competitorTypes";

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

function emptyRepo(): CompetitorQueryRepo {
  return {
    listDays: async () => [],
    getDay: async () => null,
    getPackage: async () => null,
    getPackageHistory: async () => [],
    getSummary: async () => [],
    getBatch: async () => null,
  };
}

function packageDetail(packageCode = "com.example.app"): PackageDetail {
  return {
    packageCode,
    targetDate: "2026-11-18",
    displayName: "iOS-Example",
    team: "Alpha",
    firstAdDate: "2026-11-18",
    listingDate: "2026-11-01",
    first100Date: null,
    offlineDate: null,
    category: "Utilities",
    minimumOsVersion: "16.0",
    appVersion: "1.2.3",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    appleId: 123,
    appStoreJson: { appleId: 123, name: "Real App" },
    iconLocalPath: "2026-11-18/com.example.app/icon.png",
    screenshotLocalPaths: ["2026-11-18/com.example.app/1.png"],
    versions: [],
    fetchedAt: "2026-11-18T02:00:00.000Z",
  };
}

function day(date: string, dateKind: DateKind, pkg = packageDetail()): DayDetail {
  return { date, dateKind, batch: null, packages: [pkg] };
}

describe("competitor query API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports unavailability when no repository is configured", async () => {
    const app = await createTestApp(baseDeps);
    for (const path of [
      "/api/competitor/days?start=2026-11-01&end=2026-11-18",
      "/api/competitor/summary?date=2026-11-18",
      "/api/competitor/day/2026-11-18",
      "/api/competitor/package/com.example.app",
      "/api/competitor/batch/2026-11-18",
    ]) {
      const response = await request(app.server).get(path);
      expect(response.status, path).toBe(503);
    }
  });

  it("rejects malformed dates, date kinds and package codes before querying", async () => {
    const repo = emptyRepo();
    repo.listDays = vi.fn(repo.listDays);
    repo.getDay = vi.fn(repo.getDay);
    repo.getPackage = vi.fn(repo.getPackage);
    repo.getPackageHistory = vi.fn(repo.getPackageHistory);
    repo.getSummary = vi.fn(repo.getSummary);
    repo.getBatch = vi.fn(repo.getBatch);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    for (const path of [
      "/api/competitor/days",
      "/api/competitor/days?start=2026-11-01",
      "/api/competitor/days?start=2026-02-30&end=2026-03-01",
      "/api/competitor/days?start=2026-03-02&end=2026-03-01",
      "/api/competitor/summary",
      "/api/competitor/summary?date=2026-02-30",
      "/api/competitor/summary?date=2026-11-18&date_kind=weekly",
      "/api/competitor/summary?date=2026-11-18&group_by=country",
      "/api/competitor/summary?from=2026-11-01",
      "/api/competitor/summary?to=2026-11-18",
      "/api/competitor/summary?from=2026-11-19&to=2026-11-18",
      "/api/competitor/summary?from=2026-11-01&to=2026-12-02",
      "/api/competitor/summary?from=2026-02-30&to=2026-03-01",
      "/api/competitor/summary?from=bad&to=2026-11-18",
      "/api/competitor/summary?date=2026-11-18&from=2026-11-01&to=2026-11-18",
      "/api/competitor/day/not-a-date",
      "/api/competitor/day/2026-11-18?date_kind=weekly",
      "/api/competitor/day/2026-11-18?date_kind=listing&date_kind=first_ad",
      "/api/competitor/package/-leading",
      "/api/competitor/package/bad%20id",
      "/api/competitor/batch/2026-13-01",
    ]) {
      expect((await request(app.server).get(path)).status, path).toBe(400);
    }
    expect(repo.listDays).not.toHaveBeenCalled();
    expect(repo.getDay).not.toHaveBeenCalled();
    expect(repo.getPackage).not.toHaveBeenCalled();
    expect(repo.getPackageHistory).not.toHaveBeenCalled();
    expect(repo.getSummary).not.toHaveBeenCalled();
    expect(repo.getBatch).not.toHaveBeenCalled();
  });

  it("passes the selected date_kind through and returns different day data", async () => {
    const repo = emptyRepo();
    const getDay = vi.fn(async (date: string, dateKind: DateKind) => day(date, dateKind, {
      ...packageDetail(), displayName: dateKind === "listing" ? "Listed" : "Advertised",
    }));
    repo.getDay = getDay;
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const firstAd = await request(app.server).get("/api/competitor/day/2026-11-18");
    const listing = await request(app.server).get("/api/competitor/day/2026-11-18?date_kind=listing");

    expect(getDay.mock.calls).toEqual([
      ["2026-11-18", "first_ad"],
      ["2026-11-18", "listing"],
    ]);
    expect(firstAd.status).toBe(200);
    expect(firstAd.body).toMatchObject({ date: "2026-11-18", dateKind: "first_ad" });
    expect(firstAd.body.packages[0].displayName).toBe("Advertised");
    expect(listing.body).toMatchObject({ dateKind: "listing" });
    expect(listing.body.packages[0].displayName).toBe("Listed");
  });

  it("distinguishes empty results from missing data and keeps partial days readable", async () => {
    const repo = emptyRepo();
    repo.listDays = async () => [];
    repo.getDay = async (date, dateKind) => day(date, dateKind);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const days = await request(app.server).get("/api/competitor/days?start=2026-11-01&end=2026-11-18");
    expect(days.status).toBe(200);
    expect(days.body).toEqual({ days: [] });

    const partialDay = await request(app.server).get("/api/competitor/day/2026-11-18");
    expect(partialDay.status).toBe(200);
    expect(partialDay.body.batch).toBeNull();
    expect(partialDay.body.packages).toHaveLength(1);

    expect((await request(app.server).get("/api/competitor/package/com.example.missing")).status).toBe(404);
    expect((await request(app.server).get("/api/competitor/batch/2026-11-18")).status).toBe(404);
  });

  it("returns package assets and never exposes source credentials", async () => {
    vi.stubEnv("FIRST_DELIVERY_API_KEY", "super-secret-key");
    const repo = emptyRepo();
    repo.getPackage = async () => packageDetail();
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const response = await request(app.server).get("/api/competitor/package/com.example.app");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      packageCode: "com.example.app",
      iconLocalPath: "2026-11-18/com.example.app/icon.png",
      screenshotLocalPaths: ["2026-11-18/com.example.app/1.png"],
      appleId: 123,
    });
    expect(JSON.stringify(response.body)).not.toContain("super-secret-key");
    expect(JSON.stringify(response.body)).not.toContain("X-API-Key");
  });

  it("defaults summary scope and forwards date_kind and group_by", async () => {
    const group = {
      groupKey: "Alpha",
      packageCount: 2,
      hitCount: 1,
      missCount: 1,
      pendingCount: 0,
      competitorCount: 1,
      competitors: [{
        appleId: 123,
        name: "Real App",
        packageCount: 1,
        packages: [{
          packageCode: "com.example.app", displayName: "iOS-Example", team: "Alpha",
          appVersion: "1.0", offlineDate: null, iconLocalPath: "2026-11-18/com.example.app/icon.png",
          hasIap: true, versionCount: 3,
          earliestReleasedAt: null, latestReleasedAt: null,
        }],
      }],
      missedPackages: [{
        packageCode: "com.example.miss", displayName: "iOS-Miss", team: "Alpha",
        appVersion: null, offlineDate: null, iconLocalPath: null, hasIap: false, versionCount: 0,
        earliestReleasedAt: null, latestReleasedAt: null,
      }],
      pendingPackages: [],
      timeline: [{
        date: "2026-11-18", packageCount: 2, hitCount: 1, missCount: 1, batchStatus: "ok" as const,
      }],
    };
    const repo = emptyRepo();
    repo.getSummary = vi.fn(async () => [group]);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const defaults = await request(app.server).get("/api/competitor/summary?date=2026-11-18");
    expect(defaults.status).toBe(200);
    expect(defaults.body).toMatchObject({
      date: "2026-11-18", dateKind: "first_ad", groupBy: "team", pendingCount: 0, groups: [group],
    });
    expect(repo.getSummary).toHaveBeenNthCalledWith(1, "2026-11-18", "first_ad", "team");

    const custom = await request(app.server)
      .get("/api/competitor/summary?date=2026-11-18&date_kind=listing&group_by=ios_version");
    expect(custom.status).toBe(200);
    expect(custom.body).toMatchObject({ dateKind: "listing", groupBy: "ios_version" });
    expect(repo.getSummary).toHaveBeenNthCalledWith(2, "2026-11-18", "listing", "ios_version");
  });

  it("supports inclusive from/to ranges and forwards them to the repository", async () => {
    const repo = emptyRepo();
    repo.getSummary = vi.fn(async () => []);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const response = await request(app.server)
      .get("/api/competitor/summary?from=2026-11-01&to=2026-11-18&date_kind=listing&group_by=category");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      date: "2026-11-18", from: "2026-11-01", to: "2026-11-18",
      dateKind: "listing", groupBy: "category", pendingCount: 0, groups: [],
    });
    expect(repo.getSummary).toHaveBeenCalledWith("2026-11-18", "listing", "category", "2026-11-01");

    const max = await request(app.server).get("/api/competitor/summary?from=2026-11-01&to=2026-12-01");
    expect(max.status).toBe(200);
    expect(repo.getSummary).toHaveBeenLastCalledWith("2026-12-01", "first_ad", "team", "2026-11-01");
  });

  it("sums pendingCount across summary groups", async () => {
    const group = (groupKey: string, pendingCount: number) => ({
      groupKey,
      packageCount: pendingCount,
      hitCount: 0,
      missCount: 0,
      pendingCount,
      competitorCount: 0,
      competitors: [],
      missedPackages: [],
      pendingPackages: [],
      timeline: [],
    });
    const repo = emptyRepo();
    repo.getSummary = vi.fn(async () => [group("Alpha", 1), group("Beta", 2)]);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const response = await request(app.server).get("/api/competitor/summary?date=2026-11-18");

    expect(response.status).toBe(200);
    expect(response.body.pendingCount).toBe(3);
    expect(response.body.groups).toHaveLength(2);
  });

  it("returns ordered snapshot rows for an existing range and empty rows for missing dates", async () => {
    const repo = emptyRepo();
    repo.getPackageHistory = vi.fn(async () => [
      {
        targetDate: "2026-11-17", team: "Alpha", lookupStatus: "hit" as const,
        enrichStatus: "ok" as const, assetStatus: "ok" as const, category: "Utilities",
        minimumOsVersion: "16.0", appVersion: "1.0", appStoreJson: { appleId: 123 },
        fetchedAt: "2026-11-17T02:00:00.000Z",
      },
      {
        targetDate: "2026-11-18", team: "Alpha", lookupStatus: "hit" as const,
        enrichStatus: "ok" as const, assetStatus: "ok" as const, category: "Utilities",
        minimumOsVersion: "16.0", appVersion: "2.0", appStoreJson: { appleId: 123 },
        fetchedAt: "2026-11-18T02:00:00.000Z",
      },
    ]);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const response = await request(app.server)
      .get("/api/competitor/package/com.example.app/history?from=2026-11-17&to=2026-11-18");
    expect(response.status).toBe(200);
    expect(response.body.packageCode).toBe("com.example.app");
    expect(response.body.snapshots.map((row: { targetDate: string }) => row.targetDate))
      .toEqual(["2026-11-17", "2026-11-18"]);
    expect(repo.getPackageHistory).toHaveBeenCalledWith("com.example.app", "2026-11-17", "2026-11-18");

    repo.getPackageHistory = async () => [];
    const empty = await request(app.server)
      .get("/api/competitor/package/com.example.app/history?from=2026-12-01&to=2026-12-02");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ packageCode: "com.example.app", snapshots: [] });
  });

  it("rejects malformed history ranges before querying", async () => {
    const repo = emptyRepo();
    repo.getPackageHistory = vi.fn(repo.getPackageHistory);
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    for (const path of [
      "/api/competitor/package/com.example.app/history",
      "/api/competitor/package/com.example.app/history?from=2026-11-18",
      "/api/competitor/package/com.example.app/history?from=2026-11-19&to=2026-11-18",
      "/api/competitor/package/com.example.app/history?from=2026-02-30&to=2026-03-01",
      "/api/competitor/package/-bad/history?from=2026-11-01&to=2026-11-18",
    ]) {
      expect((await request(app.server).get(path)).status, path).toBe(400);
    }
    expect(repo.getPackageHistory).not.toHaveBeenCalled();
  });

  it("hides repository failure details behind a generic 500", async () => {
    const repo = emptyRepo();
    repo.getPackage = async () => { throw new Error("password=leak"); };
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const response = await request(app.server).get("/api/competitor/package/com.example.app");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ message: "Competitor query failed" });
  });
});
