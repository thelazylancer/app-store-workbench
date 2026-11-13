import { getIpaDownload, startIpaDownload, submitIpaAuthCode } from "./api";
import type { IpaDownloadErrorCode, IpaDownloadJob } from "../../shared/types";

type IpaButtonState = Omit<
  IpaDownloadJob,
  "id" | "bundleId" | "fileName" | "sizeBytes" | "createdAt" | "updatedAt"
> & {
  jobId: string;
  startedAt: string;
};

const states = new Map<string, IpaButtonState>();
const starting = new Set<string>();
const submitting = new Set<string>();
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_FAILURES = 5;

const ERROR_MESSAGES: Record<IpaDownloadErrorCode, string> = {
  terms_required: "服务器登录的 Apple ID 有待接受的 App Store 条款：请在 iPhone/iPad 的 App Store 中登录该账号（不是手机上日常使用的账号），按提示同意条款或获取一次该应用后重试",
  purchase_auth_required: "未拥有的应用需要验证码完成购买，请输入 Apple 设备上显示的 6 位验证码",
  auth_code_invalid: "验证码无效或已过期，请重新输入",
  not_authenticated: "服务器尚未登录 Apple ID",
  storefront_unavailable: "App Store 商店服务暂不可用，请重试",
  timeout: "下载超时，请重试",
  unknown: "下载失败，请重试",
};

function applyJob(bundleId: string, job: IpaDownloadJob) {
  const previous = states.get(bundleId);
  const continuing = previous?.jobId === job.id &&
    (previous.status === "queued" || previous.status === "running");
  states.set(bundleId, {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    bytesDownloaded: job.bytesDownloaded,
    queuePosition: job.queuePosition ?? null,
    activeJob: job.activeJob ?? null,
    errorCode: job.errorCode,
    error: job.error,
    fileUrl: job.fileUrl,
    startedAt: continuing ? previous.startedAt : new Date().toISOString(),
  });
}

