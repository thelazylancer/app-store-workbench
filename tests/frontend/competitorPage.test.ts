import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderPackageDetail } from "../../src/competitor/renderPackageDetail";
import type {
  DayDetail,
  LookupStatus,
  PackageDetail,
  SnapshotEntry,
  SummaryGroup,
  TimelinePoint,
} from "../../shared/competitorTypes";

function yesterdayUtc(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function addDays(date: string, delta: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

const DATE = yesterdayUtc();

function packageDetail(overrides: Partial<PackageDetail> & { packageCode: string }): PackageDetail {
  return {
    targetDate: DATE,
    displayName: overrides.packageCode,
    team: "团队 A",
    firstAdDate: DATE,
    listingDate: "2026-10-01",
    first100Date: null,
    offlineDate: null,
    category: "游戏",
    minimumOsVersion: "15.0",
    appVersion: "1.0.0",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    appleId: 111,
    appStoreJson: {
      appleId: 111,
      trackName: "Alpha App",
      averageUserRating: 4.6,
      formattedPrice: "免费",
      iapItems: [
        { name: "高级版", price: "$4.99" },
        { name: "去广告", price: "$1.99" },
      ],
    },
    iconLocalPath: `${DATE}/com.alpha.ios/icon.png`,
    screenshotLocalPaths: [`${DATE}/com.alpha.ios/1.png`, `${DATE}/com.alpha.ios/2.png`],
    versions: [
      { version: "1.0.0", releasedAt: "2026-11-10", notes: "修复若干问题", capturedAt: `${DATE}T02:00:00.000Z` },
    ],
    fetchedAt: `${DATE}T02:00:00.000Z`,
    ...overrides,
  };
}

const alpha = packageDetail({ packageCode: "com.alpha.ios" });
const alphaHd = packageDetail({
  packageCode: "com.alpha.ios.hd",
  iconLocalPath: `${DATE}/com.alpha.ios.hd/icon.png`,
  screenshotLocalPaths: [],
});
const missed = packageDetail({
  packageCode: "com.beta.s",
  displayName: "Beta Source",
  team: "团队 A",
  lookupStatus: "bundle_not_found",
  enrichStatus: "failed",
  assetStatus: "pending",
  appleId: null,
  appStoreJson: {},
  iconLocalPath: null,
  screenshotLocalPaths: [],
  versions: [],
});
const gamma = packageDetail({
  packageCode: "com.gamma.ios",
  displayName: "Gamma Source",
  team: "团队 B",
  category: "工具",
  minimumOsVersion: "16.0",
  appleId: 222,
  appStoreJson: { appleId: 222, trackName: "Gamma App" },
  iconLocalPath: `${DATE}/com.gamma.ios/icon.png`,
  screenshotLocalPaths: [],
});

const day: DayDetail = {
  date: DATE,
  dateKind: "first_ad",
  batch: {
    targetDate: DATE,
    syncId: "sync-1",
    snapshotId: "snap-1",
    dataUpdatedAt: `${DATE}T01:00:00.000Z`,
    publishedAt: `${DATE}T01:10:00.000Z`,
    rangeComplete: true,
    stale: false,
    status: "ok",
    fetchedAt: `${DATE}T02:00:00.000Z`,
  },
  packages: [alpha, alphaHd, missed, gamma],
};

function timeline(counts: number[] = [4, 3, 4, 2, 4, 4, 4]): TimelinePoint[] {
  return counts.map((packageCount, index) => ({
    date: addDays(DATE, index - 6),
    packageCount,
    hitCount: Math.max(0, packageCount - 1),
    missCount: packageCount > 0 ? 1 : 0,
    batchStatus: "ok",
  }));
}

function teamGroups(): SummaryGroup[] {
  return [
    {
      groupKey: "团队 A",
      packageCount: 3,
      hitCount: 2,
      missCount: 1,
      pendingCount: 2,
      competitorCount: 2,
      competitors: [{
        appleId: 111,
        name: "Alpha App",
        packageCount: 2,
        packages: [
          { packageCode: "com.alpha.ios", displayName: "Alpha Source", team: "团队 A", appVersion: "1.0.0", iconLocalPath: alpha.iconLocalPath },
          { packageCode: "com.alpha.ios.hd", displayName: "Alpha HD", team: "团队 A", appVersion: "1.0.0", iconLocalPath: alphaHd.iconLocalPath },
        ],
      }],
      missedPackages: [{
        packageCode: "com.beta.s",
        displayName: "Beta Source",
        team: "团队 A",
        appVersion: null,
        iconLocalPath: null,
      }],
      pendingPackages: [],
      timeline: timeline(),
    },
    {
      groupKey: "团队 B",
      packageCount: 1,
      hitCount: 1,
      missCount: 0,
      pendingCount: 0,
      competitorCount: 1,
      competitors: [{
        appleId: 222,
        name: "Gamma App",
        packageCount: 1,
        packages: [{
          packageCode: "com.gamma.ios",
          displayName: "Gamma Source",
          team: "团队 B",
          appVersion: "1.0.0",
          iconLocalPath: gamma.iconLocalPath,
        }],
      }],
      missedPackages: [],
      pendingPackages: [],
      timeline: timeline([2, 2, 2, 1, 2, 2, 1]),
    },
  ];
}

function categoryGroups(): SummaryGroup[] {
  return [{
    groupKey: "游戏",
    packageCount: 4,
    hitCount: 3,
    missCount: 1,
    pendingCount: 2,
    competitorCount: 3,
    competitors: [
      {
        appleId: 111,
        name: "Alpha App",
        packageCount: 2,
        packages: [
          { packageCode: "com.alpha.ios", displayName: "Alpha Source", team: "团队 A", appVersion: "1.0.0", iconLocalPath: alpha.iconLocalPath },
          { packageCode: "com.alpha.ios.hd", displayName: "Alpha HD", team: "团队 A", appVersion: "1.0.0", iconLocalPath: alphaHd.iconLocalPath },
        ],
      },
      {
        appleId: 222,
        name: "Gamma App",
        packageCount: 1,
        packages: [{ packageCode: "com.gamma.ios", displayName: "Gamma Source", team: "团队 B", appVersion: "1.0.0", iconLocalPath: gamma.iconLocalPath }],
      },
    ],
    missedPackages: [{ packageCode: "com.beta.s", displayName: "Beta Source", team: "团队 A", appVersion: null, iconLocalPath: null }],
    pendingPackages: [],
    timeline: timeline(),
  }];
}

function listingGroups(): SummaryGroup[] {
  return [{
    groupKey: "上架口径组",
    packageCount: 2,
    hitCount: 2,
    missCount: 0,
    pendingCount: 0,
    competitorCount: 2,
    competitors: [
      {
        appleId: 111,
        name: "Alpha App",
        packageCount: 1,
        packages: [{ packageCode: "com.alpha.ios", displayName: "Alpha Source", team: "团队 A", appVersion: "1.0.0", iconLocalPath: alpha.iconLocalPath }],
      },
      {
        appleId: 222,
        name: "Gamma App",
        packageCount: 1,
        packages: [{ packageCode: "com.gamma.ios", displayName: "Gamma Source", team: "团队 B", appVersion: "1.0.0", iconLocalPath: gamma.iconLocalPath }],
      },
    ],
    missedPackages: [],
    pendingPackages: [],
    timeline: timeline([1, 2, 2, 2, 1, 2, 2]),
  }];
}

function snapshots(packageCode: string): SnapshotEntry[] {
  return [addDays(DATE, -2), DATE].map((date) => ({
    targetDate: date,
    team: "团队 A",
    lookupStatus: "hit" as const,
    enrichStatus: "ok" as const,
    assetStatus: "ok" as const,
    category: "游戏",
    minimumOsVersion: "15.0",
    appVersion: "1.0.0",
    appStoreJson: {},
    fetchedAt: `${date}T02:00:00.000Z`,
  }));
}

function createFetchMock() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url, "http://localhost");
    const path = parsed.pathname;

    if (path === "/api/competitor/summary") {
      const dateKind = parsed.searchParams.get("date_kind");
      const groupBy = parsed.searchParams.get("group_by");
      if (dateKind === "listing") return json(listingGroups());
      return json(groupBy === "category" ? categoryGroups() : teamGroups());
    }
    if (path.startsWith("/api/competitor/day/")) return json({
      ...day,
      dateKind: parsed.searchParams.get("date_kind") === "listing" ? "listing" : "first_ad",
    });
    if (path === "/api/competitor/days") {
      return json({
        days: Array.from({ length: 7 }, (_, index) => ({
          date: addDays(DATE, -index),
          packageCount: 4,
          hitCount: 3,
          missCount: 1,
          batchStatus: "ok",
        })),
      });
    }
    if (path.endsWith("/history")) {
      const packageCode = decodeURIComponent(path.split("/")[4] ?? "");
      return json({ packageCode, snapshots: snapshots(packageCode) });
    }
    if (path.startsWith("/api/competitor/package/")) {
      const packageCode = decodeURIComponent(path.split("/")[4] ?? "");
      return json([alpha, alphaHd, missed, gamma].find((pkg) => pkg.packageCode === packageCode) ?? alpha);
    }
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function mountPage(search = ""): Promise<void> {
  window.history.replaceState({}, "", `/competitor.html${search}`);
  document.body.innerHTML = '<div id="app"></div>';
  await import("../../src/competitor/main");
}

async function waitForRows(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('[data-role="competitor-row"]')).not.toBeNull();
  });
}

