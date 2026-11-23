import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { ShelfQueryRepo } from "../../server/lib/shelfQueries";
import type { ShelfPackagesResponse, ShelfTrendResponse } from "../../shared/shelfTypes";

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

const trendResponse: ShelfTrendResponse = {
  from: "2026-08-22",
  to: "2026-11-20",
  team: null,
  groupBy: "category",
  teams: ["Alpha", "Beta"],
  weeks: [
    {
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      packageCount: 42,
      groups: [{ key: "Games", count: 10 }, { key: "unknown", count: 3 }],
      teams: [{ key: "Alpha", count: 42 }],
    },
  ],
  totals: { packageCount: 93, groups: [{ key: "Games", count: 18 }, { key: "unknown", count: 17 }] },
};

const packagesResponse: ShelfPackagesResponse = {
  from: "2026-08-22",
  to: "2026-11-20",
  team: null,
  total: 2,
  limit: 200,
  rows: [
    {
      packageCode: "com.example.app",
      name: "Real App",
      team: "Alpha",
      targetDate: "2026-11-18",
      weekStart: "2026-11-16",
      category: "Games",
      minimumOsVersion: "16.0",
      appVersion: "2.3.1",
      iap: "yes",
      listingDate: "2026-11-15",
      offlineDate: null,
      resolved: true,
    },
    {
      packageCode: "com.example.missing",
      name: null,
      team: "Beta",
      targetDate: "2026-11-19",
      weekStart: "2026-11-16",
      category: null,
      minimumOsVersion: null,
      appVersion: null,
      iap: "unknown",
      listingDate: "2026-10-01",
      offlineDate: "2026-11-10",
      resolved: false,
    },
  ],
};

// Both camelCase and raw snake_case must never appear in a public response.
const SENSITIVE_FIELDS = [
  "displayName",
  "display_name",
  "firstAdDate",
  "first_ad_date",
  "lookupStatus",
  "lookup_status",
  "enrichStatus",
  "enrich_status",
  "assetStatus",
  "asset_status",
  "appStoreJson",
  "app_store_json",
  "sync",
  "snapshot",
  "batch",
  "stale",
];

function fakeRepo(): ShelfQueryRepo {
  return {
    getShelfTrend: vi.fn(async (params) => ({
      ...trendResponse,
      from: params.from,
      to: params.to,
      team: params.team,
      groupBy: params.groupBy,
    })),
    getShelfPackages: vi.fn(async (params) => ({
      ...packagesResponse,
      from: params.from,
      to: params.to,
      team: params.team,
      limit: params.limit,
    })),
  };
}

function expectNoSensitiveFields(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const field of SENSITIVE_FIELDS) {
    expect(serialized, `response leaked ${field}`).not.toContain(field);
  }
}

const trendUrl = "/api/public/shelf/trend?from=2026-08-22&to=2026-11-20";
const packagesUrl = "/api/public/shelf/packages?from=2026-08-22&to=2026-11-20";

