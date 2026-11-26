import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Theme } from "@astryxdesign/core";
import { BrowserRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DayDetail, DaySummary, PackageDetail } from "../../shared/competitorTypes";
import { CompetitorHomePage } from "../../src/competitor/App";
import { addDays, sourceAppName, yesterdayUtc } from "../../src/competitor/format";
import { storeName } from "../../src/competitor/selectors";
import { wxTheme } from "../../src/theme/wxTheme";

const DATE = yesterdayUtc();
const PREV = addDays(DATE, -1);
const ZERO = addDays(DATE, -2);

beforeAll(() => {
  if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    } as unknown as typeof IntersectionObserver;
  }
  // jsdom has no native dialog implementation; Lightbox calls showModal/close.
  if (typeof HTMLDialogElement.prototype.showModal !== "function") {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (typeof HTMLDialogElement.prototype.close !== "function") {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
  // jsdom ships no CSS.escape(); the dialog uses it to build its title id.
  if (typeof globalThis.CSS?.escape !== "function") {
    const css = (globalThis.CSS ??= {} as typeof CSS);
    css.escape = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }
});

function pkg(overrides: Partial<PackageDetail> & { packageCode: string }): PackageDetail {
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
    appVersion: "1.2.0",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    attribution: null,
    appleId: 111,
    appStoreJson: {},
    iconLocalPath: null,
    screenshotLocalPaths: [],
    versions: [],
    fetchedAt: `${DATE}T02:00:00.000Z`,
    ...overrides,
  };
}

const alpha = pkg({
  packageCode: "com.alpha.ios",
  displayName: "Alpha Source",
  appleId: 111,
  attribution: "appsflyer",
  appStoreJson: {
    name: "Alpha Official",
    trackName: "Alpha App",
    iapItems: [{ name: "高级版", price: "$4.99" }],
    versionHistory: [{ releasedAt: "2026-10-01T00:00:00.000Z" }, { releasedAt: "2026-11-10T00:00:00.000Z" }],
  },
  iconLocalPath: `${DATE}/com.alpha.ios/icon.png`,
});
const alphaHd = pkg({
  packageCode: "com.alpha.ios.hd",
  displayName: "Alpha HD Source",
  appleId: 111,
  appStoreJson: { trackName: "Alpha HD" },
  versions: [{ version: "1.0.0", releasedAt: "2026-11-01", notes: null, capturedAt: `${DATE}T02:00:00.000Z` }],
});
const gamma = pkg({
  packageCode: "com.gamma.ios",
  displayName: "Gamma Source",
  team: "团队 B",
  category: "工具",
  appleId: 222,
  attribution: "none",
  offlineDate: "2026-11-20",
  appStoreJson: {},
  versions: [{ version: "1.0.0", releasedAt: "2026-11-05", notes: null, capturedAt: `${DATE}T02:00:00.000Z` }],
});
const missed = pkg({
  packageCode: "com.beta.s",
  displayName: "Beta Source",
  lookupStatus: "bundle_not_found",
  enrichStatus: "failed",
  appleId: null,
  appStoreJson: {},
});
const pending = pkg({
  packageCode: "com.pending.ios",
  displayName: "Pending Source",
  lookupStatus: "pending",
  enrichStatus: "pending",
  appleId: null,
  appStoreJson: {},
});

function day(date: string, packages: PackageDetail[]): DayDetail {
  return {
    date,
    dateKind: "first_ad",
    batch: {
      targetDate: date,
      syncId: `sync-${date}`,
      snapshotId: `snap-${date}`,
      dataUpdatedAt: `${date}T01:00:00.000Z`,
      publishedAt: `${date}T01:10:00.000Z`,
      rangeComplete: true,
      stale: false,
      status: "ok",
      fetchedAt: `${date}T02:00:00.000Z`,
    },
    packages,
  };
}

const current = day(DATE, [alpha, alphaHd, missed, gamma]);
const previous = day(PREV, [{ ...gamma, targetDate: PREV }]);

function summary(date: string, packageCount: number): DaySummary {
  return { date, packageCount, hitCount: packageCount, missCount: 0, batchStatus: "ok" };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockApi(details: Record<string, DayDetail>, summaries: DaySummary[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, "http://localhost");
    if (url.pathname === "/api/competitor/days") return json({ days: summaries });
    if (url.pathname.startsWith("/api/competitor/day/")) {
      const date = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const detail = details[date];
      return detail ? json(detail) : json({ message: "No competitor data for this date" }, 404);
    }
    return json({ message: "not found" }, 404);
  });
}

