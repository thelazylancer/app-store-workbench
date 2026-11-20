import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppVersionHistoryItem } from "../../../shared/types";
import { matched, renderInspector } from "./fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const versions: AppVersionHistoryItem[] = [
  { version: "1.16.24", releasedAt: "2026-05-06T02:08:36Z", notes: "Improved outfit logging" },
  { version: "1.15.0", releasedAt: "2026-05-01T01:43:36Z", notes: "Release 2" },
  { version: "1.14.0", releasedAt: "2026-04-24T01:43:36Z", notes: "Release 3" },
  { version: "1.13.0", releasedAt: "2026-04-18T01:43:36Z", notes: "Release 4" },
  { version: "1.12.0", releasedAt: "2026-04-12T01:43:36Z", notes: "Release 5" },
  { version: "1.0", releasedAt: "2026-04-01T01:43:36Z", notes: "Initial release" },
];

describe("inspector sections", () => {
  it("limits version history to the five most recent entries with the legacy summary", () => {
    renderInspector(matched({ versionHistory: versions }));

    expect(document.querySelectorAll(".wx-version-history-item")).toHaveLength(5);
    const history = document.querySelector(".wx-version-history");
    expect(history?.textContent).toContain("1.16.24");
    expect(history?.textContent).toContain("最近 5 个（共 6 个）");
    expect(history?.textContent).not.toContain("Initial release");
  });

  it("renders IAP hints, item rows, and the non-US hint", () => {
    const result = matched({
      iapItems: [
        { name: "Pack A", price: "$4.99" },
        { name: "Pack B", price: "$9.99" },
      ],
    });
    const { unmount } = renderInspector(result);

    expect(document.querySelector(".wx-iap-hints")?.textContent).toBe("4.99 命中 · 9.99 未命中");
    expect(document.querySelector(".wx-fact-row")?.textContent).toContain("4.99 命中");
    expect(document.querySelectorAll(".wx-iap-row")).toHaveLength(2);
    expect(screen.getByText("Pack A")).toBeTruthy();
    expect(screen.getByText("$9.99")).toBeTruthy();

    unmount();
    renderInspector(matched({ iapItems: [] }), "jp");
    expect(screen.getByText("4.99 / 9.99 美元价格线索仅适用于美国区")).toBeTruthy();
    expect(screen.getByText("未提取到内购价格行。")).toBeTruthy();
  });

  it("copies identifiers with feedback and keeps missing values copy-free", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderInspector(matched());

    const copy = screen.getByRole("button", { name: "复制 Apple ID：123" });
    fireEvent.click(copy);
    await waitFor(() =>
      expect(copy.closest(".wx-identifier")?.querySelector('[role="status"]')?.textContent).toBe("已复制"),
    );
    expect(writeText).toHaveBeenCalledWith("123");
    expect(copy.getAttribute("aria-disabled")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "复制 Bundle ID：com.example.funce" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("com.example.funce"));
  });

  it("reports clipboard failure without hiding the identifier", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderInspector(matched());

    const copy = screen.getByRole("button", { name: "复制 Bundle ID：com.example.funce" });
    fireEvent.click(copy);

    await waitFor(() =>
      expect(copy.closest(".wx-identifier")?.querySelector('[role="status"]')?.textContent).toBe(
        "复制失败，请手动选择标识",
      ),
    );
    expect(copy.closest(".wx-identifier")?.textContent).toContain("com.example.funce");
  });

  it("shows missing identifiers without copy controls", () => {
    renderInspector(matched({ appleId: undefined, bundleId: " " }));

    expect(document.querySelector(".wx-info-list")?.textContent).toContain("Apple ID未提供");
    expect(document.querySelector(".wx-info-list")?.textContent).toContain("Bundle ID未提供");
    expect(document.querySelectorAll(".wx-identifier-copy")).toHaveLength(0);
    expect(document.querySelector(".qimai-link")).toBeNull();
  });

  it("aligns price, rating, size, and minimum iOS facts", () => {
    renderInspector(
      matched({
        price: 2.99,
        formattedPrice: "$2.99",
        currency: "USD",
        averageUserRating: 4.75,
        userRatingCount: 1234,
        fileSizeBytes: 1_250_000,
        minimumOsVersion: "17.0",
      }),
    );

    const info = document.querySelector(".wx-info-list")?.textContent ?? "";
    expect(info).toContain("应用价格$2.99 · USD");
    expect(info).toContain("评分4.75 / 5 · 1,234 条评分");
    expect(info).toContain("安装包大小1.25 MB");
    expect(info).toContain("最低 iOS17.0+");
  });

  it("expands and clamps long descriptions", () => {
    renderInspector(matched({ description: "Long description. ".repeat(30) }));

    const description = document.querySelector(".wx-description");
    expect(description?.classList.contains("is-clamped")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(description?.classList.contains("is-clamped")).toBe(false);
    expect(screen.getByRole("button", { name: "收起" })).toBeTruthy();
  });
});
