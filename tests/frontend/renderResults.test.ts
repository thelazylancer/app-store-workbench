import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderResults } from "../../src/lib/renderResults";
import type { AppDetailsResponse, LookupCandidate, MatchedApp, SearchResult } from "../../shared/types";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const identityApp: MatchedApp = {
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
};
const alternateApp: LookupCandidate = {
  name: "Funce Daily",
  developer: "B Dev",
  appleId: 6755396088,
  bundleId: "com.example.FunceDaily",
  appStoreUrl: "https://apps.apple.com/us/app/funce-daily",
  iconUrl: "",
  description: "Daily description",
  category: "Utilities",
  screenshotUrls: [],
};
const identityResult: SearchResult = {
  query: "Funce",
  status: "uncertain_match",
  app: identityApp,
  candidates: [identityApp, alternateApp],
  alternates: [alternateApp],
  iapHints: null,
  message: "Possible match found; review alternates",
};

describe("renderResults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    { status: "matched", expected: "detail" },
    { status: "uncertain_match", expected: "candidates" },
    { status: "no_match", expected: "candidates" },
  ] as const)("opens $expected for a $status query with candidates", ({ status, expected }) => {
    const host = document.createElement("div");
    const result: SearchResult = status === "matched"
      ? { ...identityResult, status, app: identityApp, message: null }
      : status === "no_match"
        ? { ...identityResult, status, app: null, iapHints: null }
        : { ...identityResult, status, app: identityApp };
    renderResults(host, [result]);
    const selected = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
    expect(selected.dataset.role).toBe(`${expected}-tab`);
    expect(selected.tabIndex).toBe(0);
    const panel = host.querySelector<HTMLElement>(`[id="${selected.getAttribute("aria-controls")}"]`)!;
    expect(panel.getAttribute("role")).toBe("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(selected.id);
    expect(panel.hidden).toBe(false);
    expect(host.querySelectorAll('.canvas-panel:not([hidden])')).toHaveLength(1);
    expect(host.querySelector(".query-context")?.textContent).toContain("搜索词：Funce");
    expect(host.querySelector(".query-context")?.textContent).toContain("原始匹配");
    if (status === "no_match") expect(host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.disabled).toBe(true);
  });

  it("switches and focuses tabs with arrows and Home/End without fetching details", () => {
    const fetchDetails = vi.fn();
    vi.stubGlobal("fetch", fetchDetails);
    const host = document.createElement("div");
    document.body.append(host);
    try {
      renderResults(host, [identityResult]);
      for (const [key, expected] of [["ArrowRight", "detail"], ["ArrowRight", "candidates"], ["End", "detail"], ["Home", "candidates"], ["ArrowLeft", "detail"]]) {
        const current = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
        current.focus();
        current.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        const selected = host.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!;
        expect(selected.dataset.role).toBe(`${expected}-tab`);
        expect(document.activeElement).toBe(selected);
        expect(host.querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
        expect(host.querySelectorAll('.canvas-panel:not([hidden])')).toHaveLength(1);
      }
      expect(fetchDetails).not.toHaveBeenCalled();
    } finally {
      renderResults(host, [], false);
      host.remove();
    }
  });

  it("keeps in-flight copies and expanded descriptions intact across tab switches", async () => {
    let finishCopy!: () => void;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const host = document.createElement("div");
    renderResults(host, [{ ...identityResult, app: { ...identityApp, description: "Long description. ".repeat(30) } }]);
    host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
    host.querySelector<HTMLButtonElement>(".text-toggle")!.click();
    const copy = host.querySelector<HTMLButtonElement>('.info-list [aria-label="复制 Apple ID：6755396077"]')!;
    copy.click();
    host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
    expect(host.querySelector('.info-list [aria-label="复制 Apple ID：6755396077"]')).toBe(copy);
    expect(host.querySelector(".description")?.classList.contains("is-clamped")).toBe(false);
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    copy.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    finishCopy();
    await vi.waitFor(() => expect(copy.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));
  });

  it("returns lightbox focus to the visible detail trigger and closes it on a view change", () => {
    const host = document.createElement("div");
    document.body.append(host);
    try {
      renderResults(host, [{ ...identityResult, app: { ...identityApp, screenshotUrls: ["https://example.com/shot.png"] } }]);
      host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
      const trigger = host.querySelector<HTMLButtonElement>(".screenshot-trigger")!;
      trigger.focus();
      trigger.click();
      const dialog = document.querySelector<HTMLElement>(".screenshot-lightbox")!;
      expect(document.activeElement).toBe(dialog.querySelector(".lightbox-close"));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(dialog.hidden).toBe(true);
      expect(document.activeElement).toBe(trigger);
      trigger.click();
      host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.click();
      expect(dialog.hidden).toBe(true);
      expect(document.activeElement).toBe(host.querySelector('[data-role="candidates-tab"]'));
      expect(document.activeElement?.closest("[hidden]")).toBeNull();
    } finally {
      renderResults(host, [], false);
      host.remove();
    }
  });

  it("keeps current candidates in provider order with distinctly labelled pagination at both ends", () => {
    const host = document.createElement("div");
    const candidates = Array.from({ length: 12 }, (_, index) => ({ ...alternateApp, appleId: 100 + index, name: `Provider ${index}` }));
    renderResults(host, [{ ...identityResult, app: { ...candidates[5]!, category: null, versionHistory: [], iapItems: [] }, candidates }]);
    const cards = Array.from(host.querySelectorAll<HTMLElement>(".candidate-card"));
    expect(cards.map((card) => card.dataset.candidateKey)).toEqual(candidates.slice(0, 10).map((candidate) => `id:${candidate.appleId}`));
    expect(cards[5]!.classList.contains("is-current")).toBe(true);
    expect(cards[5]!.querySelector(".candidate-card-rank")?.textContent).toBe("#06");
    expect(host.querySelector(".candidate-grid")).toBeNull();
    const pagers = host.querySelectorAll(".candidate-pagination");
    expect(Array.from(pagers, (pager) => pager.getAttribute("aria-label"))).toEqual(["候选结果分页（顶部）", "候选结果分页（底部）"]);
    expect(host.querySelector('[data-role="candidates-top-next"]')?.getAttribute("aria-label")).not.toBe(host.querySelector('[data-role="candidates-next"]')?.getAttribute("aria-label"));
    host.querySelector<HTMLButtonElement>('[data-role="candidates-top-next"]')!.click();
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(2);
    expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");
    expect(host.querySelector('[data-role="candidate-page-top"]')?.textContent).toBe("第 2 / 2 页");
  });

  it.each(["candidate action", "candidates tab", "outside"])("returns to the originating page and retains %s focus while hidden detail finishes", async (focus) => {
    let finish!: (response: Response) => void;
    const fetchDetails = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchDetails);
    const host = document.createElement("div");
    const outside = document.createElement("button");
    document.body.append(host, outside);
    const candidates = Array.from({ length: 12 }, (_, index) => ({ ...alternateApp, appleId: 100 + index, name: `Provider ${index}` }));
    try {
      renderResults(host, [{ ...identityResult, candidates }]);
      host.querySelector<HTMLButtonElement>('[data-role="candidates-next"]')!.click();
      host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]')!.click();
      expect(host.querySelector('[data-role="detail-tab"]')?.getAttribute("aria-selected")).toBe("true");
      expect(host.querySelector<HTMLElement>('[data-role="candidates-panel"]')!.hidden).toBe(true);
      host.querySelector<HTMLButtonElement>('[data-role="back-to-candidates"]')!.click();
      const action = host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"][data-candidate-key="id:110"]')!;
      expect(document.activeElement).toBe(action);
      expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");
      if (focus === "candidates tab") host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.focus();
      if (focus === "outside") outside.focus();
      finish(new Response(JSON.stringify({ country: "us", app: { ...candidates[10]!, category: null, versionHistory: [], iapItems: [] }, iapHints: null })));
      await vi.waitFor(() => expect(host.querySelector('[data-role="detail-panel"]')?.getAttribute("data-state")).toBe("ready"));
      expect(host.querySelector<HTMLElement>('[data-role="detail-panel"]')!.hidden).toBe(true);
      expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");
      expect(host.querySelectorAll(".candidate-card")).toHaveLength(2);
      expect(document.activeElement).toBe(focus === "outside" ? outside : host.querySelector(`[data-role="${focus === "candidate action" ? "candidate-inspect" : "candidates-tab"}"]`));
      expect(document.activeElement?.closest("[hidden]")).toBeNull();
      expect(fetchDetails).toHaveBeenCalledTimes(1);
      expect(host.querySelector(".query-context .status-badge")?.textContent).toBe("待确认");
      expect(host.querySelector(".viewing-label")?.textContent).toBe("当前查看的应用");
    } finally {
      renderResults(host, [], false);
      host.remove();
      outside.remove();
    }
  });

  it.each(["candidates-tab", "detail-tab", "candidates-top-prev", "candidates-prev", "candidates-top-next", "candidates-next", "back-to-candidates", "detail-retry"])("retains %s focus and the chosen view/page after late detail completion", async (role) => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const host = document.createElement("div");
    document.body.append(host);
    const candidates = Array.from({ length: 23 }, (_, index) => ({ ...alternateApp, appleId: 100 + index, name: `Provider ${index}` }));
    try {
      renderResults(host, [{ ...identityResult, candidates }]);
      host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]')!.click();
      host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.click();
      host.querySelector<HTMLButtonElement>('[data-role="candidates-top-next"]')!.click();
      const detailView = ["detail-tab", "back-to-candidates", "detail-retry"].includes(role);
      if (detailView) host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
      const focused = host.querySelector<HTMLButtonElement>(`[data-role="${role}"]`)!;
      focused.focus();
      expect(document.activeElement).toBe(focused);
      finish(new Response(JSON.stringify({ country: "us", app: { ...candidates[0]!, category: null, versionHistory: [], iapItems: [] }, iapHints: null })));
      await vi.waitFor(() => expect(host.querySelector('[data-role="detail-panel"]')?.getAttribute("data-state")).toBe("ready"));
      expect(host.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-role")).toBe(detailView ? "detail-tab" : "candidates-tab");
      expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 3 页");
      const replacement = host.querySelector(`[data-role="${role}"]`);
      expect(replacement).not.toBe(focused);
      expect(focused.isConnected).toBe(false);
      expect(document.activeElement).toBe(replacement);
      expect(document.activeElement?.closest("[hidden]")).toBeNull();
    } finally {
      renderResults(host, [], false);
      host.remove();
    }
  });

  it("discloses the compact query queue and returns focus to its current-query summary", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const host = document.createElement("div");
    document.body.append(host);
    try {
      renderResults(host, [identityResult, { ...identityResult, query: "Another query", app: { ...identityApp, name: "Different result" } }]);
      const queue = host.querySelector<HTMLDetailsElement>(".result-list-panel")!;
      const summary = queue.querySelector<HTMLElement>("summary")!;
      expect(queue.open).toBe(false);
      expect(summary.textContent).toContain("当前：Funce");
      expect(summary.textContent).toContain("全部 2 项");
      summary.click();
      expect(queue.open).toBe(true);
      const rows = host.querySelectorAll<HTMLButtonElement>(".result-row");
      expect(rows[1]!.querySelector("strong")?.textContent).toBe("Another query");
      rows[1]!.click();
      expect(queue.open).toBe(false);
      expect(document.activeElement).toBe(summary);
      expect(summary.textContent).toContain("当前：Another query");
      expect(host.querySelectorAll('.result-row[aria-pressed="true"]')).toHaveLength(1);
      expect(host.querySelector(".query-context")?.textContent).toContain("Another query");
    } finally {
      renderResults(host, [], false);
      host.remove();
    }
  });

  it("pages every returned suggestion even when no name is automatically matched", () => {
    const host = document.createElement("div");
    const candidates = Array.from({ length: 23 }, (_, index) => ({
      name: `Suggestion ${index + 1}`, developer: `Dev ${index + 1}`, appleId: 1001 + index,
      appStoreUrl: `https://apps.apple.com/us/app/id${1001 + index}`,
      iconUrl: "", description: `Description ${index + 1}`, screenshotUrls: [],
    }));
    renderResults(host, [{
      query: "Duvae", status: "no_match", app: null, candidates, alternates: [],
      iapHints: null, message: "No App Store match found in US store",
    }]);
    const row = host.querySelector('.result-row[aria-pressed="true"]');
    expect(row?.textContent).toContain("未自动匹配");
    expect(host.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 23 个候选");
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(10);
    expect(host.querySelector(".alternate-list-items")?.textContent).toContain("Suggestion 1");
    expect(host.querySelector(".alternate-list-items")?.textContent).not.toContain("Suggestion 11");
    expect(host.querySelector<HTMLButtonElement>('[data-role="candidates-prev"]')!.disabled).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-role="candidates-next"]')!.click();
    expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 3 页");
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(10);
    expect(host.querySelector(".alternate-list-items")?.textContent).toContain("Suggestion 11");
    host.querySelector<HTMLButtonElement>('[data-role="candidates-next"]')!.click();
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(3);
    expect(host.querySelector(".alternate-list-items")?.textContent).toContain("Suggestion 23");
    expect(host.querySelector<HTMLButtonElement>('[data-role="candidates-next"]')!.disabled).toBe(true);
    host.querySelector<HTMLButtonElement>('[data-role="candidates-prev"]')!.click();
    expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 3 页");
    expect(host.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 23 个候选");
    expect(host.querySelector('.result-row[aria-pressed="true"]')).toBe(row);
  });

  it("inspects a candidate by its own ID and country while keeping search count, page and automatic verdict", async () => {
    let finish!: (response: Response) => void;
    const fetchDetails = vi.fn((_url: string) => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchDetails);
    const host = document.createElement("div");
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      ...alternateApp, name: "Same name", appleId: 100 + index, bundleId: `com.candidate.${index}`,
      appStoreUrl: `https://apps.apple.com/jp/app/id${100 + index}`,
      description: `Own description ${index}`, screenshotUrls: [`https://example.com/own-${index}.png`],
      versionHistory: [{ version: `Own ${index}`, releasedAt: null, notes: `Own history ${index}` }],
    }));
    renderResults(host, [{
      ...identityResult,
      app: { ...identityApp, iapItems: [{ name: "Primary pack", price: "$4.99" }],
        versionHistory: [{ version: "Primary release", releasedAt: null, notes: "Primary history" }] },
      candidates,
      iapHints: { "4.99": "found", "9.99": "found", source: "rendered_page" },
    }], true, { country: "jp" });
    host.querySelector<HTMLButtonElement>('[data-role="candidates-next"]')!.click();
    const select = host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]');
    expect(select).not.toBeNull();
    select!.click();
    expect(fetchDetails.mock.calls[0]?.[0]).toBe("/api/app-details/110?country=jp");
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Same name");
    expect(host.querySelector(".info-list")?.textContent).toContain("com.candidate.10");
    expect(host.querySelector(".description-block")?.textContent ?? host.textContent).toContain("Own description 10");
    expect(host.querySelector('[data-role="detail-state"]')?.textContent).toContain("详情加载中");
    expect(host.querySelectorAll(".iap-row")).toHaveLength(0);
    expect(host.querySelector(".version-history")?.textContent).toContain("Own history 10");
    expect(host.querySelector(".version-history")?.textContent).not.toContain("Primary history");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("待确认");
    expect(host.querySelector('.result-row[aria-pressed="true"]')?.textContent).toContain("Funce AI");
    const detail: AppDetailsResponse = {
      country: "jp",
      app: { ...candidates[10]!, category: "Travel", versionHistory: [{ version: "2.0", releasedAt: null, notes: "Selected page history" }],
        iapItems: [{ name: "Selected pack", price: "¥100" }] },
      iapHints: { "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" },
    };
    finish(new Response(JSON.stringify(detail)));
    await vi.waitFor(() => expect(host.querySelector(".iap-row")?.textContent).toContain("Selected pack"));
    expect(host.querySelector(".version-history")?.textContent).toContain("Selected page history");
    expect(host.querySelector('[data-role="candidate-page"]')?.textContent).toBe("第 2 / 2 页");
    expect(host.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 12 个候选");
    expect(host.querySelector(".qimai-link")?.getAttribute("href")).toContain("/appid/110/country/jp");
    expect(host.querySelector(".primary-link")?.getAttribute("href")).toBe("https://apps.apple.com/jp/app/id110");
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(2);
  });

  it.each(["copy", "candidate copy", "screenshot", "outside"])("preserves %s focus when the same candidate detail refreshes", async (control) => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const host = document.createElement("div");
    const outside = document.createElement("button");
    outside.textContent = "Outside inspector";
    document.body.append(host, outside);
    const candidate = { ...alternateApp, screenshotUrls: ["https://example.com/own-shot.png"] };
    try {
      renderResults(host, [{ ...identityResult, candidates: [identityApp, candidate] }]);
      host.querySelector<HTMLButtonElement>('.candidate-card:not(.is-current) [data-role="candidate-inspect"]')!.click();
      if (control === "candidate copy") host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.click();
      const selector = control === "copy"
        ? '.info-list [aria-label="复制 Apple ID：6755396088"]'
        : control === "candidate copy"
          ? '.is-current [aria-label="复制 Apple ID：6755396088"]'
          : ".screenshots-section .screenshot-trigger";
      const focused = control === "outside" ? outside : host.querySelector<HTMLButtonElement>(selector)!;
      focused.focus();
      expect(document.activeElement).toBe(focused);
      finish(new Response(JSON.stringify({
        country: "us", app: { ...candidate, category: "Utilities", versionHistory: [], iapItems: [] },
        iapHints: { "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" },
      })));
      await vi.waitFor(() => expect(host.querySelector('[data-role="detail-panel"]')?.getAttribute("data-state")).toBe("ready"));
      if (control === "outside") {
        expect(document.activeElement).toBe(outside);
      } else {
        const replacement = host.querySelector<HTMLButtonElement>(selector)!;
        expect(replacement).not.toBe(focused);
        expect(focused.isConnected).toBe(false);
        expect(document.activeElement).toBe(replacement);
      }
    } finally {
      renderResults(host, [], false);
      host.remove();
      outside.remove();
    }
  });

  it("shows a missing-ID candidate's own baseline without requesting or inventing identity", () => {
    const fetchDetails = vi.fn();
    vi.stubGlobal("fetch", fetchDetails);
    const host = document.createElement("div");
    renderResults(host, [{
      ...identityResult,
      candidates: [{ ...alternateApp, appleId: undefined, description: "Missing ID own description",
        versionHistory: [{ version: "Own 1.0", releasedAt: null, notes: "Own baseline history" }] }],
    }]);
    host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]')!.click();
    expect(fetchDetails).not.toHaveBeenCalled();
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Funce Daily");
    expect(host.querySelector(".info-list")?.textContent).toContain("Apple ID未提供");
    expect(host.querySelector(".qimai-link")).toBeNull();
    expect(host.querySelector('[data-role="detail-state"]')?.textContent).toContain("未提供 Apple ID");
    expect(host.querySelector(".version-history")?.textContent).toContain("Own baseline history");
    expect(host.querySelectorAll(".iap-row")).toHaveLength(0);
    expect(host.querySelector(".primary-link")?.getAttribute("href")).toBe(alternateApp.appStoreUrl);
  });

  it("preserves candidate baseline and search count on detail failure and allows retry", async () => {
    const fetchDetails = vi.fn().mockResolvedValueOnce(new Response("Unavailable", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        country: "us", app: { ...alternateApp, category: null, versionHistory: [], iapItems: [] },
        iapHints: { "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" },
      })));
    vi.stubGlobal("fetch", fetchDetails);
    const host = document.createElement("div");
    renderResults(host, [identityResult]);
    host.querySelector<HTMLButtonElement>('.candidate-card:not(.is-current) [data-role="candidate-inspect"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-role="detail-state"]')?.textContent).toContain("详情加载失败"));
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Funce Daily");
    expect(host.querySelector(".info-list")?.textContent).toContain("com.example.FunceDaily");
    expect(host.querySelectorAll(".iap-row")).toHaveLength(0);
    expect(host.querySelector('[data-role="candidate-count"]')?.textContent).toBe("共 2 个候选");
    host.querySelector<HTMLButtonElement>('[data-role="detail-retry"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-role="detail-panel"]')?.getAttribute("data-state")).toBe("ready"));
    expect(fetchDetails).toHaveBeenCalledTimes(2);
  });

  it.each(["candidate", "row", "country render", "clear", "detached host"])("ignores a late detail response after changing %s", async (action) => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockImplementation(() => new Promise<Response>(() => {})));
    const host = document.createElement("div");
    document.body.append(host);
    const first = { ...alternateApp, screenshotUrls: [] };
    const second = { ...alternateApp, appleId: 789, name: "Latest candidate", bundleId: "com.latest.App", screenshotUrls: [] };
    const result: SearchResult = { query: "Duvae", status: "no_match", app: null, candidates: [first, second], alternates: [], iapHints: null, message: "No App Store match found in US store" };
    try {
      renderResults(host, [result, { ...identityResult, candidates: [] }]);
      host.querySelectorAll<HTMLButtonElement>(".result-row")[0]!.click();
      host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]')!.click();
      if (action === "candidate") {
        host.querySelector<HTMLButtonElement>('[data-role="back-to-candidates"]')!.click();
        host.querySelectorAll<HTMLButtonElement>('[data-role="candidate-inspect"]')[1]!.click();
      } else if (action === "row") {
        host.querySelectorAll<HTMLButtonElement>(".result-row")[1]!.click();
      } else if (action === "country render") {
        renderResults(host, [{ ...identityResult, candidates: [] }], true, { country: "jp" });
      } else if (action === "clear") {
        renderResults(host, [], false);
      } else {
        host.remove();
      }
      finish(new Response(JSON.stringify({
        country: "us",
        app: { ...first, category: null, versionHistory: [], iapItems: [{ name: "Old response pack", price: "$4.99" }],
          screenshotUrls: ["https://example.com/old-response.png"] },
        iapHints: { "4.99": "found", "9.99": "not_found", source: "rendered_page" },
      })));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(host.textContent).not.toContain("Old response pack");
      expect(document.querySelectorAll('.screenshot-lightbox img[src="https://example.com/old-response.png"]')).toHaveLength(0);
      if (action === "candidate") expect(host.querySelector(".inspector h3")?.textContent).toBe("Latest candidate");
      if (action === "country render") expect(host.querySelector(".qimai-link")?.getAttribute("href")).toContain("/country/jp");
    } finally {
      renderResults(host, [], false);
      host.remove();
    }
  });

  it("ignores an earlier detail failure after a newer candidate has loaded", async () => {
    let rejectOld!: (reason: Error) => void;
    const latest = { ...alternateApp, appleId: 789, name: "Latest candidate" };
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        country: "us", app: { ...latest, category: null, versionHistory: [], iapItems: [{ name: "Latest pack", price: "$2.99" }] },
        iapHints: { "4.99": "not_found", "9.99": "not_found", source: "rendered_page" },
      }))));
    const host = document.createElement("div");
    renderResults(host, [{ ...identityResult, candidates: [alternateApp, latest] }]);
    host.querySelector<HTMLButtonElement>('[data-role="candidate-inspect"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-role="back-to-candidates"]')!.click();
    host.querySelectorAll<HTMLButtonElement>('[data-role="candidate-inspect"]')[1]!.click();
    await vi.waitFor(() => expect(host.querySelector(".iap-row")?.textContent).toContain("Latest pack"));
    rejectOld(new Error("Old failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Latest candidate");
    expect(host.querySelector('[data-role="detail-panel"]')?.getAttribute("data-state")).toBe("ready");
    expect(host.textContent).not.toContain("详情加载失败");
  });

  it.each(["id", "country"])("refuses detail with a mismatched %s while keeping baseline identity", async (mismatch) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      country: mismatch === "country" ? "jp" : "us",
      app: { ...identityApp, appleId: mismatch === "id" ? 999 : alternateApp.appleId,
        iapItems: [{ name: "Wrong identity pack", price: "$4.99" }] },
      iapHints: { "4.99": "found", "9.99": "found", source: "rendered_page" },
    }))));
    const host = document.createElement("div");
    renderResults(host, [identityResult]);
    host.querySelector<HTMLButtonElement>('.candidate-card:not(.is-current) [data-role="candidate-inspect"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('[data-role="detail-state"]')?.textContent).toContain("详情加载失败"));
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Funce Daily");
    expect(host.textContent).not.toContain("Wrong identity pack");
  });

  it("identifies an empty selected storefront without describing other countries as US", () => {
    const host = document.createElement("div");
    renderResults(host, [{ query: "Missing", status: "no_match", app: null, candidates: [], alternates: [], iapHints: null,
      message: "No App Store match found in JP store" }], true, { country: "jp" });
    expect(host.textContent).toContain("未在 JP 区 App Store 找到结果");
    expect(host.textContent).not.toContain("美国区");
  });

  it("does not replace an explicitly empty provider list with legacy alternates", () => {
    const host = document.createElement("div");
    renderResults(host, [{ ...identityResult, candidates: [] }]);
    expect(host.querySelectorAll(".candidate-card")).toHaveLength(0);
    expect(host.querySelector(".inspector h3")?.textContent).toBe("Funce AI");
  });

  it("copies exact app identifiers with feedback and preserves the current selection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const host = document.createElement("div");
    renderResults(host, [identityResult]);
    host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
    const selected = host.querySelector('.result-row[aria-pressed="true"]');

    const appleId = host.querySelector<HTMLButtonElement>('.info-list [aria-label="复制 Apple ID：6755396077"]');
    expect(appleId).not.toBeNull();
    appleId!.click();
    await vi.waitFor(() => expect(appleId!.parentElement?.querySelector('[role="status"]')?.textContent).toBe("已复制"));

    host.querySelector<HTMLButtonElement>('[data-role="candidates-tab"]')!.click();
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
      candidates: [
        { ...identityApp, appleId: undefined, bundleId: blank, minimumOsVersion: blank },
        { ...alternateApp, appleId: undefined, bundleId: blank, minimumOsVersion: blank },
      ],
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
      host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
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
    host.querySelector<HTMLButtonElement>('[data-role="detail-tab"]')!.click();
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
      candidates: [identityApp, { ...alternateApp, ...facts }],
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
      candidates: [identityApp, { ...alternateApp, ...facts }],
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
      candidates: [identityApp, { ...alternateApp, fileSizeBytes: 50000000 }],
    }]);

    expect(host.querySelector(".info-list")?.textContent).toContain(`安装包大小${expected}`);
    expect(host.querySelector(".candidate-card.is-current")?.textContent).toContain(`安装包大小：${expected}`);
    expect(host.querySelector(".candidate-card:not(.is-current)")?.textContent).toContain("安装包大小：50 MB");
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
      candidates: [identityApp, {
        ...alternateApp,
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
    const alternate = host.querySelector(".candidate-card:not(.is-current)")?.textContent;
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
        candidates: [],
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
        candidates: [],
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
        candidates: [],
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
        candidates: [],
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
        candidates: [],
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
        candidates: [],
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

    renderResults(host, [{
      ...identityResult,
      candidates: [identityApp, {
        ...alternateApp,
        category: "Travel",
        screenshotUrls: [
          "https://example.com/a.png", "https://example.com/b.png",
          "https://example.com/c.png", "https://example.com/d.png",
        ],
      }, {
        name: "Funce Planner",
        developer: "C Dev",
        appleId: 6755396089,
        appStoreUrl: "https://apps.apple.com/us/app/funce-planner",
        iconUrl: "https://example.com/icon-3.png",
        description: "Planner description",
        category: "Productivity",
        screenshotUrls: ["https://example.com/e.png"],
      }],
    }]);

    expect(host.querySelector(".inspector")?.textContent).toContain(
      "可能匹配，请检查备选结果",
    );
    expect(host.querySelector(".inspector")?.textContent).toContain("候选对比");
    expect(host.querySelector('[data-role="candidates-panel"] > .alternates')).not.toBeNull();
    expect(host.querySelector(".alternate-list-items")).not.toBeNull();
    expect(host.querySelector(".alternate-list-items > .candidate-card.is-current")?.textContent).toContain(
      "自动匹配应用",
    );
    expect(host.querySelector(".info-list")?.textContent).toContain("Bundle IDcom.example.FunceAI");
    expect(host.querySelector(".candidate-card.is-current")?.textContent).toContain(
      "Bundle ID：com.example.FunceAI",
    );
    expect(host.querySelector(".candidate-card:not(.is-current)")?.textContent).toContain(
      "Bundle ID：com.example.FunceDaily",
    );
    expect(host.querySelectorAll(".candidate-card:not(.is-current)")[1]?.textContent).toContain(
      "Bundle ID：未提供",
    );
    expect(host.querySelector(".alternate-list-header")?.textContent).toContain("共 3 个候选");
    expect(host.querySelectorAll(".candidate-card:not(.is-current)")).toHaveLength(2);
    expect(host.querySelectorAll(".candidate-card-rank")).toHaveLength(3);
    expect(host.querySelector(".candidate-card-rank")?.textContent).toBe("#01");
    expect(host.querySelector(".candidate-card:not(.is-current)")?.textContent).toContain(
      "Apple ID：6755396088",
    );
    const alternateScreenshots = host.querySelector(
      ".candidate-card:not(.is-current)",
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
        candidates: [],
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
        candidates: [],
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
        candidates: [],
        alternates: [],
        iapHints: null,
        message: "No App Store match found in US store",
      },
      {
        query: "Broken App",
        status: "search_failed",
        app: null,
        candidates: [],
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
