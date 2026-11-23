import {
  boolean,
  dateOnly,
  fetchSourceAllPages,
  pick,
  text,
  timestamp,
} from "./sourceApi";

// Kept as an alias so existing callers and tests keep compiling.
export { SourceHttpError as FirstDeliveryHttpError } from "./sourceApi";

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
  const { metadata, rows } = await fetchSourceAllPages("first-delivery-packages", {
    start_day: targetDate,
    end_day: targetDate,
  });

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
