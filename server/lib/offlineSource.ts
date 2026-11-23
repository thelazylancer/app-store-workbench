import { boolean, dateOnly, fetchSourceAllPages, pick, text } from "./sourceApi";

export type OfflinePackageRow = {
  packageCode: string; // required, trimmed, non-empty
  offlineDate: string; // YYYY-MM-DD, Beijing time
};

export type OfflineSourceBatch = {
  syncId: string;
  rangeComplete: boolean;
  stale: boolean;
  rows: OfflinePackageRow[]; // valid rows only
  invalid: number; // rows missing package_code or a valid offline_date
};

/**
 * Fetches offline packages for an inclusive Beijing-time day range. Rejects on
 * source/authorization/pagination failure; a resolved batch keeps only rows
 * with both a package code and an offline date. No display-name filtering.
 */
export async function fetchOfflinePackages(
  startDay: string,
  endDay: string,
): Promise<OfflineSourceBatch> {
  for (const day of [startDay, endDay]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error("Offline day must be YYYY-MM-DD");
    }
  }

  const { metadata, rows: rawRows } = await fetchSourceAllPages("offline-packages", {
    start_day: startDay,
    end_day: endDay,
  });

  const rows: OfflinePackageRow[] = [];
  let invalid = 0;
  for (const raw of rawRows) {
    const packageCode = text(pick(raw, "package_code", "packageCode"));
    const offlineDate = dateOnly(pick(raw, "offline_date", "offlineDate"));
    if (!packageCode || !offlineDate) {
      invalid += 1;
      continue;
    }
    rows.push({ packageCode, offlineDate });
  }

  return {
    syncId: text(pick(metadata, "sync_id", "syncId")),
    rangeComplete: boolean(pick(metadata, "range_complete", "rangeComplete"), true),
    stale: boolean(pick(metadata, "stale"), false),
    rows,
    invalid,
  };
}
