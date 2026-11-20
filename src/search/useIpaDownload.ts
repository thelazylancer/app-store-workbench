import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IpaDownloadActiveJob,
  IpaDownloadErrorCode,
  IpaDownloadJob,
  IpaDownloadStatus,
} from "../../shared/types";
import { cancelIpaDownload, getIpaDownload, startIpaDownload, submitIpaAuthCode } from "../lib/api";

const POLL_INTERVAL_MS = 2000;
const AWAITING_POLL_INTERVAL_MS = 5000;
const MAX_POLL_FAILURES = 5;
const PREPARING_HINT_MS = 90_000;

export const IPA_ERROR_MESSAGES: Record<IpaDownloadErrorCode, string> = {
  terms_required:
    "服务器登录的 Apple ID 有待接受的 App Store 条款：请在 iPhone/iPad 的 App Store 中登录该账号（不是手机上日常使用的账号），按提示同意条款或获取一次该应用后重试",
  purchase_auth_required:
    "未拥有的应用需要验证码完成购买；只需输入一次，验证通过后同一批次中排队的任务会共用刷新后的会话",
  auth_code_invalid: "验证码无效或已过期，请重新输入",
  not_authenticated: "服务器尚未登录 Apple ID",
  storefront_unavailable: "App Store 商店服务暂不可用，请重试",
  timeout: "下载超时，请重试",
  cancelled: "下载已取消",
  unknown: "下载失败，请重试",
};

const UNAVAILABLE_MESSAGE = "IPA 下载不可用";
const CANCELING_MESSAGE = "正在取消…";
const CANCEL_FAILED_MESSAGE = "取消失败，请重试";
const INVALID_CODE_MESSAGE = "请输入 6 位数字验证码";
const SUBMITTING_MESSAGE = "正在验证…";
const SUBMIT_FAILED_MESSAGE = "验证码提交失败，请重试";

const ERROR_NOTICES = new Set([CANCEL_FAILED_MESSAGE, INVALID_CODE_MESSAGE, SUBMIT_FAILED_MESSAGE]);

type IpaState = {
  jobId: string;
  status: IpaDownloadStatus;
  progress: number | null;
  bytesDownloaded: number | null;
  queuePosition: number | null;
  activeJob: IpaDownloadActiveJob | null;
  errorCode: IpaDownloadErrorCode | null;
  fileUrl: string | null;
  startedAt: string;
  message: string | null;
};

export type IpaDownloadControl = {
  status: IpaDownloadStatus | "idle";
  label: string;
  disabled: boolean;
  canCancel: boolean;
  canceling: boolean;
  submitting: boolean;
  starting: boolean;
  awaitingCode: boolean;
  statusMessage: string | null;
  messageTone: "info" | "error";
  start: () => void;
  cancel: () => void;
  submitCode: (raw: string) => boolean;
  save: () => void;
};

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

function runningLabel(job: IpaState): string {
  const downloading = job.progress !== null || (job.bytesDownloaded ?? 0) > 0;
  const parts = [downloading ? "下载中" : "准备中…"];
  if (job.progress !== null) parts.push(`${job.progress}%`);
  const size = formatBytes(job.bytesDownloaded);
  if (size) parts.push(size);
  const elapsed = formatElapsed(job.startedAt);
  if (elapsed) parts.push(elapsed);
  return parts.join(" ");
}

function queuedLabel(job: IpaState): string {
  const elapsed = formatElapsed(job.startedAt);
  return elapsed ? `排队中 ${elapsed}` : "排队中…";
}

function describeActiveJob(active: IpaDownloadActiveJob): string {
  const state = active.progress !== null ? `下载中 ${active.progress}%` : "准备中…";
  return `${active.bundleId} ${state}`;
}

function queuedMessage(job: IpaState): string | null {
  const ahead = job.queuePosition ?? 0;
  if (ahead <= 0) return null;
  return job.activeJob
    ? `前面还有 ${ahead} 个下载任务，正在处理 ${describeActiveJob(job.activeJob)}`
    : `前面还有 ${ahead} 个下载任务`;
}

function stateMessage(job: IpaState): string | null {
  switch (job.status) {
    case "queued":
      return queuedMessage(job);
    case "running": {
      const preparing = job.progress === null && !(job.bytesDownloaded ?? 0);
      const elapsed = Date.now() - Date.parse(job.startedAt);
      return preparing && elapsed >= PREPARING_HINT_MS
        ? "正在与 App Store 通信（登录/授权阶段），通常需要几分钟…"
        : null;
    }
    case "awaiting_auth_code":
      return IPA_ERROR_MESSAGES[job.errorCode ?? "purchase_auth_required"];
    case "cancelled":
      return IPA_ERROR_MESSAGES.cancelled;
    case "failed":
      return job.message ?? IPA_ERROR_MESSAGES[job.errorCode ?? "unknown"];
    default:
      return null;
  }
}

function stateLabel(job: IpaState | null): string {
  if (!job) return "下载 IPA";
  switch (job.status) {
    case "queued":
      return queuedLabel(job);
    case "running":
      return runningLabel(job);
    case "awaiting_auth_code":
      return "输入验证码";
    case "done":
      return "保存 IPA";
    case "cancelled":
      return "重新下载";
    case "failed":
      return "重试下载";
  }
}

function failedState(message: string | null): IpaState {
  return {
    jobId: "",
    status: "failed",
    progress: null,
    bytesDownloaded: null,
    queuePosition: null,
    activeJob: null,
    errorCode: "unknown",
    fileUrl: null,
    startedAt: new Date().toISOString(),
    message,
  };
}

