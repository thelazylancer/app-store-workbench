import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchApps } from "../../src/lib/api";
import type { SearchAppsResponse, StoreCountry } from "../../shared/types";

vi.mock("../../src/lib/api", () => ({
  searchApps: vi.fn(async (_names: string[], country: StoreCountry = "us") => ({
    country,
    results: [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appleId: 123,
          category: "Utilities",
          versionHistory: [],
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          screenshotUrls: ["https://example.com/1.png"],
          iapItems: [{ name: "Pack", price: "$4.99" }],
        },
        candidates: [],
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

const defaultSearch = vi.mocked(searchApps).getMockImplementation()!;

function getQuickInput() {
  return document.querySelector<HTMLInputElement>('[data-role="quick-query"]')!;
}

function getBatchTextarea() {
  return document.querySelector<HTMLTextAreaElement>('[data-role="batch-query"]')!;
}

function typeQuickQuery(value: string) {
  const input = getQuickInput();
  input.value = value;
  input.dispatchEvent(new Event("input"));
  return input;
}

function createPasteEvent(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type: string) => (type === "text/plain" ? text : "") },
  });
  return event;
}

describe("main shell", () => {
  beforeEach(() => {
    vi.mocked(searchApps).mockReset().mockImplementation(defaultSearch);
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
    expect(document.querySelector(".empty-state")?.textContent).toContain("输入应用名称后显示结果");
    expect(document.querySelector(".empty-state-kicker")).toBeNull();
    expect(document.querySelector(".empty-state-mark")).not.toBeNull();
    expect(document.querySelector(".empty-state-visual")).toBeNull();
    expect(document.querySelector(".field-note")).toBeNull();
    expect(document.querySelector('[data-role="search"] .button-icon')).not.toBeNull();
    expect(document.querySelector('[data-role="clear"] .button-icon')).not.toBeNull();
    expect(document.querySelector('[data-role="search"]')?.textContent).toContain("开始搜索");
    expect(document.querySelector('[data-role="clear"]')?.textContent).toContain("清空结果");
  });

  it("keeps the header storefront-neutral when searching and clearing GB results", async () => {
    await import("../../src/main");
    const country = document.querySelector<HTMLSelectElement>('select[aria-label="App Store 区域"]')!;
    country.value = "gb";
    country.dispatchEvent(new Event("change"));
    typeQuickQuery("Duvae");
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    expect(document.querySelector(".workspace-kicker")).toBeNull();
    expect(document.querySelectorAll('[data-role="country-code"]')[0]?.textContent).toBe("GB");
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(country.value).toBe("gb");
    expect(document.querySelector(".workspace-kicker")).toBeNull();
  });

  it("searches the chosen country and preserves it across Clear with country-specific links and filters", async () => {
    await import("../../src/main");
    const country = document.querySelector<HTMLSelectElement>('select[aria-label="App Store 区域"]');
    expect(country).not.toBeNull();
    expect(Array.from(country!.options, (option) => option.value)).toEqual(["us", "cn", "hk", "tw", "jp", "sg", "gb", "au"]);
    expect(country!.value).toBe("us");
    const quickInput = typeQuickQuery("Funce");
    country!.value = "jp";
    country!.dispatchEvent(new Event("change"));
    expect(quickInput.value).toBe("Funce");
    expect(getBatchTextarea().value).toBe("Funce");
    expect(document.querySelector<HTMLButtonElement>('[data-role="iap-filter"]')!.disabled).toBe(true);
    expect(document.querySelector('[data-role="iap-filter"]')?.textContent).toContain("仅美国区");
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    await vi.waitFor(() => expect(document.querySelector(".qimai-link")).not.toBeNull());
    expect(searchApps).toHaveBeenCalledWith(["Funce"], "jp");
    expect(document.querySelector(".qimai-link")?.getAttribute("href")).toContain("/country/jp");
    expect(document.querySelector(".primary-link")?.getAttribute("href")).toContain("/jp/app/");
    expect(document.querySelector(".iap-hints")?.textContent).toContain("仅适用于美国区");
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(country!.value).toBe("jp");
    expect(document.querySelectorAll(".result-row")).toHaveLength(0);
  });

  it.each(["country", "clear", "newer search", "empty submission"])("ignores a late search response after %s", async (action) => {
    const oldResponse = await defaultSearch(["Funce"], "us");
    let finish!: (response: SearchAppsResponse) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await import("../../src/main");
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    typeQuickQuery("Funce");
    search.click();
    if (action === "country") {
      const select = document.querySelector("select")!;
      select.value = "jp";
      select.dispatchEvent(new Event("change"));
    } else if (action === "clear") {
      document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    } else if (action === "empty submission") {
      typeQuickQuery("");
      search.click();
    } else {
      const latest = structuredClone(oldResponse);
      latest.results[0]!.query = "Latest";
      latest.results[0]!.app!.name = "Latest";
      vi.mocked(searchApps).mockResolvedValueOnce(latest);
      typeQuickQuery("Latest");
      search.click();
      await vi.waitFor(() => expect(document.querySelector(".inspector h3")?.textContent).toBe("Latest"));
    }
    finish(oldResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector(".inspector h3")?.textContent).toBe(action === "newer search" ? "Latest" : undefined);
    expect(document.querySelector('[data-role="summary"]')?.textContent).not.toContain("检索失败");
  });

  it("ignores an older search failure after newer results are displayed", async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await import("../../src/main");
    typeQuickQuery("First");
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    search.click();
    search.click();
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    fail(new Error("Old request failed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector(".inspector h3")?.textContent).toBe("Funce");
    expect(document.querySelector('[data-role="summary"]')?.textContent).toContain("共 1 项");
  });

  it("uses a full-width composer disclosure with batch context and reopens it on Clear", async () => {
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const disclosure = composer.querySelector<HTMLElement>("summary")!;
    const quickInput = typeQuickQuery("Funce, Duolingo");
    expect(composer.open).toBe(true);
    expect(composer.nextElementSibling?.classList.contains("content-panel")).toBe(true);
    expect(disclosure.textContent).toContain("2 个应用名称 · US 区");
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    search.focus();
    search.click();
    expect(composer.open).toBe(false);
    expect(document.activeElement).toBe(disclosure);
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    disclosure.click();
    expect(composer.open).toBe(true);
    expect(quickInput.value).toBe("Funce, Duolingo");
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(composer.open).toBe(true);
    expect(quickInput.value).toBe("");
    expect(getBatchTextarea().value).toBe("");
    expect(document.activeElement).toBe(quickInput);
    expect(disclosure.textContent).toContain("US 区");
  });

  it("opens the batch editor, mirrors parsed names, and returns focus to its toggle", async () => {
    await import("../../src/main");
    const toggle = document.querySelector<HTMLButtonElement>('[data-role="batch-toggle"]')!;
    const panel = document.querySelector<HTMLElement>('[data-role="batch-panel"]')!;
    const textarea = getBatchTextarea();
    const quickInput = getQuickInput();
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    toggle.click();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(textarea);
    textarea.value = "Funce\nDuolingo, Monument";
    textarea.dispatchEvent(new Event("input"));
    expect(quickInput.value).toBe("Funce, Duolingo, Monument");
    expect(document.querySelector(".composer-summary")?.textContent).toContain("3 个应用名称 · US 区");
    toggle.click();
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(quickInput.value).toBe("Funce, Duolingo, Monument");
  });

  it("normalizes multiline paste into comma-separated names and keeps parse order", async () => {
    await import("../../src/main");
    const quickInput = getQuickInput();
    const textarea = getBatchTextarea();
    quickInput.focus();
    quickInput.setSelectionRange(0, 0);
    quickInput.dispatchEvent(createPasteEvent("Funce\nDuolingo\n\nMonument"));
    expect(quickInput.value).toBe("Funce, Duolingo, Monument");
    expect(textarea.value).toBe("Funce, Duolingo, Monument");
    quickInput.setSelectionRange(0, 7);
    quickInput.dispatchEvent(createPasteEvent("A\nB"));
    expect(quickInput.value).toBe("A, B, Duolingo, Monument");
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    expect(searchApps).toHaveBeenCalledWith(["A", "B", "Duolingo", "Monument"], "us");
  });

  it("keeps the quick input caret while syncing the canonical query field", async () => {
    await import("../../src/main");
    const quickInput = typeQuickQuery("Funce, Duolingo");
    quickInput.setSelectionRange(7, 7);
    quickInput.dispatchEvent(new Event("input"));
    expect(quickInput.selectionStart).toBe(7);
    expect(quickInput.selectionEnd).toBe(7);
    expect(getBatchTextarea().value).toBe("Funce, Duolingo");
  });

  it("submits on Enter in the quick input except during IME composition", async () => {
    await import("../../src/main");
    const quickInput = typeQuickQuery("Funce");
    const batchEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    getBatchTextarea().dispatchEvent(batchEnter);
    expect(batchEnter.defaultPrevented).toBe(false);
    expect(searchApps).not.toHaveBeenCalled();
    const composingEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(composingEnter, "isComposing", { value: true });
    quickInput.dispatchEvent(composingEnter);
    expect(searchApps).not.toHaveBeenCalled();
    quickInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(searchApps).toHaveBeenCalledWith(["Funce"], "us"));
  });

  it.each(["editing", "outside"])("does not collapse the composer or steal %s focus when results finish", async (location) => {
    const response = await defaultSearch(["Funce"], "us");
    let finish!: (response: SearchAppsResponse) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const quickInput = getQuickInput();
    const textarea = getBatchTextarea();
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    typeQuickQuery("Funce");
    search.focus();
    search.click();
    expect(composer.open).toBe(false);
    composer.querySelector<HTMLElement>("summary")!.click();
    expect(composer.open).toBe(true);
    const outside = document.createElement("button");
    document.body.append(outside);
    let focused: HTMLElement;
    if (location === "editing") {
      document.querySelector<HTMLButtonElement>('[data-role="batch-toggle"]')!.click();
      textarea.value = "Next name";
      textarea.dispatchEvent(new Event("input"));
      focused = textarea;
    } else {
      typeQuickQuery("Next name");
      focused = outside;
    }
    focused.focus();
    expect(document.activeElement).toBe(focused);
    finish(response);
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    expect(composer.open).toBe(true);
    expect(document.activeElement).toBe(focused);
    expect(quickInput.value).toBe("Next name");
    outside.remove();
  });

  it("closes the batch editor and focuses the quick input on Clear", async () => {
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const toggle = document.querySelector<HTMLButtonElement>('[data-role="batch-toggle"]')!;
    const panel = document.querySelector<HTMLElement>('[data-role="batch-panel"]')!;
    const textarea = getBatchTextarea();
    const quickInput = getQuickInput();
    toggle.click();
    textarea.value = "Funce\nDuolingo";
    textarea.dispatchEvent(new Event("input"));
    expect(quickInput.value).toBe("Funce, Duolingo");
    composer.open = false;
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(composer.open).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(quickInput.value).toBe("");
    expect(textarea.value).toBe("");
    expect(document.activeElement).toBe(quickInput);
  });

  it("updates filter counts after a search completes", async () => {
    await import("../../src/main");

    const searchButton = document.querySelector('[data-role="search"]') as HTMLButtonElement;

    typeQuickQuery("Funce");
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
