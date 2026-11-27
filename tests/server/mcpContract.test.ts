import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import type { ShelfQueryRepo } from "../../server/lib/shelfQueries";
import type { DayDetail, PackageDetail, SnapshotEntry } from "../../shared/competitorTypes";

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
    getCountryHits: async () => [],
  };
}

type RpcBody = { jsonrpc: "2.0"; id: number; method: string; params?: Record<string, unknown> };
type TestApp = Awaited<ReturnType<typeof createTestApp>>;

async function rpc(app: TestApp, body: RpcBody) {
  return request(app.server)
    .post("/mcp")
    .set("accept", "application/json, text/event-stream")
    .send(body);
}

async function callTool(app: TestApp, name: string, args: Record<string, unknown>) {
  const response = await rpc(app, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name, arguments: args },
  });
  expect(response.status).toBe(200);
  const result = response.body.result as { isError?: boolean; content: Array<{ text: string }> };
  const text = result.content[0]?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    data: result.isError ? null : (JSON.parse(text) as unknown),
  };
}

const DESCRIPTION = "A".repeat(300);

const APP_STORE_JSON: Record<string, unknown> = {
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
  description: DESCRIPTION,
  screenshotUrls: ["https://example.com/shot-1.png"],
  category: "Games",
  iapItems: Array.from({ length: 6 }, (_, index) => ({ name: `IAP ${index}`, price: "$0.99" })),
  versionHistory: Array.from({ length: 7 }, (_, index) => ({
    version: `1.${index}.0`,
    releasedAt: "2026-11-01T00:00:00.000Z",
    notes: `release notes ${index}`,
  })),
  privacy: { privacyPolicyUrl: "https://example.com/privacy" },
};

const PACKAGE: PackageDetail = {
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
  appStoreJson: APP_STORE_JSON,
  iconLocalPath: "com.example.funce/icon.png",
  screenshotLocalPaths: ["a.png", "b.png"],
  versions: Array.from({ length: 7 }, (_, index) => ({
    version: `1.${index}.0`,
    releasedAt: "2026-11-01T00:00:00.000Z",
    notes: `release notes ${index}`,
    capturedAt: "2026-11-23T02:00:00.000Z",
  })),
  fetchedAt: "2026-11-23T02:00:00.000Z",
};

const DAY: DayDetail = {
  date: "2026-11-23",
  dateKind: "first_ad",
  batch: {
    targetDate: "2026-11-23",
    syncId: "sync-1",
    snapshotId: "snap-1",
    dataUpdatedAt: "2026-11-23T01:00:00.000Z",
    publishedAt: "2026-11-23T01:05:00.000Z",
    rangeComplete: true,
    stale: false,
    status: "ok",
    fetchedAt: "2026-11-23T02:00:00.000Z",
  },
  packages: [PACKAGE],
};

const SNAPSHOTS: SnapshotEntry[] = [{
  targetDate: "2026-11-23",
  team: "Alpha",
  lookupStatus: "hit",
  enrichStatus: "ok",
  assetStatus: "ok",
  category: "Games",
  minimumOsVersion: "15.0",
  appVersion: "1.6.0",
  appStoreJson: APP_STORE_JSON,
  fetchedAt: "2026-11-23T02:00:00.000Z",
}];