describe("shelf HTTP contract", () => {
  it("returns the trend shape and defaults group_by to category", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });

    const response = await request(app.server).get(trendUrl);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(trendResponse);
    expect(repo.getShelfTrend).toHaveBeenCalledWith({
      from: "2026-08-22", to: "2026-11-20", team: null, groupBy: "category",
    });
    expectNoSensitiveFields(response.body);
  });

  it("passes team and group_by through, treating empty team as all", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });

    await request(app.server)
      .get("/api/public/shelf/trend?from=2026-08-22&to=2026-11-20&team=Alpha&group_by=iap")
      .expect(200);
    expect(repo.getShelfTrend).toHaveBeenLastCalledWith({
      from: "2026-08-22", to: "2026-11-20", team: "Alpha", groupBy: "iap",
    });

    await request(app.server)
      .get("/api/public/shelf/trend?from=2026-08-22&to=2026-11-20&team=&group_by=ios_version")
      .expect(200);
    expect(repo.getShelfTrend).toHaveBeenLastCalledWith({
      from: "2026-08-22", to: "2026-11-20", team: null, groupBy: "ios_version",
    });
  });

  it("returns package rows, defaults limit to 200 and keeps unresolved dates but nulls app fields", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });

    const response = await request(app.server).get(packagesUrl);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(packagesResponse);
    expect(repo.getShelfPackages).toHaveBeenCalledWith({
      from: "2026-08-22", to: "2026-11-20", team: null, limit: 200,
    });
    expect(response.body.rows[1]).toMatchObject({
      name: null,
      category: null,
      minimumOsVersion: null,
      appVersion: null,
      iap: "unknown",
      listingDate: "2026-10-01",
      offlineDate: "2026-11-10",
      resolved: false,
    });
    expectNoSensitiveFields(response.body);

    await request(app.server).get(`${packagesUrl}&limit=500`).expect(200);
    expect(repo.getShelfPackages).toHaveBeenLastCalledWith({
      from: "2026-08-22", to: "2026-11-20", team: null, limit: 500,
    });
    await request(app.server).get(`${packagesUrl}&limit=1`).expect(200);
  });

  it("rejects invalid parameters with the documented messages", async () => {
    const app = await createTestApp({ ...baseDeps, shelfQueries: fakeRepo() });
    const cases: Array<[string, string]> = [
      ["/api/public/shelf/trend?to=2026-11-20", "Valid from and to dates are required"],
      ["/api/public/shelf/trend?from=2026-11-20", "Valid from and to dates are required"],
      ["/api/public/shelf/trend?from=2026-02-30&to=2026-11-20", "Valid from and to dates are required"],
      ["/api/public/shelf/trend?from=2026-11-21&to=2026-11-20", "from must not be after to"],
      ["/api/public/shelf/trend?from=2025-01-01&to=2026-01-02", "Date range must not exceed 366 days"],
      ["/api/public/shelf/trend?from=2026-11-01&to=2026-11-20&group_by=team", "Unsupported group_by"],
      [`/api/public/shelf/trend?from=2026-11-01&to=2026-11-20&team=${"t".repeat(256)}`, "Unsupported team"],
      ["/api/public/shelf/packages?from=2026-11-01&to=2026-11-20&limit=0", "limit must be an integer between 1 and 500"],
      ["/api/public/shelf/packages?from=2026-11-01&to=2026-11-20&limit=501", "limit must be an integer between 1 and 500"],
      ["/api/public/shelf/packages?from=2026-11-01&to=2026-11-20&limit=abc", "limit must be an integer between 1 and 500"],
      ["/api/public/shelf/packages?from=2026-11-01&to=2026-11-20&limit=1.5", "limit must be an integer between 1 and 500"],
      ["/api/public/shelf/packages?from=2026-11-21&to=2026-11-20", "from must not be after to"],
      [`/api/public/shelf/packages?from=2026-11-01&to=2026-11-20&team=${"t".repeat(256)}`, "Unsupported team"],
    ];

    for (const [url, message] of cases) {
      const response = await request(app.server).get(url);
      expect(response.status, url).toBe(400);
      expect(response.body, url).toEqual({ message });
      expectNoSensitiveFields(response.body);
    }

    await request(app.server)
      .get("/api/public/shelf/trend?from=2025-01-01&to=2026-01-01")
      .expect(200);
  });

  it("returns 503 with the shelf message only when shelfQueries is missing", async () => {
    const app = await createTestApp(baseDeps);

    for (const url of [trendUrl, packagesUrl]) {
      const response = await request(app.server).get(url);
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ message: "Shelf data is unavailable" });
      expectNoSensitiveFields(response.body);
    }

    const unrelated = await request(app.server).get("/api/public/shelfx");
    expect(unrelated.status).toBe(404);

    const competitor = await request(app.server).get("/api/competitor/days?start=2026-11-01&end=2026-11-02");
    expect(competitor.status).toBe(503);
    expect(competitor.body).toEqual({ message: "Competitor data is unavailable" });
  });

  it("keeps the competitor 503 guard independent from the shelf repo", async () => {
    const app = await createTestApp({ ...baseDeps, shelfQueries: fakeRepo() });

    await request(app.server).get(trendUrl).expect(200);
    const competitor = await request(app.server).get("/api/competitor/days?start=2026-11-01&end=2026-11-02");
    expect(competitor.status).toBe(503);
    expect(competitor.body).toEqual({ message: "Competitor data is unavailable" });
  });

  it("maps repository failures to the documented 500 message", async () => {
    const repo = fakeRepo();
    repo.getShelfTrend = vi.fn(async () => { throw new Error("boom"); });
    repo.getShelfPackages = vi.fn(async () => { throw new Error("boom"); });
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });

    for (const url of [trendUrl, packagesUrl]) {
      const response = await request(app.server).get(url);
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: "Shelf query failed" });
      expectNoSensitiveFields(response.body);
    }
  });
});
