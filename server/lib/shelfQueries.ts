import type { Pool } from "pg";
import type { LookupStatus } from "../../shared/competitorTypes";
import type {
  ShelfGroupBy,
  ShelfGroupCount,
  ShelfIap,
  ShelfIosBucket,
  ShelfPackageRow,
  ShelfPackagesResponse,
  ShelfTeamWeekStats,
  ShelfTrendResponse,
  ShelfTrendTotals,
  ShelfTrendWeek,
} from "../../shared/shelfTypes";
import { SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";

export type ShelfTrendParams = {
  from: string;
  to: string;
  team: string | null;
  groupBy: ShelfGroupBy;
};

export type ShelfPackagesParams = {
  from: string;
  to: string;
  team: string | null;
  limit: number;
};

export type ShelfQueryRepo = {
  getShelfTrend(params: ShelfTrendParams): Promise<ShelfTrendResponse>;
  getShelfPackages(params: ShelfPackagesParams): Promise<ShelfPackagesResponse>;
};

type TrendAggregateRow = {
  week_start: string;
  team: string;
  lookup_status: LookupStatus;
  category: string | null;
  minimum_os_version: string | null;
  iap_has: boolean;
  n: number;
};

type TeamWeekStatsRow = {
  week_start: string;
  team: string;
  package_count: number;
  avg_version_count: number;
  avg_gap_days: number | null;
  avg_latest_to_ad_days: number | null;
  avg_ad_to_offline_days: number | null;
};

type PackageDetailRow = {
  package_code: string;
  target_date: string;
  week_start: string;
  team: string;
  name: string | null;
  category: string | null;
  minimum_os_version: string | null;
  app_version: string | null;
  iap: ShelfIap;
  listing_date: string | null;
  offline_date: string | null;
  resolved: boolean;
};

const TREND_SQL = `
  SELECT to_char(date_trunc('week', target_date)::date, 'YYYY-MM-DD') AS week_start,
         team,
         lookup_status,
         category,
         minimum_os_version,
         CASE
           WHEN lookup_status = 'hit'
            AND jsonb_typeof(app_store_json->'iapItems') = 'array'
           THEN jsonb_array_length(app_store_json->'iapItems') > 0
           ELSE false
         END AS iap_has,
         count(*)::int AS n
    FROM competitor_packages
   WHERE target_date BETWEEN $1::date AND $2::date
     AND ($3::text IS NULL OR team = $3)
   GROUP BY 1, team, lookup_status, category, minimum_os_version, iap_has
   ORDER BY 1`;

const TEAMS_SQL = `
  SELECT DISTINCT team
    FROM competitor_packages
   WHERE target_date BETWEEN $1::date AND $2::date
   ORDER BY team`;

// Version timings per team-week. A package's mean interval is (last - first) / (n - 1),
// which avoids window functions; float casts keep pg from returning numeric strings.
const TEAM_WEEK_STATS_SQL = `
  WITH pkg_versions AS (
    SELECT package_code,
           count(DISTINCT version) AS version_count,
           count(DISTINCT released_at::date) AS release_dates,
           min(released_at::date) AS first_release,
           max(released_at::date) AS last_release
      FROM competitor_versions
     GROUP BY package_code
  ),
  pkg_stats AS (
    SELECT date_trunc('week', p.target_date)::date AS week_start,
           p.team,
           COALESCE(pv.version_count, 0) AS version_count,
           CASE
             WHEN pv.release_dates > 1
             THEN (pv.last_release - pv.first_release)::float8 / (pv.release_dates - 1)
           END AS gap_days,
           CASE
             WHEN pv.last_release IS NOT NULL
             THEN (p.first_ad_date - pv.last_release)::int
           END AS latest_to_ad_days,
           CASE
             WHEN p.offline_date IS NOT NULL
             THEN (p.offline_date - p.first_ad_date)::int
           END AS ad_to_offline_days
      FROM competitor_packages p
      LEFT JOIN pkg_versions pv ON pv.package_code = p.package_code
     WHERE p.target_date BETWEEN $1::date AND $2::date
       AND ($3::text IS NULL OR p.team = $3)
  )
  SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start,
         team,
         count(*)::int AS package_count,
         avg(version_count)::float8 AS avg_version_count,
         avg(gap_days)::float8 AS avg_gap_days,
         avg(latest_to_ad_days)::float8 AS avg_latest_to_ad_days,
         avg(ad_to_offline_days)::float8 AS avg_ad_to_offline_days
    FROM pkg_stats
   GROUP BY 1, 2
   ORDER BY 1, 2`;

const COUNT_SQL = `
  SELECT count(*)::int AS total
    FROM competitor_packages
   WHERE target_date BETWEEN $1::date AND $2::date
     AND ($3::text IS NULL OR team = $3)`;

// Unresolved rows must not expose their raw category/OS/name; the JSON array
// guard also keeps jsonb_array_length from erroring on a non-array iapItems.
const PACKAGES_SQL = `
  SELECT package_code,
         to_char(target_date, 'YYYY-MM-DD') AS target_date,
         to_char(date_trunc('week', target_date)::date, 'YYYY-MM-DD') AS week_start,
         team,
         CASE
           WHEN lookup_status = 'hit'
           THEN COALESCE(NULLIF(app_store_json->>'name', ''), NULLIF(app_store_json->>'trackName', ''))
           ELSE NULL
         END AS name,
         CASE WHEN lookup_status = 'hit' THEN category ELSE NULL END AS category,
         CASE WHEN lookup_status = 'hit' THEN minimum_os_version ELSE NULL END AS minimum_os_version,
         CASE WHEN lookup_status = 'hit' THEN app_version ELSE NULL END AS app_version,
         CASE
           WHEN lookup_status <> 'hit' THEN 'unknown'
           WHEN jsonb_typeof(app_store_json->'iapItems') = 'array'
           THEN CASE WHEN jsonb_array_length(app_store_json->'iapItems') > 0 THEN 'yes' ELSE 'no' END
           ELSE 'no'
         END AS iap,
         to_char(listing_date, 'YYYY-MM-DD') AS listing_date,
         to_char(offline_date, 'YYYY-MM-DD') AS offline_date,
         lookup_status = 'hit' AS resolved
    FROM competitor_packages
   WHERE target_date BETWEEN $1::date AND $2::date
     AND ($3::text IS NULL OR team = $3)
   ORDER BY target_date, package_code
   LIMIT $4`;

/** Maps a minimum OS string to its major-version bucket. Unparseable → unknown. */
export function iosBucket(value: string | null): ShelfIosBucket {
  const match = /^\s*(\d+)/.exec(value ?? "");
  if (!match) return SHELF_UNKNOWN_KEY;
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major)) return SHELF_UNKNOWN_KEY;
  if (major <= 14) return "lte14";
  if (major >= 19) return "26plus"; // Apple jumped 18 → 26; 19–25 fold in to avoid fragments.
  return String(major) as ShelfIosBucket;
}