function formatBytes(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatElapsed(startedAt: string): string | null {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const seconds = Math.floor((Date.now() - started) / 1000);
  if (seconds < 1) return null;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function runningLabel(state: IpaButtonState): string {
  const downloading = state.progress !== null || (state.bytesDownloaded ?? 0) > 0;
  const parts = [downloading ? "下载中" : "准备中…"];
  if (state.progress !== null) parts.push(`${state.progress}%`);
  const size = formatBytes(state.bytesDownloaded);
  if (size) parts.push(size);
  const elapsed = formatElapsed(state.startedAt);
  if (elapsed) parts.push(elapsed);
  return parts.join(" ");
}

function queuedLabel(state: IpaButtonState): string {
  const elapsed = formatElapsed(state.startedAt);
  return elapsed ? `排队中 ${elapsed}` : "排队中…";
}

function describeActiveJob(active: NonNullable<IpaButtonState["activeJob"]>): string {
  const state = active.progress !== null ? `下载中 ${active.progress}%` : "准备中…";
  return `${active.bundleId} ${state}`;
}

export function createIpaDownloadControl(bundleId: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = "ipa-download-control";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button";
  button.dataset.role = "ipa-download";

  const form = document.createElement("form");
  form.className = "ipa-auth-form";
  form.dataset.role = "ipa-auth-form";
  form.hidden = true;

  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "one-time-code";
  input.maxLength = 6;
  input.placeholder = "6 位验证码";
  input.dataset.role = "ipa-auth-code";
  input.setAttribute("aria-label", "Apple ID 两步验证码");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "secondary-button";
  submit.dataset.role = "ipa-auth-submit";
  submit.textContent = "提交";

  form.append(input, submit);

  const status = document.createElement("span");
  status.className = "ipa-download-status";
  status.setAttribute("role", "status");

  const render = () => {
    const state = states.get(bundleId);
    button.hidden = false;
    button.disabled = false;
    button.title = "";
    form.hidden = true;
    status.textContent = "";
    if (!state) {
      button.textContent = "下载 IPA";
      return;
    }
    switch (state.status) {
      case "queued": {
        button.textContent = queuedLabel(state);
        button.disabled = true;
        const ahead = state.queuePosition ?? 0;
        if (ahead > 0) {
          status.textContent = state.activeJob
            ? `前面还有 ${ahead} 个下载任务，正在处理 ${describeActiveJob(state.activeJob)}`
            : `前面还有 ${ahead} 个下载任务`;
        }
        break;
      }
      case "running": {
        button.textContent = runningLabel(state);
        button.disabled = true;
        const preparing = state.progress === null && !(state.bytesDownloaded ?? 0);
        const elapsedMs = Date.now() - Date.parse(state.startedAt);
        if (preparing && elapsedMs >= 90_000) {
          status.textContent = "正在与 App Store 通信（登录/授权阶段），通常需要几分钟…";
        }
        break;
      }
      case "awaiting_auth_code":
        button.hidden = true;
        form.hidden = false;
        status.textContent = ERROR_MESSAGES[state.errorCode ?? "purchase_auth_required"];
        break;
      case "done":
        button.textContent = "保存 IPA";
        button.title = "服务器保留 7 天，请及时保存";
        break;
      case "failed":
        button.textContent = "重试下载";
        status.textContent = ERROR_MESSAGES[state.errorCode ?? "unknown"];
        break;
    }
  };

  const triggerSave = (fileUrl: string) => {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `${bundleId}.ipa`;
    link.click();
  };

  button.addEventListener("click", () => {
    const state = states.get(bundleId);
    if (state?.status === "done" && state.fileUrl) {
      triggerSave(state.fileUrl);
      return;
    }
    if (!state || state.status === "failed") {
      void begin(bundleId, button, render);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = states.get(bundleId);
    if (!state || state.status !== "awaiting_auth_code" || submitting.has(bundleId)) return;
    const code = input.value.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      status.textContent = "请输入 6 位数字验证码";
      input.focus();
      return;
    }
    submitting.add(bundleId);
    input.value = "";
    status.textContent = "正在验证…";
    void (async () => {
      try {
        applyJob(bundleId, await submitIpaAuthCode(state.jobId, code));
        render();
        poll(bundleId, button, render);
      } catch {
        status.textContent = "验证码提交失败，请重试";
      } finally {
        submitting.delete(bundleId);
      }
    })();
  });

  render();
  const state = states.get(bundleId);
  if (state && (state.status === "queued" || state.status === "running")) {
    poll(bundleId, button, render);
  }

  wrapper.append(button, form, status);
  return wrapper;
}

async function begin(bundleId: string, button: HTMLButtonElement, render: () => void) {
  if (starting.has(bundleId)) return;
  starting.add(bundleId);
  try {
    applyJob(bundleId, await startIpaDownload(bundleId));
    render();
    poll(bundleId, button, render);
  } catch {
    states.set(bundleId, {
      jobId: "",
      status: "failed",
      progress: null,
      bytesDownloaded: null,
      queuePosition: null,
      activeJob: null,
      errorCode: "unknown",
      error: null,
      fileUrl: null,
      startedAt: new Date().toISOString(),
    });
    render();
  } finally {
    starting.delete(bundleId);
  }
}

function poll(bundleId: string, button: HTMLButtonElement, render: () => void, failures = 0) {
  const state = states.get(bundleId);
  if (!state?.jobId) return;
  setTimeout(async () => {
    if (!button.isConnected || states.get(bundleId)?.jobId !== state.jobId) return;
    try {
      const job = await getIpaDownload(state.jobId);
      applyJob(bundleId, job);
      render();
      if (job.status === "queued" || job.status === "running") {
        poll(bundleId, button, render);
      }
    } catch {
      if (failures < MAX_POLL_FAILURES) {
        poll(bundleId, button, render, failures + 1);
      } else {
        states.set(bundleId, { ...state, status: "failed", errorCode: "unknown", fileUrl: null });
        render();
      }
    }
  }, POLL_INTERVAL_MS);
}

export function resetIpaDownloadState() {
  states.clear();
  starting.clear();
  submitting.clear();
}
