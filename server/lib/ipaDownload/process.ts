import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import type { IpaDownloadErrorCode } from "../../../shared/types";

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

export function createDefaultOwnershipResolver(
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

export function createDefaultRunner(
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

export function createDefaultAuthRefresher(ipatoolBin: string, proxyUrl?: string): AuthRefresher {
  const env = proxyEnv(proxyUrl);
  return (code, signal) =>
    runCommand(ipatoolBin, ["auth", "refresh", "--auth-code", code, "--non-interactive"], env, signal);
}

export function parseProgress(output: string): number | null {
  const matches = output.match(/(\d{1,3})%/g);
  if (!matches?.length) return null;
  const percent = Number(matches[matches.length - 1]!.replace("%", ""));
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null;
}

export function classifyOutput(text: string): IpaDownloadErrorCode {
  if (/dyld_lazy_load|termsPage|AMSOpenURL/i.test(text)) return "terms_required";
  if (/auth code is required/i.test(text)) return "purchase_auth_required";
  if (/did not complete verification|2FA code must contain/i.test(text)) return "auth_code_invalid";
  if (/available storefronts request failed/i.test(text)) return "storefront_unavailable";
  if (/password|sign in|keyring|keychain|failed to get account|not logged in|login/i.test(text)) {
    return "not_authenticated";
  }
  return "unknown";
}

export function errorMessage(code: IpaDownloadErrorCode): string {
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

export async function fileSize(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0 ? info.size : null;
  } catch {
    return null;
  }
}
