import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import type { IpaDownloadErrorCode, IpaDownloadJob } from "../../../shared/types";
import {
  classifyOutput,
  createDefaultAuthRefresher,
  createDefaultOwnershipResolver,
  createDefaultRunner,
  errorMessage,
  fileSize,
  parseProgress,
} from "./process";
import type {
  AuthRefresher,
  DownloadRunner,
  OwnershipResolver,
} from "./process";
import { createJobStore, isTerminalStatus } from "./jobStore";
import type { JobRecord } from "./jobStore";

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_JOBS = 200;
const STOREFRONT_RETRY_LIMIT = 1;
const PROGRESS_POLL_MS = 1000;
const AUTH_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;

export type IpaDownloadManager = {
  createJob(bundleId: string): IpaDownloadJob;
  getJob(id: string): IpaDownloadJob | null;
  getFilePath(id: string): string | null;
  submitAuthCode(id: string, code: string): Promise<IpaDownloadJob | null>;
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
  authRefresher?: AuthRefresher | null;
  ownershipResolver?: OwnershipResolver | null;
  now?: () => number;
  persistJobs?: boolean;
  maxJobs?: number;
};

export function createIpaDownloadManager(options: IpaDownloadManagerOptions): IpaDownloadManager {
  const downloadsDir = options.downloadsDir;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxJobs = options.maxJobs ?? DEFAULT_MAX_JOBS;
  const persistJobs = options.persistJobs ?? false;
  // Injected runners are used by tests and alternate backends. Do not create
  // real subprocess side effects for them unless the caller opts in.
  const ownershipResolver = options.ownershipResolver === null
    ? null
    : options.ownershipResolver
      ?? (options.runner ? null : createDefaultOwnershipResolver(options.ipatoolBin, options.proxyUrl, options.now));
  const runner = options.runner
    ?? createDefaultRunner(options.ipatoolBin, options.proxyUrl, ownershipResolver ?? undefined);
  const authRefresher = options.authRefresher === null
    ? null
    : options.authRefresher
      ?? (options.runner ? null : createDefaultAuthRefresher(options.ipatoolBin, options.proxyUrl));
  const now = options.now ?? Date.now;

  const store = createJobStore({ downloadsDir, retentionDays, maxJobs, persistJobs, now });
  const { jobs, queue, controllers } = store;

  // shortcut: the cache is keyed by bundleId only, so a hit can predate the
  // newest App Store build; retention bounds how stale it can be.
  function cachedJob(bundleId: string): JobRecord | null {
    const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;
    let newest: JobRecord | null = null;
    for (const job of jobs.values()) {
      if (job.bundleId !== bundleId || job.status !== "done" || job.updatedAt < cutoff) continue;
      if (newest && job.updatedAt <= newest.updatedAt) continue;
      try {
        if (statSync(path.join(downloadsDir, job.fileName)).isFile()) newest = job;
      } catch {
        // The file was cleaned up: not a cache hit.
      }
    }
    return newest;
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
      store.persistJobsToDisk();
      store.activeId = null;
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

    store.pruneJobs();
    store.persistJobsToDisk();
    store.activeId = null;
    pump();
  }

  function pump() {
    if (store.activeId !== null) return;
    const nextId = queue.shift();
    if (!nextId) return;
    const record = jobs.get(nextId);
    if (!record) {
      pump();
      return;
    }
    store.activeId = nextId;
    void execute(record);
  }

  store.loadPersistedJobs();

  return {
    createJob(bundleId: string) {
      const cached = cachedJob(bundleId);
      if (cached) return store.toView(cached);

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
      store.pruneJobs();
      store.persistJobsToDisk();
      queueMicrotask(pump);
      return store.toView(record);
    },

    getJob(id: string) {
      const record = jobs.get(id);
      return record ? store.toView(record) : null;
    },

    getFilePath(id: string) {
      const record = jobs.get(id);
      return record && record.status === "done" ? path.join(downloadsDir, record.fileName) : null;
    },

    async submitAuthCode(id: string, code: string) {
      const record = jobs.get(id);
      if (!record || record.status !== "awaiting_auth_code") return null;

      // A successful `auth refresh` persists a new password token in the
      // keychain. Every waiting job can then run without its own 2FA code, so
      // one human-entered code covers the whole batch. If the refresh command
      // is unavailable or the refresh fails, fall back to the previous
      // per-job `--auth-code` behaviour.
      let refreshed = false;
      if (authRefresher) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AUTH_REFRESH_TIMEOUT_MS);
        try {
          const result = await authRefresher(code, controller.signal);
          refreshed = result.exitCode === 0
            && !/success=false/i.test(result.output)
            && !/2FA code must contain|did not complete verification|unknown command|unknown flag/i.test(result.output);
        } catch {
          refreshed = false;
        } finally {
          clearTimeout(timer);
        }
      }

      // The job may have been cancelled while the refresh request was in flight.
      if (record.status !== "awaiting_auth_code") return null;

      const waiting = [...jobs.values()]
        .filter((job) => job.status === "awaiting_auth_code")
        .sort((left, right) => left.createdAt - right.createdAt);
      const targets = refreshed ? waiting : [record];
      if (targets.length === 0) return null;

      const requeued: string[] = [];
      for (const job of targets) {
        job.authCode = refreshed ? null : code;
        job.status = "queued";
        job.errorCode = null;
        job.error = null;
        job.cancelRequested = false;
        job.updatedAt = now();
        const queuedIndex = queue.indexOf(job.id);
        if (queuedIndex >= 0) queue.splice(queuedIndex, 1);
        requeued.push(job.id);
      }
      queue.unshift(...requeued);
      store.persistJobsToDisk();
      queueMicrotask(pump);
      return store.toView(record);
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
      store.pruneJobs();
      store.persistJobsToDisk();
      return store.toView(record);
    },

    cleanupExpired(referenceTime = now()) {
      return store.cleanupExpired(referenceTime);
    },
  };
}
