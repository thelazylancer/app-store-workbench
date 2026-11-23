export type SourcePackageRow = {
  packageCode: string;
  displayName: string;
  team: string;
  firstAdDate: string;
  listingDate: string | null;
  first100Date: string | null;
  offlineDate: string | null;
};

export type SourceBatch = {
  syncId: string;
  snapshotId: string;
  dataUpdatedAt: string;
  publishedAt: string;
  rangeComplete: boolean;
  stale: boolean;
  rows: SourcePackageRow[];
};

const DEFAULT_API_URL = "http://192.168.110.61:8001/api/v1/first-delivery-packages";
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 200;

export class FirstDeliveryHttpError extends Error {
  constructor(readonly status: number) {
    super(`First-delivery request failed with ${status}`);
    this.name = "FirstDeliveryHttpError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function endpoint(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (/\/first-delivery-packages$/.test(trimmed)) return trimmed;
  if (/\/api\/v\d+$/.test(trimmed)) return `${trimmed}/first-delivery-packages`;
  return `${trimmed}/api/v1/first-delivery-packages`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

function timestamp(value: unknown, fallback: string): string {
  const raw = text(value);
  if (!raw) return fallback;
  // Source timestamps are UTC; accept space-separated values without a zone.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(" ", "T")}Z`
    : raw;
  const time = Date.parse(normalized);
  return Number.isNaN(time) ? fallback : new Date(time).toISOString();
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function unwrap(body: unknown): { metadata: Record<string, unknown>; rows: Record<string, unknown>[] } {
  if (Array.isArray(body)) return { metadata: {}, rows: body.filter(isRecord) };
  if (!isRecord(body)) throw new Error("First-delivery response is not an object");

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

async function fetchPage(
  targetDate: string,
  page: number,
  syncId: string,
): Promise<{ metadata: Record<string, unknown>; rows: Record<string, unknown>[] }> {
  const apiKey = process.env.FIRST_DELIVERY_API_KEY?.trim();
  if (!apiKey) throw new Error("FIRST_DELIVERY_API_KEY is not configured");

  // Compose may inject empty strings for unset vars, so empty counts as missing.
  const baseUrl = process.env.FIRST_DELIVERY_API_URL?.trim()
    || process.env.FIRST_DELIVERY_API_BASE_URL?.trim()
    || DEFAULT_API_URL;
  const url = new URL(endpoint(baseUrl));
  url.searchParams.set("start_day", targetDate);
  url.searchParams.set("end_day", targetDate);
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
      const error = new FirstDeliveryHttpError(response.status);
      if (response.status < 500) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof FirstDeliveryHttpError && error.status < 500) throw error;
      lastError = error;
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("First-delivery request failed");
}

function normalizeRow(row: Record<string, unknown>): SourcePackageRow | null {
  const packageCode = text(pick(row, "package_code", "packageCode"));
  const displayName = text(pick(row, "display_name", "displayName"));
  const team = text(pick(row, "team"));
  const firstAdDate = dateOnly(pick(row, "first_ad_date", "firstAdDate"));
  if (!packageCode || !displayName || !team || !firstAdDate) return null;

  return {
    packageCode,
    displayName,
    team,
    firstAdDate,
    listingDate: dateOnly(pick(row, "listing_date", "listingDate")),
    first100Date: dateOnly(pick(row, "first_100_date", "first100Date")),
    offlineDate: dateOnly(pick(row, "offline_date", "offlineDate")),
  };
}

/**
 * Fetches one day of first-delivery packages. Rejecting means the source is
 * unreachable, unauthorized, or malformed; a resolved batch is already
 * filtered (display name contains "ios") and de-duplicated.
 */
export async function fetchFirstDeliveryPackages(targetDate: string): Promise<SourceBatch> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("Target date must be YYYY-MM-DD");
  }
  const fetchedAt = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let metadata: Record<string, unknown> = {};
  let syncId = "";

  for (let page = 1; page <= 1_000_000; page += 1) {
    const result = await fetchPage(targetDate, page, syncId);
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
  const seen = new Set<string>();
  const packages: SourcePackageRow[] = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);
    if (!row) continue;
    if (!row.displayName.toLowerCase().includes("ios")) continue;
    if (seen.has(row.packageCode)) continue;
    seen.add(row.packageCode);
    packages.push(row);
  }

  return {
    syncId: text(pick(metadata, "sync_id", "syncId")),
    snapshotId: text(pick(metadata, "snapshot_id", "snapshotId")),
    dataUpdatedAt: timestamp(pick(metadata, "data_updated_at", "dataUpdatedAt"), fetchedAt),
    publishedAt: timestamp(pick(metadata, "published_at", "publishedAt"), fetchedAt),
    rangeComplete: boolean(pick(metadata, "range_complete", "rangeComplete"), true),
    stale: boolean(pick(metadata, "stale"), false),
    rows: packages,
  };
}
