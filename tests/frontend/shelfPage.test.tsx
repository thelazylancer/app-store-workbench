import { Theme } from "@astryxdesign/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShelfGroupBy } from "../../shared/shelfTypes";
import { ShelfTrendPage } from "../../src/shelf/App";
import { wxTheme } from "../../src/theme/wxTheme";
import { WEEKS, json, mockShelf, packagesFor, trendFor } from "./shelfFixtures";

// Astryx Dialog drives the native <dialog>; jsdom ships the element without the modal API.
if (typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

// jsdom ships no CSS.escape(); the dialog uses it to build its title id.
if (typeof globalThis.CSS?.escape !== "function") {
  const css = (globalThis.CSS ??= {} as typeof CSS);
  css.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
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

function teamSegments(week?: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="team-segment"]')]
    .filter((segment) => week === undefined || segment.dataset.week === week);
}

function weekBars(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="week-bar"]')];
}

function detailRows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="detail-row"]')];
}

async function waitForTeamSegments(count: number) {
  await waitFor(() => {
    expect(teamSegments()).toHaveLength(count);
  });
}

async function waitForWeekBars(count: number) {
  await waitFor(() => {
    expect(weekBars()).toHaveLength(count);
  });
}

async function openDetails(trigger: HTMLElement) {
  fireEvent.click(trigger);
  await screen.findByRole("dialog");
}

function packagesCalls(fetchMock: ReturnType<typeof mockShelf>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.includes("/api/public/shelf/packages"));
}

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

    const segmentTotal = (weekStart: string) => [...document.querySelectorAll<HTMLElement>('[data-role="segment"]')]
      .filter((segment) => segment.dataset.week === weekStart)
      .reduce((sum, segment) => sum + Number(segment.dataset.count), 0);
    expect(segmentTotal(WEEKS[0]!.weekStart)).toBe(3);
    expect(segmentTotal(WEEKS[1]!.weekStart)).toBe(2);

    expect(document.querySelector('[data-role="weekly-chart"] .wx-chart-line polyline')).not.toBeNull();
    const chips = [...document.querySelectorAll('[data-role="team-filter-chip"]')]
      .map((chip) => chip.textContent);
    expect(chips).toEqual(["团队 A", "团队 B"]);

    const legend = [...document.querySelectorAll(".wx-chart-legend li")].map((item) => ({
      name: item.querySelector(".wx-legend-name")?.textContent,
      count: item.querySelector(".wx-legend-count")?.textContent,
    }));
    expect(legend).toContainEqual({ name: "游戏", count: "2" });
    expect(legend).toContainEqual({ name: "未知", count: "2" });

    const labels = document.querySelector('[data-role="weekly-chart"] .wx-chart-labels')?.textContent ?? "";
    expect(labels).toContain("2026-11-09");
    expect(labels).toContain("~ 2026-11-15");

    expect(document.querySelector('[data-role="weekly-chart"] caption')?.textContent).toBe("每周入库包数");
    expect(document.body.textContent).not.toContain("投放");
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
    expect(categories).toEqual(["游戏2", "未知1"]);
    expect(detailRows().map((row) => row.textContent).join(" ")).toContain("Beta App");
    expect(detailRows().map((row) => row.textContent).join(" ")).toContain("com.unresolved.ios");

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

  it("shows the dimension detail while hovering a bar segment", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const teamSegment = teamSegments(WEEKS[0]!.weekStart)[0]!;
    fireEvent.mouseOver(teamSegment);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("团队 A 3 包");
    fireEvent.mouseOut(teamSegment);
    expect(document.querySelector(".wx-chart-tip")).toBeNull();

    const games = document.querySelector<HTMLElement>(
      `[data-role="segment"][data-week="${WEEKS[0]!.weekStart}"][data-key="Games"]`,
    );
    fireEvent.mouseOver(games!);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("游戏 2 包");
    fireEvent.mouseOut(games!);
    expect(document.querySelector(".wx-chart-tip")).toBeNull();
  });

  it("narrows the week detail to the clicked distribution segment", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    const games = document.querySelector<HTMLElement>(
      `[data-role="segment"][data-week="${WEEKS[0]!.weekStart}"][data-key="Games"]`,
    );
    await openDetails(games!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(2);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("全部团队 · 游戏");
    expect(dialog.textContent).toContain("共 2 包");
    expect(detailRows().map((row) => row.textContent).join(" ")).not.toContain("com.unresolved.ios");
    expect(new URL(packagesCalls(fetchMock)[0]!, "http://localhost").searchParams.get("team")).toBeNull();
  });

  it("opens the unresolved segment with Bundle ID only", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const unknown = document.querySelector<HTMLElement>(
      `[data-role="segment"][data-week="${WEEKS[0]!.weekStart}"][data-key="unknown"]`,
    );
    await openDetails(unknown!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(1);
    });
    expect(detailRows()[0]?.textContent).toContain("com.unresolved.ios");
    expect(detailRows()[0]?.textContent).toContain("未知");
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
    expect(await screen.findByText(/本周共 300 包，仅加载前 3 包/)).toBeTruthy();
  });

  it("keeps the weekly chart when a dimension switch fails, and retries only the trend", async () => {
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
      if (url.pathname.endsWith("/packages")) {
        return json(packagesFor(team, url.searchParams.get("from") ?? "", url.searchParams.get("to") ?? ""));
      }
      return json({ message: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    fireEvent.click(screen.getByRole("radio", { name: "最低 iOS" }));

    expect(await screen.findByText("分布数据加载失败")).toBeTruthy();
    expect(teamSegments()).toHaveLength(2);
    expect(document.querySelector('[data-role="stacked-chart"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-role="shelf-error"]')).toBeNull();
    expect(teamSegments()).toHaveLength(2);
  });

  it("switching the distribution dimension refetches only the trend", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "最低 iOS" }));

    await waitFor(() => {
      expect(document.querySelector('[data-role="stacked-chart"] [data-key="15"]')).not.toBeNull();
    });
    expect(packagesCalls(fetchMock)).toHaveLength(0);
    const trendUrls = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.includes("/trend"));
    expect(trendUrls.some((url) => url.includes("group_by=ios_version"))).toBe(true);
  });
});