describe("MCP over streamable HTTP", () => {
  it("initializes, lists every tool and serves a non-POST method with 405", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });

    const init = await rpc(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("app-store-workbench");

    const list = await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(list.status).toBe(200);
    const names = (list.body.result.tools as Array<{ name: string }>).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      "shelf_trend", "shelf_packages",
      "competitor_days", "competitor_day", "competitor_batch", "competitor_summary",
      "competitor_package", "competitor_package_history", "competitor_country_hits",
      "competitor_set_attribution", "competitor_set_permissions",
      "search_apps", "app_details",
      "ipa_download_start", "ipa_download_status", "ipa_download_submit_code", "ipa_download_cancel",
    ]));

    const get = await request(app.server).get("/mcp").set("accept", "application/json, text/event-stream");
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe("POST");
  });

  it("forwards tool arguments to the shared route logic", async () => {
    const repo = {
      ...emptyRepo(),
      getCountryHits: vi.fn(async () => [
        { country: "us" as const, status: "hit" as const, appleId: 123456, fetchedAt: "2026-11-20T02:00:00.000Z" },
      ]),
    } satisfies CompetitorQueryRepo;
    const shelfQueries: ShelfQueryRepo = {
      getShelfTrend: vi.fn(async () => ({ from: "2026-11-01", to: "2026-11-20", weeks: [] }) as never),
      getShelfPackages: vi.fn(async () => ({ packages: [] }) as never),
    };
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo, shelfQueries });

    const hits = await callTool(app, "competitor_country_hits", { packageCode: "com.example.app" });
    expect(hits.isError).toBe(false);
    expect(hits.data).toEqual({
      packageCode: "com.example.app",
      hits: [{ country: "us", status: "hit", appleId: 123456, fetchedAt: "2026-11-20T02:00:00.000Z" }],
    });
    expect(repo.getCountryHits).toHaveBeenCalledWith("com.example.app");

    const trend = await callTool(app, "shelf_trend", {
      from: "2026-11-01", to: "2026-11-20", team: "Alpha", group_by: "iap",
    });
    expect(trend.isError).toBe(false);
    expect(shelfQueries.getShelfTrend).toHaveBeenCalledWith({
      from: "2026-11-01", to: "2026-11-20", team: "Alpha", groupBy: "iap",
    });
  });

  it("forwards attribution updates through the shared route", async () => {
    const updateAttribution = vi.fn(async (entries: Array<{ packageCode: string }>) =>
      entries.map((entry) => entry.packageCode));
    const app = await createTestApp({
      ...baseDeps,
      competitorRepo: emptyRepo(),
      competitorWriter: { updateAttribution, updatePermissions: async () => [] },
    });

    const result = await callTool(app, "competitor_set_attribution", {
      updates: [{ packageCode: "com.example.funce", attribution: " AppsFlyer " }],
    });
    expect(result.isError).toBe(false);
    expect(updateAttribution).toHaveBeenCalledWith([
      { packageCode: "com.example.funce", attribution: "appsflyer" },
    ]);
    expect(result.data).toEqual({ updated: ["com.example.funce"], missing: [] });
  });

  it("forwards permission updates through the shared route", async () => {
    const updatePermissions = vi.fn(async (entries: Array<{ packageCode: string }>) =>
      entries.map((entry) => entry.packageCode));
    const app = await createTestApp({
      ...baseDeps,
      competitorRepo: emptyRepo(),
      competitorWriter: { updateAttribution: async () => [], updatePermissions },
    });

    const result = await callTool(app, "competitor_set_permissions", {
      updates: [{ packageCode: "com.example.funce", permissions: ["NSCameraUsageDescription", "NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"] }],
    });
    expect(result.isError).toBe(false);
    expect(updatePermissions).toHaveBeenCalledWith([
      {
        packageCode: "com.example.funce",
        permissions: ["NSCameraUsageDescription", "NSLocationWhenInUseUsageDescription"],
      },
    ]);
    expect(result.data).toEqual({ updated: ["com.example.funce"], missing: [] });
  });

  it("reports route validation failures as tool errors", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });
    const result = await callTool(app, "competitor_day", { date: "2026-13-40" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("HTTP 400");
  });

  it("returns compact competitor details by default and the full route payload with compact: false", async () => {
    const repo = {
      ...emptyRepo(),
      getDay: vi.fn(async () => DAY),
      getPackage: vi.fn(async () => PACKAGE),
      getPackageHistory: vi.fn(async () => SNAPSHOTS),
    } satisfies CompetitorQueryRepo;
    const app = await createTestApp({ ...baseDeps, competitorRepo: repo });

    const day = await callTool(app, "competitor_day", { date: "2026-11-23" });
    expect(day.isError).toBe(false);
    expect(day.text).not.toContain("appStoreJson");
    expect(day.text).not.toContain("screenshotLocalPaths");
    expect(day.text).not.toContain("versionHistory");
    expect(day.text).not.toContain('"descriptionTruncated":false');
    const compactPackages = (day.data as { packages: Array<Record<string, unknown>> }).packages;
    expect(typeof compactPackages[0].hasIcon).toBe("boolean");
    expect(typeof compactPackages[0].screenshotCount).toBe("number");
    expect(typeof compactPackages[0].versionCount).toBe("number");
    expect(compactPackages[0].versionCount).toBe(7);
    expect(compactPackages[0]).not.toHaveProperty("latestVersions");
    const dayStore = compactPackages[0].store as Record<string, unknown>;
    expect(dayStore.description).toHaveLength(160);
    expect(dayStore.descriptionTruncated).toBe(true);
    expect(dayStore).not.toHaveProperty("versionHistory");

    const fullDay = await callTool(app, "competitor_day", { date: "2026-11-23", compact: false });
    expect(fullDay.isError).toBe(false);
    expect(fullDay.text).toContain('"appStoreJson"');
    const fullPackages = (fullDay.data as { packages: Array<{ appStoreJson: { description: string } }> }).packages;
    expect(fullPackages[0].appStoreJson.description).toBe(DESCRIPTION);

    const pkg = await callTool(app, "competitor_package", { packageCode: "com.example.funce" });
    expect(pkg.isError).toBe(false);
    expect(pkg.text).not.toContain("appStoreJson");
    const compactPackage = pkg.data as { versionCount: number; latestVersions: unknown[]; versionsTruncated?: boolean };
    expect(compactPackage.versionCount).toBe(7);
    expect(compactPackage.latestVersions).toHaveLength(5);
    expect(compactPackage.versionsTruncated).toBe(true);

    const fullPackage = await callTool(app, "competitor_package", { packageCode: "com.example.funce", compact: false });
    expect(fullPackage.text).toContain('"appStoreJson"');

    const historyArgs = { packageCode: "com.example.funce", from: "2026-11-20", to: "2026-11-23" };
    const history = await callTool(app, "competitor_package_history", historyArgs);
    expect(history.isError).toBe(false);
    expect(history.text).not.toContain("appStoreJson");
    const compactSnapshots = (history.data as { snapshots: Array<Record<string, unknown>> }).snapshots;
    expect(compactSnapshots[0]).not.toHaveProperty("fetchedAt");
    expect(compactSnapshots[0].store).toMatchObject({ descriptionTruncated: true });

    const fullHistory = await callTool(app, "competitor_package_history", { ...historyArgs, compact: false });
    expect(fullHistory.text).toContain('"appStoreJson"');
  });

  it("rejects more than ten search queries before any upstream lookup", async () => {
    const lookup = vi.fn(async () => []);
    const app = await createTestApp({ ...baseDeps, lookupAppStore: lookup, competitorRepo: emptyRepo() });

    const eleven = Array.from({ length: 11 }, (_, index) => ({ name: `Query ${index}` }));
    const overLimit = await callTool(app, "search_apps", { queries: eleven });
    expect(overLimit.isError).toBe(true);
    expect(overLimit.text).toContain("上限 10");
    expect(overLimit.text).toContain("11");
    expect(lookup).not.toHaveBeenCalled();

    const ten = Array.from({ length: 10 }, (_, index) => ({ name: `Query ${index}` }));
    const atLimit = await callTool(app, "search_apps", { queries: ten });
    expect(atLimit.isError).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(10);
  });
});
