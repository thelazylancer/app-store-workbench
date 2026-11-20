import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { IpaDownloadErrorCode, IpaDownloadJob, IpaDownloadStatus } from "../../../shared/types";

const HOUR_MS = 60 * 60 * 1000;
const PERSISTED_JOBS_FILE = ".jobs.json";

export type JobRecord = {
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

export type PersistedJob = Omit<JobRecord, "output" | "authCode" | "cancelRequested">;

export function isTerminalStatus(status: IpaDownloadStatus): boolean {
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

export type JobStoreOptions = {
  downloadsDir: string;
  retentionDays: number;
  maxJobs: number;
  persistJobs: boolean;
  now: () => number;
};

export type JobStore = {
  jobs: Map<string, JobRecord>;
  queue: string[];
  controllers: Map<string, AbortController>;
  activeId: string | null;
  pruneJobs(cutoff?: number): void;
  persistJobsToDisk(): void;
  loadPersistedJobs(): void;
  toView(record: JobRecord): IpaDownloadJob;
  cleanupExpired(referenceTime?: number): Promise<string[]>;
};

export function createJobStore(options: JobStoreOptions): JobStore {
  const downloadsDir = options.downloadsDir;
  const retentionDays = options.retentionDays;
  const maxJobs = options.maxJobs;
  const persistJobs = options.persistJobs;
  const now = options.now;
  const persistPath = path.join(downloadsDir, PERSISTED_JOBS_FILE);

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

  async function cleanupExpired(referenceTime = now()) {
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
  }

  return {
    jobs,
    queue,
    controllers,
    get activeId() {
      return activeId;
    },
    set activeId(value: string | null) {
      activeId = value;
    },
    pruneJobs,
    persistJobsToDisk,
    loadPersistedJobs,
    toView,
    cleanupExpired,
  };
}
