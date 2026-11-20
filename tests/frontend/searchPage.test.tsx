import { Theme } from "@astryxdesign/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchedApp, SearchAppsResponse, SearchResult } from "../../shared/types";
import { searchApps } from "../../src/lib/api";
import { SearchPage } from "../../src/search/App";
import { wxTheme } from "../../src/theme/wxTheme";

vi.mock("../../src/lib/api", () => ({
  searchApps: vi.fn(),
}));

const searchMock = vi.mocked(searchApps);

function makeApp(overrides: Partial<MatchedApp> = {}): MatchedApp {
  return {
    name: "Funce",
    developer: "A Dev",
    appleId: 123,
    bundleId: "com.example.funce",
    category: "Utilities",
    appStoreUrl: "https://apps.apple.com/us/app/funce/id123",
    iconUrl: "https://example.com/icon.png",
    description: "A short description",
    screenshotUrls: ["https://example.com/1.png"],
    iapItems: [{ name: "Pack", price: "$4.99" }],
    versionHistory: [
      { version: "2.0", releasedAt: "2025-01-02T00:00:00.000Z", notes: "Notes" },
    ],
    ...overrides,
  };
}

function matched(overrides: Partial<MatchedApp> = {}): SearchResult {
  return {
    query: "Funce",
    status: "matched",
    app: makeApp(overrides),
    candidates: [],
    alternates: [],
    iapHints: { "4.99": "found", "9.99": "not_found", source: "rendered_page" },
    message: null,
  };
}

function noMatch(query: string): SearchResult {
  return {
    query,
    status: "no_match",
    app: null,
    candidates: [],
    alternates: [],
    iapHints: null,
    message: "No App Store match found in US store",
  };
}

function response(results: SearchResult[]): SearchAppsResponse {
  return { country: "us", results };
}

function renderSearch() {
  return render(
    <Theme theme={wxTheme} mode="light">
      <SearchPage />
    </Theme>,
  );
}

function nameInput(index = 0) {
  return screen.getByRole("textbox", { name: `应用名称 ${index + 1}` });
}

function bundleInput(index = 0) {
  return screen.getByRole("textbox", { name: `Bundle ID ${index + 1}（与名称二选一）` });
}

function typeName(value: string, index = 0) {
  fireEvent.change(nameInput(index), { target: { value } });
}

function typeBundle(value: string, index = 0) {
  fireEvent.change(bundleInput(index), { target: { value } });
}

function clickSearch() {
  fireEvent.click(screen.getByRole("button", { name: "开始搜索" }));
}

function summaryText() {
  return document.querySelector('[data-role="summary"]')?.textContent ?? "";
}

function composerContext() {
  return document.querySelector('[data-role="composer-context"]')?.textContent ?? "";
}

beforeEach(() => {
  window.history.replaceState({}, "", "/search");
  searchMock.mockReset();
});

afterEach(cleanup);

