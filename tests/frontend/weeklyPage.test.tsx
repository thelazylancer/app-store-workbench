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
    expect(byRole("weekly-summary")?.textContent).toContain("环比 +2（+4.0%）");
    expect(byRole("weekly-summary")?.textContent).toContain("来自 3 个团队");
    expect(byRole("weekly-footnote")?.textContent).toContain("112");
    expect(byRole("weekly-footnote")?.textContent).toContain("60");
    expect(byRole("weekly-footnote")?.textContent).toContain("批次状态 正常");
    expect(window.location.search).toBe(`?week=${WEEK_START}`);

    const next = byRole<HTMLButtonElement>("weekly-next");
    expect(next?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("已是最新完整周")).toBeTruthy();

    const highlight = byRole("weekly-highlights");
    expect(highlight?.textContent).toContain("增幅 · Alpha");
    expect(highlight?.textContent).toContain("降幅 · Productivity");
    expect(highlight?.textContent).toContain("-10.4pp");
  });

  it("shows the <3 package sample rule and API highlight direction", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const gamma = document.querySelector<HTMLElement>(
      '[data-role="weekly-team-card"][data-team="Gamma"]',
    );
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
      summary: { ...base.summary, previousResolvedPackages: 0, change: 52, changePct: null },
    }))));
    const first = renderPage();
    await screen.findByText(/环比新增/);
    expect(byRole("weekly-summary")?.textContent).toContain("环比新增 52 个包");
    first.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => json(weeklyReport({
      summary: { ...base.summary, change: 0, changePct: 0 },
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
    expect(screen.getByText("已是最新完整周")).toBeTruthy();
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

  it("renders structure rows with a final unknown bucket and one-decimal shares", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const rows = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-structure-row"]')];
    expect(rows.map((row) => row.querySelector("h3")?.textContent)).toEqual([
      "类目",
      "iOS",
      "IAP",
      "隐私",
      "版本数分布",
    ]);

    const categoryLegend = [...rows[0]!.querySelectorAll(".wx-weekly-structure-legend li")];
    expect(categoryLegend[categoryLegend.length - 1]?.textContent).toContain("未知");
    expect(rows[0]!.textContent).toContain("Utilities 14 · 26.9%");
    expect(rows[0]!.textContent).toContain("其他 3 · 5.8%");
    expect(rows[4]!.textContent).toContain("4+ 0 · 0.0%");
    expect(rows[4]!.textContent).toContain("无记录 0 · 0.0%");
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
  });

  it("hatches weeks with insufficient data and keeps the current-week marker", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const gaps = document.querySelectorAll('[data-role="weekly-trend-gap"]');
    expect(gaps).toHaveLength(1);
    expect(byRole("weekly-trend-gap-wrap")?.textContent).toContain("数据不足");

    const bars = [...document.querySelectorAll<HTMLElement>('[data-role="weekly-trend-bar"]')];
    expect(bars.map((bar) => bar.dataset.value)).toEqual(["18", "50", "52"]);
    expect(document.querySelector(".wx-weekly-current-week")?.textContent).toBe("本周");
  });
});