function groupKey(row: TrendAggregateRow, groupBy: ShelfGroupBy): string {
  if (groupBy === "category") {
    if (row.lookup_status !== "hit") return SHELF_UNKNOWN_KEY;
    return row.category?.trim() ? row.category : SHELF_UNKNOWN_KEY;
  }
  if (groupBy === "ios_version") {
    return row.lookup_status === "hit" ? iosBucket(row.minimum_os_version) : SHELF_UNKNOWN_KEY;
  }
  if (row.lookup_status !== "hit") return SHELF_UNKNOWN_KEY;
  return row.iap_has ? "yes" : "no";
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function sortedGroups(groups: Map<string, number>): ShelfGroupCount[] {
  return [...groups]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function emptyDimensions(): Record<ShelfGroupBy, Map<string, number>> {
  return { category: new Map(), ios_version: new Map(), iap: new Map() };
}

function foldTrend(rows: TrendAggregateRow[], groupBy: ShelfGroupBy): {
  weeks: ShelfTrendWeek[];
  totals: ShelfTrendTotals;
  distributions: Record<ShelfGroupBy, ShelfGroupCount[]>;
} {
  type WeekFold = {
    packageCount: number;
    groups: Map<string, number>;
    teams: Map<string, number>;
    dimensions: Record<ShelfGroupBy, Map<string, number>>;
  };
  const weeks = new Map<string, WeekFold>();
  const totalGroups = new Map<string, number>();
  const dimensionTotals = emptyDimensions();
  const DIMENSIONS: ShelfGroupBy[] = ["category", "ios_version", "iap"];
  let totalCount = 0;

  for (const row of rows) {
    const key = groupKey(row, groupBy);
    let week = weeks.get(row.week_start);
    if (!week) {
      week = { packageCount: 0, groups: new Map(), teams: new Map(), dimensions: emptyDimensions() };
      weeks.set(row.week_start, week);
    }
    week.packageCount += row.n;
    week.groups.set(key, (week.groups.get(key) ?? 0) + row.n);
    week.teams.set(row.team, (week.teams.get(row.team) ?? 0) + row.n);
    for (const dimension of DIMENSIONS) {
      const dimensionKey = groupKey(row, dimension);
      const totals = dimensionTotals[dimension];
      totals.set(dimensionKey, (totals.get(dimensionKey) ?? 0) + row.n);
      const weekTotals = week.dimensions[dimension];
      weekTotals.set(dimensionKey, (weekTotals.get(dimensionKey) ?? 0) + row.n);
    }
    totalCount += row.n;
    totalGroups.set(key, (totalGroups.get(key) ?? 0) + row.n);
  }

  return {
    weeks: [...weeks]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([weekStart, week]) => ({
        weekStart,
        weekEnd: addDays(weekStart, 6),
        packageCount: week.packageCount,
        groups: sortedGroups(week.groups),
        teams: sortedGroups(week.teams),
        distributions: {
          category: sortedGroups(week.dimensions.category),
          ios_version: sortedGroups(week.dimensions.ios_version),
          iap: sortedGroups(week.dimensions.iap),
        },
      })),
    totals: { packageCount: totalCount, groups: sortedGroups(totalGroups) },
    distributions: {
      category: sortedGroups(dimensionTotals.category),
      ios_version: sortedGroups(dimensionTotals.ios_version),
      iap: sortedGroups(dimensionTotals.iap),
    },
  };
}

export function createShelfQueries(pool: Pool): ShelfQueryRepo {
  return {
    async getShelfTrend({ from, to, team, groupBy }) {
      const [teamResult, trendResult, statsResult] = await Promise.all([
        pool.query<{ team: string }>(TEAMS_SQL, [from, to]),
        pool.query<TrendAggregateRow>(TREND_SQL, [from, to, team]),
        pool.query<TeamWeekStatsRow>(TEAM_WEEK_STATS_SQL, [from, to, team]),
      ]);
      const folded = foldTrend(trendResult.rows, groupBy);
      const teamWeekStats: ShelfTeamWeekStats[] = statsResult.rows.map((row) => ({
        weekStart: row.week_start,
        team: row.team,
        packageCount: row.package_count,
        avgVersionCount: row.avg_version_count,
        avgVersionGapDays: row.avg_gap_days,
        avgLatestVersionToAdDays: row.avg_latest_to_ad_days,
        avgAdToOfflineDays: row.avg_ad_to_offline_days,
      }));

      return {
        from,
        to,
        team,
        groupBy,
        teams: teamResult.rows.map((row) => row.team),
        teamWeekStats,
        ...folded,
      };
    },

    async getShelfPackages({ from, to, team, limit }) {
      const [countResult, rowResult] = await Promise.all([
        pool.query<{ total: number }>(COUNT_SQL, [from, to, team]),
        pool.query<PackageDetailRow>(PACKAGES_SQL, [from, to, team, limit]),
      ]);

      const rows: ShelfPackageRow[] = rowResult.rows.map((row) => ({
        packageCode: row.package_code,
        name: row.name,
        team: row.team,
        targetDate: row.target_date,
        weekStart: row.week_start,
        category: row.category,
        minimumOsVersion: row.minimum_os_version,
        appVersion: row.app_version,
        iap: row.iap,
        listingDate: row.listing_date,
        offlineDate: row.offline_date,
        resolved: row.resolved,
      }));

      return {
        from,
        to,
        team,
        total: countResult.rows[0]?.total ?? 0,
        limit,
        rows,
      };
    },
  };
}
