import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Theme } from "@astryxdesign/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDetailsResponse, LookupCandidate, SearchResult } from "../../../shared/types";
import { Inspector } from "../../../src/search/Inspector";
import { wxTheme } from "../../../src/theme/wxTheme";
import { getAppDetails } from "../../../src/lib/api";
import { renderInspector } from "./fixtures";

vi.mock("../../../src/lib/api", () => ({
  getAppDetails: vi.fn(),
}));

const detailsMock = vi.mocked(getAppDetails);

beforeEach(() => detailsMock.mockReset());
afterEach(cleanup);

function candidate(index: number, overrides: Partial<LookupCandidate> = {}): LookupCandidate {
  return {
    name: `Candidate ${index}`,
    developer: `Dev ${index}`,
    appleId: 100 + index,
    bundleId: `com.candidate.${index}`,
    appStoreUrl: `https://apps.apple.com/jp/app/id${100 + index}`,
    iconUrl: "",
    description: `Own description ${index}`,
    category: "Utilities",
    screenshotUrls: [],
    ...overrides,
  };
}

function resultWithCandidates(): SearchResult {
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(index));
  return {
    query: "Same name",
    status: "matched",
    app: {
      ...candidates[0]!,
      category: "Utilities",
      versionHistory: [{ version: "1.0", releasedAt: null, notes: "Primary history" }],
      iapItems: [],
    },
    candidates,
    alternates: [],
    iapHints: { "4.99": "found", "9.99": "found", source: "rendered_page" },
    message: null,
  };
}

describe("inspector candidate comparison", () => {
  it("pages, filters, and clears the candidate list", () => {
    renderInspector(resultWithCandidates(), "jp");

    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));
    expect(document.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 12 个候选");
    expect(document.querySelectorAll(".wx-candidate-card")).toHaveLength(10);
    expect(document.querySelector(".wx-candidate-rank")?.textContent).toBe("#01");

    fireEvent.click(screen.getByRole("button", { name: "底部：下一页候选" }));
    expect(document.querySelectorAll(".wx-candidate-card")).toHaveLength(2);
    expect(document.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");

    fireEvent.change(screen.getByRole("textbox", { name: "Bundle ID" }), {
      target: { value: "com.candidate.11" },
    });
    expect(document.querySelector('[data-role="candidate-count"]')?.textContent).toBe("筛选 1 / 12 个候选");
    expect(screen.getByText("Candidate 11")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "清除 Bundle ID 筛选" }));
    expect(document.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 12 个候选");
    expect((screen.getByRole("textbox", { name: "Bundle ID" }) as HTMLInputElement).value).toBe("");
  });

  it("remembers the filter and page for each queued result", () => {
    const first = resultWithCandidates();
    const second: SearchResult = {
      ...resultWithCandidates(),
      query: "Other",
      candidates: Array.from({ length: 4 }, (_, index) => candidate(index)),
    };
    const view = renderInspector(first, "jp");

    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));
    fireEvent.click(screen.getByRole("button", { name: "底部：下一页候选" }));

    const rerender = (result: SearchResult) =>
      view.rerender(
        <Theme theme={wxTheme} mode="light">
          <Inspector result={result} country="jp" />
        </Theme>,
      );

    rerender(second);
    fireEvent.click(screen.getByRole("tab", { name: "候选（4）" }));
    expect(document.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 4 个候选");

    rerender(first);
    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));
    expect(document.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");

    fireEvent.change(screen.getByRole("textbox", { name: "Bundle ID" }), {
      target: { value: "com.candidate.11" },
    });
    rerender(second);
    rerender(first);
    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));
    expect((screen.getByRole("textbox", { name: "Bundle ID" }) as HTMLInputElement).value)
      .toBe("com.candidate.11");
    expect(document.querySelector('[data-role="candidate-count"]')?.textContent).toBe("筛选 1 / 12 个候选");
  });

  it("moves between result tabs with the keyboard", () => {
    renderInspector(resultWithCandidates(), "jp");
    const candidatesTab = screen.getByRole("tab", { name: "候选（12）" });
    candidatesTab.focus();
    fireEvent.click(candidatesTab);

    fireEvent.keyDown(candidatesTab.parentElement!, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "详情" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "详情" }).parentElement!, { key: "Home" });
    expect(candidatesTab.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps current candidate labels and provider order", () => {
    renderInspector(resultWithCandidates(), "jp");
    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".wx-candidate-card"));
    expect(cards[0]?.classList.contains("is-current")).toBe(true);
    expect(cards[0]?.textContent).toContain("自动匹配应用");
    expect(cards[0]?.textContent).toContain("Bundle ID：com.candidate.0");
    expect(cards[1]?.textContent).toContain("Bundle ID：com.candidate.1");
  });

  it("loads a candidate detail by its own Apple ID and country", async () => {
    detailsMock.mockResolvedValue({
      country: "jp",
      app: {
        ...candidate(10),
        name: "Candidate Ten",
        category: "Travel",
        versionHistory: [{ version: "2.0", releasedAt: null, notes: "Selected page history" }],
        iapItems: [{ name: "Selected pack", price: "¥100" }],
      },
      iapHints: { "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" },
    } satisfies AppDetailsResponse);

    renderInspector(resultWithCandidates(), "jp");
    fireEvent.click(screen.getByRole("tab", { name: "候选（12）" }));
    fireEvent.click(screen.getByRole("button", { name: "底部：下一页候选" }));

    const inspectButtons = screen.getAllByRole("button", { name: /查看 .* 的详情/ });
    fireEvent.click(inspectButtons[0]!);

    expect(detailsMock).toHaveBeenCalledWith(110, "jp");
    await screen.findByRole("heading", { name: "Candidate Ten" });
    await waitFor(() => expect(screen.getByText("Selected pack")).toBeTruthy());
    expect(document.querySelector(".wx-info-list")?.textContent).toContain("com.candidate.10");
    expect(document.querySelector(".qimai-link")?.getAttribute("href")).toContain("/appid/110/country/jp");
    expect(document.querySelector(".wx-version-history")?.textContent).toContain("Selected page history");
    expect(screen.getByRole("tab", { name: "详情" }).getAttribute("aria-selected")).toBe("true");
  });

  it("shows the baseline detail without fetching when a candidate has no Apple ID", async () => {
    const noId = candidate(3, { appleId: undefined, name: "No ID candidate" });
    const result: SearchResult = {
      ...resultWithCandidates(),
      candidates: [noId],
    };
    renderInspector(result, "jp");
    fireEvent.click(screen.getByRole("tab", { name: "候选（1）" }));
    fireEvent.click(screen.getByRole("button", { name: /查看 No ID candidate 的详情/ }));

    await screen.findByRole("heading", { name: "No ID candidate" });
    expect(detailsMock).not.toHaveBeenCalled();
    expect(document.querySelector('[data-role="detail-state"]')?.textContent).toContain("未提供 Apple ID");
    expect(document.querySelector(".qimai-link")).toBeNull();
  });

  it("shows the candidate count and empty message when the provider returns none", () => {
    const result: SearchResult = {
      query: "Missing",
      status: "no_match",
      app: null,
      candidates: [],
      alternates: [],
      iapHints: null,
      message: "No App Store match found in US store",
    };
    renderInspector(result);
    expect(screen.getByRole("tab", { name: "候选（0）" })).toBeTruthy();
    expect(screen.getAllByText("未在美国区 App Store 找到结果").length).toBeGreaterThan(0);
  });
});
