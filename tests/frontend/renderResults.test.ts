import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderResults } from "../../src/lib/renderResults";
import type { SearchResult } from "../../shared/types";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const identityResult: SearchResult = {
  query: "Funce",
  status: "uncertain_match",
  app: {
    name: "Funce AI",
    developer: "A Dev",
    appleId: 6755396077,
    bundleId: "com.example.FunceAI",
    appStoreUrl: "https://apps.apple.com/us/app/funce-ai",
    iconUrl: "",
    description: "A description",
    category: "Utilities",
    screenshotUrls: [],
    versionHistory: [],
    iapItems: [],
  },
  alternates: [{
    name: "Funce Daily",
    developer: "B Dev",
    appleId: 6755396088,
    bundleId: "com.example.FunceDaily",
    appStoreUrl: "https://apps.apple.com/us/app/funce-daily",
    iconUrl: "",
    category: "Utilities",
    screenshotUrls: [],
  }],
  iapHints: null,
  message: "Possible match found; review alternates",
};

describe("renderResults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("copies exact app identifiers with feedback and preserves the current selection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const host = document.createElement("div");
    renderResults(host, [identityResult]);
    const selected = host.querySelector('.result-row[aria-pressed="true"]');

    const appleId = host.querySelector<HTMLButtonElement>('.info-list [aria-label="复制 Apple ID：6755396077"]');
    expect(appleId).not.toBeNull();
    appleId!.click();
    await vi.waitFor(() => expect(appleId!.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));

    const bundleId = host.querySelector<HTMLButtonElement>('.candidate-card.is-current [aria-label="复制 Bundle ID：com.example.FunceAI"]');
    expect(bundleId).not.toBeNull();
    bundleId!.click();
    await vi.waitFor(() => expect(bundleId!.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));

    const alternateId = host.querySelector<HTMLButtonElement>('.alternate-list [aria-label="复制 Bundle ID：com.example.FunceDaily"]');
    expect(alternateId).not.toBeNull();
    alternateId!.click();
    await vi.waitFor(() => expect(alternateId!.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));

    expect(writeText.mock.calls).toEqual([["6755396077"], ["com.example.FunceAI"], ["com.example.FunceDaily"]]);
    expect(host.querySelector('.result-row[aria-pressed="true"]')).toBe(selected);
  });
  it.each(["", " \n\t "])("treats a blank Bundle ID and minimum OS as missing without copy actions", (blank) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      app: { ...identityResult.app!, appleId: undefined, bundleId: blank, minimumOsVersion: blank },
      alternates: [{ ...identityResult.alternates[0]!, appleId: undefined, bundleId: blank, minimumOsVersion: blank }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain("Bundle ID未提供");
    expect(host.querySelector(".info-list")?.textContent).toContain("最低 iOS未提供");
    for (const card of host.querySelectorAll(".candidate-card")) {
      expect(card.textContent).toContain("Bundle ID：未提供");
      expect(card.textContent).toContain("最低 iOS：未提供");
    }
    expect(host.querySelectorAll(".identifier-copy")).toHaveLength(0);
  });

  it("keeps the copy control focusable and prevents duplicate writes while clipboard access is pending", async () => {
    let completeCopy!: () => void;
    const pendingCopy = new Promise<void>((resolve) => {
      completeCopy = resolve;
    });
    const writeText = vi.fn().mockReturnValue(pendingCopy);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const host = document.createElement("div");
    document.body.append(host);
    try {
      renderResults(host, [identityResult]);
      const copy = host.querySelector<HTMLButtonElement>('.info-list [aria-label="复制 Bundle ID：com.example.FunceAI"]')!;
      copy.focus();
      copy.click();

      expect(copy.disabled).toBe(false);
      expect(copy.getAttribute("aria-disabled")).toBe("true");
      expect(document.activeElement).toBe(copy);
      copy.click();
      copy.click();
      expect(writeText.mock.calls).toEqual([["com.example.FunceAI"]]);

      completeCopy();
      await vi.waitFor(() => expect(copy.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));
      expect(copy.getAttribute("aria-disabled")).toBe("false");
      expect(document.activeElement).toBe(copy);
      copy.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    } finally {
      completeCopy();
      host.remove();
    }
  });

  it("keeps candidate identifier values in their row color", () => {
    const style = document.createElement("style");
    style.textContent = styles;
    const host = document.createElement("div");
    document.head.append(style);
    document.body.append(host);
    try {
      renderResults(host, [identityResult]);

      for (const card of host.querySelectorAll(".candidate-card")) {
        const appleId = card.querySelector<HTMLElement>(".candidate-card-apple-id")!;
        expect(getComputedStyle(appleId).color).toBe("rgb(29, 78, 216)");
        expect(getComputedStyle(appleId.querySelector(".identifier-text")!).color).toBe("rgb(29, 78, 216)");
        const bundleId = card.querySelector<HTMLElement>(".candidate-card-bundle-id")!;
        expect(getComputedStyle(bundleId).color).toBe("rgb(100, 116, 139)");
        expect(getComputedStyle(bundleId.querySelector(".identifier-text")!).color).toBe("rgb(100, 116, 139)");
      }
    } finally {
      style.remove();
      host.remove();
    }
  });

  it.each(["unavailable", "denied"])("reports %s clipboard access without hiding the identifier", async (access) => {
    const writeText = vi.fn().mockRejectedValue(new Error("Clipboard denied"));
    vi.stubGlobal("navigator", access === "unavailable" ? {} : { clipboard: { writeText } });
    const host = document.createElement("div");
    renderResults(host, [identityResult]);
    const copy = host.querySelector<HTMLButtonElement>('.info-list [aria-label="复制 Bundle ID：com.example.FunceAI"]')!;

    copy.click();

    await vi.waitFor(() => expect(copy.parentElement?.querySelector('[role="status"]')?.textContent).toBe("复制失败，请手动选择标识"));
    expect(copy.parentElement?.textContent).toContain("com.example.FunceAI");
    expect(copy.disabled).toBe(false);

    if (access === "denied") {
      writeText.mockResolvedValue(undefined);
      copy.click();
      await vi.waitFor(() => expect(copy.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));
    }
  });

  it.each([
    { label: "free", facts: { price: 0 }, expected: "免费" },
    { label: "formatted paid", facts: { price: 2.99, formattedPrice: "US$2.99", currency: "USD" }, expected: "US$2.99 · USD" },
    { label: "numeric paid", facts: { price: 2.99, currency: "EUR" }, expected: "2.99 · EUR" },
    { label: "unknown currency", facts: { price: 2.99 }, expected: "2.99 · 币种未提供" },
    { label: "unknown currency with a label", facts: { price: 2.99, formattedPrice: "$2.99" }, expected: "$2.99 · 币种未提供" },
    { label: "missing numeric price", facts: { formattedPrice: "Free", currency: "USD" }, expected: "未提供" },
    { label: "missing price", facts: {}, expected: "未提供" },
  ])("distinguishes $label app prices in details and candidate cards", ({ facts, expected }) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      app: { ...identityResult.app!, ...facts, iapItems: [{ name: "IAP Pack", price: "$4.99" }] },
      alternates: [{ ...identityResult.alternates[0]!, ...facts }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain(`应用价格${expected}`);
    for (const card of host.querySelectorAll(".candidate-card")) {
      expect(card.textContent).toContain(`应用价格：${expected}`);
    }
    expect(host.querySelector(".info-list")?.textContent).not.toContain("$4.99");
  });

  it.each([
    { label: "zero", facts: { averageUserRating: 0, userRatingCount: 0 }, expected: "0 / 5 · 0 条评分" },
    { label: "provided", facts: { averageUserRating: 4.75, userRatingCount: 1234 }, expected: "4.75 / 5 · 1,234 条评分" },
    { label: "missing count", facts: { averageUserRating: 4.5 }, expected: "4.5 / 5" },
    { label: "missing rating", facts: { userRatingCount: 12 }, expected: "未提供 · 12 条评分" },
    { label: "missing", facts: {}, expected: "未提供" },
  ])("shows $label rating evidence in details and every candidate", ({ facts, expected }) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      app: { ...identityResult.app!, ...facts },
      alternates: [{ ...identityResult.alternates[0]!, ...facts }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain(`评分${expected}`);
    for (const card of host.querySelectorAll(".candidate-card")) {
      expect(card.textContent).toContain(`评分：${expected}`);
    }
  });

  it.each([
    { facts: { fileSizeBytes: 1250000 }, expected: "1.25 MB" },
    { facts: { fileSizeBytes: 123456789 }, expected: "123.46 MB" },
    { facts: { fileSizeBytes: 0 }, expected: "0 MB" },
    { facts: {}, expected: "未提供" },
  ])("shows package size as $expected without confusing absence with zero", ({ facts, expected }) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      app: { ...identityResult.app!, ...facts },
      alternates: [{ ...identityResult.alternates[0]!, fileSizeBytes: 50000000 }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain(`安装包大小${expected}`);
    expect(host.querySelector(".candidate-card.is-current")?.textContent).toContain(`安装包大小：${expected}`);
    expect(host.querySelector(".alternate-list .candidate-card")?.textContent).toContain("安装包大小：50 MB");
    expect(host.textContent).not.toMatch(/undefined|null|NaN/);
  });

  it.each([
    { minimumOsVersion: "16.0", expected: "16.0+" },
    { minimumOsVersion: undefined, expected: "未提供" },
  ])("shows minimum iOS as $expected and keeps each candidate's own comparison facts", ({ minimumOsVersion, expected }) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      app: {
        ...identityResult.app!,
        averageUserRating: 0,
        userRatingCount: 0,
        price: 0,
        fileSizeBytes: 0,
        minimumOsVersion,
      },
      alternates: [{
        ...identityResult.alternates[0]!,
        averageUserRating: 4.75,
        userRatingCount: 1234,
        price: 2.99,
        formattedPrice: "$2.99",
        currency: "USD",
        fileSizeBytes: 1250000,
        minimumOsVersion: "17.0",
      }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain(`最低 iOS${expected}`);
    const current = host.querySelector(".candidate-card.is-current")?.textContent;
    expect(current).toContain(`最低 iOS：${expected}`);
    expect(current).toContain("评分：0 / 5 · 0 条评分");
    expect(current).toContain("应用价格：免费");
    expect(current).toContain("安装包大小：0 MB");
    const alternate = host.querySelector(".alternate-list .candidate-card")?.textContent;
    expect(alternate).toContain("最低 iOS：17.0+");
    expect(alternate).toContain("评分：4.75 / 5 · 1,234 条评分");
    expect(alternate).toContain("应用价格：$2.99 · USD");
    expect(alternate).toContain("安装包大小：1.25 MB");
  });

  it.each([
    { first: "found", second: "unavailable", expectedFirst: "命中", expectedSecond: "未获取" },
    { first: "not_found", second: "found", expectedFirst: "未命中", expectedSecond: "命中" },
    { first: "unavailable", second: "not_found", expectedFirst: "未获取", expectedSecond: "未命中" },
  ] as const)("keeps $first and $second IAP evidence distinct in summary and details", ({ first, second, expectedFirst, expectedSecond }) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      iapHints: { "4.99": first, "9.99": second, source: "best_effort" },
    }]);

    for (const selector of [".fact-row", ".iap-hints"]) {
      const text = host.querySelector(selector)?.textContent;
      expect(text).toContain(`4.99 ${expectedFirst}`);
      expect(text).toContain(`9.99 ${expectedSecond}`);
    }
  });

  it.each(["null", "unavailable"])("keeps empty IAP extraction neutral with %s hints", (evidence) => {
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      iapHints: evidence === "null" ? null : {
        "4.99": "unavailable",
        "9.99": "unavailable",
        source: "best_effort",
      },
    }]);

    for (const selector of [".fact-row", ".result-row-meta"]) {
      const text = host.querySelector(selector)?.textContent;
      expect(text).toContain("未提取到内购价格");
      expect(text).not.toContain("0 个内购");
    }
    expect(host.textContent).toContain("未提取到内购价格行。");
    if (evidence === "null") {
      expect(host.querySelector(".iap-hints")?.textContent).toBe("暂无价格线索");
      expect(host.querySelector(".fact-row")?.textContent).not.toMatch(/4\.99|9\.99/);
    }
  });

  it("renders a distinct empty-submission state before any results exist", () => {
    const host = document.createElement("div");

    renderResults(host, [], false);

    expect(host.textContent).toContain("输入应用名称开始检索");
  });

  it("renders a result list with an inspector for a matched app", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appleId: 6755396077,
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          category: "Travel",
          versionHistory: [
            {
              version: "1.1.0",
              releasedAt: "2026-01-14T12:07:22Z",
              notes: "Fixed bugs",
            },
          ],
          screenshotUrls: [
            "https://example.com/1.png",
            "https://example.com/2.png",
          ],
          iapItems: [
            { name: "Funce Get 1198 coins", price: "$4.99" },
            { name: "Funce Get 2498 coins", price: "$9.99" },
          ],
        },
        alternates: [],
        iapHints: {
          "4.99": "found",
          "9.99": "found",
          source: "rendered_page",
        },
        message: null,
      },
    ]);

    expect(host.querySelector(".results-workbench")).not.toBeNull();
    expect(host.querySelectorAll(".result-row")).toHaveLength(1);
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("已匹配");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("Travel");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("2 张截图");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("2 个内购");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).not.toContain("4.99");
    expect(host.querySelector(".inspector")?.textContent).toContain("A Dev");
    expect(host.querySelector(".inspector")?.textContent).toContain("Apple ID");
    expect(host.querySelector(".inspector")?.textContent).toContain("6755396077");
    expect(host.querySelector(".inspector")?.textContent).toContain("版本 1.1.0");
    expect(host.querySelector(".inspector")?.textContent).toContain("Travel");
    expect(host.querySelectorAll(".screenshots img")).toHaveLength(2);
    expect(host.querySelectorAll(".iap-row")).toHaveLength(2);
    expect(host.querySelector(".primary-link")?.getAttribute("href")).toContain("apps.apple.com");
    expect(host.querySelector(".qimai-link")?.textContent).toBe("打开 Qimai");
    expect(host.querySelector(".qimai-link")?.getAttribute("href")).toBe(
      "https://www.qimai.cn/app/baseinfo/appid/6755396077/country/us",
    );
  });

  it("renders a fallback when the Apple ID is unavailable", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Missing ID",
        status: "matched",
        app: {
          name: "Missing ID",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/missing-id",
          iconUrl: "https://example.com/icon.png",
          description: "A description",
          category: "Utilities",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [],
        iapHints: null,
        message: null,
      },
    ]);

    expect(host.querySelector(".inspector")?.textContent).toContain("Apple ID");
    expect(host.querySelector(".inspector")?.textContent).toContain("未提供");
    expect(host.querySelector(".qimai-link")).toBeNull();
    expect(host.querySelector(".info-list")?.textContent).toContain("Bundle ID未提供");
    expect(host.querySelectorAll(".identifier-copy")).toHaveLength(0);
  });

  it("limits visible version history to the five most recent entries", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Evin",
        status: "matched",
        app: {
          name: "Evin",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/evin",
          iconUrl: "https://example.com/icon.png",
          description: "A description",
          category: "Lifestyle",
          versionHistory: [
            {
              version: "1.16.24",
              releasedAt: "2026-05-06T02:08:36Z",
              notes: "Improved outfit logging",
            },
            {
              version: "1.15.0",
              releasedAt: "2026-05-01T01:43:36Z",
              notes: "Release 2",
            },
            {
              version: "1.14.0",
              releasedAt: "2026-04-24T01:43:36Z",
              notes: "Release 3",
            },
            {
              version: "1.13.0",
              releasedAt: "2026-04-18T01:43:36Z",
              notes: "Release 4",
            },
            {
              version: "1.12.0",
              releasedAt: "2026-04-12T01:43:36Z",
              notes: "Release 5",
            },
            {
              version: "1.0",
              releasedAt: "2026-04-01T01:43:36Z",
              notes: "Initial release",
            },
          ],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [],
        iapHints: null,
        message: null,
      },
    ]);

    expect(host.querySelectorAll(".version-history-item")).toHaveLength(5);
    expect(host.querySelector(".version-history")?.textContent).toContain("1.16.24");
    expect(host.querySelector(".version-history")?.textContent).toContain("最近 5 个");
    expect(host.querySelector(".version-history")?.textContent).not.toContain(
      "Initial release",
    );
  });

  it("shows loading states and closes from empty lightbox space", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A description",
          category: "Travel",
          versionHistory: [],
          screenshotUrls: [
            "https://example.com/320x480bb.jpg",
            "https://example.com/321x481bb.jpg",
            "https://example.com/322x482bb.jpg",
            "https://example.com/323x483bb.jpg",
          ],
          iapItems: [],
        },
        alternates: [],
        iapHints: null,
        message: null,
      },
    ]);

    const trigger = host.querySelector<HTMLButtonElement>(".screenshot-trigger");
    expect(trigger).not.toBeNull();

    trigger?.click();

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog?.hasAttribute("hidden")).toBe(false);
    expect(dialog?.querySelectorAll(".screenshot-lightbox-image")).toHaveLength(4);
    expect(dialog?.querySelectorAll(".screenshot-lightbox-slide")).toHaveLength(4);
    expect(dialog?.querySelectorAll(".screenshot-lightbox-placeholder")).toHaveLength(4);
    expect(dialog?.querySelector(".screenshot-lightbox-slide")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(dialog?.querySelector(".screenshot-lightbox-strip")).not.toBeNull();
    expect(dialog?.querySelector(".lightbox-counter")?.textContent).toBe("4 张截图");
    expect(dialog?.querySelector("[data-role=lightbox-next]")).toBeNull();
    expect(dialog?.querySelector(".screenshot-lightbox-image")?.getAttribute("src")).toBe(
      "https://example.com/1290x2796bb.jpg",
    );

    const lightboxImages = dialog?.querySelectorAll<HTMLImageElement>(
      ".screenshot-lightbox-image",
    );
    lightboxImages?.[0]?.dispatchEvent(new Event("load"));
    lightboxImages?.[1]?.dispatchEvent(new Event("error"));
    expect(dialog?.querySelector(".screenshot-lightbox-slide")?.classList).toContain(
      "is-loaded",
    );
    expect(dialog?.querySelectorAll(".screenshot-lightbox-slide")[1]?.classList).toContain(
      "is-error",
    );
    expect(dialog?.querySelectorAll(".screenshot-lightbox-placeholder")[1]?.textContent).toContain(
      "加载失败",
    );

    dialog?.querySelector<HTMLElement>(".lightbox-frame")?.click();
    expect(dialog?.hasAttribute("hidden")).toBe(true);

    trigger?.click();
    expect(dialog?.hasAttribute("hidden")).toBe(false);
    dialog?.querySelector<HTMLImageElement>(".screenshot-lightbox-image")?.click();
    expect(dialog?.hasAttribute("hidden")).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dialog?.hasAttribute("hidden")).toBe(true);
  });

  it("switches the inspector when another result row is selected", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          category: "Travel",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [],
        iapHints: {
          "4.99": "unavailable",
          "9.99": "unavailable",
          source: "best_effort",
        },
        message: null,
      },
      {
        query: "Another App",
        status: "matched",
        app: {
          name: "Another App",
          developer: "B Dev",
          appStoreUrl: "https://apps.apple.com/us/app/another-app",
          iconUrl: "https://example.com/icon-2.png",
          description: "Second description",
          category: "Productivity",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [{ name: "Pack", price: "$1.99" }],
        },
        alternates: [],
        iapHints: {
          "4.99": "unavailable",
          "9.99": "unavailable",
          source: "best_effort",
        },
        message: null,
      },
    ]);

    const rows = host.querySelectorAll<HTMLButtonElement>(".result-row");
    rows[1]?.click();

    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("Another App");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("1 个内购");
    expect(host.querySelector(".inspector")?.textContent).toContain("B Dev");
    expect(host.querySelector(".inspector")?.textContent).toContain("$1.99");
  });

  it("renders alternates for an uncertain match in the inspector", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "uncertain_match",
        app: {
          name: "Funce AI",
          developer: "A Dev",
          bundleId: "com.example.FunceAI",
          appStoreUrl: "https://apps.apple.com/us/app/funce-ai",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          category: "Lifestyle",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [
          {
            name: "Funce Daily",
            developer: "B Dev",
            appleId: 6755396088,
            bundleId: "com.example.FunceDaily",
            appStoreUrl: "https://apps.apple.com/us/app/funce-daily",
            iconUrl: "https://example.com/icon-2.png",
            category: "Travel",
            screenshotUrls: [
              "https://example.com/a.png",
              "https://example.com/b.png",
              "https://example.com/c.png",
              "https://example.com/d.png",
            ],
          },
          {
            name: "Funce Planner",
            developer: "C Dev",
            appleId: 6755396089,
            appStoreUrl: "https://apps.apple.com/us/app/funce-planner",
            iconUrl: "https://example.com/icon-3.png",
            category: "Productivity",
            screenshotUrls: ["https://example.com/e.png"],
          },
        ],
        iapHints: {
          "4.99": "unavailable",
          "9.99": "unavailable",
          source: "best_effort",
        },
        message: "Possible match found; review alternates",
      },
    ]);

    expect(host.querySelector(".inspector")?.textContent).toContain(
      "可能匹配，请检查备选结果",
    );
    expect(host.querySelector(".inspector")?.textContent).toContain("候选对比");
    expect(host.querySelector(".inspector > .alternates")).not.toBeNull();
    expect(host.querySelector(".alternate-list-items")).not.toBeNull();
    expect(host.querySelector(".candidate-grid > .candidate-card.is-current")?.textContent).toContain(
      "当前命中",
    );
    expect(host.querySelector(".info-list")?.textContent).toContain("Bundle IDcom.example.FunceAI");
    expect(host.querySelector(".candidate-card.is-current")?.textContent).toContain(
      "Bundle ID：com.example.FunceAI",
    );
    expect(host.querySelector(".alternate-list .candidate-card")?.textContent).toContain(
      "Bundle ID：com.example.FunceDaily",
    );
    expect(host.querySelectorAll(".alternate-list .candidate-card")[1]?.textContent).toContain(
      "Bundle ID：未提供",
    );
    expect(host.querySelector(".alternate-list-header")?.textContent).toContain("2 个备选");
    expect(host.querySelectorAll(".alternate-list .candidate-card")).toHaveLength(2);
    expect(host.querySelectorAll(".candidate-card-rank")).toHaveLength(2);
    expect(host.querySelector(".candidate-card-rank")?.textContent).toBe("#01");
    expect(host.querySelector(".alternate-list .candidate-card")?.textContent).toContain(
      "Apple ID：6755396088",
    );
    const alternateScreenshots = host.querySelector(
      ".alternate-list .candidate-card",
    )?.querySelectorAll<HTMLImageElement>(".candidate-card-screenshot");
    expect(alternateScreenshots).toHaveLength(3);
    expect(alternateScreenshots?.[0]?.src).toBe("https://example.com/a.png");
  });

  it("prefers a matched result over an uncertain one for the default selection", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Maybe Funce",
        status: "uncertain_match",
        app: {
          name: "Maybe Funce",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/maybe-funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          category: "Lifestyle",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [],
        iapHints: {
          "4.99": "unavailable",
          "9.99": "unavailable",
          source: "best_effort",
        },
        message: "Possible match found; review alternates",
      },
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "B Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon-2.png",
          description: "Second description",
          category: "Travel",
          versionHistory: [],
          screenshotUrls: [],
          iapItems: [],
        },
        alternates: [],
        iapHints: {
          "4.99": "found",
          "9.99": "found",
          source: "rendered_page",
        },
        message: null,
      },
    ]);

    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("Funce");
  });

  it("renders explicit text for no_match and search_failed states", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Missing App",
        status: "no_match",
        app: null,
        alternates: [],
        iapHints: null,
        message: "No App Store match found in US store",
      },
      {
        query: "Broken App",
        status: "search_failed",
        app: null,
        alternates: [],
        iapHints: null,
        message: "Search failed",
      },
    ]);

    expect(host.textContent).toContain("未在美国区 App Store 找到结果");

    const rows = host.querySelectorAll<HTMLButtonElement>(".result-row");
    rows[1]?.click();

    expect(host.querySelector(".inspector")?.textContent).toContain("搜索失败");
    expect(host.querySelectorAll(".result-row")).toHaveLength(2);
  });
});
