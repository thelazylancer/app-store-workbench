import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { IpaDownloadErrorCode, IpaDownloadJob, IpaDownloadStatus } from "../../shared/types";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;
const STOREFRONT_RETRY_LIMIT = 1;
const HOUR_MS = 60 * 60 * 1000;
const PROGRESS_POLL_MS = 1000;

export type DownloadRunner = (
  bundleId: string,
  outPath: string,
  onOutput: (chunk: string) => void,
  signal: AbortSignal,
  authCode?: string,
) => Promise<{ exitCode: number; output: string }>;

export type IpaDownloadManager = {
  createJob(bundleId: string): IpaDownloadJob;
  getJob(id: string): IpaDownloadJob | null;
  getFilePath(id: string): string | null;
  submitAuthCode(id: string, code: string): IpaDownloadJob | null;
  cleanupExpired(referenceTime?: number): Promise<string[]>;
};

export type IpaDownloadManagerOptions = {
  ipatoolBin: string;
  downloadsDir: string;
  retentionDays?: number;
  timeoutMs?: number;
  proxyUrl?: string;
  runner?: DownloadRunner;
  now?: () => number;
};

type JobRecord = {
  id: string;
  bundleId: string;
  status: IpaDownloadStatus;
  progress: number | null;
  bytesDownloaded: number | null;
  fileName: string;
  sizeBytes: number | null;
  errorCode: IpaDownloadErrorCode | null;
  error: string | null;
  output: string;
  authCode: string | null;
  createdAt: number;
  updatedAt: number;
};

