import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamableHTTPServerTransport as SdkTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createTestApp } from "./createTestApp";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import type {
  BatchRow,
  DayDetail,
  PackageDetail,
  SnapshotEntry,
} from "../../shared/competitorTypes";

// The /mcp route builds its transport inline, so the only non-invasive seam is
// mocking the SDK module. This file uses a transparent wrapper (default = real
// implementation) so the protocol tests below still exercise the real SDK; only
// the fallback tests override handleRequest. Pinned to @modelcontextprotocol/sdk 1.32.2.
type HandleRequestArgs = Parameters<SdkTransport["handleRequest"]>;

const { transportOverride } = vi.hoisted(() => ({
  transportOverride: {
    onHandleRequest: null as
      | null
      | ((req: unknown, res: unknown, body: unknown) => Promise<void>),
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js")
  >();
  class DelegatingTransport extends actual.StreamableHTTPServerTransport {
    override async handleRequest(
      req: HandleRequestArgs[0],
      res: HandleRequestArgs[1],
      parsedBody?: HandleRequestArgs[2],
    ): Promise<void> {
      if (transportOverride.onHandleRequest) {
        await transportOverride.onHandleRequest(req, res, parsedBody);
        return;
      }
      await super.handleRequest(req, res, parsedBody);
    }
  }
  return { ...actual, StreamableHTTPServerTransport: DelegatingTransport };
});

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

function emptyRepo(): CompetitorQueryRepo {
  return {
    listDays: async () => [], getDay: async () => null, getPackage: async () => null,
    getPackageHistory: async () => [], getSummary: async () => [], getBatch: async () => null,
    getCountryHits: async () => [],
  };
}

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

type RpcBody = { jsonrpc: "2.0"; id: number | string | object; method: string; params?: Record<string, unknown> };

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

// ---------------------------------------------------------------------------
// Independent fixtures (not copied from the backend test file).
// Real appStoreJson key names confirmed against the read-only 7001 payload.
// Volume fixture models the DESIGN §4.7 worst case: 28 hit packages, each with
// 5 IAP items and a description >=2000 chars. The real 2026-11-23 day has zero
// IAP items (~23KB, recorded as reference only), so the 5-IAP shape is the
// load-bearing dimension for the 32KB regression gate.
// ---------------------------------------------------------------------------
const DATE = "2026-11-23";
const LONG_DESCRIPTION = `QA-DESCRIPTION-${"z".repeat(2000)}`;
const SCREENSHOT_COUNT = 4;
const VERSION_COUNT = 7;
const IAP_COUNT = 5;
const WORST_CASE_BYTE_LIMIT = 32_800;

const BATCH: BatchRow = {
  targetDate: DATE,
  syncId: "qa-sync-1",
  snapshotId: "qa-snapshot-1",
  dataUpdatedAt: "2026-11-24T01:48:09.422Z",
  publishedAt: "2026-11-24T02:30:06.374Z",
  rangeComplete: true,
  stale: false,
  status: "ok",
  fetchedAt: "2026-11-24T03:37:28.609Z",
};

function storeJson(index: number, iapCount = 0): Record<string, unknown> {
  return {
    name: `QA App ${index}`,
    developer: `QA Developer ${index}`,
    appleId: 900_000 + index,
    bundleId: `com.example.qa${index}`,
    averageUserRating: 4.2,
    userRatingCount: 100 + index,
    price: 0,
    formattedPrice: "Free",
    currency: "USD",
    fileSizeBytes: 60_000_000 + index,
    minimumOsVersion: "15.0",
    appStoreUrl: `https://apps.apple.com/us/app/id${900_000 + index}`,
    iconUrl: `https://example.com/icon-${index}.png`,
    description: LONG_DESCRIPTION,
    screenshotUrls: Array.from({ length: SCREENSHOT_COUNT }, (_, k) => `https://example.com/shot-${index}-${k}.png`),
    category: "Education",
    iapItems: Array.from({ length: iapCount }, (_, k) => ({ name: `IAP ${index}-${k}`, price: `$${k}.99` })),
    versionHistory: Array.from({ length: VERSION_COUNT }, (_, k) => ({
      version: `1.${k}.0`,
      releasedAt: `2026-11-0${k + 1}T00:00:00Z`,
      notes: `release notes ${index}-${k}`,
    })),
    privacy: { groups: [], policyUrl: `https://example.com/privacy-${index}`, notCollected: true },
  };
}

function packageDetail(index: number, iapCount = 0): PackageDetail {
  return {
    packageCode: `com.example.qa${index}`,
    targetDate: DATE,
    displayName: `QA App ${index}`,
    team: ["Alpha", "Beta", "Gamma"][index % 3],
    firstAdDate: "2026-11-01",
    listingDate: null,
    first100Date: null,
    offlineDate: null,
    category: "Education",
    minimumOsVersion: "15.0",
    appVersion: "1.4.0",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    attribution: null,
    permissions: null,
    appleId: 900_000 + index,
    appStoreJson: storeJson(index, iapCount),
    iconLocalPath: `2026-11-23/com.example.qa${index}/icon.png`,
    screenshotLocalPaths: Array.from({ length: SCREENSHOT_COUNT }, (_, k) => `shot-${k}.png`),
    versions: Array.from({ length: VERSION_COUNT }, (_, k) => ({
      version: `1.${k}.0`,
      releasedAt: `2026-11-0${k + 1}T00:00:00Z`,
      notes: `release notes ${index}-${k}`,
      capturedAt: "2026-11-24T03:37:28.609Z",
    })),
    fetchedAt: "2026-11-24T03:37:28.609Z",
  };
}

const DAY: DayDetail = {
  date: DATE,
  dateKind: "first_ad",
  batch: BATCH,
  packages: Array.from({ length: 28 }, (_, index) => packageDetail(index, IAP_COUNT)),
};

const SNAPSHOTS: SnapshotEntry[] = [
  {
    targetDate: DATE,
    team: "Alpha",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    category: "Education",
    minimumOsVersion: "15.0",
    appVersion: "1.4.0",
    appStoreJson: storeJson(0, 6),
    fetchedAt: "2026-11-24T03:37:28.609Z",
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
    fetchedAt: "2026-11-22T03:00:00.000Z",
  },
];

type CompactPackageView = {
  packageCode: string; hasIcon: boolean; screenshotCount: number; versionCount: number;
  store?: Record<string, unknown>; latestVersions?: Array<Record<string, unknown>>; versionsTruncated?: boolean;
};
type CompactDayView = { date: string; dateKind: string; batch: BatchRow; packages: CompactPackageView[] };
type CompactHistoryView = { packageCode: string; snapshots: Array<Record<string, unknown>> };

function expectCompactGuards(text: string): void {
  expect(text).not.toContain("appStoreJson");
  expect(text).not.toContain("screenshotLocalPaths");
  expect(text).not.toContain("versionHistory");
  expect(text).not.toContain('"descriptionTruncated":false');
}

describe("MCP hardening QA", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    transportOverride.onHandleRequest = null;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    transportOverride.onHandleRequest = null;
    vi.restoreAllMocks();
  });

  // 1. Volume acceptance, measured through the real MCP protocol.
  // Worst case per DESIGN §4.7: 28 hit packages x 5 IAP x >=2000-char description.
  it("keeps the 28-package worst case under 32800 bytes and drops raw store payloads", async () => {
    const app = await createTestApp({
      ...baseDeps,
      competitorRepo: { ...emptyRepo(), getDay: async () => DAY },
    });

    const compact = await callTool(app, "competitor_day", { date: DATE });
    expect(compact.isError).toBe(false);

    const bytes = Buffer.byteLength(compact.text, "utf8");
    console.info(`[qa] competitor_day compact worst-case content bytes: ${bytes}`);
    expect(bytes, `compact content was ${bytes} bytes`).toBeLessThanOrEqual(WORST_CASE_BYTE_LIMIT);
    expectCompactGuards(compact.text);

    const day = compact.data as CompactDayView;
    expect(day.date).toBe(DATE);
    expect(day.dateKind).toBe("first_ad");
    expect(day.batch).toEqual(BATCH);
    expect(day.packages).toHaveLength(28);

    for (const [index, pkg] of day.packages.entries()) {
      expect(pkg.packageCode).toBe(`com.example.qa${index}`);
      expect(typeof pkg.hasIcon).toBe("boolean");
      expect(typeof pkg.screenshotCount).toBe("number");
      expect(typeof pkg.versionCount).toBe("number");
      expect(pkg.hasIcon).toBe(true);
      expect(pkg.screenshotCount).toBe(SCREENSHOT_COUNT);
      expect(pkg.versionCount).toBe(VERSION_COUNT);
      expect(pkg.store).toBeDefined();
      expect(pkg.store?.description).toHaveLength(160);
      expect(pkg.store?.descriptionTruncated).toBe(true);
      expect(pkg.store?.iapItems).toHaveLength(IAP_COUNT);
      expect(pkg.store).not.toHaveProperty("iapItemsTruncated");
      expect(pkg.store).not.toHaveProperty("versionHistory");
      expect(pkg.store).not.toHaveProperty("screenshotUrls");
      expect(pkg).not.toHaveProperty("latestVersions");
    }
  });

  // 2. Escape hatch: same tool, compact: false returns the full route payload.
  it("returns appStoreJson and the full description when compact is false", async () => {
    const app = await createTestApp({
      ...baseDeps,
      competitorRepo: { ...emptyRepo(), getDay: async () => DAY },
    });

    const compact = await callTool(app, "competitor_day", { date: DATE });
    const full = await callTool(app, "competitor_day", { date: DATE, compact: false });

    expect(full.isError).toBe(false);
    expect(full.text).toContain('"appStoreJson"');
    expect(Buffer.byteLength(full.text, "utf8")).toBeGreaterThan(Buffer.byteLength(compact.text, "utf8"));

    const packages = (full.data as DayDetail).packages;
    expect(packages).toHaveLength(28);
    expect(packages[0].appStoreJson.description).toBe(LONG_DESCRIPTION);
    expect(packages[0].screenshotLocalPaths).toHaveLength(SCREENSHOT_COUNT);
    expect(packages[0].versions).toHaveLength(VERSION_COUNT);
    expect(packages[0].fetchedAt).toBe("2026-11-24T03:37:28.609Z");
  });

  // 3. competitor_package / competitor_package_history default field contracts.
  it("projects package and history with the documented field sets", async () => {
    const pkg = packageDetail(0, 6);
    const app = await createTestApp({
      ...baseDeps,
      competitorRepo: {
        ...emptyRepo(),
        getPackage: async () => pkg,
        getPackageHistory: async () => SNAPSHOTS,
      },
    });

    const detail = await callTool(app, "competitor_package", { packageCode: pkg.packageCode });
    expect(detail.isError).toBe(false);
    expectCompactGuards(detail.text);

    const compactPackage = detail.data as CompactPackageView & {
      latestVersions: Array<Record<string, unknown>>;
      versionsTruncated: boolean;
    };
    expect(Object.keys(compactPackage).sort()).toEqual([
      "appleId", "appVersion", "assetStatus", "attribution", "category", "displayName", "enrichStatus",
      "firstAdDate", "hasIcon", "latestVersions", "listingDate", "lookupStatus", "minimumOsVersion", "permissions",
      "offlineDate", "packageCode", "screenshotCount", "store", "targetDate", "team", "versionCount",
      "versionsTruncated",
    ].sort());

    expect(compactPackage.latestVersions).toHaveLength(5);
    expect(compactPackage.latestVersions[0]).toEqual({ version: "1.0.0", releasedAt: "2026-11-01T00:00:00Z" });
    for (const version of compactPackage.latestVersions) {
      expect(Object.keys(version).sort()).toEqual(["releasedAt", "version"]);
    }
    expect(compactPackage.versionsTruncated).toBe(true);
    expect(compactPackage.versionCount).toBe(VERSION_COUNT);

    expect(Object.keys(compactPackage.store ?? {}).sort()).toEqual([
      "averageUserRating", "currency", "description", "descriptionTruncated", "developer",
      "formattedPrice", "iapItems", "iapItemsTruncated", "name", "privacy", "userRatingCount",
    ].sort());
    expect(compactPackage.store?.iapItems).toHaveLength(5);

    const historyArgs = { packageCode: pkg.packageCode, from: "2026-11-22", to: DATE };
    const history = await callTool(app, "competitor_package_history", historyArgs);
    expect(history.isError).toBe(false);
    expect(history.text).not.toContain("appStoreJson");
    expect(history.text).not.toContain("fetchedAt");

    const snapshots = (history.data as CompactHistoryView).snapshots;
    expect(snapshots).toHaveLength(2);
    const historyKeys = [
      "appVersion", "assetStatus", "category", "enrichStatus", "lookupStatus",
      "minimumOsVersion", "targetDate", "team",
    ];
    expect(Object.keys(snapshots[0]).sort()).toEqual([...historyKeys, "store"].sort());
    expect(snapshots[0].store).toMatchObject({ descriptionTruncated: true });
    expect(Object.keys(snapshots[1]).sort()).toEqual(historyKeys.sort());
    expect(snapshots[1]).not.toHaveProperty("store");
  });

  // 4. search_apps batch limit.
  it("rejects 11 search queries without calling upstream and allows exactly 10", async () => {
    const lookup = vi.fn(async () => []);
    const app = await createTestApp({
      ...baseDeps,
      lookupAppStore: lookup,
      competitorRepo: emptyRepo(),
    });

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

  // 5. /mcp transport failure fallback.
  describe("transport failure fallback", () => {
    it("writes a 500 JSON-RPC internal error and echoes a numeric id", async () => {
      transportOverride.onHandleRequest = async () => {
        throw new Error("transport exploded");
      };
      const app = await createTestApp(baseDeps);

      const response = await request(app.server).post("/mcp").send({
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: { name: "search_apps", arguments: {} },
      });

      expect(response.status).toBe(500);
      expect(String(response.headers["content-type"])).toContain("application/json");
      expect(response.body).toEqual({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal error" },
        id: 42,
      });
    });

    it("echoes a string id and nulls any other id shape", async () => {
      transportOverride.onHandleRequest = async () => {
        throw new Error("transport exploded");
      };
      const app = await createTestApp(baseDeps);

      const asString = await request(app.server).post("/mcp").send({
        jsonrpc: "2.0", id: "abc-1", method: "tools/call", params: { name: "search_apps", arguments: {} },
      });
      expect(asString.status).toBe(500);
      expect(asString.body.id).toBe("abc-1");

      transportOverride.onHandleRequest = async () => {
        throw new Error("transport exploded");
      };
      const asObject = await request(app.server).post("/mcp").send({
        jsonrpc: "2.0", id: { nested: true }, method: "tools/call", params: { name: "search_apps", arguments: {} },
      });
      expect(asObject.status).toBe(500);
      expect(asObject.body.id).toBeNull();
    });

    it("logs the error type and frames but never the request body", async () => {
      const sentinel = "QA-SENTINEL-908172";
      transportOverride.onHandleRequest = async () => {
        throw new Error(`transport failed with ${sentinel}`);
      };
      const app = await createTestApp(baseDeps);

      await request(app.server).post("/mcp").send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "ipa_download_submit_code", arguments: { id: sentinel, code: "123456" } },
      });

      const logged = errorSpy.mock.calls.flat().map((value: unknown) => String(value)).join(" ");
      expect(logged).toContain("Error");
      expect(logged).not.toContain(sentinel);
    });

    it("keeps GET and DELETE at 405 with allow: POST", async () => {
      const app = await createTestApp(baseDeps);

      const get = await request(app.server).get("/mcp").set("accept", "application/json, text/event-stream");
      expect(get.status).toBe(405);
      expect(get.headers.allow).toBe("POST");

      const del = await request(app.server).delete("/mcp").set("accept", "application/json, text/event-stream");
      expect(del.status).toBe(405);
      expect(del.headers.allow).toBe("POST");
    });
  });
});
