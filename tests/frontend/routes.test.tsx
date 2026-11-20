import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/app/routes";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ days: [] })));
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
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBeNull();
  });

  it("renders the search workspace at /search", () => {
    renderAt("/search");
    expect(screen.getByRole("heading", { level: 2, name: "商店页信息" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "输入应用名称或 Bundle ID 后显示结果" })).toBeTruthy();
    expect(document.title).toBe("App Store 搜索 · App 搜索工作台");
    expect(screen.getByRole("link", { name: "App Store 搜索" }).getAttribute("aria-current")).toBe("page");
  });

  it("renders the package detail at /package/:code", () => {
    renderAt("/package/123");
    expect(screen.getByRole("button", { name: "返回竞品日报" })).toBeTruthy();
    expect(screen.queryByText(/详情页迁移中/)).toBeNull();
  });

  it("renders a page-level 404", () => {
    renderAt("/missing");
    expect(screen.getByRole("heading", { level: 1, name: "页面不存在" })).toBeTruthy();
  });
});
