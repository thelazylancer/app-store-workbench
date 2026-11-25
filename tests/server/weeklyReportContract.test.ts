import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import { addWeeks, isoWeekStart } from "../../server/lib/weeklyReport";
import type { WeeklyReportRepo } from "../../server/lib/weeklyReport";
import type { WeeklyReportResponse } from "../../shared/weeklyReportTypes";
import { createTestApp } from "./createTestApp";

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

// The weekly route never touches the daily repo; an empty stub is enough.
const competitorRepo = {} as CompetitorQueryRepo;

const bucket = (key: string, label: string, count: number, share: number) => ({ key, label, count, share });

const reportResponse: WeeklyReportResponse = {
  weekStart: "2026-11-16",
  weekEnd: "2026-11-22",
  latestCompleteWeek: "2026-11-16",
  generatedAt: "2026-11-24T01:00:00.000Z",
  summary: {
    resolvedPackages: 52,
    ingestedPackages: 112,
    unresolvedPackages: 60,
    teamCount: 2,
    previousResolvedPackages: 50,
    change: 2,
    changePct: 0.04,
    resolvedRate: 52 / 112,
    batchStatus: "ok",
    dataThrough: "2026-11-23",
  },
  teams: [
    {
      team: "Alpha",
      rank: 1,
      resolvedPackages: 30,
      previousResolvedPackages: 28,
      change: 2,
      changePct: 2 / 28,
      share: 30 / 52,
      versionCounts: [
        bucket("1", "1 个版本", 5, 5 / 30),
        bucket("2", "2 个版本", 20, 20 / 30),
        bucket("3", "3 个版本", 4, 4 / 30),
        bucket("4+", "4+ 个版本", 1, 1 / 30),
        bucket("0", "无记录", 0, 0),
      ],
      topCategories: [bucket("Utilities", "Utilities", 12, 12 / 30)],
      iap: { yes: 6, no: 24, yesShare: 6 / 30 },
      topIos: bucket("16", "16", 18, 18 / 30),
      topPrivacies: [bucket("own", "自有域名", 20, 20 / 30)],
    },
    {
      team: "Beta",
      rank: 2,
      resolvedPackages: 22,
      previousResolvedPackages: 22,
      change: 0,
      changePct: 0,
      share: 22 / 52,
      versionCounts: [
        bucket("1", "1 个版本", 2, 2 / 22),
        bucket("2", "2 个版本", 16, 16 / 22),
        bucket("3", "3 个版本", 2, 2 / 22),
        bucket("4+", "4+ 个版本", 2, 2 / 22),
        bucket("0", "无记录", 0, 0),
      ],
      topCategories: [bucket("Lifestyle", "Lifestyle", 10, 10 / 22)],
      iap: { yes: 1, no: 21, yesShare: 1 / 22 },
      topIos: null,
      topPrivacies: [],
    },
  ],
  versionCounts: [
    bucket("1", "1 个版本", 7, 7 / 52),
    bucket("2", "2 个版本", 36, 36 / 52),
    bucket("3", "3 个版本", 6, 6 / 52),
    bucket("4+", "4+ 个版本", 3, 3 / 52),
    bucket("0", "无记录", 0, 0),
  ],
  distributions: {
    category: [bucket("Utilities", "Utilities", 14, 14 / 52), bucket("unknown", "未知", 1, 1 / 52)],
    ios: [bucket("16", "16", 18, 18 / 52), bucket("unknown", "未知", 2, 2 / 52)],
    iap: [bucket("no", "无", 45, 45 / 52), bucket("yes", "有", 7, 7 / 52)],
    privacy: [bucket("own", "自有域名", 30, 30 / 52), bucket("unknown", "未知", 2, 2 / 52)],
  },
  trends: {
    weeks: [
      { weekStart: "2026-10-26", weekEnd: "2026-11-01", resolvedPackages: 0, ingestedPackages: 0, dataSufficient: false },
      { weekStart: "2026-11-02", weekEnd: "2026-11-08", resolvedPackages: 18, ingestedPackages: 30, dataSufficient: true },
      { weekStart: "2026-11-09", weekEnd: "2026-11-15", resolvedPackages: 50, ingestedPackages: 90, dataSufficient: true },
      { weekStart: "2026-11-16", weekEnd: "2026-11-22", resolvedPackages: 52, ingestedPackages: 112, dataSufficient: true },
    ],
    metrics: [
      {
        key: "avgVersionGapDays",
        title: "平均版本间隔（天）",
        points: [{ weekStart: "2026-11-16", team: "Alpha", value: 8.5, packageCount: 30, offlineCount: 0 }],
        overall: [{ weekStart: "2026-11-16", value: 8.5, packageCount: 52, offlineCount: 0 }],
      },
      {
        key: "avgLatestVersionToAdDays",
        title: "最新版本→投放（天）",
        points: [{ weekStart: "2026-11-16", team: "Alpha", value: 7.2, packageCount: 30, offlineCount: 0 }],
        overall: [{ weekStart: "2026-11-16", value: 7.2, packageCount: 52, offlineCount: 0 }],
      },
      {
        key: "avgAdToOfflineDays",
        title: "投放→下架（天）",
        points: [{ weekStart: "2026-11-16", team: "Alpha", value: 0, packageCount: 30, offlineCount: 0 }],
        overall: [{ weekStart: "2026-11-16", value: 0, packageCount: 52, offlineCount: 0 }],
      },
    ],
  },
  highlights: [
    {
      kind: "team_change", team: "大容", direction: "up",
      change: 4, changePct: 1, current: 8, previous: 4,
    },
    {
      kind: "category_change", category: "Productivity", direction: "down",
      currentShare: 0.096, previousShare: 0.2, deltaPp: -10.4,
    },
  ],
};