function requested(fetchMock: ReturnType<typeof mockApi>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function renderPage(search = "") {
  window.history.replaceState({}, "", `/${search}`);
  return render(
    <Theme theme={wxTheme} mode="light">
      <BrowserRouter>
        <CompetitorHomePage />
      </BrowserRouter>
    </Theme>,
  );
}

async function waitForRows(count = 2) {
  await waitFor(() => {
    expect(document.querySelectorAll('[data-role="competitor-row"]')).toHaveLength(count);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("React competitor home", () => {
  it("renders only the timeline with team blocks, row fields and detail links", async () => {
    const fetchMock = mockApi({ [DATE]: current }, [summary(DATE, 4)]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage("?date_kind=listing&group_by=category");
    await waitForRows();

    expect(screen.getByRole("heading", { level: 1, name: "竞品日报" })).toBeTruthy();
    const days = document.querySelectorAll<HTMLElement>('[data-role="timeline-day"]');
    expect(days).toHaveLength(1);
    expect(days[0]?.dataset.date).toBe(DATE);
    expect(document.querySelector(".wx-tl-when")?.textContent).toBe(DATE);
    expect(document.querySelector(".wx-tl-n")?.textContent).toBe("4 包");
    expect(document.querySelector(".wx-tl-date")?.tagName).toBe("DIV");
    expect(document.querySelector(".wx-tl-date button")).toBeNull();
    expect(document.querySelector("details")).toBeNull();
    expect(document.querySelector(".wx-bar")).toBeNull();
    expect(document.querySelector('[data-role="forecast"]')).toBeNull();
    expect(document.querySelector('[data-role="indicator"]')).toBeNull();
    expect(document.querySelector('[data-role="date-kind"]')).toBeNull();

    const teamLines = document.querySelectorAll<HTMLElement>(".wx-team-line");
    expect(teamLines).toHaveLength(2);
    expect(teamLines[0]?.tagName).toBe("DIV");
    expect(teamLines[0]?.textContent).toContain("团队 A");
    expect(teamLines[0]?.textContent).toContain("3 包");
    expect(teamLines[0]?.querySelector("button")).toBeNull();
    expect(teamLines[1]?.textContent).toContain("团队 B");

    const alphaRow = document.querySelector<HTMLAnchorElement>('[data-competitor="apple:111"]')!;
    expect(alphaRow.getAttribute("href")).toBe("/package/com.alpha.ios");
    expect(alphaRow.textContent).toContain("Alpha Official");
    expect(alphaRow.textContent).not.toContain("Alpha Source");
    expect(alphaRow.querySelector('[data-role="package-count"]')?.textContent).toBe("2 个包");
    expect(alphaRow.querySelector(".wx-row-pkg")?.textContent).toBe("111");
    expect(alphaRow.textContent).toContain("com.alpha.ios 等 2 个");
    expect(alphaRow.textContent).toContain("最早 2026-10-01");
    expect(alphaRow.textContent).toContain("最新 2026-11-10");
    expect(alphaRow.textContent).toContain("2个版本");
    expect(alphaRow.textContent).toContain("游戏");
    expect(alphaRow.textContent).toContain("v1.2.0");
    expect(alphaRow.querySelector(".wx-attribution-tag")?.textContent).toBe("AppsFlyer");
    const side = alphaRow.querySelector(".wx-row-side")!;
    expect(side.children[0]?.classList.contains("wx-iap-pill")).toBe(true);
    expect(side.children[1]?.classList.contains("wx-row-versions")).toBe(true);

    const gammaRow = document.querySelector('[data-competitor="apple:222"]')!;
    expect(gammaRow.textContent).toContain("Gamma Source");
    expect(gammaRow.textContent).toContain("1个版本");
    expect(gammaRow.querySelector(".wx-iap-pill")).toBeNull();
    // The delisted date moves next to the name, with a stamp on the list icon.
    expect(gammaRow.querySelector(".wx-row-offline")?.textContent).toBe("2026-11-20 已下架");
    expect(gammaRow.querySelector(".wx-row-icon-stamp")?.textContent).toBe("已下架");
    expect(alphaRow.querySelector(".wx-row-offline")).toBeNull();
    expect(alphaRow.querySelector(".wx-row-icon-stamp")).toBeNull();
    expect(gammaRow.querySelector(".wx-attribution-tag")?.textContent).toBe("无归因");

    const missedRow = document.querySelector<HTMLAnchorElement>('[data-role="exception-row"][data-reason="miss"]')!;
    expect(missedRow.textContent).toContain("Beta Source");
    expect(missedRow.textContent).toContain("com.beta.s");
    expect(missedRow.textContent).toContain("App Store 未命中");
    expect(missedRow.getAttribute("href")).toBe("/package/com.beta.s");
    expect(document.querySelector('.wx-team-block[data-team="团队 A"]')?.contains(missedRow)).toBe(true);

    expect(screen.getByRole("button", { name: "团队 B" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部" }).getAttribute("aria-current")).toBe("true");
    expect(document.querySelector(".wx-group-head")).toBeNull();
    expect(document.querySelector('[data-role="exceptions"]')).toBeNull();

    expect(["stat-total", "stat-competitors", "stat-hit", "stat-exception"].map(
      (role) => document.querySelector(`[data-role="${role}"]`)?.textContent,
    )).toEqual(["4", "2", "3", "1"]);

    const urls = requested(fetchMock);
    expect(urls.some((url) => url.includes("start=2020-01-01") && url.includes(`end=${DATE}`))).toBe(true);
    expect(urls.some((url) => url.includes(`/api/competitor/day/${DATE}?date_kind=first_ad`))).toBe(true);
    expect(urls.every((url) => !url.includes("date_kind=listing"))).toBe(true);
    expect(urls.some((url) => url.includes("/api/competitor/summary"))).toBe(false);
  });

  it("orders dates newest first and skips days without packages", async () => {
    const fetchMock = mockApi(
      { [DATE]: current, [PREV]: previous },
      [summary(PREV, 1), summary(ZERO, 0), summary(DATE, 4)],
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage("?date_kind=listing");
    await waitFor(() => expect(document.querySelectorAll('[data-role="timeline-day"]')).toHaveLength(2));

    expect([...document.querySelectorAll<HTMLElement>('[data-role="timeline-day"]')].map((node) => node.dataset.date))
      .toEqual([DATE, PREV]);
    expect(document.body.textContent).not.toContain(ZERO);
    const urls = requested(fetchMock);
    expect(urls.some((url) => url.includes(`/api/competitor/day/${ZERO}`))).toBe(false);
    expect(urls.some((url) => url.includes(`/api/competitor/day/${PREV}`))).toBe(true);
  });

  it("filters by team, status and category without refetching", async () => {
    const fetchMock = mockApi({ [DATE]: current }, [summary(DATE, 4)]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForRows();
    const calls = fetchMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "团队 B" }));
    expect(document.querySelector('[data-competitor="apple:111"]')).toBeNull();
    expect(document.querySelector('[data-competitor="apple:222"]')).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("team")).toBe("团队 B");

    fireEvent.click(screen.getByRole("button", { name: "全部" }));
    fireEvent.click(screen.getByRole("radio", { name: /异常/ }));
    expect(document.querySelector('[data-competitor="apple:111"]')).toBeNull();
    expect(document.querySelector('[data-role="exception-row"]')).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("status")).toBe("exception");

    fireEvent.click(screen.getByRole("radio", { name: /命中/ }));
    expect(document.querySelector('[data-role="exception-row"]')).toBeNull();
    expect(document.querySelector('[data-competitor="apple:111"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: /类目/ }));
    fireEvent.click(await screen.findByRole("option", { name: "游戏" }));
    expect(document.querySelector('[data-competitor="apple:111"]')).not.toBeNull();
    expect(document.querySelector('[data-competitor="apple:222"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get("category")).toBe("游戏");
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("uses Astryx DateInput for date filtering and clears all filters from the note", async () => {
    vi.stubGlobal("fetch", mockApi({ [DATE]: current, [PREV]: previous }, [summary(DATE, 4), summary(PREV, 1)]));
    renderPage();
    await waitFor(() => expect(document.querySelectorAll('[data-role="timeline-day"]')).toHaveLength(2));

    const input = screen.getByLabelText("日期");
    expect(input.tagName).toBe("INPUT");
    expect(input.getAttribute("type")).not.toBe("date");
    expect(document.querySelector('select[data-role="date-filter"]')).toBeNull();
    expect(screen.queryByText("全部日期")).toBeNull();

    fireEvent.change(input, { target: { value: PREV } });
    fireEvent.blur(input);
    await waitFor(() => expect(document.querySelectorAll('[data-role="timeline-day"]')).toHaveLength(1));
    expect(document.querySelector<HTMLElement>('[data-role="timeline-day"]')?.dataset.date).toBe(PREV);
    expect(document.querySelector('[data-competitor="apple:111"]')).toBeNull();
    expect(new URLSearchParams(window.location.search).get("date")).toBe(PREV);

    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    await waitFor(() => expect(document.querySelectorAll('[data-role="timeline-day"]')).toHaveLength(2));
    expect(window.location.search).toBe("");
    expect(document.querySelector('[data-competitor="apple:111"]')).not.toBeNull();
  });

  it("keeps exception rows under their team and maps legacy status=miss", async () => {
    vi.stubGlobal("fetch", mockApi({ [DATE]: day(DATE, [alpha, missed, pending]) }, [summary(DATE, 3)]));
    renderPage("?status=miss");
    await waitFor(() => expect(document.querySelectorAll('[data-role="exception-row"]')).toHaveLength(2));
    expect(screen.getByRole("radio", { name: /异常/ }).getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('.wx-team-block[data-team="团队 A"]')?.contains(document.querySelector('[data-reason="pending"]'))).toBe(true);
    expect(document.querySelector('[data-reason="pending"]')?.textContent).toContain("待补全");
    expect(document.querySelector('[data-reason="miss"]')).not.toBeNull();
  });

  it("labels a missed package by its offline date instead of the lookup", async () => {
    const delisted = pkg({
      packageCode: "com.offline.s",
      displayName: "iOS-GasketCycleiOSjufeng",
      lookupStatus: "bundle_not_found",
      enrichStatus: "failed",
      appleId: null,
      appStoreJson: {},
      offlineDate: "2026-11-20",
    });
    vi.stubGlobal("fetch", mockApi({ [DATE]: day(DATE, [delisted]) }, [summary(DATE, 1)]));
    renderPage("?status=miss");
    await waitFor(() => expect(document.querySelector('[data-role="exception-row"]')).not.toBeNull());
    const row = document.querySelector('[data-role="exception-row"]')!;
    // Only the app name survives the source markers.
    expect(row.querySelector(".wx-row-title strong")?.textContent).toBe("GasketCycle");
    // Same convention as hit rows: stamp on the icon, date next to the name.
    expect(row.querySelector(".wx-row-offline")?.textContent).toBe("2026-11-20 已下架");
    expect(row.querySelector(".wx-row-icon-stamp")?.textContent).toBe("已下架");
    expect(row.textContent).not.toContain("App Store 未命中");
  });

  it("shows a date-specific empty state and loads the window from 看全部日期", async () => {
    const fetchMock = mockApi({ [DATE]: current }, [summary(DATE, 4)]);
    vi.stubGlobal("fetch", fetchMock);
    renderPage(`?date=${addDays(DATE, -3)}`);
    await waitFor(() => expect(document.querySelector('[data-role="empty-day"]')).not.toBeNull());
    expect(document.body.textContent).toContain("这一天还没有快照");
    fireEvent.click(screen.getByRole("button", { name: "看全部日期" }));
    await waitForRows();
    expect(new URLSearchParams(window.location.search).get("date")).toBeNull();
  });

  it("shows an empty-filter state and clears it", async () => {
    vi.stubGlobal("fetch", mockApi({ [DATE]: current }, [summary(DATE, 4)]));
    renderPage("?category=%E5%B7%A5%E5%85%B7&status=exception");
    await waitFor(() => expect(document.querySelector('[data-role="empty-filter"]')).not.toBeNull());
    expect(document.body.textContent).toContain("没有符合当前筛选的包");
    const card = document.querySelector('[data-role="empty-filter"]')!;
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "清除筛选" }));
    await waitForRows();
    expect(window.location.search).toBe("");
  });

  it("surfaces a database error with retry", async () => {
    const fetchMock = vi.fn(async () => json({ message: "unavailable" }, 503));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitFor(() => expect(document.querySelector('[data-role="error"]')).not.toBeNull());
    expect(document.body.textContent).toContain("报告加载失败");
    expect(document.body.textContent).toContain("未配置数据库");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
  });

  it("switches to the screenshot strip mode with list details and a full gallery", async () => {
    const shot = pkg({
      packageCode: "com.shot.ios",
      displayName: "Shot Source",
      appleId: 333,
      category: "游戏",
      appVersion: "2.0.0",
      appStoreJson: {
        name: "Shot App",
        trackName: "Shot App",
        iapItems: [{ name: "Pro", price: "$1.99" }],
      },
      screenshotLocalPaths: [`${DATE}/com.shot.ios/1.png`, `${DATE}/com.shot.ios/2.png`],
    });
    vi.stubGlobal("fetch", mockApi({ [DATE]: day(DATE, [shot, missed]) }, [summary(DATE, 2)]));
    renderPage("?view=shots");
    await waitForRows(1);

    expect(screen.getByRole("radio", { name: /商店图/ }).getAttribute("aria-checked")).toBe("true");

    const row = document.querySelector<HTMLElement>('[data-role="competitor-row"]')!;
    expect(row.querySelector(".wx-shot-name")?.getAttribute("href")).toBe("/package/com.shot.ios");
    expect(row.querySelector(".wx-shot-name")?.textContent).toBe("Shot App");
    expect(row.textContent).toContain("游戏");
    expect(row.textContent).toContain("v2.0.0");
    expect(row.textContent).toContain("内购");
    expect(row.textContent).toContain("0个版本");
    expect(row.textContent).toContain("未知");
    // The list-mode details are kept in the left column.
    expect(row.textContent).toContain("333");
    expect(row.textContent).toContain("com.shot.ios");

    const images = [...row.querySelectorAll<HTMLImageElement>(".wx-shot-img")];
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      `/competitor-assets/${DATE}/com.shot.ios/1.png`,
      `/competitor-assets/${DATE}/com.shot.ios/2.png`,
    ]);
    expect(images.every((img) => img.getAttribute("loading") === "lazy")).toBe(true);

    // A missed package keeps its name, badge and a no-screenshot slot.
    const missedRow = document.querySelector<HTMLElement>('[data-role="exception-row"]')!;
    expect(missedRow.textContent).toContain("Beta Source");
    expect(missedRow.textContent).toContain("App Store 未命中");
    expect(missedRow.querySelector(".wx-shot-empty")?.textContent).toBe("无商店图");

    fireEvent.click(screen.getByRole("button", { name: "放大查看Shot App 全部 2 张截图（当前第 1 张）" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Shot App · 商店图（2）");
    expect([...dialog.querySelectorAll<HTMLImageElement>('[data-role="shot-gallery"] img')]
      .map((img) => img.getAttribute("src"))).toEqual([
      `/competitor-assets/${DATE}/com.shot.ios/1.png`,
      `/competitor-assets/${DATE}/com.shot.ios/2.png`,
    ]);
    fireEvent.click(screen.getByRole("button", { name: /关闭|Close/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("radio", { name: /列表/ }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(document.querySelector('[data-role="competitor-row"]')?.tagName).toBe("A");
  });

  it("resolves App Store names as name → trackName → cleaned displayName", () => {
    expect(storeName(alpha)).toBe("Alpha Official");
    expect(storeName(alphaHd)).toBe("Alpha HD");
    expect(storeName(gamma)).toBe("Gamma Source");
    expect(storeName({ ...gamma, appStoreJson: { name: "   ", trackName: "Tracked" } })).toBe("Tracked");
    expect(storeName({ ...gamma, appStoreJson: {}, displayName: "iOS-GasketCycleiOSjufeng" })).toBe("GasketCycle");
  });

  it("strips source platform and team markers from display names", () => {
    expect(sourceAppName("iOS-GasketCycleiOSjufeng")).toBe("GasketCycle");
    expect(sourceAppName("iOS-Boundary LoopiOS")).toBe("Boundary Loop");
    expect(sourceAppName("iOS-LoafneiosL")).toBe("Loafne");
    expect(sourceAppName("iOS-BlynniOS-S")).toBe("Blynn");
    expect(sourceAppName("iOS-EmberyardiOS-2")).toBe("Emberyard");
    expect(sourceAppName("iOS-BeluniiOS-LC")).toBe("Beluni");
    expect(sourceAppName("iOS-*AevniiOS")).toBe("Aevni");
    expect(sourceAppName("Plain Source")).toBe("Plain Source");
    expect(sourceAppName("iOS-")).toBe("iOS-");
  });
});
