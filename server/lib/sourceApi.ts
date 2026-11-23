const DEFAULT_API_URL = "http://192.168.110.61:8001/api/v1/first-delivery-packages";
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 200;

export class SourceHttpError extends Error {
  constructor(readonly status: number) {
    super(`First-delivery request failed with ${status}`);
    this.name = "SourceHttpError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolves a source endpoint. Accepts a bare origin, an `/api/v1` base, or a
 * full path for either package endpoint; the segment is always re-appended.
 */
export function sourceEndpointUrl(path: string): string {
  // Compose may inject empty strings for unset vars, so empty counts as missing.
  const baseUrl = process.env.FIRST_DELIVERY_API_URL?.trim()
    || process.env.FIRST_DELIVERY_API_BASE_URL?.trim()
    || DEFAULT_API_URL;
  const trimmed = baseUrl
    .replace(/\/+$/, "")
    .replace(/\/(?:first-delivery-packages|offline-packages)$/, "");
  if (/\/api\/v\d+$/.test(trimmed)) return `${trimmed}/${path}`;
  return `${trimmed}/api/v1/${path}`;
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

export function dateOnly(value: unknown): string | null {
  // Accept a bare day or a day followed by a time suffix; reject dates that
  // the calendar does not have (2026-02-31), which PostgreSQL would reject.
  const day = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(text(value))?.[1];
  if (!day) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day
    ? null
    : day;
}

export function timestamp(value: unknown, fallback: string): string {
  const raw = text(value);
  if (!raw) return fallback;
  // Source timestamps are UTC; accept space-separated values without a zone.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

export function boolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function unwrap(body: unknown): SourcePage {
  if (Array.isArray(body)) return { metadata: {}, rows: body.filter(isRecord) };
  if (!isRecord(body)) throw new Error("Source response is not an object");

  const meta = isRecord(body.meta) ? body.meta : {};
  const data = body.data;
  if (Array.isArray(data)) return { metadata: { ...body, ...meta }, rows: data.filter(isRecord) };
  if (isRecord(data)) {
    const rowsCandidate = [data.items, data.rows, data.list, data.records, data.packages]
      .find(Array.isArray);
    return {
      metadata: { ...body, ...data, ...meta },
      rows: (rowsCandidate ?? []).filter(isRecord),
    };
  }

  const rowsCandidate = [body.items, body.rows, body.list, body.records, body.packages, body.results]
    .find(Array.isArray);
  return { metadata: { ...body, ...meta }, rows: (rowsCandidate ?? []).filter(isRecord) };
}

export type SourcePage = {
  metadata: Record<string, unknown>;
  rows: Record<string, unknown>[];
};

/** Fetches one page; 4xx fails fast, 5xx and network errors retry three times. */
export async function fetchSourcePage(
  path: string,
  params: Record<string, string>,
  page: number,
  syncId: string,
): Promise<SourcePage> {
  const apiKey = process.env.FIRST_DELIVERY_API_KEY?.trim();
  if (!apiKey) throw new Error("FIRST_DELIVERY_API_KEY is not configured");

  const url = new URL(sourceEndpointUrl(path));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(PAGE_SIZE));
  if (syncId) url.searchParams.set("sync_id", syncId);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "X-API-Key": apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        return unwrap(await response.json());
      }
      const error = new SourceHttpError(response.status);
      if (response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof SourceHttpError && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Source request failed");
}

/** Follows pagination, reusing the first page's sync id until the range ends. */
export async function fetchSourceAllPages(
  path: string,
  params: Record<string, string>,
): Promise<SourcePage> {
  const rows: Record<string, unknown>[] = [];
  let metadata: Record<string, unknown> = {};
  let syncId = "";

  for (let page = 1; page <= 1_000_000; page += 1) {
    const result = await fetchSourcePage(path, params, page, syncId);
    if (page === 1) {
      metadata = result.metadata;
      syncId = text(pick(metadata, "sync_id", "syncId"));
    }
    rows.push(...result.rows);

    const totalCount = Number(pick(result.metadata, "total_count", "totalCount"));
    const pageSize = Number(pick(result.metadata, "page_size", "pageSize")) || PAGE_SIZE;
    if (result.rows.length === 0
      || result.rows.length < pageSize
      || (Number.isFinite(totalCount) && rows.length >= totalCount)) {
      break;
    }
  }

  return { metadata, rows };
}
