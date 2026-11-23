import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@astryxdesign/core";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PackageDetail } from "../../shared/competitorTypes";
import { CompetitorDetailPage } from "../../src/competitor/Detail";
import { wxTheme } from "../../src/theme/wxTheme";

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: false,
        media: "",
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
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
  if (!("open" in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, "open", {
      configurable: true,
      get() { return this.hasAttribute("open"); },
    });
  }
});

const DESCRIPTION = `Alpha 描述第一段。\n\nAlpha 描述第二段。\n\n${"详细说明。".repeat(140)}`;

function packageDetail(overrides: Partial<PackageDetail> & { packageCode: string }): PackageDetail {
  return {
    targetDate: "2026-11-20",
    displayName: overrides.packageCode,
    team: "团队 A",
    firstAdDate: "2026-10-01",
    listingDate: "2026-10-01",
    first100Date: null,
    offlineDate: null,
    category: "游戏",
    minimumOsVersion: "15.0",
    appVersion: "1.0.0",
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "ok",
    appleId: 111,
    appStoreJson: {
      appleId: 111,
      name: "Alpha App",
      trackName: "Alpha Tracked",
      developer: "Alpha Studio",
      bundleId: "com.alpha.ios",
      fileSizeBytes: 3_750_000,
      description: DESCRIPTION,
      formattedPrice: "免费",
      iapItems: [
        { name: "高级版", price: "$4.99" },
        { name: "去广告", price: "$1.99" },
      ],
    },
    iconLocalPath: "2026-11-20/com.alpha.ios/icon.png",
    screenshotLocalPaths: [
      "2026-11-20/com.alpha.ios/1.png",
      "2026-11-20/com.alpha.ios/2.png",
    ],
    versions: [
      { version: "1.0.0", releasedAt: "2026-11-10", notes: "修复若干问题", capturedAt: "2026-11-20T02:00:00.000Z" },
    ],
    fetchedAt: "2026-11-20T02:00:00.000Z",
    ...overrides,
  };
}