describe("competitor report page", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, "", "/");
    document.body.innerHTML = "";
  });

  it("renders the three-layer summary, aggregated competitor rows, missed packages and local icons", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await mountPage();
    await waitForRows();

    const rows = document.querySelectorAll('[data-role="competitor-row"]');
    expect(rows).toHaveLength(2);
    const alphaRow = document.querySelector<HTMLAnchorElement>('[data-competitor="apple:111"]')!;
    expect(alphaRow.textContent).toContain("Alpha App");
    expect(alphaRow.querySelector('[data-role="package-count"]')?.textContent).toBe("2 个包");
    expect(document.querySelectorAll('[data-package="com.alpha.ios"]')).toHaveLength(1);

    const groups = Array.from(document.querySelectorAll(".wx-group-head"));
    expect(groups[0]?.textContent).toContain("团队 A");
    expect(groups[0]?.textContent).toContain("3 包");
    expect(groups[0]?.textContent).toContain("命中 2 · 异常 3");
    expect(document.querySelector(".wx-list-head")).toBeNull();

    const missedRow = document.querySelector<HTMLAnchorElement>('[data-role="exception-row"][data-reason="miss"]')!;
    expect(missedRow.textContent).toContain("Beta Source");
    expect(missedRow.textContent).toContain("com.beta.s");
    expect(missedRow.textContent).toContain("App Store 未命中");

    const icon = alphaRow.querySelector<HTMLImageElement>(".wx-row-icon")!;
    expect(icon.src).toContain(`/competitor-assets/${DATE}/com.alpha.ios/icon.png`);

    expect(document.querySelector(".wx-day.is-main .wx-day-count")?.textContent).toBe("4");
    expect(document.querySelector('[data-role="status"][data-value="hit"]')?.textContent).toBe("命中 3");
    expect(document.querySelector('[data-role="stat-total"]')?.textContent).toBe("4");
    expect(document.querySelector('[data-role="stat-competitors"]')?.textContent).toBe("3");
    expect(document.querySelector('[data-role="stat-hit"]')?.textContent).toBe("3");
    expect(document.querySelector('[data-role="stat-exception"]')?.textContent).toBe("3");
    expect(document.querySelector('[data-role="week-total"]')?.textContent).toContain("近 7 天合计 28 包");
    expect(document.querySelector('[data-role="batch-summary"]')?.textContent).toContain(`批次正常 · 批次 ${DATE}`);
    expect(document.querySelectorAll(".wx-day")).toHaveLength(7);
    expect(document.querySelectorAll(".wx-day.is-main")).toHaveLength(1);
    expect(document.querySelector('[data-role="exceptions"]')).not.toBeNull();

    const firstDay = () => document.querySelector<HTMLButtonElement>(".wx-day")?.dataset.date;
    expect(firstDay()).toBe(addDays(DATE, -6));
    document.querySelector<HTMLButtonElement>('[data-role="forecast-prev"]')!.click();
    expect(firstDay()).toBe(addDays(DATE, -13));
    expect(document.querySelector('[data-role="forecast-caption"]')?.textContent).toContain(`${addDays(DATE, -13).slice(5)} — ${addDays(DATE, -7).slice(5)}`);
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => url.includes(`start=${addDays(DATE, -13)}`) && url.includes(`end=${addDays(DATE, -7)}`))).toBe(true);
    });
    document.querySelector<HTMLButtonElement>('[data-role="forecast-next"]')!.click();
    expect(firstDay()).toBe(addDays(DATE, -6));

    const requested = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requested.some((url) => url.includes("/api/competitor/summary?") && url.includes("date_kind=first_ad") && url.includes("group_by=team"))).toBe(true);
    expect(requested.some((url) => url.includes(`/api/competitor/day/${DATE}?date_kind=first_ad`))).toBe(true);

    const previousDate = addDays(DATE, -1);
    document.querySelector<HTMLButtonElement>(`[data-role="forecast-day"][data-date="${previousDate}"]`)!.click();
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => url.includes("from=") && url.includes("to="))).toBe(true);
    });
    expect(window.location.search).toContain(`from=${previousDate}`);
    expect(document.querySelectorAll(".wx-day.is-in-range")).toHaveLength(2);
  });

  it("switches date kind and grouping and sends matching query parameters", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await mountPage();
    await waitForRows();

    document.querySelector<HTMLButtonElement>('[data-role="date-kind"][data-value="listing"]')!.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("上架口径组");
    });

    document.querySelector<HTMLButtonElement>('[data-role="group-by"][data-value="category"]')!.click();
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("游戏");
    });
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => url.includes("date_kind=listing") && url.includes("group_by=category"))).toBe(true);
    });

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("date_kind=listing") && url.includes("group_by=team"))).toBe(true);

    document.querySelector<HTMLAnchorElement>('[data-competitor="apple:111"]')!.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="detail-view"]')?.textContent).toContain("上架日期口径");
    });
    expect(document.querySelector('[data-role="detail-view"]')?.textContent).not.toContain("投放日期口径");
  });

  it("opens a hit package detail with screenshots, versions and missing history dates", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await mountPage();
    await waitForRows();

    document.querySelector<HTMLAnchorElement>('[data-competitor="apple:111"]')!.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="detail-view"]')?.hasAttribute("hidden")).toBe(false);
      expect(document.querySelector(".competitor-screenshot-grid")).not.toBeNull();
    });

    expect(document.querySelector(".identity-title-row h2")?.textContent).toBe("Alpha App");
    expect(document.querySelector('[data-role="detail-view"]')?.textContent).toContain("投放日期口径");
    expect(document.querySelector('[data-role="detail-view"]')?.textContent).not.toContain("上架日期口径");
    expect(document.querySelectorAll(".competitor-screenshot-grid .screenshot")).toHaveLength(2);
    expect(document.querySelector(".competitor-screenshot-grid img")?.getAttribute("src")).toContain(`/competitor-assets/${DATE}/com.alpha.ios/1.png`);
    expect(document.querySelector(".version-history")?.textContent).toContain("版本历史（当日可见）");
    expect(document.body.textContent).toContain("1.0.0");

    expect(document.querySelector(".iap-section .detail-section-title")?.textContent).toBe("内购（2）");
    const iapRows = document.querySelectorAll(".iap-row");
    expect(iapRows).toHaveLength(2);
    expect(iapRows[0]?.textContent).toContain("高级版");
    expect(iapRows[0]?.textContent).toContain("$4.99");

    const missing = document.querySelectorAll(".history-row.is-missing");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]?.textContent).toContain("当天未入库");

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("/api/competitor/package/com.alpha.ios"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/competitor/package/com.alpha.ios/history?"))).toBe(true);
  });

  it("shows a missed package detail without App Store screenshots or versions", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    await mountPage();
    await waitForRows();

    document.querySelector<HTMLAnchorElement>('[data-role="exception-row"][data-reason="miss"]')!.click();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="detail-view"]')?.textContent).toContain("App Store 未命中");
    });

    const detail = document.querySelector('[data-role="detail-view"]');
    expect(detail?.textContent).toContain("App Store 未命中");
    expect(detail?.textContent).toContain("未命中，无 App Store 详情可展示。");
    expect(detail?.querySelector(".competitor-screenshot-grid")).toBeNull();
    expect(detail?.querySelector(".identity-icon-missed")).not.toBeNull();
    expect(detail?.querySelector<HTMLAnchorElement>('a[href*="index.html?bundle=com.beta.s"]')).not.toBeNull();
  });

  it("renders skipped assets as a normal state instead of a failure", () => {
    const host = document.createElement("div");
    document.body.append(host);
    renderPackageDetail(host, {
      competitor: {
        appleId: 111,
        name: "Alpha App",
        packageCount: 1,
        packages: [{
          packageCode: "com.alpha.ios",
          displayName: "Alpha Source",
          team: "团队 A",
          appVersion: "1.0.0",
          iconLocalPath: alpha.iconLocalPath,
        }],
      },
      packageCode: "com.alpha.ios",
      packageDetail: {
        ...alpha,
        assetStatus: "skipped",
        screenshotLocalPaths: [],
        versions: [],
      },
      date: DATE,
      dateKind: "first_ad",
      groupName: "团队 A",
      loading: false,
      error: null,
      history: [],
      historyError: null,
      historyDates: [DATE],
      packageStatus: new Map<string, LookupStatus>([["com.alpha.ios", "hit"]]),
      onSelectPackage: () => undefined,
      onRetry: () => undefined,
      onBack: () => undefined,
    });

    const text = host.textContent ?? "";
    expect(text).toContain("无需下载");
    expect(text).not.toContain("图片缺失");
  });

  it("shows a specific empty state when the API reports no snapshot for the date", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/competitor/day/")) {
        return json({ message: "No competitor data for this date" }, 404);
      }
      if (url.includes("/api/competitor/summary")) return json([]);
      return json({ days: [] });
    }));
    await mountPage();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="empty-day"]')).not.toBeNull();
    });
    expect(document.body.textContent).toContain("这一天还没有快照");
    expect(document.querySelectorAll('[data-role="competitor-row"]')).toHaveLength(0);
  });

  it("renders seven proportional forecast bars and turns a second click into a range", async () => {
    const counts = [0, 1, 2, 4, 3, 2, 7];
    const groups = listingGroups();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/competitor/summary") return json(groups);
      if (url.pathname.startsWith("/api/competitor/day/")) {
        return json({ ...day, dateKind: "listing" });
      }
      return json({
        days: counts.map((packageCount, index) => ({
          date: addDays(DATE, index - 6),
          packageCount,
          hitCount: packageCount,
          missCount: 0,
          batchStatus: null,
        })),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await mountPage(`?date=${DATE}&date_kind=listing&group_by=team`);
    await waitForRows();

    const cells = Array.from(document.querySelectorAll<HTMLButtonElement>(".wx-day"));
    expect(cells).toHaveLength(7);
    expect(cells[0]?.querySelector<HTMLElement>(".wx-bar")?.style.height).toBe("0px");
    expect(cells[3]?.querySelector<HTMLElement>(".wx-bar")?.style.height).toBe("64px");
    expect(cells[6]?.querySelector<HTMLElement>(".wx-bar")?.style.height).toBe("112px");
    expect(cells[6]?.classList.contains("is-main")).toBe(true);

    cells[5]!.click();
    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(urls.some((url) => url.includes("from=") && url.includes("to="))).toBe(true);
    });
    expect(document.querySelectorAll(".wx-day.is-in-range")).toHaveLength(2);
    expect(window.location.search).toContain(`from=${addDays(DATE, -1)}`);
  });

  it("filters locally by hit or exception and maps legacy status=miss to exception", async () => {
    const fetchMock = createFetchMock();
    vi.stubGlobal("fetch", fetchMock);
    await mountPage();
    await waitForRows();
    const callsBefore = fetchMock.mock.calls.length;

    document.querySelector<HTMLButtonElement>('[data-role="status"][data-value="exception"]')!.click();
    expect(document.querySelector('[data-competitor="apple:111"]')).toBeNull();
    expect(document.querySelector('[data-role="exception-row"][data-reason="miss"]')).not.toBeNull();
    expect(document.querySelector(".wx-group-head")).toBeNull();
    expect(window.location.search).toContain("status=exception");
    expect(fetchMock).toHaveBeenCalledTimes(callsBefore);

    document.querySelector<HTMLButtonElement>('[data-role="status"][data-value="hit"]')!.click();
    expect(document.querySelector('[data-role="exception-row"]')).toBeNull();
    expect(document.querySelector('[data-competitor="apple:111"]')).not.toBeNull();
    expect(window.location.search).toContain("status=hit");
  });

  it("treats legacy status=miss URLs as the exception filter", async () => {
    vi.stubGlobal("fetch", createFetchMock());
    await mountPage("?status=miss");
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="exception-row"][data-reason="miss"]')).not.toBeNull();
    });
    const active = document.querySelector<HTMLButtonElement>('[data-role="status"].is-active');
    expect(active?.dataset.value).toBe("exception");
    expect(document.querySelector('[data-role="exception-row"][data-reason="miss"]')).not.toBeNull();
  });

  it("lists a pending package in the exception zone with the pending reason", async () => {
    const pending = packageDetail({
      packageCode: "com.pending.ios",
      displayName: "Pending Source",
      lookupStatus: "pending",
      enrichStatus: "pending",
      assetStatus: "pending",
      appleId: null,
      appStoreJson: {},
      iconLocalPath: null,
      screenshotLocalPaths: [],
      versions: [],
    });
    const groups: SummaryGroup[] = [{
      groupKey: "团队 A",
      packageCount: 1,
      hitCount: 0,
      missCount: 0,
      pendingCount: 1,
      competitorCount: 0,
      competitors: [],
      missedPackages: [],
      pendingPackages: [],
      timeline: timeline([0, 0, 0, 0, 0, 0, 1]),
    }];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/competitor/summary") return json(groups);
      if (url.pathname.startsWith("/api/competitor/day/")) return json({ ...day, packages: [pending] });
      return json({ days: [] });
    }));
    await mountPage();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="exception-row"][data-reason="pending"]')).not.toBeNull();
    });
    const row = document.querySelector('[data-role="exception-row"][data-reason="pending"]')!;
    expect(row.textContent).toContain("Pending Source");
    expect(row.textContent).toContain("com.pending.ios");
    expect(row.textContent).toContain("待补全");
  });

  it("surfaces a 503 database error with a retry action", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "unavailable" }, 503)));
    await mountPage();
    await vi.waitFor(() => {
      expect(document.querySelector('[data-role="error"]')).not.toBeNull();
    });
    expect(document.body.textContent).toContain("报告加载失败");
    expect(document.body.textContent).toContain("未配置数据库");
    expect(document.querySelector('[data-role="retry-load"]')).not.toBeNull();
  });
});
