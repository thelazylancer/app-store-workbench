import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { IpaDownloadErrorCode, IpaDownloadJob, IpaDownloadStatus } from "../../shared/types";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;
const DEFAULT_MAX_JOBS = 200;
const STOREFRONT_RETRY_LIMIT = 1;
const HOUR_MS = 60 * 60 * 1000;
const PROGRESS_POLL_MS = 1000;
const PERSISTED_JOBS_FILE = ".jobs.json";

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
  cancelJob(id: string): IpaDownloadJob | null;
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
  persistJobs?: boolean;
  maxJobs?: number;
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
  cancelRequested: boolean;
  createdAt: number;
  updatedAt: number;
};

type PersistedJob = Omit<JobRecord, "output" | "authCode" | "cancelRequested">;

function isTerminalStatus(status: IpaDownloadStatus): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

function isPersistedJob(value: unknown): value is PersistedJob {
  if (typeof value !== "object" || value === null) return false;
  const job = value as Record<string, unknown>;
  return typeof job.id === "string" && job.id.length > 0
    && typeof job.bundleId === "string" && job.bundleId.length > 0
    && typeof job.fileName === "string" && job.fileName.length > 0
    && typeof job.status === "string"
    && ["queued", "running", "awaiting_auth_code", "done", "failed", "cancelled"].includes(job.status)
    && typeof job.createdAt === "number" && Number.isFinite(job.createdAt)
    && typeof job.updatedAt === "number" && Number.isFinite(job.updatedAt);
}

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
    case "cancelled":
      return "IPA download cancelled";
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
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const persistJobs = options.persistJobs ?? false;
  const persistPath = path.join(downloadsDir, PERSISTED_JOBS_FILE);
  const runner = options.runner ?? createDefaultRunner(options.ipatoolBin, options.proxyUrl);
  const now = options.now ?? Date.now;

  const jobs = new Map<string, JobRecord>();
  const queue: string[] = [];
  const controllers = new Map<string, AbortController>();
  let activeId: string | null = null;

  function pruneJobs(cutoff = now() - retentionDays * 24 * HOUR_MS) {
    for (const [id, record] of jobs) {
      if (isTerminalStatus(record.status) && record.updatedAt < cutoff) {
        jobs.delete(id);
      }
    }

    const removable = [...jobs.values()]
      .filter((record) => isTerminalStatus(record.status))
      .sort((left, right) => left.updatedAt - right.updatedAt);
    while (jobs.size > maxJobs && removable.length > 0) {
      jobs.delete(removable.shift()!.id);
    }
  }

  function persistJobsToDisk() {
    if (!persistJobs) return;
    try {
      mkdirSync(downloadsDir, { recursive: true });
      const payload: PersistedJob[] = [...jobs.values()].map(
        ({ output: _output, authCode: _authCode, cancelRequested: _cancelRequested, ...record }) => record,
      );
      const temporaryPath = `${persistPath}.tmp`;
      writeFileSync(temporaryPath, JSON.stringify(payload), "utf8");
      renameSync(temporaryPath, persistPath);
    } catch {
      // Persistence is best effort; an unwritable directory must not break downloads.
    }
  }

  function loadPersistedJobs() {
    if (!persistJobs) return;
    try {
      const payload: unknown = JSON.parse(readFileSync(persistPath, "utf8"));
      if (!Array.isArray(payload)) return;
      for (const item of payload) {
        if (!isPersistedJob(item) || jobs.has(item.id)) continue;
        const interrupted = !isTerminalStatus(item.status);
        jobs.set(item.id, {
          ...item,
          status: interrupted ? "failed" : item.status,
          progress: interrupted ? null : item.progress,
          bytesDownloaded: interrupted ? null : item.bytesDownloaded,
          errorCode: interrupted ? "unknown" : item.errorCode,
          error: interrupted ? "Server restarted before the download finished" : item.error,
          output: "",
          authCode: null,
          cancelRequested: false,
        });
      }
      pruneJobs();
    } catch {
      // A missing or malformed jobs file simply starts with an empty history.
    }
  }

  function toView(record: JobRecord): IpaDownloadJob {
    const active = activeId !== null && activeId !== record.id ? jobs.get(activeId) : undefined;
    const activeRunning = active?.status === "running";
    const queuedIndex = record.status === "queued" ? queue.indexOf(record.id) : -1;
    return {
      id: record.id,
      bundleId: record.bundleId,
      status: record.status,
      progress: record.progress,
      bytesDownloaded: record.bytesDownloaded,
      queuePosition: queuedIndex >= 0 ? queuedIndex + (activeRunning ? 1 : 0) : null,
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

  async function attemptDownload(
    record: JobRecord,
  ): Promise<"done" | "cancelled" | IpaDownloadErrorCode> {
    const outPath = path.join(downloadsDir, record.fileName);
    const tmpPath = `${outPath}.tmp`;
    const controller = new AbortController();
    controllers.set(record.id, controller);
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

    let outcome: "done" | "cancelled" | IpaDownloadErrorCode;
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
      if (record.cancelRequested) {
        outcome = "cancelled";
      } else {
        const size = timedOut ? null : await fileSize(outPath);
        if (!timedOut && result.exitCode === 0 && !/success=false/i.test(record.output) && size !== null) {
          record.sizeBytes = size;
          record.bytesDownloaded = size;
          outcome = "done";
        } else {
          outcome = timedOut ? "timeout" : classifyOutput(record.output);
        }
      }
    } catch {
      outcome = record.cancelRequested
        ? "cancelled"
        : timedOut ? "timeout" : classifyOutput(record.output);
    } finally {
      controllers.delete(record.id);
      clearTimeout(timer);
      clearInterval(progressTimer);
    }
    if (outcome !== "done") {
      record.bytesDownloaded = null;
      await unlink(tmpPath).catch(() => {});
    }
    if (outcome === "cancelled") {
      await unlink(outPath).catch(() => {});
      record.sizeBytes = null;
    }
    return outcome;
  }

  async function execute(record: JobRecord) {
    if (record.status === "cancelled" || record.cancelRequested) {
      record.status = "cancelled";
      record.progress = null;
      record.bytesDownloaded = null;
      record.errorCode = "cancelled";
      record.error = errorMessage("cancelled");
      record.updatedAt = now();
      persistJobsToDisk();
      activeId = null;
      pump();
      return;
    }

    record.status = "running";
    record.progress = null;
    record.errorCode = null;
    record.error = null;
    record.cancelRequested = false;
    record.updatedAt = now();

    for (let attempt = 0; attempt <= STOREFRONT_RETRY_LIMIT; attempt++) {
      const outcome = await attemptDownload(record);
      if (record.cancelRequested || outcome === "cancelled") {
        record.status = "cancelled";
        record.progress = null;
        record.bytesDownloaded = null;
        record.errorCode = "cancelled";
        record.error = errorMessage("cancelled");
        record.updatedAt = now();
        break;
      }
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

    pruneJobs();
    persistJobsToDisk();
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

  loadPersistedJobs();

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
        // Keep the on-disk name below common 255-byte filename limits.
        fileName: `${bundleId.slice(0, 200)}-${id.slice(0, 8)}.ipa`,
        sizeBytes: null,
        errorCode: null,
        error: null,
        output: "",
        authCode: null,
        cancelRequested: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      jobs.set(id, record);
      queue.push(id);
      pruneJobs();
      persistJobsToDisk();
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
      record.cancelRequested = false;
      record.updatedAt = now();
      queue.unshift(id);
      persistJobsToDisk();
      queueMicrotask(pump);
      return toView(record);
    },

    cancelJob(id: string) {
      const record = jobs.get(id);
      if (!record || isTerminalStatus(record.status)) return null;

      if (record.status === "queued") {
        const index = queue.indexOf(id);
        if (index >= 0) queue.splice(index, 1);
      }

      record.cancelRequested = true;
      record.status = "cancelled";
      record.progress = null;
      record.bytesDownloaded = null;
      record.errorCode = "cancelled";
      record.error = errorMessage("cancelled");
      record.updatedAt = now();
      controllers.get(id)?.abort();
      pruneJobs();
      persistJobsToDisk();
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
      pruneJobs(cutoff);
      persistJobsToDisk();
      return removed;
    },
  };
}
