import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIpaDownloadControl, resetIpaDownloadState } from "../../src/lib/ipaDownloadButton";
import { renderResults } from "../../src/lib/renderResults";
import type { MatchedApp, SearchResult } from "../../shared/types";

function job(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id: "job-1",
    bundleId: "com.example.app",
    status: "queued",
    progress: null,
    bytesDownloaded: null,
    queuePosition: null,
    activeJob: null,
    fileName: null,
    sizeBytes: null,
    errorCode: null,
    error: null,
    fileUrl: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const app: MatchedApp = {
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

describe("IPA download control", () => {
  beforeEach(() => {
    resetIpaDownloadState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts a download, polls progress, and offers the file", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({ status: "running", progress: 42, bytesDownloaded: 13_000_000 }))))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "done",
        progress: 100,
        bytesDownloaded: 24_299_274,
        fileName: "com.example.app-job1.ipa",
        fileUrl: "/api/ipa-download/job-1/file",
      }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;
    expect(button.textContent).toBe("下载 IPA");

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.textContent).toBe("排队中…");
    expect(button.disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toContain("下载中");
    expect(button.textContent).toContain("42%");
    expect(button.textContent).toContain("12.4 MB");

    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe("保存 IPA");
    expect(button.disabled).toBe(false);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ipa-download", expect.objectContaining({ method: "POST" }));
  });

  it("explains a long preparation phase after 90 seconds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockImplementation(async () => new Response(JSON.stringify(job({ status: "running" }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;
    const status = control.querySelector(".ipa-download-status")!;

    button.click();
    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toContain("准备中");
    expect(status.textContent).toBe("");

    await vi.advanceTimersByTimeAsync(90_000);
    expect(status.textContent).toContain("App Store");
    expect(status.textContent).toContain("几分钟");
  });

  it("explains what a queued download is waiting for", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "queued",
        queuePosition: 1,
        activeJob: { bundleId: "com.other.app", status: "running", progress: null },
      }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;
    const status = control.querySelector(".ipa-download-status")!;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(button.textContent).toContain("排队中");
    expect(status.textContent).toContain("前面还有 1 个下载任务");
    expect(status.textContent).toContain("com.other.app");
    expect(status.textContent).toContain("准备中");
  });

  it("asks for a 2FA code inline and continues after submission", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "awaiting_auth_code",
        errorCode: "purchase_auth_required",
      }))))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({ status: "queued" })), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({ status: "running", progress: 10 }))))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "done",
        progress: 100,
        fileUrl: "/api/ipa-download/job-1/file",
      }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;
    const form = control.querySelector<HTMLFormElement>('[data-role="ipa-auth-form"]')!;
    const input = control.querySelector<HTMLInputElement>('[data-role="ipa-auth-code"]')!;
    const status = control.querySelector(".ipa-download-status")!;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(button.hidden).toBe(true);
    expect(form.hidden).toBe(false);
    expect(status.textContent).toContain("验证码");

    input.value = "12";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(status.textContent).toContain("6 位");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    input.value = "123456";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/ipa-download/job-1/auth-code", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ code: "123456" }),
    }));
    expect(form.hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toContain("10%");

    await vi.advanceTimersByTimeAsync(2000);
    expect(button.textContent).toBe("保存 IPA");
  });

  it("re-prompts when the submitted code is rejected", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "awaiting_auth_code",
        errorCode: "purchase_auth_required",
      }))))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({ status: "queued" })), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({
        status: "awaiting_auth_code",
        errorCode: "auth_code_invalid",
      }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;
    const form = control.querySelector<HTMLFormElement>('[data-role="ipa-auth-form"]')!;
    const input = control.querySelector<HTMLInputElement>('[data-role="ipa-auth-code"]')!;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    input.value = "000000";
    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(form.hidden).toBe(false);
    expect(control.querySelector(".ipa-download-status")?.textContent).toContain("无效或已过期");
  });

  it("surfaces the terms error and allows a retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(job()), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(job({ status: "failed", errorCode: "terms_required" }))));
    vi.stubGlobal("fetch", fetchMock);

    const control = createIpaDownloadControl("com.example.app");
    document.body.replaceChildren(control);
    const button = control.querySelector<HTMLButtonElement>('[data-role="ipa-download"]')!;

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(button.textContent).toBe("重试下载");
    expect(button.disabled).toBe(false);
    expect(control.querySelector(".ipa-download-status")?.textContent).toContain("条款");
  });

  it("shows the control in the detail actions only when the app has a Bundle ID", () => {
    const host = document.createElement("div");
    const matched: SearchResult = {
      query: "Funce",
      status: "matched",
      app,
      candidates: [app],
      alternates: [],
      iapHints: null,
      message: null,
    };
    renderResults(host, [matched]);
    expect(host.querySelector('[data-role="ipa-download"]')?.textContent).toBe("下载 IPA");

    const withoutBundle: MatchedApp = { ...app, bundleId: undefined };
    const plainHost = document.createElement("div");
    renderResults(plainHost, [{ ...matched, app: withoutBundle, candidates: [withoutBundle] }]);
    expect(plainHost.querySelector('[data-role="ipa-download"]')).toBeNull();
  });
});
