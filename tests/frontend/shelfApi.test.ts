import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppDependencies } from "../../server/app";
import type { ShelfQueryRepo, ShelfTrendParams, ShelfPackagesParams } from "../../server/lib/shelfQueries";
import { getShelfPackages, getShelfTrend, ShelfApiError } from "../../src/lib/shelfApi";
import { createTestApp } from "../server/createTestApp";

const baseDeps: AppDependencies = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" }),
};

function fakeRepo() {
  const getShelfTrend = vi.fn(async (params: ShelfTrendParams) => ({
    from: params.from,
    to: params.to,
    team: params.team,
    groupBy: params.groupBy,
    teams: ["团队 A", "团队 B"],
    weeks: [],
    totals: { packageCount: 0, groups: [] },
    distributions: { category: [], ios_version: [], iap: [] },
    teamWeekStats: [],
  }));
  const getShelfPackages = vi.fn(async (params: ShelfPackagesParams) => ({
    from: params.from,
    to: params.to,
    team: params.team,
    total: 0,
    limit: params.limit,
    rows: [],
  }));
  return { getShelfTrend, getShelfPackages } satisfies ShelfQueryRepo;
}

/** Route the browser's relative fetch calls through the real Fastify app. */
function stubFetchToApp(app: Awaited<ReturnType<typeof createTestApp>>): void {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://workbench.local");
    const response = await request(app.server).get(`${url.pathname}${url.search}`);
    return new Response(JSON.stringify(response.body ?? null), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shelf API", () => {
  it("omits an empty team and round-trips from/to/group_by", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });
    stubFetchToApp(app);

    const trend = await getShelfTrend({
      from: "2026-08-22",
      to: "2026-11-20",
      team: null,
      groupBy: "ios_version",
    });

    expect(trend.groupBy).toBe("ios_version");
    expect(repo.getShelfTrend).toHaveBeenCalledWith({
      from: "2026-08-22",
      to: "2026-11-20",
      team: null,
      groupBy: "ios_version",
    });
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).not.toContain("team=");
  });

  it("passes a selected team and the package limit through", async () => {
    const repo = fakeRepo();
    const app = await createTestApp({ ...baseDeps, shelfQueries: repo });
    stubFetchToApp(app);

    await getShelfTrend({ from: "2026-08-22", to: "2026-11-20", team: "团队 A", groupBy: "category" });
    expect(repo.getShelfTrend).toHaveBeenCalledWith({
      from: "2026-08-22",
      to: "2026-11-20",
      team: "团队 A",
      groupBy: "category",
    });

    await getShelfPackages({ from: "2026-08-22", to: "2026-11-20", team: null });
    expect(repo.getShelfPackages).toHaveBeenCalledWith({
      from: "2026-08-22",
      to: "2026-11-20",
      team: null,
      limit: 200,
    });

    await getShelfPackages({ from: "2026-08-22", to: "2026-11-20", team: "团队 A", limit: 50 });
    expect(repo.getShelfPackages).toHaveBeenLastCalledWith({
      from: "2026-08-22",
      to: "2026-11-20",
      team: "团队 A",
      limit: 50,
    });
  });

  it("maps a 503 response to the shelf-specific message", async () => {
    const app = await createTestApp(baseDeps);
    stubFetchToApp(app);

    const error = await getShelfTrend({
      from: "2026-08-22",
      to: "2026-11-20",
      team: null,
      groupBy: "category",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ShelfApiError);
    expect(error).toMatchObject({
      status: 503,
      message: "竞品趋势暂不可用：服务端未配置数据库",
    });
  });

  it("maps network failures to a status-less ShelfApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));

    const error = await getShelfPackages({
      from: "2026-08-22",
      to: "2026-11-20",
      team: null,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ShelfApiError);
    expect(error).toMatchObject({
      status: null,
      message: "网络请求失败，请检查服务是否可用",
    });
  });
});