function fakeRepo(overrides: Partial<WeeklyReportRepo> = {}): WeeklyReportRepo {
  return {
    latestCompleteDataWeek: vi.fn(async () => "2026-11-09"),
    getWeeklyReport: vi.fn(async (weekStart: string) => ({ ...reportResponse, weekStart })),
    ...overrides,
  };
}

// `batchStatus` is whitelisted below; the rest must never leave the server.
const SENSITIVE_FIELDS = [
  "displayName", "display_name",
  "firstAdDate", "first_ad_date",
  "lookupStatus", "lookup_status",
  "enrichStatus", "enrich_status",
  "assetStatus", "asset_status",
  "appStoreJson", "app_store_json",
  "sync", "snapshot", "stale",
];

function expectNoSensitiveFields(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const field of SENSITIVE_FIELDS) {
    expect(serialized, `response leaked ${field}`).not.toContain(field);
  }
}

describe("weekly report HTTP contract", () => {
  it("returns the full report and normalizes a Sunday week to its Monday", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, competitorRepo, weeklyReport: repo });

    const response = await request(app.server).get("/api/competitor/weekly-report?week=2026-11-22");

    expect(response.status).toBe(200);
    expect(repo.getWeeklyReport).toHaveBeenCalledWith("2026-11-16");
    expect(response.body).toEqual(reportResponse);
    expect(response.body.latestCompleteWeek).toBe("2026-11-16");
    expectNoSensitiveFields(response.body);
    expect(["ok", "partial", "failed"]).toContain(response.body.summary.batchStatus);
    expect(response.body.summary.dataThrough).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.body.trends.weeks).toHaveLength(4);
  });

  it("defaults to the latest complete data week", async () => {
    const latest = vi.fn(async (_today: string) => "2026-11-09");
    const repo = fakeRepo({ latestCompleteDataWeek: latest });
    const app = await createTestApp({ ...baseDeps, competitorRepo, weeklyReport: repo });

    const response = await request(app.server).get("/api/competitor/weekly-report");

    expect(response.status).toBe(200);
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]![0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(repo.getWeeklyReport).toHaveBeenCalledWith("2026-11-09");
  });

  it("falls back to the last complete week when no data week exists", async () => {
    const latest = vi.fn(async (_today: string) => null as string | null);
    const repo = fakeRepo({ latestCompleteDataWeek: latest });
    const app = await createTestApp({ ...baseDeps, competitorRepo, weeklyReport: repo });

    await request(app.server).get("/api/competitor/weekly-report").expect(200);

    const today = latest.mock.calls[0]![0];
    expect(repo.getWeeklyReport).toHaveBeenCalledWith(addWeeks(isoWeekStart(today), -1));
  });

  it("accepts a future week as an empty state instead of rejecting it", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, competitorRepo, weeklyReport: repo });

    const response = await request(app.server).get("/api/competitor/weekly-report?week=2099-01-05");

    expect(response.status).toBe(200);
    expect(repo.getWeeklyReport).toHaveBeenCalledWith(isoWeekStart("2099-01-05"));
  });

  it("rejects malformed week values with the documented 400", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo, weeklyReport: fakeRepo() });

    for (const week of ["abc", "2026-13-99", "2026-02-30", ""]) {
      const response = await request(app.server).get(`/api/competitor/weekly-report?week=${week}`);
      expect(response.status, week).toBe(400);
      expect(response.body).toEqual({ message: "A valid week is required" });
      expectNoSensitiveFields(response.body);
    }
  });

  it("returns 503 consistently when either dependency is missing", async () => {
    const missingWeekly = await createTestApp({ ...baseDeps, competitorRepo });
    const bothMissing = await createTestApp(baseDeps);

    for (const app of [missingWeekly, bothMissing]) {
      const response = await request(app.server).get("/api/competitor/weekly-report");
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ message: "Competitor data is unavailable" });
      expectNoSensitiveFields(response.body);
    }
  });

  it("maps repository failures to the documented 500", async () => {
    const queryFailure = await createTestApp({
      ...baseDeps,
      competitorRepo,
      weeklyReport: fakeRepo({ getWeeklyReport: vi.fn(async () => { throw new Error("boom"); }) }),
    });
    const defaultWeekFailure = await createTestApp({
      ...baseDeps,
      competitorRepo,
      weeklyReport: fakeRepo({ latestCompleteDataWeek: vi.fn(async () => { throw new Error("boom"); }) }),
    });

    for (const url of [
      "/api/competitor/weekly-report?week=2026-11-22",
      "/api/competitor/weekly-report",
    ]) {
      const app = url.includes("week=") ? queryFailure : defaultWeekFailure;
      const response = await request(app.server).get(url);
      expect(response.status, url).toBe(500);
      expect(response.body).toEqual({ message: "Competitor query failed" });
      expectNoSensitiveFields(response.body);
    }
  });
});