describe("search page composer", () => {
  it("starts with one paired row, us country, and the idle empty state", () => {
    renderSearch();

    expect(nameInput()).toBeTruthy();
    expect(bundleInput()).toBeTruthy();
    expect((nameInput() as HTMLInputElement).placeholder).toBe("应用名称（与 Bundle ID 二选一）");
    expect((bundleInput() as HTMLInputElement).placeholder).toBe("Bundle ID（与名称二选一）");
    expect(screen.queryByRole("button", { name: "移除应用 1" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "App Store 区域" }).textContent).toContain("美国 · US");
    expect(document.querySelector('[data-role="country-code"]')?.textContent).toBe("US");
    expect(screen.getByRole("heading", { name: "输入应用名称或 Bundle ID 后显示结果" })).toBeTruthy();
    expect(document.querySelector(".filter-bar")?.hasAttribute("hidden")).toBe(true);
    expect(summaryText()).toBe("尚未检索");
  });

  it("adds and removes rows, keeping the one-row minimum and row order", () => {
    renderSearch();

    typeName("First");
    fireEvent.click(screen.getByRole("button", { name: "添加应用" }));
    typeName("Second", 1);
    expect(composerContext()).toBe("2 个应用名称 · US 区");

    fireEvent.click(screen.getByRole("button", { name: "移除应用 2" }));
    expect(screen.queryByRole("textbox", { name: "应用名称 2" })).toBeNull();
    expect((nameInput() as HTMLInputElement).value).toBe("First");
    expect(screen.queryByRole("button", { name: "移除应用 1" })).toBeNull();
  });

  it("counts bundle-only rows as queries", () => {
    renderSearch();
    typeBundle("com.example.only");
    expect(composerContext()).toBe("1 个查询 · US 区");
    typeName("Funce");
    expect(composerContext()).toBe("1 个应用名称 · US 区");
  });

  it("submits trimmed names and optional bundle ids in row order", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    renderSearch();

    typeName(" Funce, Daily ");
    typeBundle("  com.example.first  ");
    fireEvent.click(screen.getByRole("button", { name: "添加应用" }));
    typeName("Name only", 1);
    typeBundle("   ", 1);

    clickSearch();
    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(1));
    expect(searchMock).toHaveBeenCalledWith(
      [
        { name: "Funce, Daily", bundleId: "com.example.first" },
        { name: "Name only" },
      ],
      "us",
    );
    await screen.findByRole("heading", { name: "Funce" });
  });

  it("submits on Enter but not during IME composition", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    renderSearch();
    typeName("Funce");

    const composing = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(composing, "isComposing", { value: true });
    fireEvent(nameInput(), composing);
    expect(searchMock).not.toHaveBeenCalled();

    fireEvent.keyDown(nameInput(), { key: "Enter" });
    await waitFor(() => expect(searchMock).toHaveBeenCalledWith([{ name: "Funce" }], "us"));
  });

  it("cancels an in-flight search when an invalid row is submitted", async () => {
    searchMock.mockReturnValue(new Promise(() => {}));
    renderSearch();
    typeName("Funce");
    clickSearch();
    expect(screen.getByText("检索中...")).toBeTruthy();

    fireEvent.click(document.querySelector(".wx-composer-summary")!);
    typeName("   ");
    clickSearch();

    await waitFor(() => expect(screen.queryByText("检索中...")).toBeNull());
    expect(screen.getByRole("heading", { name: "输入应用名称或 Bundle ID 后显示结果" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("应用名称与 Bundle ID 至少填一项");
  });

  it("blocks a blank row and clears the error when the row becomes valid", () => {
    renderSearch();
    clickSearch();

    expect(searchMock).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("应用名称与 Bundle ID 至少填一项");
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
    expect(bundleInput().getAttribute("aria-invalid")).toBe("true");
    expect(nameInput().getAttribute("aria-describedby")).toBe("search-query-error");

    typeBundle("com.example.only");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nameInput().hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("search page country and filters", () => {
  it("switches country, updates the summary, and disables the US-only IAP filter", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    renderSearch();

    fireEvent.click(screen.getByRole("combobox", { name: "App Store 区域" }));
    fireEvent.click(await screen.findByRole("option", { name: "日本 · JP" }));

    expect(composerContext()).toBe("JP 区");
    expect(document.querySelector('[data-role="country-code"]')?.textContent).toBe("JP");
    expect(summaryText()).toBe("已切换至 JP 区");

    typeName("Funce");
    clickSearch();
    await screen.findByRole("heading", { name: "Funce" });

    const iap = screen.getByRole("button", { name: "美元价格筛选仅美国区" });
    expect(iap.getAttribute("aria-disabled")).toBe("true");
  });

  it("searches the selected country", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    renderSearch();

    fireEvent.click(screen.getByRole("combobox", { name: "App Store 区域" }));
    fireEvent.click(await screen.findByRole("option", { name: "日本 · JP" }));
    typeName("Funce");
    clickSearch();

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith([{ name: "Funce" }], "jp"));
  });

  it("filters by status, screenshots, and US IAP hints", async () => {
    searchMock.mockResolvedValue(response([matched(), noMatch("Missing")]));
    const { container } = renderSearch();
    typeName("Funce");
    typeBundle("com.example.funce");
    fireEvent.click(screen.getByRole("button", { name: "添加应用" }));
    typeName("Missing", 1);
    clickSearch();

    await screen.findByRole("heading", { name: "Funce" });
    expect(container.querySelectorAll(".result-row")).toHaveLength(2);
    expect(summaryText()).toContain("共 2 项");

    fireEvent.click(screen.getByRole("radio", { name: "已匹配 1" }));
    expect(container.querySelectorAll(".result-row")).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "未解决 1" }));
    expect(container.querySelectorAll(".result-row")).toHaveLength(1);

    fireEvent.click(screen.getByRole("radio", { name: "全部 2" }));
    fireEvent.click(screen.getByRole("button", { name: "仅看有截图" }));
    expect(container.querySelectorAll(".result-row")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "仅看有截图" }));
    fireEvent.click(screen.getByRole("button", { name: "命中 4.99 / 9.99" }));
    expect(container.querySelectorAll(".result-row")).toHaveLength(1);
  });
});

describe("search page results and states", () => {
  it("shows the filtered-empty state when a search returns nothing", async () => {
    searchMock.mockResolvedValue(response([]));
    renderSearch();
    typeName("Nothing");
    clickSearch();

    await screen.findByRole("heading", { name: "没有符合当前筛选的结果" });
    expect(summaryText()).toContain("共 0 项");
  });

  it("shows the error state when the request fails", async () => {
    searchMock.mockRejectedValue(new Error("boom"));
    renderSearch();
    typeName("Funce");
    clickSearch();

    await screen.findByText("请求失败，请稍后重试");
    expect(summaryText()).toBe("检索失败");
  });

  it("renders queue badges, inspector identity, and store link for the selected row", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    renderSearch();
    typeName("Funce");
    typeBundle("com.example.funce");
    clickSearch();

    await screen.findByRole("heading", { name: "Funce" });
    expect(screen.getAllByText("已匹配").length).toBeGreaterThan(0);
    expect(screen.getAllByText("com.example.funce").length).toBeGreaterThan(0);
    expect(screen.getAllByText("123").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "打开商店页" }).getAttribute("href")).toContain(
      "/us/app/funce",
    );
    expect(screen.getByText("A short description")).toBeTruthy();
  });

  it("clears rows and results, preserves country, and reopens the composer", async () => {
    searchMock.mockResolvedValue(response([matched()]));
    const { container } = renderSearch();

    fireEvent.click(screen.getByRole("combobox", { name: "App Store 区域" }));
    fireEvent.click(await screen.findByRole("option", { name: "英国 · GB" }));
    typeName("Funce");
    clickSearch();
    await screen.findByRole("heading", { name: "Funce" });

    fireEvent.click(screen.getByRole("button", { name: "清空结果" }));
    expect(container.querySelectorAll(".result-row")).toHaveLength(0);
    expect((nameInput() as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("combobox", { name: "App Store 区域" }).textContent).toContain("英国 · GB");
    expect(summaryText()).toBe("尚未检索");
    expect(document.querySelector(".filter-bar")?.hasAttribute("hidden")).toBe(true);
  });
});
