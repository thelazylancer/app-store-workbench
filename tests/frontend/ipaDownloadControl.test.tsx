import { Theme } from "@astryxdesign/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IpaDownloadJob } from "../../shared/types";
import { IpaDownload } from "../../src/search/IpaDownload";
import { IPA_ERROR_MESSAGES, resetIpaDownloadStore } from "../../src/search/useIpaDownload";
import { wxTheme } from "../../src/theme/wxTheme";
import { installDialogPolyfill, matched, renderInspector } from "./inspector/fixtures";

function job(overrides: Partial<IpaDownloadJob> = {}): IpaDownloadJob {
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Answer the mount-time cache probe without consuming the sequenced responses. */
function stubFetch(mock: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: string | URL | Request, init?: RequestInit) =>
    String(input).startsWith("/api/ipa-download?bundleId=")
      ? Promise.resolve(json({ message: "No cached IPA" }, 404))
      : init ? mock(input, init) : mock(input)));
}

function renderControl(
  bundleId = "com.example.app",
  props: { team?: string; appName?: string } = {},
) {
  return render(
    <Theme theme={wxTheme} mode="light">
      <IpaDownload bundleId={bundleId} {...props} />
    </Theme>,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function statusText(): string {
  return document.querySelector('[data-role="ipa-download-status"]')?.textContent ?? "";
}

function authInput(): HTMLInputElement {
  return document.querySelector('[data-role="ipa-auth-code"]') as HTMLInputElement;
}

function authForm(): HTMLFormElement {
  return authInput().closest("form") as HTMLFormElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  installDialogPolyfill();
  if (!globalThis.CSS) {
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`) },
    });
  }
});

afterEach(() => {
  cleanup();
  resetIpaDownloadStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("React IPA download control", () => {
  it("starts a download, polls progress, and offers the file with the legacy name", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "running", progress: 42, bytesDownloaded: 13_000_000 })))
      .mockResolvedValueOnce(
        json(
          job({
            status: "done",
            progress: 100,
            bytesDownloaded: 24_299_274,
            fileName: "com.example.app-job1.ipa",
            fileUrl: "/api/ipa-download/job-1/file",
          }),
        ),
      );
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    expect(screen.getByRole("button", { name: /排队中/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /排队中/ }).getAttribute("aria-disabled")).toBe("true");

    await advance(2000);
    expect(screen.getByRole("button", { name: /下载中 42% 12.4 MB/ })).toBeTruthy();

    await advance(2000);
    expect(screen.getByRole("button", { name: "保存 IPA" })).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ipa-download", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ipa-download/job-1");

    let saved: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this;
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 IPA" }));
    expect(saved).not.toBeNull();
    expect(saved!.getAttribute("href")).toBe("/api/ipa-download/job-1/file");
    expect(saved!.download).toBe("com.example.app-job1.ipa");
  });

  it("saves immediately when the server returns a cached download", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      json(
        job({
          status: "done",
          progress: 100,
          fileName: "2026-11-23_LC_Misate.ipa",
          fileUrl: "/api/ipa-download/job-1/file",
        }),
        202,
      ),
    );
    stubFetch(fetchMock);
    renderControl("com.example.app", { team: "LC", appName: "Misate" });

    let saved: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this;
    });

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);

    expect(saved).not.toBeNull();
    expect(saved!.getAttribute("href")).toBe("/api/ipa-download/job-1/file");
    expect(saved!.download).toBe("2026-11-23_LC_Misate.ipa");
    expect(screen.getByRole("button", { name: "保存 IPA" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends team and app name so the server can name the file", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(job(), 202));
    stubFetch(fetchMock);
    renderControl("com.example.app", { team: "LC", appName: "Misate" });

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      bundleId: "com.example.app",
      team: "LC",
      appName: "Misate",
    });
  });

  it("reattaches to the stored job after a page reload", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(job({ status: "running", progress: 30 })));
    stubFetch(fetchMock);
    localStorage.setItem("wx.ipa.job.com.example.app", "job-1");

    renderControl();
    await advance(0);

    expect(screen.getByRole("button", { name: /下载中 30%/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/ipa-download/job-1");
  });

  it("stops polling after the terminal state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "done", progress: 100, fileUrl: "/api/ipa-download/job-1/file" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);
    expect(screen.getByRole("button", { name: "保存 IPA" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops polling when the component unmounts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValue(json(job({ status: "running", progress: 12 })));
    stubFetch(fetchMock);
    const { unmount } = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);
    const calls = fetchMock.mock.calls.length;

    unmount();
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it("restores a running job after a remount instead of starting a duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValue(json(job({ status: "running", progress: 30 })));
    stubFetch(fetchMock);
    const first = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    expect(screen.getByRole("button", { name: /排队中/ })).toBeTruthy();

    first.unmount();
    renderControl();

    expect(screen.getByRole("button", { name: /排队中/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a running download and offers a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "running", progress: 12 })))
      .mockResolvedValueOnce(json(job({ status: "cancelled", errorCode: "cancelled" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);
    expect(screen.getByRole("button", { name: /下载中 12%/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "取消当前 IPA 下载" }));
    await advance(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/ipa-download/job-1", expect.objectContaining({
      method: "DELETE",
    }));
    expect(screen.getByRole("button", { name: "重新下载" })).toBeTruthy();
    expect(statusText()).toContain(IPA_ERROR_MESSAGES.cancelled);
    expect(document.querySelector('[data-role="ipa-download-cancel"]')).toBeNull();
  });

  it("explains what a queued download is waiting for", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(
        json(
          job({
            status: "queued",
            queuePosition: 1,
            activeJob: { bundleId: "com.other.app", status: "running", progress: null },
          }),
        ),
      );
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);

    expect(screen.getByRole("button", { name: /排队中/ })).toBeTruthy();
    expect(statusText()).toContain("前面还有 1 个下载任务");
    expect(statusText()).toContain("com.other.app");
    expect(statusText()).toContain("准备中");
  });

  it("explains a long preparation phase after 90 seconds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValue(json(job({ status: "running" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);
    expect(screen.getByRole("button", { name: /准备中/ })).toBeTruthy();
    expect(statusText()).toBe("");

    await advance(90_000);
    expect(statusText()).toContain("App Store");
    expect(statusText()).toContain("几分钟");
  });

  it("asks for a 2FA code in a dialog and continues after submission", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "awaiting_auth_code", errorCode: "purchase_auth_required" })))
      .mockResolvedValueOnce(json(job({ status: "queued" }), 202))
      .mockResolvedValueOnce(json(job({ status: "running", progress: 10 })))
      .mockResolvedValueOnce(json(job({ status: "done", progress: 100, fileUrl: "/api/ipa-download/job-1/file" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(IPA_ERROR_MESSAGES.purchase_auth_required)).toBeTruthy();
    const input = authInput();
    expect(input.inputMode).toBe("numeric");
    expect(input.getAttribute("autocomplete")).toBe("one-time-code");

    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.submit(authForm());
    await advance(0);
    expect(document.body.textContent).toContain("6 位");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.submit(authForm());
    await advance(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/ipa-download/job-1/auth-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    await advance(2000);
    expect(screen.getByRole("button", { name: /下载中 10%/ })).toBeTruthy();

    await advance(2000);
    expect(screen.getByRole("button", { name: "保存 IPA" })).toBeTruthy();
  });

  it("re-prompts with a Banner when the submitted code is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "awaiting_auth_code", errorCode: "purchase_auth_required" })))
      .mockResolvedValueOnce(json(job({ status: "awaiting_auth_code", errorCode: "auth_code_invalid" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);

    fireEvent.change(authInput(), { target: { value: "000000" } });
    fireEvent.submit(authForm());
    await advance(0);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector('[data-role="ipa-auth-error"]')?.textContent).toContain("无效或已过期");
    expect((authInput() as HTMLInputElement).value).toBe("");
  });

  it("surfaces a 409 submission failure without leaving the dialog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "awaiting_auth_code", errorCode: "purchase_auth_required" })))
      .mockResolvedValueOnce(json({ message: "Job is not awaiting an auth code" }, 409));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);

    fireEvent.change(authInput(), { target: { value: "123456" } });
    fireEvent.submit(authForm());
    await advance(0);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.querySelector('[data-role="ipa-auth-error"]')?.textContent).toContain("验证码提交失败");
  });

  it("cancels the download from the auth dialog", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "awaiting_auth_code", errorCode: "purchase_auth_required" })))
      .mockResolvedValueOnce(json(job({ status: "cancelled", errorCode: "cancelled" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(document.querySelector('[data-role="ipa-auth-cancel"]') as HTMLButtonElement);
    await advance(0);

    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/ipa-download/job-1", expect.objectContaining({
      method: "DELETE",
    }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "重新下载" })).toBeTruthy();
    expect(statusText()).toContain(IPA_ERROR_MESSAGES.cancelled);
  });

  it("surfaces backend error classifications and allows a retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(job(), 202))
      .mockResolvedValueOnce(json(job({ status: "failed", errorCode: "terms_required" })));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    await advance(2000);

    expect(screen.getByRole("button", { name: "重试下载" })).toBeTruthy();
    expect(statusText()).toContain("条款");

    fireEvent.click(screen.getByRole("button", { name: "重试下载" }));
    await advance(0);
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/ipa-download", expect.objectContaining({ method: "POST" }));
  });

  it("shows the unavailable message when the IPA backend returns 503", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ message: "IPA download is unavailable" }, 503));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);

    expect(screen.getByRole("button", { name: "重试下载" })).toBeTruthy();
    expect(statusText()).toBe("IPA 下载不可用");
  });

  it("shows a generic failure when starting the download fails for another reason", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ message: "bad" }, 500));
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);

    expect(statusText()).toBe(IPA_ERROR_MESSAGES.unknown);
  });

  it("tries a failed poll at most five times before surfacing an error", async () => {
    const failing = vi.fn(async () => json({ message: "nope" }, 500));
    const fetchMock = vi.fn().mockResolvedValueOnce(json(job(), 202)).mockImplementation(failing);
    stubFetch(fetchMock);
    renderControl();

    fireEvent.click(screen.getByRole("button", { name: "下载 IPA" }));
    await advance(0);
    for (let index = 0; index < 7; index += 1) {
      await advance(2000);
    }

    expect(screen.getByRole("button", { name: "重试下载" })).toBeTruthy();
    expect(statusText()).toBe(IPA_ERROR_MESSAGES.unknown);
  });

  it("lives in the inspector detail actions only when the app has a Bundle ID", () => {
    const { unmount } = renderInspector(matched());
    expect(screen.getByRole("button", { name: "下载 IPA" })).toBeTruthy();
    unmount();

    cleanup();
    renderInspector(matched({ bundleId: undefined }));
    expect(screen.queryByRole("button", { name: "下载 IPA" })).toBeNull();
  });
});
