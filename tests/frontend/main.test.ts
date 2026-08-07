import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api", () => ({
  searchApps: vi.fn(async () => ({
    results: [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          screenshotUrls: ["https://example.com/1.png"],
          iapItems: [{ name: "Pack", price: "$4.99" }],
        },
        alternates: [],
        iapHints: {
          "4.99": "found",
          "9.99": "not_found",
          source: "rendered_page",
        },
        message: null,
      },
    ],
  })),
}));

describe("main shell", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("keeps the default shell compact instead of showing long instructional copy", async () => {
    await import("../../src/main");

    const app = document.querySelector("#app");
    expect(app?.textContent).toContain("App搜索工作台");
    expect(app?.textContent).toContain("搜索");
    expect(app?.textContent).not.toContain("Competitor Workbench");
    expect(app?.textContent).not.toContain("Apple search endpoint plus rendered App Store product page");
    expect(app?.textContent).not.toContain("Captured signals");
  });

  it("renders the filter bar and empty state shell", async () => {
    await import("../../src/main");

    expect(document.querySelector(".filter-bar")?.hasAttribute("hidden")).toBe(true);
    expect(document.querySelector('[data-role="status-filter"]')?.textContent).toContain("全部 0");
    expect(document.querySelector(".empty-state")?.textContent).toContain("等待搜索");
    expect(document.querySelector(".empty-state")?.textContent).toContain("输入应用名称后显示结果");
    expect(document.querySelector(".empty-state")?.textContent).toContain("支持单个搜索");
    expect(document.querySelector(".empty-state-mark")).not.toBeNull();
    expect(document.querySelector(".empty-state-visual")).toBeNull();
    expect(document.querySelector(".field-note")?.textContent).toContain("每行一个");
    expect(document.querySelector('[data-role="search"] .button-icon')).not.toBeNull();
    expect(document.querySelector('[data-role="clear"] .button-icon')).not.toBeNull();
    expect(document.querySelector('[data-role="search"]')?.textContent).toContain("开始搜索");
    expect(document.querySelector('[data-role="clear"]')?.textContent).toContain("清空结果");
  });

  it("updates filter counts after a search completes", async () => {
    await import("../../src/main");

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    const searchButton = document.querySelector('[data-role="search"]') as HTMLButtonElement;

    textarea.value = "Funce";
    searchButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector(".filter-bar")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector('[data-role="status-filter"]')?.textContent).toContain("全部 1");
    expect(document.querySelector('[data-role="status-filter"][data-value="matched"]')?.textContent).toContain(
      "已匹配 1",
    );
  });
});
