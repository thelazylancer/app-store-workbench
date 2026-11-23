import { Theme } from "@astryxdesign/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ShelfGroupBy,
  ShelfGroupCount,
  ShelfPackageRow,
  ShelfPackagesResponse,
  ShelfTrendResponse,
} from "../../shared/shelfTypes";
import { ShelfTrendPage } from "../../src/shelf/App";
import { wxTheme } from "../../src/theme/wxTheme";

const WEEKS = [
  { weekStart: "2026-11-09", weekEnd: "2026-11-15" },
  { weekStart: "2026-11-16", weekEnd: "2026-11-22" },
];

function groupsFor(groupBy: ShelfGroupBy, week: number): ShelfGroupCount[] {
  if (groupBy === "ios_version") {
    return week === 0
      ? [{ key: "16", count: 1 }, { key: "17", count: 1 }, { key: "unknown", count: 1 }]
      : [{ key: "15", count: 1 }, { key: "unknown", count: 1 }];
  }
  if (groupBy === "iap") {
    return week === 0
      ? [{ key: "yes", count: 1 }, { key: "no", count: 1 }, { key: "unknown", count: 1 }]
      : [{ key: "no", count: 1 }, { key: "unknown", count: 1 }];
  }
  return week === 0
    ? [{ key: "Games", count: 2 }, { key: "unknown", count: 1 }]
    : [{ key: "Utilities", count: 1 }, { key: "unknown", count: 1 }];
}

function sumGroups(weeks: number[], groupBy: ShelfGroupBy): ShelfGroupCount[] {
  const map = new Map<string, number>();
  for (const week of weeks) {
    for (const group of groupsFor(groupBy, week)) {
      map.set(group.key, (map.get(group.key) ?? 0) + group.count);
    }
  }
  return [...map].map(([key, count]) => ({ key, count }));
}

function trendFor(team: string | null, groupBy: ShelfGroupBy): ShelfTrendResponse {
  const knownTeam = team === null || team === "团队 A" || team === "团队 B";
  const weekIndexes = !knownTeam ? [] : team === "团队 A" ? [0] : team === "团队 B" ? [1] : [0, 1];
  const weeks = weekIndexes.map((index) => ({
    ...WEEKS[index]!,
    packageCount: groupsFor(groupBy, index).reduce((sum, group) => sum + group.count, 0),
    groups: groupsFor(groupBy, index),
  }));
  return {
    from: "2026-08-22",
    to: "2026-11-20",
    team,
    groupBy,
    teams: ["团队 A", "团队 B"],
    weeks,
    totals: {
      packageCount: weeks.reduce((sum, week) => sum + week.packageCount, 0),
      groups: sumGroups(weekIndexes, groupBy),
    },
  };
}

const ROWS: ShelfPackageRow[] = [
  {
    packageCode: "com.alpha.ios",
    name: "Alpha App",
    team: "团队 A",
    targetDate: "2026-11-10",
    weekStart: "2026-11-09",
    category: "Games",
    minimumOsVersion: "16.0",
    appVersion: "2.3.1",
    iap: "yes",
    listingDate: "2026-10-01",
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.beta.ios",
    name: "Beta App",
    team: "团队 A",
    targetDate: "2026-11-11",
    weekStart: "2026-11-09",
    category: "Games",
    minimumOsVersion: "17.0",
    appVersion: "1.0.0",
    iap: "no",
    listingDate: null,
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.unresolved.ios",
    name: null,
    team: "团队 A",
    targetDate: "2026-11-12",
    weekStart: "2026-11-09",
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    iap: "unknown",
    listingDate: null,
    offlineDate: null,
    resolved: false,
  },
  {
    packageCode: "com.gamma.ios",
    name: "Gamma App",
    team: "团队 B",
    targetDate: "2026-11-17",
    weekStart: "2026-11-16",
    category: "Utilities",
    minimumOsVersion: "15.0",
    appVersion: "3.0.0",
    iap: "no",
    listingDate: "2026-11-01",
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.delta.ios",
    name: null,
    team: "团队 B",
    targetDate: "2026-11-18",
    weekStart: "2026-11-16",
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    iap: "unknown",
    listingDate: null,
    offlineDate: null,
    resolved: false,
  },
];

function packagesFor(team: string | null, totalOverride?: number): ShelfPackagesResponse {
  const rows = ROWS.filter((row) => team === null || row.team === team);
  return { from: "2026-08-22", to: "2026-11-20", team, total: totalOverride ?? rows.length, limit: 200, rows };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockShelf(options: { totalOverride?: number; failFirst?: number } = {}) {
  let remainingFailures = options.failFirst ?? 0;
  return vi.fn(async (input: string | URL | Request) => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return json({ message: "Shelf data is unavailable" }, 503);
    }
    const url = new URL(String(input), "http://localhost");
    const team = url.searchParams.get("team");
    if (url.pathname.endsWith("/api/public/shelf/trend")) {
      const groupBy = (url.searchParams.get("group_by") ?? "category") as ShelfGroupBy;
      return json(trendFor(team, groupBy));
    }
    if (url.pathname.endsWith("/api/public/shelf/packages")) {
      return json(packagesFor(team, options.totalOverride));
    }
    return json({ message: "not found" }, 404);
  });
}

