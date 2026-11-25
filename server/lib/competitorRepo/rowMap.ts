import type {
  AssetRow,
  BatchRow,
  BatchStatus,
  EnrichStatus,
  GroupBy,
  LookupStatus,
  PackageBrief,
  PackageDetail,
  PackageRow,
} from "../../../shared/competitorTypes";

export type PackageRowResult = {
  package_code: string;
  target_date: string;
  display_name: string;
  team: string;
  first_ad_date: string;
  listing_date: string | null;
  first_100_date: string | null;
  offline_date: string | null;
  category: string | null;
  minimum_os_version: string | null;
  app_version: string | null;
  lookup_status: LookupStatus;
  enrich_status: EnrichStatus;
  asset_status: PackageRow["assetStatus"];
  attribution: string | null;
  app_store_json: unknown;
  fetched_at: unknown;
};

export const PACKAGE_SELECT = `
  package_code,
  to_char(target_date, 'YYYY-MM-DD') AS target_date,
  display_name,
  team,
  to_char(first_ad_date, 'YYYY-MM-DD') AS first_ad_date,
  to_char(listing_date, 'YYYY-MM-DD') AS listing_date,
  to_char(first_100_date, 'YYYY-MM-DD') AS first_100_date,
  to_char(offline_date, 'YYYY-MM-DD') AS offline_date,
  category,
  minimum_os_version,
  app_version,
  lookup_status,
  enrich_status,
  asset_status,
  attribution,
  app_store_json,
  fetched_at`;

export function text(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function appleIdFrom(value: Record<string, unknown>): number | null {
  const raw = value.appleId;
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function groupKeyFor(
  row: { team: string; category: string | null; minimum_os_version: string | null; app_version: string | null },
  groupBy: GroupBy,
): string {
  if (groupBy === "team") return row.team;
  if (groupBy === "category") return row.category ?? "未知";
  return row.minimum_os_version ?? row.app_version ?? "未知";
}

export function shiftDay(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function toPackageBase(row: PackageRowResult) {
  return {
    packageCode: row.package_code,
    targetDate: row.target_date,
    displayName: row.display_name,
    team: row.team,
    firstAdDate: row.first_ad_date,
    listingDate: row.listing_date,
    first100Date: row.first_100_date,
    offlineDate: row.offline_date,
    category: row.category,
    minimumOsVersion: row.minimum_os_version,
    appVersion: row.app_version,
    lookupStatus: row.lookup_status,
    enrichStatus: row.enrich_status,
    assetStatus: row.asset_status,
    attribution: row.attribution,
    appStoreJson: jsonObject(row.app_store_json),
    fetchedAt: text(row.fetched_at),
  };
}

export function batchFromRow(row: Record<string, unknown>): BatchRow {
  return {
    targetDate: text(row.target_date),
    syncId: text(row.sync_id),
    snapshotId: text(row.snapshot_id),
    dataUpdatedAt: text(row.data_updated_at),
    publishedAt: text(row.published_at),
    rangeComplete: Boolean(row.range_complete),
    stale: Boolean(row.stale),
    status: text(row.status) as BatchStatus,
    fetchedAt: text(row.fetched_at),
  };
}

function releaseRange(versionHistory: unknown) {
  const dates = (Array.isArray(versionHistory) ? versionHistory : [])
    .map((entry) => (typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).releasedAt : undefined))
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return {
    earliestReleasedAt: dates[0] ?? null,
    latestReleasedAt: dates.at(-1) ?? null,
  };
}

export function packageBrief(row: PackageRowResult, assets: AssetRow[]): PackageBrief {
  const base = toPackageBase(row);
  const { iapItems, versionHistory } = base.appStoreJson;
  return {
    packageCode: base.packageCode,
    displayName: base.displayName,
    team: base.team,
    appVersion: base.appVersion,
    offlineDate: base.offlineDate,
    iconLocalPath: assets.find((asset) => asset.type === "icon")?.localPath ?? null,
    hasIap: Array.isArray(iapItems) && iapItems.length > 0,
    versionCount: Array.isArray(versionHistory) ? versionHistory.length : 0,
    ...releaseRange(versionHistory),
  };
}

export function withAssets(base: ReturnType<typeof toPackageBase>, assets: AssetRow[]): PackageDetail {
  return {
    ...base,
    appleId: appleIdFrom(base.appStoreJson),
    iconLocalPath: assets.find((asset) => asset.type === "icon")?.localPath ?? null,
    screenshotLocalPaths: assets
      .filter((asset) => asset.type === "screenshot")
      .map((asset) => asset.localPath),
    versions: [],
  };
}
