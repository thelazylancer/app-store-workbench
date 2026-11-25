import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEEK_START, mockWeekly } from "./weeklyFixtures";
import { byRole, renderPage, waitForCards } from "./weeklyHarness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("weekly trends", () => {
  it("renders overall metric rows without a team layer", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const rows = [...document.querySelectorAll<HTMLElement>(
      '[data-role="weekly-metric-overall-row"]',
    )];
    expect(rows.map((row) => row.dataset.metric)).toEqual([
      "avgVersionGapDays",
      "avgLatestVersionToAdDays",
      "avgAdToOfflineDays",
    ]);
    expect(rows[0]!.textContent).toContain("6.5");
    expect(rows[0]!.textContent).toContain("8.5");
    expect(rows[2]!.textContent).toContain("2.5");
    expect(document.querySelector('[data-role="weekly-metric-row"]')).toBeNull();
    expect(document.querySelector('[data-role="weekly-metric-toggle"]')).toBeNull();
    expect(document.querySelector(".wx-weekly-team-legend")).toBeNull();

    fireEvent.click(document.querySelector<HTMLElement>(
      `[data-role="weekly-metric-overall-bar"][data-metric="avgAdToOfflineDays"][data-week="${WEEK_START}"]`,
    )!);
    expect(rows[2]!.querySelector(".wx-chart-tip")?.textContent)
      .toBe("整体：2.5 天（已下架 2/52）");
  });

  it("renders IAP share and mean versions across the trend window", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const iap = document.querySelector<HTMLElement>(
      '[data-role="weekly-ratio-chart"][data-chart="iap"]',
    )!;
    expect(iap.textContent).toContain("27.8%");
    expect(iap.textContent).toContain("18.0%");
    expect(iap.textContent).toContain("13.5%");
    // 10-26 has no resolved packages, so it renders an empty slot.
    expect(iap.querySelectorAll('[data-role="weekly-ratio-bar"]')).toHaveLength(3);
    fireEvent.click(iap.querySelector<HTMLElement>(
      `[data-role="weekly-ratio-bar"][data-chart="iap"][data-week="${WEEK_START}"]`,
    )!);
    expect(iap.querySelector(".wx-chart-tip")?.textContent).toBe("11-16：13.5%");

    const versions = document.querySelector<HTMLElement>(
      '[data-role="weekly-ratio-chart"][data-chart="version"]',
    )!;
    expect(versions.textContent).toContain("1.7");
    expect(versions.textContent).toContain("1.8");
    expect(versions.textContent).toContain("1.9");
    expect(screen.getByText("平均版本数")).toBeTruthy();
    fireEvent.click(versions.querySelector<HTMLElement>(
      `[data-role="weekly-ratio-bar"][data-chart="version"][data-week="${WEEK_START}"]`,
    )!);
    expect(versions.querySelector(".wx-chart-tip")?.textContent).toBe("11-16：1.9 个版本");
  });

  it("renders Top10 category and privacy changes against the base week", async () => {
    vi.stubGlobal("fetch", mockWeekly());
    renderPage();
    await waitForCards(3);

    const panel = (id: string) => document.querySelector<HTMLElement>(
      `[data-role="weekly-top-panel"][data-chart="${id}"]`,
    )!;
    const category = panel("category");
    expect(category.querySelector("h4")?.textContent).toBe("品类 Top10 变化");
    expect(category.querySelector(".wx-weekly-top-base")?.textContent).toBe("较 11-02");
    const rows = [...category.querySelectorAll<HTMLElement>('[data-role="weekly-top-row"]')];
    expect(rows.map((row) => row.dataset.key)).toEqual([
      "Utilities", "Lifestyle", "Games", "Finance", "Productivity", "Photo", "Music",
    ]);
    expect(rows[0]!.textContent).toContain("26.9%");
    expect(rows[0]!.querySelector('[data-role="weekly-top-delta"]')?.textContent).toBe("-6.4pp");
    expect(rows[0]!.querySelectorAll('[data-role="weekly-top-bar"]')).toHaveLength(3);

    fireEvent.click(rows[0]!.querySelector<HTMLElement>(
      `[data-role="weekly-top-bar"][data-week="${WEEK_START}"]`,
    )!);
    expect(category.querySelector(".wx-chart-tip")?.textContent)
      .toBe("Utilities · 11-16：26.9%");

    const privacy = panel("privacy");
    expect(privacy.querySelector("h4")?.textContent).toBe("隐私域名 Top10 变化");
    expect(
      privacy.querySelector<HTMLElement>(
        '[data-role="weekly-top-row"][data-key="own"] [data-role="weekly-top-delta"]',
      )?.textContent,
    ).toBe("+1.7pp");
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