// Job state outlives the inspector remount cycle (switching candidates would
// otherwise forget a running job and start a duplicate one).
const jobStore = new Map<string, IpaState>();

export function resetIpaDownloadStore(): void {
  jobStore.clear();
}

export function useIpaDownload(bundleId: string): IpaDownloadControl {
  const [job, setJob] = useState<IpaState | null>(() => jobStore.get(bundleId) ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const disposed = useRef(false);
  const startingRef = useRef(false);
  const submittingRef = useRef(false);
  const failuresRef = useRef(0);
  const jobRef = useRef(job);
  jobRef.current = job;

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, []);

  useEffect(() => {
    setJob(jobStore.get(bundleId) ?? null);
    setNotice(null);
    failuresRef.current = 0;
  }, [bundleId]);

  const commitJob = useCallback((value: IpaState) => {
    jobStore.set(bundleId, value);
    setJob(value);
  }, [bundleId]);

  const applyJob = useCallback((next: IpaDownloadJob) => {
    const previous = jobRef.current;
    commitJob({
      jobId: next.id,
      status: next.status,
      progress: next.progress,
      bytesDownloaded: next.bytesDownloaded,
      queuePosition: next.queuePosition ?? null,
      activeJob: next.activeJob ?? null,
      errorCode: next.errorCode,
      fileUrl: next.fileUrl,
      message: null,
      startedAt:
        previous && previous.jobId === next.id && (previous.status === "queued" || previous.status === "running")
          ? previous.startedAt
          : new Date().toISOString(),
    });
    setNotice(null);
    failuresRef.current = 0;
  }, [commitJob]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running" && job.status !== "awaiting_auth_code")) {
      return;
    }
    let cancelled = false;
    const interval = job.status === "awaiting_auth_code" ? AWAITING_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
    const timer = setTimeout(async () => {
      if (disposed.current) return;
      try {
        const next = await getIpaDownload(job.jobId);
        if (cancelled || disposed.current) return;
        applyJob(next);
      } catch {
        if (cancelled || disposed.current) return;
        failuresRef.current += 1;
        if (failuresRef.current > MAX_POLL_FAILURES) {
          const previous = jobRef.current;
          if (previous && previous.jobId === job.jobId) {
            commitJob({ ...previous, status: "failed", errorCode: "unknown", fileUrl: null });
          }
          setNotice(null);
        } else {
          setPollTick((value) => value + 1);
        }
      }
    }, interval);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [job, pollTick, applyJob, commitJob]);

  const start = useCallback(() => {
    const existing = jobStore.get(bundleId);
    if (startingRef.current || existing?.status === "queued" || existing?.status === "running") return;
    startingRef.current = true;
    setStarting(true);
    void (async () => {
      try {
        applyJob(await startIpaDownload(bundleId));
      } catch (error) {
        if (disposed.current) return;
        const status = (error as { status?: number }).status;
        commitJob(failedState(status === 503 ? UNAVAILABLE_MESSAGE : null));
        setNotice(null);
      } finally {
        startingRef.current = false;
        if (!disposed.current) setStarting(false);
      }
    })();
  }, [applyJob, bundleId, commitJob]);

  const cancel = useCallback(() => {
    const current = jobRef.current;
    if (
      !current ||
      (current.status !== "queued" && current.status !== "running" && current.status !== "awaiting_auth_code")
    ) {
      return;
    }
    setCanceling(true);
    setNotice(CANCELING_MESSAGE);
    void (async () => {
      try {
        applyJob(await cancelIpaDownload(current.jobId));
      } catch {
        if (!disposed.current) setNotice(CANCEL_FAILED_MESSAGE);
      } finally {
        if (!disposed.current) setCanceling(false);
      }
    })();
  }, [applyJob]);

  const submitCode = useCallback(
    (raw: string) => {
      const current = jobRef.current;
      if (!current || current.status !== "awaiting_auth_code" || submittingRef.current) return false;
      const code = raw.replace(/\D/g, "").slice(0, 6);
      if (code.length !== 6) {
        setNotice(INVALID_CODE_MESSAGE);
        return false;
      }
      submittingRef.current = true;
      setSubmitting(true);
      setNotice(SUBMITTING_MESSAGE);
      void (async () => {
        try {
          applyJob(await submitIpaAuthCode(current.jobId, code));
        } catch {
          if (!disposed.current) setNotice(SUBMIT_FAILED_MESSAGE);
        } finally {
          submittingRef.current = false;
          if (!disposed.current) setSubmitting(false);
        }
      })();
      return true;
    },
    [applyJob],
  );

  const save = useCallback(() => {
    const url = jobRef.current?.fileUrl;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${bundleId}.ipa`;
    link.click();
  }, [bundleId]);

  const status = job?.status ?? "idle";
  const statusMessage = notice ?? (job ? stateMessage(job) : null);
  const messageTone =
    (notice !== null && ERROR_NOTICES.has(notice)) ||
    job?.status === "failed" ||
    job?.errorCode === "auth_code_invalid"
      ? "error"
      : "info";

  return {
    status,
    label: stateLabel(job),
    disabled: job?.status === "queued" || job?.status === "running",
    canCancel: job?.status === "queued" || job?.status === "running" || job?.status === "awaiting_auth_code",
    canceling,
    submitting,
    starting,
    awaitingCode: job?.status === "awaiting_auth_code",
    statusMessage,
    messageTone,
    start,
    cancel,
    submitCode,
    save,
  };
}
