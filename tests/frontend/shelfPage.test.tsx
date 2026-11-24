import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, todayUtc } from "../../src/lib/reportDate";
import { WEEKS, json, mockShelf } from "./shelfFixtures";
import {
  detailRows,
  openDetails,
  packagesCalls,
  renderPage,
  teamSegments,
  waitForTeamSegments,
  waitForWeekBars,
  weekBars,
} from "./shelfHarness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("React shelf trend page", () => {
  it("renders the grouped weekly bars with the total line and the distribution", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    expect(screen.getByRole("heading", { level: 1, name: "竞品入库趋势" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "每周入库包数" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "入库包分布" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "核对明细（临时）" })).toBeNull();
    expect(document.querySelector('[data-role="package-table"]')).toBeNull();

    expect(teamSegments(WEEKS[0]!.weekStart).map((segment) => segment.dataset.count)).toEqual(["3"]);
    expect(teamSegments(WEEKS[1]!.weekStart).map((segment) => segment.dataset.count)).toEqual(["2"]);

    const chips = [...document.querySelectorAll('[data-role="team-filter-chip"]')]
      .map((chip) => chip.textContent);
    expect(chips).toEqual(["团队 A", "团队 B"]);

    expect(document.querySelector('[data-role="weekly-chart"] .wx-chart-line polyline')).not.toBeNull();

    const dims = [...document.querySelectorAll<HTMLElement>('[data-role="distribution-row"]')].map((row) => ({
      dimension: row.dataset.dimension,
      title: row.querySelector(".wx-dist-title")?.textContent,
      legend: [...row.querySelectorAll(".wx-dist-legend li")].map((item) => ({
        label: item.querySelector(".wx-dist-legend-label")?.textContent,
        count: item.querySelector(".wx-dist-legend-count")?.textContent,
      })),
      bars: [...row.querySelectorAll<HTMLElement>('[data-role="dist-bar"]')].map((bar) => ({
        week: bar.dataset.week,
        key: bar.dataset.key,
        count: bar.dataset.count,
      })),
    }));
    expect(dims.map((row) => row.title)).toEqual(["类目", "最低 iOS", "内购", "隐私协议"]);
    expect(dims[0]!.legend).toEqual([
      { label: "Games", count: "2" },
      { label: "Utilities", count: "1" },
    ]);
    expect(dims[0]!.bars).toEqual([
      { week: WEEKS[0]!.weekStart, key: "Games", count: "2" },
      { week: WEEKS[1]!.weekStart, key: "Utilities", count: "1" },
    ]);
    expect(dims[1]!.legend).toEqual([
      { label: "15", count: "1" },
      { label: "16", count: "1" },
      { label: "17", count: "1" },
    ]);
    expect(dims[1]!.bars).toEqual([
      { week: WEEKS[0]!.weekStart, key: "16", count: "1" },
      { week: WEEKS[0]!.weekStart, key: "17", count: "1" },
      { week: WEEKS[1]!.weekStart, key: "15", count: "1" },
    ]);
    expect(dims[2]!.legend).toEqual([
      { label: "有", count: "1" },
      { label: "无", count: "2" },
    ]);
    expect(dims[2]!.bars).toEqual([
      { week: WEEKS[0]!.weekStart, key: "yes", count: "1" },
      { week: WEEKS[0]!.weekStart, key: "no", count: "1" },
      { week: WEEKS[1]!.weekStart, key: "no", count: "1" },
    ]);
    expect(dims[3]!.legend).toEqual([
      { label: "Cloudflare", count: "1" },
      { label: "模板站", count: "1" },
      { label: "自有域名", count: "1" },
    ]);
    expect(dims[3]!.bars).toEqual([
      { week: WEEKS[0]!.weekStart, key: "cloudflare", count: "1" },
      { week: WEEKS[0]!.weekStart, key: "generator", count: "1" },
      { week: WEEKS[1]!.weekStart, key: "own", count: "1" },
    ]);

    expect(screen.getByRole("heading", { level: 2, name: "版本与投放（按团队）" })).toBeTruthy();
    const metricRows = [...document.querySelectorAll<HTMLElement>('[data-role="metric-row"]')].map((row) => ({
      metric: row.dataset.metric,
      title: row.querySelector(".wx-dist-title")?.textContent,
      ticks: [...row.querySelectorAll('[data-role="metric-tick"]')].map((tick) => tick.textContent),
      values: [...row.querySelectorAll('[data-role="metric-value"]')].map((value) => value.textContent),
      bars: [...row.querySelectorAll<HTMLElement>('[data-role="metric-bar"]')].map((bar) => ({
        week: bar.dataset.week,
        team: bar.dataset.team,
        value: bar.dataset.value,
      })),
    }));
    expect(metricRows).toEqual([
      {
        metric: "avgVersionCount",
        title: "平均每包版本数",
        ticks: ["0", "1", "2", "3"],
        values: ["2.5", "3"],
        bars: [
          { week: WEEKS[0]!.weekStart, team: "团队 A", value: "2.5" },
          { week: WEEKS[1]!.weekStart, team: "团队 B", value: "3" },
        ],
      },
      {
        metric: "avgVersionGapDays",
        title: "平均版本间隔（天）",
        ticks: ["0", "2", "4", "6", "8"],
        values: ["7"],
        bars: [{ week: WEEKS[0]!.weekStart, team: "团队 A", value: "7" }],
      },
      {
        metric: "avgLatestVersionToAdDays",
        title: "最新版本→投放（天）",
        ticks: ["0", "5", "10", "15"],
        values: ["3.5", "12"],
        bars: [
          { week: WEEKS[0]!.weekStart, team: "团队 A", value: "3.5" },
          { week: WEEKS[1]!.weekStart, team: "团队 B", value: "12" },
        ],
      },
      {
        metric: "avgAdToOfflineDays",
        title: "投放→下架（天）",
        ticks: ["0", "1", "2", "3", "4"],
        values: ["4"],
        bars: [{ week: WEEKS[1]!.weekStart, team: "团队 B", value: "4" }],
      },
    ]);

    // Same week axis as the charts above: only weeks that have data.
    const metricWeekStarts = [...document.querySelectorAll('[data-role="metric-row"]')].map((row) =>
      [...row.querySelectorAll<HTMLElement>(".wx-chart-labels .wx-chart-slot span:first-child")]
        .map((span) => span.textContent));
    expect(metricWeekStarts).toEqual(Array(4).fill(WEEKS.map((week) => week.weekStart)));

    const labels = document.querySelector('[data-role="weekly-chart"] .wx-chart-labels')?.textContent ?? "";
    expect(labels).toContain("2026-11-09");
    expect(labels).toContain("~ 2026-11-15");

    expect(document.querySelector('[data-role="weekly-chart"] caption')?.textContent).toBe("每周入库包数");
    // Launch timing is published only as day averages, never as raw dates.
    expect(document.body.textContent).not.toContain("投放日期");
  });

  it("opens the week detail from a team segment, grouped by category", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    await openDetails(teamSegments(WEEKS[0]!.weekStart)[0]!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(3);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("2026-11-09 ~ 2026-11-15");
    expect(dialog.textContent).toContain("团队 A");
    expect(dialog.textContent).toContain("共 3 包");

    const categories = [...dialog.querySelectorAll(".wx-detail-group th")].map((heading) => heading.textContent);
    expect(categories).toEqual(["Games2", "Unknown1"]);
    expect(detailRows().map((row) => row.textContent).join(" ")).toContain("Beta App");
    expect(detailRows().map((row) => row.textContent).join(" ")).toContain("com.unresolved.ios");

    // Without an Apple ID there is nowhere to open, so the row stays plain text.
    const unresolvedRow = detailRows().find((row) => row.textContent?.includes("com.unresolved.ios"));
    expect(unresolvedRow?.querySelector("a.wx-detail-name")).toBeNull();
    expect(unresolvedRow?.querySelector(".wx-detail-name")?.textContent).toBe("Unresolved");

    const resolvedRow = detailRows().find((row) => row.textContent?.includes("com.alpha.ios"));
    const resolvedLink = resolvedRow?.querySelector<HTMLAnchorElement>("a.wx-detail-name");
    expect(resolvedLink?.getAttribute("href")).toBe("/package/com.alpha.ios");
    expect(resolvedLink?.getAttribute("target")).toBe("_blank");

    const url = new URL(packagesCalls(fetchMock)[0]!, "http://localhost");
    expect(url.searchParams.get("from")).toBe("2026-11-09");
    expect(url.searchParams.get("to")).toBe("2026-11-15");
    expect(url.searchParams.get("team")).toBe("团队 A");
    expect(url.searchParams.get("limit")).toBe("500");

    fireEvent.click(screen.getByRole("button", { name: /关闭|Close/ }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("shows the team detail while hovering a bar", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const teamSegment = teamSegments(WEEKS[0]!.weekStart)[0]!;
    fireEvent.mouseOver(teamSegment);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("团队 A 3 包");
    fireEvent.mouseOut(teamSegment);
    expect(document.querySelector(".wx-chart-tip")).toBeNull();

    // The distribution rows share one tip state; each bar keeps its own slot id.
    const distBar = document.querySelector<HTMLElement>(
      `[data-role="distribution-row"][data-dimension="iap"] `
      + `[data-role="dist-bar"][data-week="${WEEKS[0]!.weekStart}"][data-key="yes"]`,
    )!;
    fireEvent.mouseOver(distBar);
    expect(document.querySelectorAll(".wx-chart-tip")).toHaveLength(1);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("有 1 包");
    fireEvent.mouseOut(distBar);
    expect(document.querySelector(".wx-chart-tip")).toBeNull();

    // Metric charts share the same tip state; a bar is keyed by metric + week + team.
    const metricBar = document.querySelector<HTMLElement>(
      `[data-role="metric-row"][data-metric="avgVersionCount"] `
      + `[data-role="metric-bar"][data-week="${WEEKS[0]!.weekStart}"][data-team="团队 A"]`,
    )!;
    fireEvent.mouseOver(metricBar);
    expect(document.querySelectorAll(".wx-chart-tip")).toHaveLength(1);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("团队 A 2.5");
    fireEvent.mouseOut(metricBar);
    expect(document.querySelector(".wx-chart-tip")).toBeNull();
  });

  it("opens the whole-range detail narrowed to a clicked ranking row", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    const games = document.querySelector<HTMLElement>(
      `[data-role="distribution-row"][data-dimension="category"] [data-role="dist-legend"][data-key="Games"]`,
    );
    await openDetails(games!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(2);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("全部团队 · Games");
    expect(dialog.textContent).toContain("共 2 包");
    expect(detailRows().map((row) => row.textContent).join(" ")).not.toContain("com.unresolved.ios");

    const url = new URL(packagesCalls(fetchMock)[0]!, "http://localhost");
    expect(dialog.textContent).toContain(`${url.searchParams.get("from")} ~ ${url.searchParams.get("to")}`);
    expect(url.searchParams.get("to")).toBe(todayUtc());
    expect(url.searchParams.get("from")).toBe(addDays(todayUtc(), -90));
    expect(url.searchParams.get("team")).toBeNull();
  });

  it("opens a week-scoped detail from a distribution bar", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    const bar = document.querySelector<HTMLElement>(
      `[data-role="distribution-row"][data-dimension="category"] `
      + `[data-role="dist-bar"][data-week="${WEEKS[0]!.weekStart}"][data-key="Games"]`,
    );
    await openDetails(bar!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(2);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("2026-11-09 ~ 2026-11-15");
    expect(dialog.textContent).toContain("全部团队 · Games");
    const url = new URL(packagesCalls(fetchMock)[0]!, "http://localhost");
    expect(url.searchParams.get("from")).toBe("2026-11-09");
    expect(url.searchParams.get("to")).toBe("2026-11-15");
    expect(url.searchParams.get("team")).toBeNull();
  });

  it("opens a week-scoped detail narrowed by privacy hosting", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const bar = document.querySelector<HTMLElement>(
      `[data-role="distribution-row"][data-dimension="privacy"] `
      + `[data-role="dist-bar"][data-week="${WEEKS[0]!.weekStart}"][data-key="generator"]`,
    );
    await openDetails(bar!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(1);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("全部团队 · 模板站");
    expect(dialog.querySelector("thead")?.textContent).toContain("隐私协议");
    expect(detailRows()[0]?.textContent).toContain("Alpha App");
    expect(detailRows()[0]?.textContent).toContain("模板站");

    // The row opens the full package detail in a new tab.
    const link = detailRows()[0]?.querySelector<HTMLAnchorElement>("a.wx-detail-name");
    expect(link?.getAttribute("href")).toBe("/package/com.alpha.ios");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("filters to one team from the chart legend chip and back", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    fireEvent.click(document.querySelector<HTMLElement>('[data-role="team-filter-chip"][data-team="团队 B"]')!);
    await waitForWeekBars(1);
    expect(new URLSearchParams(window.location.search).get("team")).toBe("团队 B");

    fireEvent.click(document.querySelector<HTMLElement>('[data-role="team-filter-chip"][data-team="团队 B"]')!);
    await waitForTeamSegments(2);
    expect(new URLSearchParams(window.location.search).get("team")).toBeNull();
  });

  it("filters the trend by team, renders a single-series bar and scopes the detail", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    fireEvent.click(screen.getByRole("combobox", { name: "团队筛选" }));
    fireEvent.click(await screen.findByRole("option", { name: "团队 B" }));

    await waitForWeekBars(1);
    expect(weekBars()[0]?.dataset.count).toBe("2");
    expect(document.querySelector(".wx-chart-line")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("team")).toBe("团队 B");
    expect(packagesCalls(fetchMock)).toHaveLength(0);

    await openDetails(weekBars()[0]!);
    await waitFor(() => {
      expect(detailRows()).toHaveLength(2);
    });
    expect(detailRows().map((row) => row.textContent).join(" ")).toContain("Gamma App");
    expect(new URL(packagesCalls(fetchMock)[0]!, "http://localhost").searchParams.get("team")).toBe("团队 B");
  });

  it("restores ?team= from the URL and clears back to 全部", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage("?team=%E5%9B%A2%E9%98%9F%20B");
    await waitForWeekBars(1);

    expect(screen.getByRole("combobox", { name: "团队筛选" }).textContent).toContain("团队 B");
    expect(weekBars()[0]?.dataset.count).toBe("2");

    fireEvent.click(screen.getByRole("combobox", { name: "团队筛选" }));
    fireEvent.click(await screen.findByRole("option", { name: "全部" }));

    await waitForTeamSegments(2);
    expect(new URLSearchParams(window.location.search).get("team")).toBeNull();
  });

  it("shows a loading skeleton before the first response", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderPage();
    expect(screen.getByText("正在加载趋势数据…")).toBeTruthy();
    expect(document.querySelector('[data-role="shelf-loading"]')).not.toBeNull();
  });

  it("surfaces the error message and retries the trend request", async () => {
    const fetchMock = mockShelf({ failFirst: 1 });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(await screen.findByText("趋势数据加载失败")).toBeTruthy();
    expect(document.body.textContent).toContain("竞品趋势暂不可用：服务端未配置数据库");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitForTeamSegments(2);
    expect(document.querySelector('[data-role="shelf-error"]')).toBeNull();
    expect(packagesCalls(fetchMock)).toHaveLength(0);
  });

  it("shows the range-wide empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      json({
        from: "2026-08-22",
        to: "2026-11-20",
        team: null,
        groupBy: "category",
        teams: [],
        weeks: [],
        totals: { packageCount: 0, groups: [] },
        distributions: { category: [], ios_version: [], iap: [], privacy: [] },
        teamWeekStats: [],
      })));
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
    await waitForTeamSegments(2);
    expect(new URLSearchParams(window.location.search).get("team")).toBeNull();
  });

  it("notes the row limit when a week exceeds the detail limit", async () => {
    vi.stubGlobal("fetch", mockShelf({ totalOverride: 300 }));
    renderPage();
    await waitForTeamSegments(2);

    await openDetails(teamSegments(WEEKS[0]!.weekStart)[0]!);
    expect(await screen.findByText(/该范围共 300 包，仅加载前 3 包/)).toBeTruthy();
  });
});