function renderPage(search = "") {
  window.history.replaceState({}, "", `/shelf${search}`);
  return render(
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <ShelfTrendPage />
      </BrowserRouter>
    </Theme>,
  );
}

async function waitForWeeks(count = 2) {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-role="week-bar"]')).toHaveLength(count);
  });
}

function weekBars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="week-bar"]')];
}

function tableRows(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>('[data-role="package-row"]');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("React shelf trend page", () => {
  it("renders weekly totals, quantity-stacked segments and the verification table", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForWeeks();

    expect(screen.getByRole("heading", { level: 1, name: "竞品入库趋势" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "每周入库包数" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "入库包分布" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "核对明细（临时）" })).toBeTruthy();
    expect(weekBars().map((bar) => bar.dataset.count)).toEqual(["3", "2"]);

    const segmentTotal = (weekStart: string) => [...document.querySelectorAll<HTMLElement>('[data-role="segment"]')]
      .filter((segment) => segment.dataset.week === weekStart)
      .reduce((sum, segment) => sum + Number(segment.dataset.count), 0);
    expect(segmentTotal(WEEKS[0]!.weekStart)).toBe(3);
    expect(segmentTotal(WEEKS[1]!.weekStart)).toBe(2);

    const legend = [...document.querySelectorAll(".wx-chart-legend li")].map((item) => ({
      name: item.querySelector(".wx-legend-name")?.textContent,
      count: item.querySelector(".wx-legend-count")?.textContent,
    }));
    expect(legend).toContainEqual({ name: "游戏", count: "2" });
    expect(legend).toContainEqual({ name: "未知", count: "2" });

    const labels = document.querySelector('[data-role="weekly-chart"] .wx-chart-labels')?.textContent ?? "";
    expect(labels).toContain("2026-11-09");
    expect(labels).toContain("~ 2026-11-15");

    expect(tableRows()).toHaveLength(5);
    expect(screen.getByRole("columnheader", { name: "入库日期" })).toBeTruthy();
    expect(tableRows()[0]?.textContent).toContain("2026-11-10");
    expect(tableRows()[0]?.textContent).toContain("2026-11-09 ~ 2026-11-15");
    expect(document.querySelector('[data-role="weekly-chart"]')?.getAttribute("role")).toBeNull();
    expect(document.querySelector('[data-role="weekly-chart"] [role="img"]')).not.toBeNull();
    expect(document.querySelector('[data-role="weekly-chart"] caption')?.textContent).toBe("每周入库包数");
    expect(document.body.textContent).not.toContain("投放");
  });

  it("shows unresolved rows with Bundle ID and 未知 only", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForWeeks();

    const unresolved = document.querySelector<HTMLElement>('[data-role="package-row"][data-resolved="false"]');
    expect(unresolved).not.toBeNull();
    expect(unresolved?.textContent).toContain("com.unresolved.ios");
    expect(unresolved?.textContent).toContain("未知");
    expect(unresolved?.textContent).not.toContain("Alpha App");
  });

  it("filters both charts and the table by team and writes ?team=", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForWeeks();
    expect(tableRows()).toHaveLength(5);

    fireEvent.click(screen.getByRole("combobox", { name: "团队筛选" }));
    fireEvent.click(await screen.findByRole("option", { name: "团队 B" }));

    await waitForWeeks(1);
    expect(weekBars()[0]?.dataset.count).toBe("2");
    expect(tableRows()).toHaveLength(2);
    expect(new URLSearchParams(window.location.search).get("team")).toBe("团队 B");

    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes("/trend") && url.includes("team="))).toBe(true);
    expect(urls.some((url) => url.includes("/packages") && url.includes("team="))).toBe(true);
  });

  it("restores ?team= from the URL and clears back to 全部", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage("?team=%E5%9B%A2%E9%98%9F%20B");
    await waitForWeeks(1);

    expect(tableRows()).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "团队筛选" }).textContent).toContain("团队 B");
    expect(weekBars()[0]?.dataset.count).toBe("2");

    fireEvent.click(screen.getByRole("combobox", { name: "团队筛选" }));
    fireEvent.click(await screen.findByRole("option", { name: "全部" }));

    await waitForWeeks();
    expect(tableRows()).toHaveLength(5);
    expect(new URLSearchParams(window.location.search).get("team")).toBeNull();
  });

  it("shows a loading skeleton before the first response", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderPage();
    expect(screen.getByText("正在加载趋势数据…")).toBeTruthy();
    expect(document.querySelector('[data-role="shelf-loading"]')).not.toBeNull();
  });

  it("surfaces the error message and retries both requests", async () => {
    vi.stubGlobal("fetch", mockShelf({ failFirst: 2 }));
    renderPage();

    expect(await screen.findByText("趋势数据加载失败")).toBeTruthy();
    expect(document.body.textContent).toContain("竞品趋势暂不可用：服务端未配置数据库");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitForWeeks();
    expect(document.querySelector('[data-role="shelf-error"]')).toBeNull();
  });

  it.each(["trend", "packages"] as const)(
    "shows one page-level error when the %s request fails",
    async (failing) => {
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input), "http://localhost");
        if (url.pathname.endsWith("/trend")) {
          return failing === "trend"
            ? json({ message: "Shelf query failed" }, 500)
            : json(trendFor(null, "category"));
        }
        return failing === "packages"
          ? json({ message: "Shelf query failed" }, 500)
          : json(packagesFor(null));
      }));
      renderPage();

      expect(await screen.findByText("趋势数据加载失败")).toBeTruthy();
      expect(document.querySelector('[data-role="shelf-loading"]')).toBeNull();
      expect(document.querySelector('[data-role="weekly-chart"]')).toBeNull();
      expect(document.querySelector('[data-role="package-row"]')).toBeNull();
    },
  );

  it("shows the range-wide empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("/trend")) {
        return json({
          from: "2026-08-22",
          to: "2026-11-20",
          team: null,
          groupBy: "category",
          teams: [],
          weeks: [],
          totals: { packageCount: 0, groups: [] },
        });
      }
      return json(packagesFor(null));
    }));
    renderPage();

    expect(await screen.findByText("还没有入库数据")).toBeTruthy();
    expect(document.body.textContent).toContain("所选时间范围内没有可展示的入库包。");
    expect(document.querySelector('[data-role="weekly-chart"]')).toBeNull();
  });

  it("keeps an unknown team selected and offers 查看全部团队", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage("?team=%E5%9B%A2%E9%98%9F%20Z");

    expect(await screen.findByText("该团队没有入库数据")).toBeTruthy();
    expect(document.body.textContent).toContain("「团队 Z」");
    expect(document.querySelector('[data-role="weekly-chart"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "查看全部团队" }));
    await waitForWeeks();
    expect(new URLSearchParams(window.location.search).get("team")).toBeNull();
  });

  it("shows the truncation footer when total exceeds rendered rows", async () => {
    vi.stubGlobal("fetch", mockShelf({ totalOverride: 300 }));
    renderPage();
    await waitForWeeks();

    expect(screen.getByText("共 300 行 · 显示前 5 行")).toBeTruthy();
  });

  it("keeps the weekly chart and table when a dimension switch fails, and retries only the trend", async () => {
    let failNextDimension = true;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      const team = url.searchParams.get("team");
      const groupBy = (url.searchParams.get("group_by") ?? "category") as ShelfGroupBy;
      if (url.pathname.endsWith("/trend")) {
        if (failNextDimension && groupBy === "ios_version") {
          failNextDimension = false;
          return json({ message: "Shelf query failed" }, 500);
        }
        return json(trendFor(team, groupBy));
      }
      if (url.pathname.endsWith("/packages")) return json(packagesFor(team));
      return json({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForWeeks();
    expect(tableRows()).toHaveLength(5);

    fireEvent.click(screen.getByRole("radio", { name: "最低 iOS" }));

    expect(await screen.findByText("分布数据加载失败")).toBeTruthy();
    // The previous trend still drives the weekly totals and the detail table.
    expect(weekBars().map((bar) => bar.dataset.count)).toEqual(["3", "2"]);
    expect(tableRows()).toHaveLength(5);
    expect(document.querySelector('[data-role="stacked-chart"]')).toBeNull();

    const packagesCalls = () => fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/packages")).length;
    expect(packagesCalls()).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-role="shelf-error"]')).toBeNull();
    expect(packagesCalls()).toBe(1);
    expect(tableRows()).toHaveLength(5);
  });

  it("switching the distribution dimension refetches only the trend", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForWeeks();

    const packagesCalls = () => fetchMock.mock.calls
      .filter(([input]) => String(input).includes("/packages")).length;
    expect(packagesCalls()).toBe(1);
    expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "最低 iOS" }));

    await waitFor(() => {
      expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).not.toBeNull();
    });
    expect(packagesCalls()).toBe(1);
    const trendUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/trend"));
    expect(trendUrls.some((url) => url.includes("group_by=ios_version"))).toBe(true);
    expect(tableRows()).toHaveLength(5);
  });
});
