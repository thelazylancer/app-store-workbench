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
const AUTH_REFRESH_TIMEOUT_MS = 2 * 60 * 1000;
const OWNERSHIP_TIMEOUT_MS = 10 * 1000;
const OWNERSHIP_TOTAL_TIMEOUT_MS = 30 * 1000;
const OWNERSHIP_CACHE_TTL_MS = 5 * 60 * 1000;
const OWNERSHIP_FAILURE_TTL_MS = 2 * 60 * 1000;
const OWNED_APPS_PAGE_SIZE = 100;
const OWNED_APPS_MAX_PAGES = 50;

export type CommandResult = { exitCode: number; output: string };

export type DownloadRunner = (
  bundleId: string,
  outPath: string,
  onOutput: (chunk: string) => void,
  signal: AbortSignal,
  authCode?: string,
) => Promise<CommandResult>;

export type AuthRefresher = (code: string, signal: AbortSignal) => Promise<CommandResult>;

/**
 * Returns true when the signed-in account owns the app, false when it does
 * not, and null when ownership could not be determined (network/session
 * failure). The runner treats null as "use --purchase" to preserve the old
 * behaviour.
 */
export type OwnershipResolver = (bundleId: string) => Promise<boolean | null>;

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

function proxyEnv(proxyUrl?: string): NodeJS.ProcessEnv {
  const proxy = proxyUrl?.trim();
  return proxy ? { ...process.env, HTTP_PROXY: proxy, HTTPS_PROXY: proxy } : process.env;
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onOutput?: (chunk: string) => void,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    let output = "";
    const handle = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onOutput?.(text);
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

/** Parses the JSON log lines printed by `ipatool list-purchases --format json`. */
export function parseOwnedAppsOutput(text: string): { bundleIds: string[]; totalCount: number | null } {
  const bundleIds: string[] = [];
  let totalCount: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const value = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof value.totalCount === "number" && Number.isFinite(value.totalCount)) {
        totalCount = value.totalCount;
      }
      const apps = Array.isArray(value.apps) ? value.apps : [];
      for (const app of apps) {
        if (typeof app !== "object" || app === null) continue;
        const record = app as Record<string, unknown>;
        const bundleId = record.bundleId ?? record.bundleID;
        if (typeof bundleId === "string" && bundleId.trim()) bundleIds.push(bundleId.trim());
      }
    } catch {
      // Ignore non-JSON log lines and malformed records.
    }
  }
  return { bundleIds, totalCount };
}

function createDefaultOwnershipResolver(
  ipatoolBin: string,
  proxyUrl?: string,
  now: () => number = Date.now,
): OwnershipResolver {
  const env = proxyEnv(proxyUrl);
  let cached: { bundleIds: Set<string>; expiresAt: number } | null = null;
  let cachedFailureUntil = 0;
  let inFlight: Promise<Set<string> | null> | null = null;

  async function loadOwnedBundleIds(): Promise<Set<string> | null> {
    const owned = new Set<string>();
    let totalCount: number | null = null;
    const deadline = now() + OWNERSHIP_TOTAL_TIMEOUT_MS;
    try {
      for (let page = 1; page <= OWNED_APPS_MAX_PAGES; page++) {
        if (now() >= deadline) break;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), OWNERSHIP_TIMEOUT_MS);
        let result: CommandResult;
        try {
          result = await runCommand(
            ipatoolBin,
            [
              "list-purchases",
              "--format",
              "json",
              "--non-interactive",
              "--page",
              String(page),
              "--max-results",
              String(OWNED_APPS_PAGE_SIZE),
            ],
            env,
            controller.signal,
          );
        } finally {
          clearTimeout(timer);
        }
        const parsed = parseOwnedAppsOutput(result.output);
        if (parsed.bundleIds.length === 0 && result.exitCode !== 0) return null;
        for (const bundleId of parsed.bundleIds) owned.add(bundleId);
        if (parsed.totalCount !== null) totalCount = parsed.totalCount;
        if (parsed.bundleIds.length < OWNED_APPS_PAGE_SIZE) break;
        if (totalCount !== null && owned.size >= totalCount) break;
      }
      return owned;
    } catch {
      return null;
    }
  }

  return async (bundleId: string) => {
    if (cached && cached.expiresAt > now()) return cached.bundleIds.has(bundleId);
    // Apple's storefront endpoint can be slow or briefly unavailable. Failure
    // is cached too, so a broken preflight does not add a delay to every job.
    if (cachedFailureUntil > now()) return null;
    if (!inFlight) {
      inFlight = loadOwnedBundleIds().finally(() => {
        inFlight = null;
      });
    }
    const bundleIds = await inFlight;
    if (!bundleIds) {
      cachedFailureUntil = now() + OWNERSHIP_FAILURE_TTL_MS;
      return null;
    }
    cached = { bundleIds, expiresAt: now() + OWNERSHIP_CACHE_TTL_MS };
    return bundleIds.has(bundleId);
  };
}

function createDefaultRunner(
  ipatoolBin: string,
  proxyUrl?: string,
  resolveOwned?: OwnershipResolver,
): DownloadRunner {
  const env = proxyEnv(proxyUrl);
  return async (bundleId, outPath, onOutput, signal, authCode) => {
    // Owned apps need no license acquisition at all. When ownership is
    // unknown, keep the old --purchase behaviour so the download still works.
    const owned = resolveOwned ? await resolveOwned(bundleId).catch(() => null) : null;
    const run = (purchase: boolean, code?: string) => {
      const args = ["download", "-b", bundleId, "-o", outPath];
      if (purchase) args.push("--purchase");
      if (code) args.push("--auth-code", code);
      return runCommand(ipatoolBin, args, env, signal, onOutput);
    };

    let result = await run(owned !== true, authCode);
    if (owned === true && /license is required/i.test(result.output)) {
      // The ownership cache can be stale (revoked license, new device, ...).
      // The first process already refreshed the keychain session if a code
      // was supplied, so the retry does not need to replay the 2FA code.
      result = await run(true, undefined);
    }
    if (isTransientStoreFailure(result)) {
      // Apple's commerce endpoints occasionally drop the connection (EOF /
      // reset) instead of answering. Retry once; a supplied 2FA code was
      // already consumed by the first process, so do not replay it.
      result = await run(owned !== true, undefined);
    }
    return result;
  };
}

function isTransientStoreFailure(result: CommandResult): boolean {
  return (
    result.exitCode !== 0
    && /failed to send http request|connection reset by peer|unexpected EOF|i\/o timeout|: EOF\b/i.test(result.output)
    && !/auth code is required|did not complete verification/i.test(result.output)
  );
}

function createDefaultAuthRefresher(ipatoolBin: string, proxyUrl?: string): AuthRefresher {
  const env = proxyEnv(proxyUrl);
  return (code, signal) =>
    runCommand(ipatoolBin, ["auth", "refresh", "--auth-code", code, "--non-interactive"], env, signal);
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
