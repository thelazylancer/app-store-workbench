import { Theme } from "@astryxdesign/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeeklyPage } from "../../src/weekly/App";
import { wxTheme } from "../../src/theme/wxTheme";
import {
  WEEK_START,
  json,
  mockWeekly,
  reportForWeek,
  weeklyReport,
} from "./weeklyFixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

function renderPage(search = "") {
  window.history.replaceState({}, "", `/weekly${search}`);
  return render(
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <WeeklyPage />
      </BrowserRouter>
    </Theme>,
  );
}

function teamCards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-role="weekly-team-card"]')];
}

function byRole<T extends HTMLElement>(role: string, attribute = "data-role"): T | null {
  return document.querySelector<T>(`[${attribute}="${role}"]`);
}

async function waitForCards(count: number) {
  await waitFor(() => expect(teamCards()).toHaveLength(count));
}

describe("weekly page", () => {
  it("renders the full report in page order", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();

    await waitForCards(3);

    expect(screen.getByRole("heading", { level: 1, name: "竞品周动态" })).toBeTruthy();
    expect(byRole("weekly-week-range")?.textContent).toBe("2026-11-16 ~ 2026-11-22");
    expect(byRole("weekly-summary")?.textContent).toContain("新增 112 个包");
    expect(byRole("weekly-summary")?.textContent).toContain("环比 +2（+1.8%）");
    expect(byRole("weekly-summary")?.textContent).toContain("来自 3 个团队");
    expect(byRole("weekly-footnote")?.textContent).toContain("112");
    expect(byRole("weekly-footnote")?.textContent).toContain("60");
    expect(byRole("weekly-footnote")?.textContent).toContain("批次状态 正常");
    expect(window.location.search).toBe(`?week=${WEEK_START}`);

    const next = byRole<HTMLButtonElement>("weekly-next");
    expect(next?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("已是最新完整周")).toBeTruthy();

    const highlight = byRole("weekly-highlights");
    expect(highlight?.textContent).toContain("增幅 · A");
    expect(highlight?.textContent).toContain("降幅 · P");
    expect(highlight?.textContent).toContain("-10.4pp");

    const groups = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-group"]')];
    expect(groups.map((group) => group.dataset.group)).toEqual(["overview", "teams", "trends"]);
    expect(groups.map((group) => group.querySelector(".wx-weekly-group-title")?.textContent))
      .toEqual(["整体情况", "团队情况", "过去 4 周趋势"]);
    expect(groups[0]!.querySelector('[data-role="weekly-structure-panel"]')).toBeTruthy();
    expect(groups[0]!.querySelector('[data-role="weekly-metric-facts"]')).toBeTruthy();
    expect(groups[0]!.querySelector('[data-role="weekly-highlights"]')).toBeTruthy();
    expect([...groups[0]!.querySelectorAll("h3")].map((heading) => heading.textContent))
      .toEqual(["本周结构", "版本与投放（本周）", "本周值得关注"]);
    expect(byRole("weekly-metric-facts")?.textContent).toContain("8.5");
    expect(byRole("weekly-metric-facts")?.textContent).toContain("7.2");
    expect(byRole("weekly-metric-facts")?.textContent).toContain("2.5");
    expect(byRole("weekly-metric-facts")?.textContent).toContain("已下架 2/52");
    expect(groups[1]!.querySelector('[data-role="weekly-team-cards"]')).toBeTruthy();
    expect(groups[2]!.querySelector('[data-role="weekly-metric-row"]')).toBeTruthy();
    expect(groups[2]!.querySelector('[data-role="weekly-trend"]')).toBeTruthy();
    expect([...groups[2]!.querySelectorAll("h3")].map((heading) => heading.textContent))
      .toEqual(["新增包数", "版本与投放"]);
  });

  it("shows the <3 package sample rule and API highlight direction", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const gamma = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Gamma"]',
    );
    expect(gamma?.querySelector(".wx-weekly-team-label")?.textContent).toBe("G");
    expect(gamma?.querySelector<HTMLElement>(".wx-weekly-team-label")?.title).toBe("Gamma");
    expect(gamma?.textContent).toContain("样本不足（<3 包），占比不计算。");
    expect(gamma?.textContent).toContain("新增 2");
    expect(gamma?.textContent).toContain("2 / 52");
    expect(gamma?.textContent).not.toContain("0.0%");

    const cardHighlights = byRole("weekly-highlights");
    expect(cardHighlights?.textContent).not.toContain("大容");
    expect(cardHighlights?.textContent).not.toContain("巨风");
  });

  it("uses all three summary branches", async () => {
    const base = weeklyReport();
    vi.stubGlobal("fetch", vi.fn(async () => json(weeklyReport({
      summary: {
        ...base.summary,
        previousIngestedPackages: 0,
        ingestedChange: 112,
        ingestedChangePct: null,
      },
    }))));
    const first = renderPage();
    await screen.findByText(/环比新增/);
    expect(byRole("weekly-summary")?.textContent).toContain("环比新增 112 个包");
    first.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => json(weeklyReport({
      summary: { ...base.summary, ingestedChange: 0, ingestedChangePct: 0 },
    }))));
    renderPage();
    await waitFor(() => expect(byRole("weekly-summary")?.textContent).toContain("环比 0（0.0%）"));
  });

  it("moves between weeks and stops at latestCompleteWeek", async () => {
    vi.stubGlobal("fetch", mockWeekly({ latest: "2026-11-23" }));
    renderPage();
    await waitForCards(3);

    const next = () => byRole<HTMLButtonElement>("weekly-next")!;
    const previous = () => byRole<HTMLButtonElement>("weekly-previous")!;
    const isNextDisabled = () => next().getAttribute("aria-disabled") === "true";
    expect(isNextDisabled()).toBe(false);

    fireEvent.click(next());
    await waitFor(() => {
      expect(byRole("weekly-week-range")?.textContent).toBe("2026-11-23 ~ 2026-11-29");
    });
    await waitFor(() => expect(isNextDisabled()).toBe(true));
    expect(screen.getByText("已是最新完整周")).toBeTruthy();
    expect(window.location.search).toBe("?week=2026-11-23");

    fireEvent.click(previous());
    await waitFor(() => {
      expect(byRole("weekly-week-range")?.textContent).toBe("2026-11-16 ~ 2026-11-22");
    });
    await waitFor(() => expect(isNextDisabled()).toBe(false));
  });

  it("clears the old week while the next one loads", async () => {
    let release: (() => void) | null = null;
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      const week = url.searchParams.get("week") ?? WEEK_START;
      if (week === "2026-11-23") {
        return new Promise<Response>((resolve) => {
          release = () => resolve(json(reportForWeek("2026-11-23", "2026-11-23")));
        });
      }
      return Promise.resolve(json(reportForWeek(week, "2026-11-23")));
    }));

    renderPage();
    await waitForCards(3);

    fireEvent.click(byRole<HTMLButtonElement>("weekly-next")!);
    await waitFor(() => expect(byRole("weekly-loading")).toBeTruthy());
    expect(document.body.textContent).not.toContain("Alpha");

    release!();
    await waitForCards(3);
  });

  it("recovers when a browser back cancels a pending week fetch", async () => {
    const pending: { release: (() => void) | null } = { release: null };
    vi.stubGlobal("fetch", vi.fn((input: string | URL | Request) => {
      const url = new URL(String(input), "http://localhost");
      const week = url.searchParams.get("week") ?? WEEK_START;
      if (week === "2026-11-23") {
        return new Promise<Response>((resolve) => {
          pending.release = () => resolve(json(reportForWeek("2026-11-23", "2026-11-23")));
        });
      }
      return Promise.resolve(json(reportForWeek(week, "2026-11-23")));
    }));

    renderPage();
    await waitForCards(3);

    fireEvent.click(byRole<HTMLButtonElement>("weekly-next")!);
    await waitFor(() => expect(byRole("weekly-loading")).toBeTruthy());

    // Simulate the browser back button returning to the already-loaded week.
    window.history.replaceState({}, "", `/weekly?week=${WEEK_START}`);
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitForCards(3);
    expect(byRole("weekly-loading")).toBeNull();
    expect(byRole("weekly-week-range")?.textContent).toBe("2026-11-16 ~ 2026-11-22");
    pending.release?.();
  });

  it("shows a future week as empty and disables next", async () => {
    vi.stubGlobal("fetch", mockWeekly({ emptyWeek: "2099-01-05", latest: "2026-11-16" }));
    renderPage("?week=2099-01-05");

    await screen.findByRole("heading", { level: 2, name: "该周没有已解析入库包" });
    expect(teamCards()).toHaveLength(0);
    expect(byRole<HTMLButtonElement>("weekly-next")?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("已超过最新完整周")).toBeTruthy();
    expect(screen.queryByText("已是最新完整周")).toBeNull();
    expect(byRole<HTMLButtonElement>("weekly-previous")?.getAttribute("aria-disabled")).not.toBe("true");
  });

  it("returns to the latest week after a 400", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? json({ message: "A valid week is required" }, 400)
        : json(weeklyReport());
    }));

    renderPage(`?week=${WEEK_START}`);
    await screen.findByRole("heading", { level: 2, name: "周参数无效" });

    fireEvent.click(byRole("weekly-retry")!);
    await waitForCards(3);
    expect(window.location.search).toBe(`?week=${WEEK_START}`);
  });

  it("renders an empty week with the footnote and a previous-week action", async () => {
    vi.stubGlobal("fetch", mockWeekly({ emptyWeek: "2026-11-02", latest: "2026-11-16" }));
    renderPage("?week=2026-11-02");

    await screen.findByRole("heading", { level: 2, name: "该周没有已解析入库包" });
    expect(teamCards()).toHaveLength(0);
    expect(screen.getByText(/本周入库 112 个包，但都没有命中 App Store/)).toBeTruthy();
    expect(byRole("weekly-footnote")?.textContent).toContain("112");

    fireEvent.click(byRole("weekly-previous-empty")!);
    await waitFor(() => {
      expect(byRole("weekly-week-range")?.textContent).toBe("2026-10-26 ~ 2026-11-01");
    });
  });

  it("shows a 503 error and retries the same week", async () => {
    vi.stubGlobal("fetch", mockWeekly({ failFirst: 1 }));
    renderPage();

    await screen.findByRole("heading", { level: 2, name: "周报服务暂不可用" });
    expect(byRole("weekly-error")).toBeTruthy();

    fireEvent.click(byRole("weekly-retry")!);
    await waitForCards(3);
  });

  it("shows the network error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    renderPage();

    await screen.findByRole("heading", { level: 2, name: "周报加载失败" });
    expect(byRole("weekly-error")?.textContent).toContain("网络请求失败，请检查服务是否可用");
  });

  it("renders the weekly structure as labeled, clickable charts", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const panels = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-structure-panel"]')];
    expect(panels.map((panel) => panel.querySelector("h4")?.textContent)).toEqual([
      "版本数",
      "内购",
      "品类 Top5",
      "隐私 Top5",
      "iOS",
    ]);

    const chart = (name: string) => document.querySelector<HTMLElement>(
      `[data-role="weekly-structure-chart"][data-chart="${name}"]`,
    )!;
    const version = chart("version");
    expect(version.textContent).toContain("10 · 19.2%");
    expect(version.textContent).toContain("36 · 69.2%");
    expect(version.textContent).toContain("6 · 11.5%");
    expect(version.textContent).toContain("3+");
    expect(version.textContent).not.toContain("4+");

    const iap = chart("iap");
    expect(iap.textContent).toContain("有");
    expect(iap.textContent).toContain("7 · 13.5%");
    expect(iap.textContent).toContain("45 · 86.5%");

    const category = chart("category");
    expect(category.textContent).toContain("Utilities");
    expect(category.textContent).toContain("14 · 26.9%");
    expect(category.textContent).toContain("Lifestyle");
    expect(category.textContent).toContain("Games");
    expect(category.textContent).toContain("Finance");
    expect(category.textContent).toContain("Productivity");
    expect(category.textContent).not.toContain("Photo");

    const privacy = chart("privacy");
    expect(privacy.textContent).toContain("自有域名");
    expect(privacy.textContent).toContain("24 · 46.2%");
    expect(privacy.textContent).toContain("Cloudflare");
    expect(privacy.textContent).toContain("Google");
    expect(privacy.textContent).toContain("Github");
    expect(privacy.textContent).not.toContain("Vercel");

    const ios = chart("ios");
    expect(ios.textContent).toContain("26+");
    expect(ios.textContent).toContain("未知");

    const threePlus = document.querySelector<HTMLElement>(
      '[data-role="weekly-structure-bar"][data-chart="version"][data-key="3+"]',
    )!;
    fireEvent.click(threePlus);
    expect(document.querySelector(".wx-chart-tip")?.textContent)
      .toBe("3+ 个版本：6 包 · 11.5%");
  });

  it("renders a clickable mini chart set inside every team card", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const alpha = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Alpha"]',
    )!;
    const chart = (name: string) => alpha.querySelector<HTMLElement>(
      `[data-role="weekly-card-chart"][data-chart="${name}"]`,
    )!;
    expect([...alpha.querySelectorAll<HTMLElement>('[data-role="weekly-card-chart"]')]
      .map((node) => node.dataset.chart)).toEqual(["version", "iap", "category", "privacy"]);

    const version = chart("version");
    expect(version.textContent).toContain("1个");
    expect(version.textContent).toContain("2个");
    expect(version.textContent).toContain("16.7%");
    expect(version.textContent).toContain("66.7%");
    expect(version.textContent).not.toContain("4+");

    expect(chart("iap").textContent).toContain("20.0%");
    expect(chart("iap").textContent).toContain("80.0%");
    expect(chart("category").textContent).toContain("12 · 40.0%");
    expect(chart("privacy").textContent).toContain("20 · 66.7%");

    fireEvent.click(alpha.querySelector<HTMLElement>(
      '[data-role="weekly-card-bar"][data-chart="version"][data-key="3+"]',
    )!);
    expect(alpha.querySelector(".wx-chart-tip")?.textContent)
      .toBe("3+ 个版本：5 包 · 16.7%");

    fireEvent.click(alpha.querySelector<HTMLElement>(
      '[data-role="weekly-card-bar"][data-chart="privacy"][data-key="own"]',
    )!);
    expect(alpha.querySelectorAll(".wx-chart-tip")).toHaveLength(1);
    expect(alpha.querySelector(".wx-chart-tip")?.textContent)
      .toBe("自有域名：20 包 · 66.7%");

    const gamma = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Gamma"]',
    )!;
    expect(gamma.querySelector('[data-role="weekly-card-chart"][data-chart="privacy"]')
      ?.textContent).toContain("—");
    expect(gamma.querySelector('[data-role="weekly-card-chart"][data-chart="category"]')
      ?.textContent).toContain("2 · —");
  });

  it("shows this-week metrics and a four-week sparkline in every team card", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const alpha = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Alpha"]',
    )!;
    const block = alpha.querySelector<HTMLElement>('[data-role="weekly-card-metrics"]')!;
    expect(block.textContent).toContain("版本与投放（本周）");
    expect([...block.querySelectorAll<HTMLElement>('[data-role="weekly-card-metric"]')]
      .map((node) => node.dataset.metric))
      .toEqual(["avgVersionGapDays", "avgLatestVersionToAdDays", "avgAdToOfflineDays"]);
    expect(block.textContent).toContain("8.5 天");
    expect(block.textContent).toContain("7.2 天");
    expect(block.textContent).toContain("0 天（已下架 0/30）");

    const gapBars = block.querySelectorAll<HTMLElement>(
      '[data-role="weekly-card-metric-bar"][data-metric="avgVersionGapDays"]',
    );
    expect(gapBars).toHaveLength(4);
    expect([...gapBars].map((bar) => bar.dataset.value)).toEqual(["", "5", "7", "8.5"]);

    fireEvent.click(gapBars[2]!);
    expect(block.querySelector(".wx-chart-tip")?.textContent).toBe("2026-11-09：7 天");

    const beta = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Beta"]',
    )!;
    const betaBlock = beta.querySelector<HTMLElement>('[data-role="weekly-card-metrics"]')!;
    expect(betaBlock.textContent).toContain("4 天（已下架 2/20）");

    const gamma = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Gamma"]',
    )!;
    expect(gamma.querySelector('[data-role="weekly-card-metrics"]')?.textContent).toContain("—");
  });

  it("renders the three metric rows, missing values and offline context", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const rows = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-metric-row"]')];
    expect(rows.map((row) => row.dataset.metric)).toEqual([
      "avgVersionGapDays",
      "avgLatestVersionToAdDays",
      "avgAdToOfflineDays",
    ]);

    const gapTable = byRole("weekly-metric-table-hidden");
    expect(gapTable).toBeTruthy();
    expect(
      document.querySelector<HTMLElement>(
        '[data-role="weekly-metric-table-hidden"][data-metric="avgVersionGapDays"]',
      )?.textContent,
    ).toContain("—");
    expect(
      document.querySelector<HTMLElement>(
        '[data-role="weekly-metric-table-hidden"][data-metric="avgAdToOfflineDays"]',
      )?.textContent,
    ).toContain("0 天（已下架 0/30）");
    expect(
      rows[2]!.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toContain("0 天表示该团队该周没有已下架包");

    const toggle = document.querySelector<HTMLElement>(
      '[data-role="weekly-metric-toggle"][data-metric="avgVersionGapDays"]',
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.querySelector(
        '[data-role="weekly-metric-table"][data-metric="avgVersionGapDays"]',
      ),
    ).toBeTruthy();

    const gapBar = document.querySelector<HTMLElement>(
      `[data-role="weekly-metric-bar"][data-metric="avgVersionGapDays"][data-week="${WEEK_START}"]`,
    )!;
    fireEvent.click(gapBar);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toBe("A：8.5");

    const overallRows = [...document.querySelectorAll<HTMLElement>(
      '[data-role="weekly-metric-overall-row"]',
    )];
    expect(overallRows.map((row) => row.dataset.metric)).toEqual([
      "avgVersionGapDays",
      "avgLatestVersionToAdDays",
      "avgAdToOfflineDays",
    ]);
    expect(overallRows[0]!.textContent).toContain("6.5");
    expect(overallRows[0]!.textContent).toContain("8.5");
    fireEvent.click(document.querySelector<HTMLElement>(
      `[data-role="weekly-metric-overall-bar"][data-metric="avgVersionGapDays"][data-week="${WEEK_START}"]`,
    )!);
    expect(overallRows[0]!.querySelector(".wx-chart-tip")?.textContent).toBe("整体：8.5");
  });

  it("hatches weeks with insufficient data and keeps the current-week marker", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const gaps = document.querySelectorAll('[data-role="weekly-trend-gap"]');
    expect(gaps).toHaveLength(1);
    expect(byRole("weekly-trend-gap-wrap")?.textContent).toContain("数据不足");

    const bars = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-trend-bar"]')];
    expect(bars.map((bar) => bar.dataset.value)).toEqual(["40", "100", "112"]);
    expect(document.querySelector(".wx-weekly-current-week")?.textContent).toBe("本周");

    fireEvent.click(bars[2]!);
    expect(document.querySelector(".wx-chart-tip")?.textContent).toContain("112 包");
  });
});
