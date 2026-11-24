import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import type { ShelfQueryRepo } from "../../server/lib/shelfQueries";

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

  it("reports route validation failures as tool errors", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });
    const result = await callTool(app, "competitor_day", { date: "2026-13-40" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("HTTP 400");
  });
});
