import { attributionKey } from "../../shared/attribution";
import {
  SHELF_UNKNOWN_KEY,
  type ShelfGroupBy,
  type ShelfPackageRow,
} from "../../shared/shelfTypes";
import { OTHER_KEY } from "./buckets";

/** A chart click: one week's packages, optionally narrowed to a team and/or one bucket. */
export type ShelfSelection = {
  weekStart: string;
  weekEnd: string;
  team: string | null; // null = all teams
  groupBy: ShelfGroupBy | null; // null = whole week, no bucket narrowing
  key: string | null;
  /** Known category keys of the current distribution; 其他 matches everything else. */
  topKeys: string[];
  label: string; // segment label for the dialog subtitle
};

/** Same major-version mapping as server/lib/shelfQueries.ts iosBucket. */
export function iosBucketOf(row: Pick<ShelfPackageRow, "resolved" | "minimumOsVersion">): string {
  if (!row.resolved) return SHELF_UNKNOWN_KEY;
  const match = /^\s*(\d+)/.exec(row.minimumOsVersion ?? "");
  if (!match) return SHELF_UNKNOWN_KEY;
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major)) return SHELF_UNKNOWN_KEY;
  if (major <= 14) return "lte14";
  if (major >= 19) return "26plus";
  return String(major);
}

export function matchesSelection(selection: ShelfSelection, row: ShelfPackageRow): boolean {
  const { groupBy, key, topKeys } = selection;
  if (groupBy === null || key === null) return true;
  if (groupBy === "category") {
    const category = row.resolved ? row.category?.trim() ?? "" : "";
    if (key === SHELF_UNKNOWN_KEY) return category === "";
    if (key === OTHER_KEY) return category !== "" && !topKeys.includes(category);
    return category === key;
  }
  if (groupBy === "ios_version") return iosBucketOf(row) === key;
  if (groupBy === "privacy") {
    if (key === OTHER_KEY) {
      return row.privacyHost !== SHELF_UNKNOWN_KEY && !topKeys.includes(row.privacyHost);
    }
    return row.privacyHost === key;
  }
  if (groupBy === "attribution") {
    // Unresolved rows are outside the attribution dimension entirely.
    if (!row.resolved) return false;
    const attribution = attributionKey(row.attribution);
    if (key === OTHER_KEY) {
      return attribution !== SHELF_UNKNOWN_KEY && !topKeys.includes(attribution);
    }
    return attribution === key;
  }
  return row.iap === key;
}
