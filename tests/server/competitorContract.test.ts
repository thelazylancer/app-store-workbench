import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/app";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import {
  getCompetitorDay,
  getCompetitorDays,
  getCompetitorPackage,
  getCompetitorPackageHistory,
  getCompetitorSummary,
} from "../../src/lib/competitorApi";
import type {
  DayDetail,
  DaySummary,
  PackageDetail,
  SnapshotEntry,
  SummaryGroup,
} from "../../shared/competitorTypes";

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

/**
 * Sends the browser client's relative fetch calls through the real Express
 * router, so a param-name or path mismatch fails here instead of in the page.
 */
function stubFetchToApp(app: ReturnType<typeof createApp>): void {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://workbench.local");
    const response = await request(app).get(`${url.pathname}${url.search}`);
    return new Response(JSON.stringify(response.body ?? null), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }));
}

const pkg: PackageDetail = {
  packageCode: "com.example.app",
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

const daySummary: DaySummary = {
  date: "2026-11-18",
  packageCount: 1,
  hitCount: 1,
  missCount: 0,
  batchStatus: "ok",
};

const group: SummaryGroup = {
  groupKey: "Alpha",
  packageCount: 1,
  hitCount: 1,
  missCount: 0,
  pendingCount: 0,
  competitorCount: 1,
  competitors: [{
    appleId: 123,
    name: "Real App",
    packageCount: 1,
    packages: [{
      packageCode: "com.example.app",
      displayName: "iOS-Example",
      team: "Alpha",
      appVersion: "1.2.3",
      iconLocalPath: "2026-11-18/com.example.app/icon.png",
      hasIap: true,
      versionCount: 2,
    }],
  }],
  missedPackages: [],
  pendingPackages: [],
  timeline: [{ date: "2026-11-18", packageCount: 1, hitCount: 1, missCount: 0, batchStatus: "ok" }],
};

const snapshot: SnapshotEntry = {
  targetDate: "2026-11-18",
  team: "Alpha",
  lookupStatus: "hit",
  enrichStatus: "ok",
  assetStatus: "ok",
  category: "Utilities",
  minimumOsVersion: "16.0",
  appVersion: "1.2.3",
  appStoreJson: { appleId: 123 },
  fetchedAt: "2026-11-18T02:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("competitor front-end/server contract", () => {
  it("routes every client call to the real handler with the declared parameters", async () => {
    const repo = emptyRepo();
    repo.getSummary = vi.fn(async () => [group]);
    repo.getDay = vi.fn(async (date, dateKind): Promise<DayDetail> => ({
      date, dateKind, batch: null, packages: [pkg],
    }));
    repo.listDays = vi.fn(async () => [daySummary]);
    repo.getPackage = vi.fn(async () => pkg);
    repo.getPackageHistory = vi.fn(async () => [snapshot]);
    stubFetchToApp(createApp({ ...baseDeps, competitorRepo: repo }));

    await expect(getCompetitorSummary("2026-11-18", "listing", "ios_version")).resolves.toEqual([group]);
    expect(repo.getSummary).toHaveBeenLastCalledWith("2026-11-18", "listing", "ios_version");

    await expect(getCompetitorSummary("2026-11-18", "first_ad", "team")).resolves.toEqual([group]);
    expect(repo.getSummary).toHaveBeenLastCalledWith("2026-11-18", "first_ad", "team");

    await expect(getCompetitorDay("2026-11-18", "listing")).resolves.toMatchObject({
      date: "2026-11-18", dateKind: "listing",
    });
    expect(repo.getDay).toHaveBeenLastCalledWith("2026-11-18", "listing");

    await expect(getCompetitorDays("2026-11-11", "2026-11-18")).resolves.toEqual([daySummary]);
    expect(repo.listDays).toHaveBeenLastCalledWith("2026-11-11", "2026-11-18");

    await expect(getCompetitorPackage("com.example.app")).resolves.toEqual(pkg);
    expect(repo.getPackage).toHaveBeenLastCalledWith("com.example.app");

    await expect(getCompetitorPackageHistory("com.example.app", "2026-11-11", "2026-11-18"))
      .resolves.toEqual([snapshot]);
    expect(repo.getPackageHistory).toHaveBeenLastCalledWith("com.example.app", "2026-11-11", "2026-11-18");
  });

  it("round-trips package codes with dots, dashes and underscores", async () => {
    const repo = emptyRepo();
    repo.getPackage = vi.fn(async () => pkg);
    repo.getPackageHistory = vi.fn(async () => []);
    stubFetchToApp(createApp({ ...baseDeps, competitorRepo: repo }));

    await getCompetitorPackage("com.example_team.app-hd");
    expect(repo.getPackage).toHaveBeenLastCalledWith("com.example_team.app-hd");

    await getCompetitorPackageHistory("com.example_team.app-hd", "2026-11-01", "2026-11-18");
    expect(repo.getPackageHistory).toHaveBeenLastCalledWith("com.example_team.app-hd", "2026-11-01", "2026-11-18");
  });

  it("maps the server's 404 and 503 responses to typed client errors", async () => {
    stubFetchToApp(createApp({ ...baseDeps, competitorRepo: emptyRepo() }));
    await expect(getCompetitorDay("2026-11-18", "first_ad")).rejects.toMatchObject({ status: 404 });
    await expect(getCompetitorPackage("com.example.missing")).rejects.toMatchObject({ status: 404 });

    vi.unstubAllGlobals();
    stubFetchToApp(createApp(baseDeps));
    await expect(getCompetitorSummary("2026-11-18", "first_ad", "team")).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("未配置数据库"),
    });
    await expect(getCompetitorDays("2026-11-11", "2026-11-18")).rejects.toMatchObject({ status: 503 });
  });

  it("reports a network failure as a client error without a status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const error = await getCompetitorPackage("com.example.app").catch((reason: unknown) => reason);
    expect(error).toMatchObject({ status: null, message: expect.stringContaining("网络请求失败") });
  });
});