const alpha = packageDetail({ packageCode: "com.alpha.ios" });
const missed = packageDetail({
  packageCode: "com.beta.s",
  displayName: "Beta Source",
  lookupStatus: "bundle_not_found",
  enrichStatus: "failed",
  assetStatus: "pending",
  appleId: null,
  appStoreJson: {},
  iconLocalPath: null,
  screenshotLocalPaths: [],
  versions: [],
});
const pending = packageDetail({
  packageCode: "com.pending.ios",
  displayName: "Pending Source",
  lookupStatus: "pending",
  enrichStatus: "pending",
  appleId: null,
  appStoreJson: {},
  iconLocalPath: null,
  screenshotLocalPaths: [],
  versions: [],
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockPackage(...packages: PackageDetail[]) {
  return vi.fn(async (input: string | URL | Request) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(raw, "http://localhost");
    if (url.pathname.startsWith("/api/competitor/package/")) {
      const code = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const found = packages.find((item) => item.packageCode === code);
      return found ? json(found) : json({ message: "not found" }, 404);
    }
    return json({ message: "not found" }, 404);
  });
}

function renderAt(path: string, initialIndex = 0) {
  const entries = initialIndex > 0
    ? ["/?team=团队%20A&status=hit", path]
    : [path];
  return render(
    <Theme theme={wxTheme} mode="light">
      <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
        <Routes>
          <Route path="/package/:code" element={<CompetitorDetailPage />} />
          <Route path="/" element={<div>竞品日报列表</div>} />
          <Route path="/search" element={<div>App Store 搜索页</div>} />
        </Routes>
      </MemoryRouter>
    </Theme>,
  );
}

async function waitForDetail(name = "Alpha App") {
  await screen.findByRole("heading", { name });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("React competitor detail", () => {
  it("renders identity, six metrics, IAP, description, version history and package info", async () => {
    vi.stubGlobal("fetch", mockPackage(alpha));
    renderAt("/package/com.alpha.ios");
    await waitForDetail();

    expect(screen.getAllByText("Alpha Studio").length).toBeGreaterThan(0);
    const storeLink = screen.getByRole("link", { name: /App Store 查看/ });
    expect(storeLink.getAttribute("href")).toBe("https://apps.apple.com/app/id111");
    const qimai = screen.getByRole("link", { name: /七麦查看/ });
    expect(qimai.getAttribute("href")).toBe("https://www.qimai.cn/app/baseinfo/appid/111/country/us");
    expect(document.body.textContent).not.toContain("App Store 已命中");

    const metrics = Array.from(document.querySelectorAll<HTMLElement>('[data-role="metric"]'));
    expect(metrics).toHaveLength(6);
    expect(metrics[0]?.textContent).toContain("APP ID");
    expect(metrics[0]?.textContent).toContain("111");
    expect(metrics[1]?.textContent).toContain("游戏");
    expect(metrics[2]?.textContent).toContain("免费");
    expect(metrics[3]?.textContent).toContain("内购");
    expect(metrics[3]?.textContent).toContain("2 项");
    expect(metrics[4]?.textContent).toContain("最近更新");
    expect(metrics[4]?.textContent).toContain("2026-11-10");
    expect(metrics[5]?.textContent).toContain("最早发布");
    expect(metrics[5]?.textContent).toContain("2026-11-10");

    const iap = document.querySelector('[data-role="iap-section"]');
    expect(iap?.querySelector(".wx-detail-section-title")?.textContent).toBe("内购（2）");
    expect(iap?.querySelectorAll(".wx-iap-row")).toHaveLength(2);
    expect(iap?.textContent).toContain("高级版");
    expect(iap?.textContent).toContain("$4.99");

    const description = document.querySelector('[data-role="description-section"]');
    expect(description?.textContent).toContain("Alpha 描述第一段。");
    expect(description?.textContent).toContain("Alpha 描述第二段。");
    const toggle = await screen.findByRole("button", { name: "展开" });
    expect(document.querySelector(".wx-description-copy")?.classList.contains("is-collapsed")).toBe(true);
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "收起" })).toBeTruthy();
    expect(document.querySelector(".wx-description-copy")?.classList.contains("is-collapsed")).toBe(false);

    const history = document.querySelector('[data-role="version-history"]');
    expect(history?.textContent).toContain("更新日志");
    expect(history?.textContent).toContain("1.0.0");
    expect(history?.textContent).toContain("当前");
    expect(history?.textContent).toContain("2026-11-10");
    expect(history?.textContent).toContain("修复若干问题");

    const info = document.querySelector('[data-role="package-info"]');
    const rows = info?.querySelectorAll(".wx-info-row") ?? [];
    expect(rows).toHaveLength(11);
    const infoText = info?.textContent ?? "";
    for (const expected of ["开发者", "Alpha Studio", "发布日期", "2026-10-01", "更新日期", "2026-11-10",
      "com.alpha.ios", "1.0.0", "3.75 MB", "团队 A", "游戏", "15.0", "源展示名", "完整"]) {
      expect(infoText).toContain(expected);
    }

    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "复制 APP ID" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("111"));
    await waitFor(() => expect(document.querySelector('[data-role="app-id-copy"]')?.textContent).toContain("已复制"));
    fireEvent.click(screen.getByRole("button", { name: "复制 Bundle ID" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("com.alpha.ios"));
  });

  it("opens screenshots in the Astryx Lightbox and reports a failed image", async () => {
    vi.stubGlobal("fetch", mockPackage(alpha));
    renderAt("/package/com.alpha.ios");
    await waitForDetail();

    expect(document.querySelector('[data-role="screenshots"]')?.textContent).toContain("截图（2）");
    const images = document.querySelectorAll<HTMLImageElement>(".wx-screenshot");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe("/competitor-assets/2026-11-20/com.alpha.ios/1.png");
    fireEvent.error(images[1]!);
    expect(document.querySelector(".wx-screenshot-error")?.textContent).toBe("截图加载失败");

    fireEvent.click(screen.getByRole("button", { name: "放大查看Alpha App 截图 1" }));
    const dialog = document.querySelector<HTMLDialogElement>("dialog");
    await waitFor(() => expect(dialog?.hasAttribute("open")).toBe(true));
    expect(dialog?.querySelectorAll("[data-lightbox-page]")).toHaveLength(2);
    expect(dialog?.querySelector("img")?.getAttribute("src")).toBe("/competitor-assets/2026-11-20/com.alpha.ios/1.png");

    const close = dialog?.querySelector<HTMLButtonElement>("[data-lightbox-chrome] button");
    fireEvent.click(close!);
    await waitFor(() => expect(dialog?.hasAttribute("open")).toBe(false));
  });

  it("labels a delisted miss by its offline date", async () => {
    vi.stubGlobal("fetch", mockPackage({ ...missed, offlineDate: "2026-11-18" }));
    renderAt("/package/com.beta.s");
    await waitForDetail("Beta Source");

    expect(screen.getByText("2026-11-18 下架")).toBeTruthy();
    expect(screen.queryByText("App Store 未命中")).toBeNull();
    expect(screen.getByText("已于 2026-11-18 下架，无 App Store 详情可展示。")).toBeTruthy();
  });

  it("shows the missed panel without App Store sections", async () => {
    vi.stubGlobal("fetch", mockPackage(missed));
    renderAt("/package/com.beta.s");
    await waitForDetail("Beta Source");

    expect(screen.getByText("App Store 未命中")).toBeTruthy();
    expect(screen.getByText("未命中，无 App Store 详情可展示。")).toBeTruthy();
    expect(document.querySelector('[data-role="detail-metrics"]')).toBeNull();
    expect(document.querySelector('[data-role="screenshots"]')).toBeNull();
    expect(document.querySelector('[data-role="iap-section"]')).toBeNull();
    expect(document.querySelector('[data-role="description-section"]')).toBeNull();
    expect(document.querySelector('[data-role="version-history"]')).toBeNull();
    const panel = document.querySelector('[data-role="missed-panel"]');
    expect(panel?.textContent).toContain("团队 A");
    expect(panel?.textContent).toContain("待下载");
    expect(screen.getByRole("link", { name: "到 App Store 搜索中查询此 Bundle ID" })
      .getAttribute("href")).toBe("/search?bundle=com.beta.s");
  });

  it("renders the full detail for packages that are still being completed", async () => {
    vi.stubGlobal("fetch", mockPackage(pending));
    renderAt("/package/com.pending.ios");
    await waitForDetail("Pending Source");

    expect(screen.queryByText("待补全")).toBeNull();
    expect(document.querySelector('[data-role="missed-panel"]')).toBeNull();
    expect(document.querySelector('[data-role="detail-metrics"]')).not.toBeNull();
    expect(document.querySelector('[data-role="package-info"]')).not.toBeNull();
  });

  it("surfaces the API error with the old message and retries", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      return attempt === 1
        ? json({ message: "unavailable" }, 503)
        : json(alpha);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAt("/package/com.alpha.ios");

    expect(await screen.findByText("无法加载该竞品详情")).toBeTruthy();
    expect(document.body.textContent).toContain("com.alpha.ios 详情请求失败：竞品数据暂不可用：服务端未配置数据库");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitForDetail();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("goes back to the list through history and falls back to / on a deep link", async () => {
    vi.stubGlobal("fetch", mockPackage(alpha));
    const view = renderAt("/package/com.alpha.ios", 1);
    await waitForDetail();
    fireEvent.click(screen.getByRole("button", { name: "返回竞品日报" }));
    expect(await screen.findByText("竞品日报列表")).toBeTruthy();
    expect(window.location.search).toBe("");
    view.unmount();

    vi.stubGlobal("fetch", mockPackage(alpha));
    renderAt("/package/com.alpha.ios");
    await waitForDetail();
    fireEvent.click(screen.getByRole("button", { name: "返回竞品日报" }));
    expect(await screen.findByText("竞品日报列表")).toBeTruthy();
  });
});
