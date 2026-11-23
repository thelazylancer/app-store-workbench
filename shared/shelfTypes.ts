/**
 * Shared contract for the public shelf trend namespace (`/api/public/shelf/*`).
 * Referenced by server/lib/shelfQueries.ts, server/routes/shelf.ts and src/lib/shelfApi.ts.
 * Types only — no implementation here. See docs/tickets/shelf-trend/DESIGN.md §3.
 */

/** Distribution dimensions for the trend chart. */
export type ShelfGroupBy = "category" | "ios_version" | "iap";

/** In-app purchase tri-state: hit+non-empty = yes, hit+empty = no, unresolved = unknown. */
export type ShelfIap = "yes" | "no" | "unknown";

/** Bucket key for missing/unresolved values, shared by all three dimensions. */
export const SHELF_UNKNOWN_KEY = "unknown";

/** iOS minimum-version buckets (major only; Apple jumped 18 → 26). */
export type ShelfIosBucket =
  | "lte14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "26plus"
  | typeof SHELF_UNKNOWN_KEY;

/** Fixed render order for iOS buckets; `unknown` always last. */
export const SHELF_IOS_BUCKET_ORDER: readonly ShelfIosBucket[] = [
  "lte14",
  "15",
  "16",
  "17",
  "18",
  "26plus",
  SHELF_UNKNOWN_KEY,
];

/** One `{ key, count }` cell of a weekly or totals distribution. */
export type ShelfGroupCount = {
  key: string; // raw category, iOS bucket key, or ShelfIap; missing → "unknown"
  count: number;
};

/** A Monday-start week with at least one package; weekEnd = weekStart + 6. */
export type ShelfTrendWeek = {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  /** All packages in the week, unresolved included. */
  packageCount: number;
  groups: ShelfGroupCount[]; // count desc, then key asc
  /** Per-team counts for the week; raw team names, same ordering rule. */
  teams: ShelfGroupCount[];
  /** This week's counts for every dimension, for the per-row weekly trends. */
  distributions: ShelfDistributions;
};

export type ShelfTrendTotals = {
  packageCount: number;
  groups: ShelfGroupCount[]; // whole range, same ordering rule
};

/** Whole-range distribution for every dimension, so each can be shown at once. */
export type ShelfDistributions = Record<ShelfGroupBy, ShelfGroupCount[]>;

/** Version and launch timings for one team's packages in the requested range. */
export type ShelfTeamStats = {
  team: string;
  packageCount: number;
  /** Packages with at least one App Store version record. */
  versionedPackages: number;
  /** Distinct versions across the team's packages. */
  versionCount: number;
  /** Mean versions per versioned package. */
  avgVersionCount: number | null;
  /** Mean days between consecutive releases within a package; needs 2+ release dates. */
  avgVersionGapDays: number | null;
  /** Mean days from the latest release to first_ad_date; negative = release after the ad. */
  avgLatestVersionToAdDays: number | null;
  /** Packages that already have an offline date. */
  offlinePackages: number;
  /** Mean days from first_ad_date to offline_date over offline packages. */
  avgAdToOfflineDays: number | null;
};

/** Response of GET /api/public/shelf/trend. */
export type ShelfTrendResponse = {
  from: string; // YYYY-MM-DD, echoed
  to: string; // YYYY-MM-DD, echoed
  team: string | null; // null when the filter is absent/empty
  groupBy: ShelfGroupBy;
  /** Distinct teams in [from, to], ignoring the team filter, ascending. */
  teams: string[];
  /** Only weeks with data, ascending by weekStart; the current partial week included. */
  weeks: ShelfTrendWeek[];
  totals: ShelfTrendTotals;
  distributions: ShelfDistributions;
  /** Per-team version/launch timings; honors the team filter, ascending by team. */
  teamStats: ShelfTeamStats[];
};

/**
 * One detail row. Unresolved rows carry only packageCode/team/dates:
 * name, category and minimumOsVersion are null, iap is "unknown", resolved is false.
 * No displayName / firstAdDate / lookup status / batch / raw appStoreJson ever leaves the server.
 */
export type ShelfPackageRow = {
  packageCode: string; // reliable Bundle ID
  name: string | null; // App Store name (appStoreJson.name → trackName); null when unresolved
  team: string;
  targetDate: string; // YYYY-MM-DD shelf date
  weekStart: string; // YYYY-MM-DD Monday of the shelf week
  category: string | null;
  minimumOsVersion: string | null;
  appVersion: string | null;
  iap: ShelfIap;
  /** App Store / source shelf dates; never the ad date. */
  listingDate: string | null;
  offlineDate: string | null;
  resolved: boolean;
};

/** Response of GET /api/public/shelf/packages. */
export type ShelfPackagesResponse = {
  from: string;
  to: string;
  team: string | null;
  /** Matching rows before the limit applies. */
  total: number;
  limit: number;
  rows: ShelfPackageRow[]; // targetDate asc, then packageCode asc
};