function createDefaultRunner(ipatoolBin: string, proxyUrl?: string): DownloadRunner {
  const proxy = proxyUrl?.trim();
  const env = proxy ? { ...process.env, HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : process.env;
  return (bundleId, outPath, onOutput, signal, authCode) =>
    new Promise((resolve, reject) => {
      // Interactive mode is kept on purpose: it makes ipatool render its
      // download progress bar (bytes and percent) instead of running silently.
      const args = ["download", "-b", bundleId, "--purchase", "-o", outPath];
      if (authCode) args.push("--auth-code", authCode);
      const child = spawn(ipatoolBin, args, {
        signal,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      let output = "";
      const handle = (chunk: Buffer) => {
        const text = chunk.toString();
        output += text;
        onOutput(text);
      };
      child.stdout.on("data", handle);
      child.stderr.on("data", handle);
      child.on("error", reject);
      child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
    });
}

function parseProgress(output: string): number | null {
  const matches = output.match(/(\d{1,3})%/g);
  if (!matches?.length) return null;
  const percent = Number(matches[matches.length - 1]!.replace("%", ""));
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
}

function classifyOutput(text: string): IpaDownloadErrorCode {
  if (/dyld_lazy_load|termsPage|AMSOpenURL/i.test(text)) return "terms_required";
  if (/auth code is required/i.test(text)) return "purchase_auth_required";
  if (/did not complete verification|2FA code must contain/i.test(text)) return "auth_code_invalid";
  if (/available storefronts request failed/i.test(text)) return "storefront_unavailable";
  if (/password|sign in|keyring|keychain|failed to get account|not logged in|login/i.test(text)) {
    return "not_authenticated";
  }
  return "unknown";
}

function errorMessage(code: IpaDownloadErrorCode): string {
  switch (code) {
    case "terms_required":
      return "The Apple ID has pending App Store terms that must be accepted first";
    case "purchase_auth_required":
      return "Purchasing an unowned app requires a 2FA code from one of the Apple ID's devices";
    case "auth_code_invalid":
      return "The 2FA code was rejected or has expired; enter a fresh code";
    case "not_authenticated":
      return "The server is not signed in to an Apple ID";
    case "storefront_unavailable":
      return "App Store storefront resolution failed; retry the download";
    case "timeout":
      return "IPA download timed out";
    default:
      return "IPA download failed";
  }
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}

export function createIpaDownloadManager(options: IpaDownloadManagerOptions): IpaDownloadManager {
  const downloadsDir = options.downloadsDir;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runner = options.runner ?? createDefaultRunner(options.ipatoolBin, options.proxyUrl);
  const now = options.now ?? Date.now;

  const jobs = new Map<string, JobRecord>();
  const queue: string[] = [];
  let activeId: string | null = null;

  function toView(record: JobRecord): IpaDownloadJob {
    const active = activeId !== null && activeId !== record.id ? jobs.get(activeId) : undefined;
    const queuedIndex = record.status === "queued" ? queue.indexOf(record.id) : -1;
    return {
      id: record.id,
      bundleId: record.bundleId,
      status: record.status,
      progress: record.progress,
      bytesDownloaded: record.bytesDownloaded,
      queuePosition: queuedIndex >= 0 ? queuedIndex + (activeId !== null ? 1 : 0) : null,
      activeJob: active && active.status === "running"
        ? { bundleId: active.bundleId, status: active.status, progress: active.progress }
        : null,
      fileName: record.status === "done" ? record.fileName : null,
      sizeBytes: record.sizeBytes,
      errorCode: record.errorCode,
      error: record.error,
      fileUrl: record.status === "done" ? `/api/ipa-download/${record.id}/file` : null,
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
    };
  }

  async function attemptDownload(record: JobRecord): Promise<"done" | IpaDownloadErrorCode> {
    const outPath = path.join(downloadsDir, record.fileName);
    const tmpPath = `${outPath}.tmp`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const progressTimer = setInterval(() => {
      void fileSize(tmpPath).then((size) => {
        if (size !== null) {
          record.bytesDownloaded = size;
          record.updatedAt = now();
        }
      });
    }, PROGRESS_POLL_MS);
    progressTimer.unref?.();

    let outcome: "done" | IpaDownloadErrorCode;
    try {
      await mkdir(downloadsDir, { recursive: true });
      record.output = "";
      record.bytesDownloaded = null;
      const result = await runner(
        record.bundleId,
        outPath,
        (chunk) => {
          record.output += chunk;
          const percent = parseProgress(record.output);
          if (percent !== null) record.progress = percent;
          record.updatedAt = now();
        },
        controller.signal,
        record.authCode ?? undefined,
      );
      if (result.output) record.output = result.output;
      const size = timedOut ? null : await fileSize(outPath);
      if (!timedOut && result.exitCode === 0 && !/success=false/i.test(record.output) && size !== null) {
        record.sizeBytes = size;
        record.bytesDownloaded = size;
        outcome = "done";
      } else {
        outcome = timedOut ? "timeout" : classifyOutput(record.output);
      }
    } catch {
      outcome = timedOut ? "timeout" : classifyOutput(record.output);
    } finally {
      clearTimeout(timer);
      clearInterval(progressTimer);
    }
    if (outcome !== "done") {
      record.bytesDownloaded = null;
      await unlink(tmpPath).catch(() => {});
    }
    return outcome;
  }

  async function execute(record: JobRecord) {
    record.status = "running";
    record.progress = null;
    record.errorCode = null;
    record.error = null;
    record.updatedAt = now();

    for (let attempt = 0; attempt <= STOREFRONT_RETRY_LIMIT; attempt++) {
      const outcome = await attemptDownload(record);
      if (outcome === "storefront_unavailable" && attempt < STOREFRONT_RETRY_LIMIT) {
        // Retry the transient storefront lookup; keep any submitted auth code for the retry.
        continue;
      }
      record.authCode = null;
      if (outcome === "done") {
        record.status = "done";
        record.progress = 100;
        record.updatedAt = now();
        break;
      }
      if (outcome === "storefront_unavailable" && attempt < STOREFRONT_RETRY_LIMIT) continue;

      if (outcome === "purchase_auth_required" || outcome === "auth_code_invalid") {
        // Park the job until the user supplies a fresh 2FA code instead of failing it.
        record.status = "awaiting_auth_code";
        record.progress = null;
        record.errorCode = outcome;
        record.error = errorMessage(outcome);
        record.updatedAt = now();
        break;
      }

      record.status = "failed";
      record.errorCode = outcome;
      record.error = outcome === "unknown"
        ? record.output.slice(-500).trim() || errorMessage(outcome)
        : errorMessage(outcome);
      record.updatedAt = now();
      break;
    }

    activeId = null;
    pump();
  }

  function pump() {
    if (activeId !== null) return;
    const nextId = queue.shift();
    if (!nextId) return;
    const record = jobs.get(nextId);
    if (!record) {
      pump();
      return;
    }
    activeId = nextId;
    void execute(record);
  }

  return {
    createJob(bundleId: string) {
      const id = randomUUID();
      const timestamp = now();
      const record: JobRecord = {
        id,
        bundleId,
        status: "queued",
        progress: null,
        bytesDownloaded: null,
        fileName: `${bundleId}-${id.slice(0, 8)}.ipa`,
        sizeBytes: null,
        errorCode: null,
        error: null,
        output: "",
        authCode: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      jobs.set(id, record);
      queue.push(id);
      queueMicrotask(pump);
      return toView(record);
    },

    getJob(id: string) {
      const record = jobs.get(id);
      return record ? toView(record) : null;
    },

    getFilePath(id: string) {
      const record = jobs.get(id);
      return record && record.status === "done" ? path.join(downloadsDir, record.fileName) : null;
    },

    submitAuthCode(id: string, code: string) {
      const record = jobs.get(id);
      if (!record || record.status !== "awaiting_auth_code") return null;
      record.authCode = code;
      record.status = "queued";
      record.errorCode = null;
      record.error = null;
      record.updatedAt = now();
      queue.unshift(id);
      queueMicrotask(pump);
      return toView(record);
    },

    async cleanupExpired(referenceTime = now()) {
      const removed: string[] = [];
      const cutoff = referenceTime - retentionDays * 24 * HOUR_MS;
      try {
        await mkdir(downloadsDir, { recursive: true });
        const entries = await readdir(downloadsDir);
        for (const entry of entries) {
          const lower = entry.toLowerCase();
          if (!lower.endsWith(".ipa") && !lower.endsWith(".ipa.tmp")) continue;
          const filePath = path.join(downloadsDir, entry);
          try {
            const info = await stat(filePath);
            if (info.isFile() && info.mtimeMs < cutoff) {
              await unlink(filePath);
              removed.push(entry);
            }
          } catch {
            // Skip files that vanish or cannot be inspected.
          }
        }
      } catch {
        // A missing or unreadable downloads directory leaves nothing to clean.
      }
      return removed;
    },
  };
}
