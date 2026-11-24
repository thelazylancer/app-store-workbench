import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/routes";
import { weeklyReport } from "./weeklyFixtures";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const shelfTrend = {
  from: "2026-08-22",
  to: "2026-11-20",
  team: null,
  groupBy: "category",
  teams: ["团队 A"],
  weeks: [],
  totals: { packageCount: 0, groups: [] },
  distributions: { category: [], ios_version: [], iap: [], privacy: [] },
  teamWeekStats: [],
};

const shelfPackages = {
  from: "2026-08-22",
  to: "2026-11-20",
  team: null,
  total: 0,
  limit: 200,
  rows: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/api/public/shelf/trend")) return json(shelfTrend);
    if (url.pathname.endsWith("/api/public/shelf/packages")) return json(shelfPackages);
    if (url.pathname.endsWith("/api/competitor/weekly-report")) return json(weeklyReport());
    return json({ days: [] });
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  window.history.replaceState({}, "", path);
  return render(<App />);
}

describe("App shell routes", () => {
  it("renders the competitor home at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "竞品日报" })).toBeTruthy();
    expect(document.title).toBe("竞品日报 · App搜索工作台");
    expect(screen.getByRole("link", { name: "竞品日报" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "竞品趋势" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "竞品周动态" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBeNull();
  });

  it("orders the top navigation", () => {
    renderAt("/");
    const navLinks = [...document.querySelectorAll<HTMLAnchorElement>(
      'a[href="/"], a[href="/shelf"], a[href="/weekly"], a[href="/search"]',
    )].filter((link) => link.textContent?.trim() !== "观星台");
    expect(navLinks.map((link) => link.textContent?.trim())).toEqual([
      "竞品日报",
      "竞品趋势",
      "竞品周动态",
      "App Store 搜索",
    ]);
  });

  it("renders the search workspace at /search", () => {
    renderAt("/search");
    expect(screen.getByRole("heading", { level: 2, name: "商店页信息" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "输入应用名称或 Bundle ID 后显示结果" })).toBeTruthy();
    expect(document.title).toBe("App Store 搜索 · App 搜索工作台");
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "竞品日报" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "竞品趋势" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "竞品周动态" }).getAttribute("aria-current")).toBeNull();
  });

  it("renders the package detail at /package/:code", () => {
    renderAt("/package/123");
    expect(screen.getByRole("button", { name: "返回竞品日报" })).toBeTruthy();
    expect(screen.queryByText(/详情页迁移中/)).toBeNull();
    expect(screen.getByRole("link", { name: "竞品日报" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "竞品趋势" }).getAttribute("aria-current")).toBeNull();
  });

  it("renders the shelf trend page at /shelf without highlighting 竞品日报", () => {
    renderAt("/shelf");
    expect(screen.getByRole("heading", { level: 1, name: "竞品入库趋势" })).toBeTruthy();
    expect(document.title).toBe("竞品趋势 · App搜索工作台");
    expect(screen.getByRole("link", { name: "竞品趋势" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "竞品日报" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "竞品周动态" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBeNull();
  });

  it("renders the weekly page at /weekly without highlighting 竞品日报", async () => {
    renderAt("/weekly");
    expect(screen.getByRole("heading", { level: 1, name: "竞品周动态" })).toBeTruthy();
    expect(document.title).toBe("竞品周动态 · App搜索工作台");
    expect(screen.getByRole("link", { name: "竞品周动态" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "竞品日报" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "竞品趋势" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBeNull();
    await waitFor(() => {
      expect(document.querySelectorAll('[data-role="weekly-team-card"]')).toHaveLength(3);
    });
  });

  it("renders a page-level 404", () => {
    renderAt("/missing");
    expect(screen.getByRole("heading", { level: 1, name: "页面不存在" })).toBeTruthy();
  });
});
