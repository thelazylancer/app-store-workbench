import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchApps } from "../../src/lib/api";
import type { AppSearchQuery, SearchAppsResponse, StoreCountry } from "../../shared/types";

vi.mock("../../src/lib/api", () => ({
  searchApps: vi.fn(async (_queries: AppSearchQuery[], country: StoreCountry = "us") => ({
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

function getNameInput(index = 0) {
  return document.querySelectorAll<HTMLInputElement>('[data-role="query-name"]')[index]!;
}

function getBundleInput(index = 0) {
  return document.querySelectorAll<HTMLInputElement>('[data-role="query-bundle"]')[index]!;
}

function typeQuery(value: string, index = 0) {
  const input = getNameInput(index);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

function typeBundle(value: string, index = 0) {
  const input = getBundleInput(index);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

function addQuery() {
  document.querySelector<HTMLButtonElement>('[data-role="add-query"]')!.click();
}

describe("main shell", () => {
  beforeEach(() => {
    vi.mocked(searchApps).mockReset().mockImplementation(defaultSearch);
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("keeps one compact paired row without legacy inputs or long instructional copy", async () => {
    await import("../../src/main");

    const app = document.querySelector("#app");
    expect(app?.textContent).toContain("App搜索工作台");
    expect(app?.textContent).toContain("添加应用");
    expect(app?.textContent).not.toContain("Competitor Workbench");
    expect(app?.textContent).not.toContain("Apple search endpoint plus rendered App Store product page");
    expect(app?.textContent).not.toContain("Captured signals");
    expect(document.querySelectorAll(".query-row")).toHaveLength(1);
    expect(getNameInput().labels?.[0]?.textContent).toContain("应用名称 1");
    expect(getNameInput().getAttribute("aria-required")).toBe("true");
    expect(getBundleInput().labels?.[0]?.textContent).toContain("Bundle ID 1（可选）");
    expect(document.querySelector<HTMLButtonElement>('[data-role="remove-query"]')!.hidden).toBe(true);
    expect(document.querySelector('[data-role="quick-query"], [data-role="batch-query"], [data-role="batch-toggle"], textarea')).toBeNull();
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
    typeQuery("Duvae");
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
    const name = typeQuery("Funce");
    const bundle = typeBundle("com.example.Funce");
    country!.value = "jp";
    country!.dispatchEvent(new Event("change"));
    expect(name.value).toBe("Funce");
    expect(bundle.value).toBe("com.example.Funce");
    expect(document.querySelector<HTMLButtonElement>('[data-role="iap-filter"]')!.disabled).toBe(true);
    expect(document.querySelector('[data-role="iap-filter"]')?.textContent).toContain("仅美国区");
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    await vi.waitFor(() => expect(document.querySelector(".qimai-link")).not.toBeNull());
    expect(searchApps).toHaveBeenCalledWith([{ name: "Funce", bundleId: "com.example.Funce" }], "jp");
    expect(document.querySelector(".qimai-link")?.getAttribute("href")).toContain("/country/jp");
    expect(document.querySelector(".primary-link")?.getAttribute("href")).toContain("/jp/app/");
    expect(document.querySelector(".iap-hints")?.textContent).toContain("仅适用于美国区");
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(country!.value).toBe("jp");
    expect(document.querySelectorAll(".result-row")).toHaveLength(0);
  });

  it.each(["country", "clear", "newer search", "empty submission", "invalid row"])("ignores a late search response after %s", async (action) => {
    const oldResponse = await defaultSearch([{ name: "Funce" }], "us");
    let finish!: (response: SearchAppsResponse) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await import("../../src/main");
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    typeQuery("Funce");
    search.click();
    if (action === "country") {
      const select = document.querySelector("select")!;
      select.value = "jp";
      select.dispatchEvent(new Event("change"));
    } else if (action === "clear") {
      document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    } else if (action === "empty submission" || action === "invalid row") {
      typeQuery("");
      if (action === "invalid row") typeBundle("com.example.Funce");
      search.click();
    } else {
      const latest = structuredClone(oldResponse);
      latest.results[0]!.query = "Latest";
      latest.results[0]!.app!.name = "Latest";
      vi.mocked(searchApps).mockResolvedValueOnce(latest);
      typeQuery("Latest");
      search.click();
      await vi.waitFor(() => expect(document.querySelector(".inspector h3")?.textContent).toBe("Latest"));
    }
    finish(oldResponse);
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector(".inspector h3")?.textContent).toBe(action === "newer search" ? "Latest" : undefined);
    expect(document.querySelector('[data-role="summary"]')?.textContent).not.toContain("检索失败");
    if (action === "invalid row") {
      expect(searchApps).toHaveBeenCalledTimes(1);
      expect(document.querySelector<HTMLElement>('[data-role="query-error"]')!.hidden).toBe(false);
      expect(document.querySelector('[data-role="summary"]')?.textContent).not.toContain("正在查询");
    }
  });

  it("ignores an older search failure after newer results are displayed", async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
    await import("../../src/main");
    typeQuery("First");
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

  it("uses the full-width disclosure with row context and reopens it on Clear", async () => {
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const disclosure = composer.querySelector<HTMLElement>("summary")!;
    const name = typeQuery("Funce");
    typeBundle("com.example.Funce");
    addQuery();
    typeQuery("Duolingo", 1);
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
    expect(name.value).toBe("Funce");
    expect(getBundleInput().value).toBe("com.example.Funce");
    expect(getNameInput(1).value).toBe("Duolingo");
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(composer.open).toBe(true);
    expect(name.value).toBe("");
    expect(getBundleInput().value).toBe("");
    expect(document.querySelectorAll(".query-row")).toHaveLength(1);
    expect(document.activeElement).toBe(name);
    expect(disclosure.textContent).toContain("US 区");
  });

  it("adds and removes paired rows with accessible controls, stable values and predictable focus", async () => {
    await import("../../src/main");
    const first = typeQuery("First");
    typeBundle("com.first");
    addQuery();
    expect(document.activeElement).toBe(getNameInput(1));
    typeQuery("Second", 1);
    typeBundle("com.second", 1);
    addQuery();
    const third = typeQuery("Third", 2);
    const thirdBundle = typeBundle("com.third", 2);
    const remove = document.querySelectorAll<HTMLButtonElement>('[data-role="remove-query"]')[1]!;
    expect(remove.hidden).toBe(false);
    expect(remove.getAttribute("aria-label")).toBe("移除应用 2");
    remove.click();
    expect(document.querySelectorAll(".query-row")).toHaveLength(2);
    expect(getNameInput()).toBe(first);
    expect(first.value).toBe("First");
    expect(getBundleInput().value).toBe("com.first");
    expect(getNameInput(1)).toBe(third);
    expect(getBundleInput(1)).toBe(thirdBundle);
    expect(thirdBundle.value).toBe("com.third");
    expect(third.labels?.[0]?.textContent).toContain("应用名称 2");
    expect(document.activeElement).toBe(third);
    document.querySelectorAll<HTMLButtonElement>('[data-role="remove-query"]')[1]!.click();
    expect(document.querySelectorAll(".query-row")).toHaveLength(1);
    expect(document.querySelector<HTMLButtonElement>('[data-role="remove-query"]')!.hidden).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(searchApps).not.toHaveBeenCalled();
  });

  it("sends each trimmed name and optional Bundle ID in row order without splitting or deduplicating names", async () => {
    await import("../../src/main");
    typeQuery(" Funce, Daily ");
    typeBundle("  com.example.first  ");
    addQuery();
    typeQuery(" Funce, Daily ", 1);
    typeBundle("com.example.second", 1);
    addQuery();
    typeQuery(" Name only ", 2);
    typeBundle("  \t ", 2);
    addQuery();
    typeQuery("  ", 3);
    typeBundle(" \t ", 3);
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    expect(searchApps).toHaveBeenCalledTimes(1);
    expect(searchApps).toHaveBeenCalledWith([
      { name: "Funce, Daily", bundleId: "com.example.first" },
      { name: "Funce, Daily", bundleId: "com.example.second" },
      { name: "Name only" },
    ], "us");
    expect(document.querySelector(".composer-summary")?.textContent).toContain("3 个应用名称 · US 区");
  });

  it("validates a Bundle-only row locally and sends all rows after the name is supplied", async () => {
    await import("../../src/main");
    typeQuery("First");
    addQuery();
    typeBundle("com.example.second", 1);
    const name = getNameInput(1);
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    const error = document.querySelector<HTMLElement>('[data-role="query-error"]')!;
    search.focus();
    search.click();
    expect(searchApps).not.toHaveBeenCalled();
    expect(composer.open).toBe(true);
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe("请填写应用名称");
    expect(error.getAttribute("role")).toBe("alert");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe(error.id);
    expect(document.activeElement).toBe(name);
    typeQuery("Second", 1);
    expect(error.hidden).toBe(true);
    expect(name.hasAttribute("aria-invalid")).toBe(false);
    search.click();
    expect(searchApps).toHaveBeenCalledWith([
      { name: "First" }, { name: "Second", bundleId: "com.example.second" },
    ], "us");
  });

  it("ignores entirely blank rows and resets existing results on an empty overall submission", async () => {
    await import("../../src/main");
    const name = typeQuery("Funce");
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    search.click();
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    document.querySelector<HTMLElement>(".composer-summary")!.click();
    typeQuery(" \t ");
    typeBundle("  ");
    addQuery();
    typeQuery(" ", 1);
    search.click();
    expect(searchApps).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".result-row")).toHaveLength(0);
    expect(document.querySelector(".empty-state")?.textContent).toContain("输入应用名称后显示结果");
    expect(document.querySelector('[data-role="summary"]')?.textContent).toBe("尚未检索");
    expect(document.querySelector<HTMLElement>('[data-role="query-error"]')!.hidden).toBe(true);
    expect(document.querySelector<HTMLDetailsElement>(".search-composer")!.open).toBe(true);
    expect(getNameInput()).toBe(name);
  });

  it("keeps native row nodes, selection and caret intact during edits", async () => {
    await import("../../src/main");
    const name = typeQuery("Funce, Daily");
    const bundle = typeBundle("com.example.Funce");
    addQuery();
    name.focus();
    name.setSelectionRange(2, 5, "backward");
    name.dispatchEvent(new Event("input", { bubbles: true }));
    expect(getNameInput()).toBe(name);
    expect(getBundleInput()).toBe(bundle);
    expect(document.activeElement).toBe(name);
    expect(name.selectionStart).toBe(2);
    expect(name.selectionEnd).toBe(5);
    expect(name.selectionDirection).toBe("backward");
    bundle.focus();
    bundle.setSelectionRange(4, 11, "backward");
    bundle.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement).toBe(bundle);
    expect(bundle.selectionStart).toBe(4);
    expect(bundle.selectionEnd).toBe(11);
    expect(bundle.selectionDirection).toBe("backward");
    expect(name.value).toBe("Funce, Daily");
  });

  it.each(["query-name", "query-bundle"])("submits on Enter in %s except during IME composition", async (role) => {
    await import("../../src/main");
    typeQuery("Funce");
    typeBundle("com.example.Funce");
    const input = document.querySelector<HTMLInputElement>(`[data-role="${role}"]`)!;
    const composingEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    Object.defineProperty(composingEnter, "isComposing", { value: true });
    input.dispatchEvent(composingEnter);
    expect(composingEnter.defaultPrevented).toBe(false);
    const legacyComposition = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true });
    input.dispatchEvent(legacyComposition);
    expect(legacyComposition.defaultPrevented).toBe(false);
    expect(searchApps).not.toHaveBeenCalled();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(searchApps).toHaveBeenCalledWith([{ name: "Funce", bundleId: "com.example.Funce" }], "us"));
  });

  it.each(["name", "bundle", "outside"])("does not collapse the composer or steal %s focus when results finish", async (location) => {
    const response = await defaultSearch([{ name: "Funce" }], "us");
    let finish!: (response: SearchAppsResponse) => void;
    vi.mocked(searchApps).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const search = document.querySelector<HTMLButtonElement>('[data-role="search"]')!;
    typeQuery("Funce");
    search.focus();
    search.click();
    expect(composer.open).toBe(false);
    composer.querySelector<HTMLElement>("summary")!.click();
    expect(composer.open).toBe(true);
    const name = typeQuery("Next name");
    const bundle = typeBundle("com.example.next");
    const outside = document.createElement("button");
    document.body.append(outside);
    const focused = location === "name" ? name : location === "bundle" ? bundle : outside;
    focused.focus();
    finish(response);
    await vi.waitFor(() => expect(document.querySelector(".result-row")).not.toBeNull());
    expect(composer.open).toBe(true);
    expect(document.activeElement).toBe(focused);
    expect(name.value).toBe("Next name");
    expect(bundle.value).toBe("com.example.next");
    outside.remove();
  });

  it("clears validation and extra rows and focuses the first name on Clear", async () => {
    await import("../../src/main");
    const composer = document.querySelector<HTMLDetailsElement>(".search-composer")!;
    const name = typeQuery("Funce");
    typeBundle("com.first");
    addQuery();
    typeBundle("com.second", 1);
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    expect(document.querySelector<HTMLElement>('[data-role="query-error"]')!.hidden).toBe(false);
    composer.open = false;
    document.querySelector<HTMLButtonElement>('[data-role="clear"]')!.click();
    expect(composer.open).toBe(true);
    expect(document.querySelectorAll(".query-row")).toHaveLength(1);
    expect(getNameInput()).toBe(name);
    expect(name.value).toBe("");
    expect(getBundleInput().value).toBe("");
    expect(document.querySelector<HTMLElement>('[data-role="query-error"]')!.hidden).toBe(true);
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(document.activeElement).toBe(name);
  });

  it("updates filter counts after a search completes", async () => {
    await import("../../src/main");
    typeQuery("Funce");
    document.querySelector<HTMLButtonElement>('[data-role="search"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.querySelector(".filter-bar")?.hasAttribute("hidden")).toBe(false);
    expect(document.querySelector('[data-role="status-filter"]')?.textContent).toContain("全部 1");
    expect(document.querySelector('[data-role="status-filter"][data-value="matched"]')?.textContent).toContain("已匹配 1");
  });
});

describe("structured search API client", () => {
  it("posts paired queries and country instead of legacy names", async () => {
    const { searchApps: postSearch } = await vi.importActual<typeof import("../../src/lib/api")>("../../src/lib/api");
    const response: SearchAppsResponse = { country: "jp", results: [] };
    const fetchSearch = vi.fn(async (_url: string, _options?: RequestInit) => new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchSearch);
    try {
      const queries = [{ name: "Funce", bundleId: "com.first" }, { name: "Funce", bundleId: "com.second" }, { name: "Name only" }];
      await expect(postSearch(queries, "jp")).resolves.toEqual(response);
      expect(fetchSearch).toHaveBeenCalledWith("/api/search-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries, country: "jp" }),
      });
      await postSearch([{ name: "Default country" }]);
      expect(fetchSearch.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ queries: [{ name: "Default country" }], country: "us" }));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
