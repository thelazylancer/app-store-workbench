import { describe, expect, it } from "vitest";
import { renderResults } from "../../src/lib/renderResults";

describe("renderResults", () => {
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
    expect(host.querySelector(".candidate-grid > .candidate-card.is-current")?.textContent).toContain(
      "当前命中",
    );
    expect(host.querySelector(".alternate-list-header")?.textContent).toContain("2 个备选");
    expect(host.querySelectorAll(".alternate-list .candidate-card")).toHaveLength(2);
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
