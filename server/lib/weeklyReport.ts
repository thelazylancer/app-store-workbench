import type { Pool } from "pg";
import { privacyHostKind, privacyHostLabel } from "../../shared/privacyHost";
import { SHELF_IOS_BUCKET_ORDER, SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";
import type {
  WeeklyHighlight, WeeklyMetricKey, WeeklyMetricOverallPoint, WeeklyMetricPoint,
  WeeklyMetricSeries, WeeklyReportResponse, WeeklyTeam, WeeklyTrendWeek,
} from "../../shared/weeklyReportTypes";
import {
  CATEGORY_LABEL, distributionBuckets, iapBuckets, increment, iosLabel, share, topBuckets, versionBuckets,
} from "./weeklyBuckets";
import { iosBucket } from "./shelfQueries";

/**
 * Weekly report seam: resolved-only, first_ad_date based, ISO-week normalized.
 * Kept out of competitorRepo (frozen daily contract) and shelfQueries (public
 * trend namespace, target_date + all packages). See DESIGN.md §1/§4.
 */
export type WeeklyReportRepo = {
  /** Latest week start with a hit package before the current week, or null. */
  latestCompleteDataWeek(today: string): Promise<string | null>;
  /** `weekStart` is normalized to its ISO Monday. */
  getWeeklyReport(weekStart: string): Promise<WeeklyReportResponse>;
};

export type HighlightInput = {
  currentTeams: Map<string, number>;
  previousTeams: Map<string, number>;
  /** Fractions (0..1) keyed by category. */
  currentCategories: Map<string, number>;
  previousCategories: Map<string, number>;
};

type WeekMainRow = {
  week_start: string; team: string; lookup_status: string; category: string | null;
  minimum_os_version: string | null; iap_has: boolean; policy_url: string | null; n: number;
};

type VersionCountRow = { team: string; bucket: string; n: number };

type MetricRow = {
  week_start: string; team: string | null; package_count: number; avg_gap_days: number | null;
  avg_latest_to_ad_days: number | null; avg_ad_to_offline_days: number | null; offline_count: number;
};

type BatchRow = { data_through: string; status: string };

const WEEK_MAIN_SQL = `
  SELECT to_char(date_trunc('week', first_ad_date::date)::date, 'YYYY-MM-DD') AS week_start,
         team, lookup_status, category, minimum_os_version,
         CASE WHEN lookup_status = 'hit'
                AND jsonb_typeof(app_store_json->'iapItems') = 'array'
              THEN jsonb_array_length(app_store_json->'iapItems') > 0
              ELSE false END AS iap_has,
         CASE WHEN lookup_status = 'hit'
              THEN app_store_json->'privacy'->>'policyUrl' END AS policy_url,
         count(*)::int AS n
    FROM competitor_packages
   WHERE first_ad_date BETWEEN $1::date AND $2::date
   GROUP BY 1, team, lookup_status, category, minimum_os_version, iap_has, policy_url
   ORDER BY 1`;

const VERSION_COUNTS_SQL = `
  WITH pkg_versions AS (
    SELECT package_code, count(DISTINCT version)::int AS version_count
      FROM competitor_versions GROUP BY package_code
  )
  SELECT p.team,
         CASE WHEN COALESCE(pv.version_count, 0) = 0 THEN '0'
              WHEN pv.version_count >= 4 THEN '4+'
              ELSE pv.version_count::text END AS bucket,
         count(*)::int AS n
    FROM competitor_packages p
    LEFT JOIN pkg_versions pv ON pv.package_code = p.package_code
   WHERE p.lookup_status = 'hit' AND p.first_ad_date BETWEEN $1::date AND $2::date
   GROUP BY 1, 2 ORDER BY 1, 2`;

// Same timing shape as shelf's TEAM_WEEK_STATS_SQL, keyed by first_ad_date and
// hit-only. Gaps over 30 days are dormant-app outliers and are dropped.
const METRICS_SQL = `
  WITH pkg_versions AS (
    SELECT package_code,
           count(DISTINCT released_at::date) AS release_dates,
           min(released_at::date) AS first_release,
           max(released_at::date) AS last_release
      FROM competitor_versions GROUP BY package_code
  ), pkg_stats AS (
    SELECT date_trunc('week', p.first_ad_date::date)::date AS week_start, p.team,
           CASE WHEN pv.release_dates > 1
                THEN (pv.last_release - pv.first_release)::float8 / (pv.release_dates - 1)
           END AS gap_days,
           CASE WHEN pv.last_release IS NOT NULL
                THEN (p.first_ad_date - pv.last_release)::int END AS latest_to_ad_days,
           CASE WHEN p.offline_date IS NOT NULL
                THEN (p.offline_date - p.first_ad_date)::int END AS ad_to_offline_days
      FROM competitor_packages p
      LEFT JOIN pkg_versions pv ON pv.package_code = p.package_code
     WHERE p.lookup_status = 'hit' AND p.first_ad_date BETWEEN $1::date AND $2::date
  )
  SELECT to_char(week_start, 'YYYY-MM-DD') AS week_start, team,
         count(*)::int AS package_count,
         avg(gap_days) FILTER (WHERE gap_days <= 30)::float8 AS avg_gap_days,
         avg(latest_to_ad_days)::float8 AS avg_latest_to_ad_days,
         avg(ad_to_offline_days)::float8 AS avg_ad_to_offline_days,
         count(ad_to_offline_days)::int AS offline_count
    FROM pkg_stats
   GROUP BY GROUPING SETS ((week_start, team), (week_start))
   ORDER BY 1, 2`;

const BATCH_SQL = `
  SELECT to_char(target_date, 'YYYY-MM-DD') AS data_through, status
    FROM competitor_batches
   ORDER BY target_date DESC, fetched_at DESC
   LIMIT 1`;

const LATEST_WEEK_SQL = `
  SELECT to_char(date_trunc('week', first_ad_date::date)::date, 'YYYY-MM-DD') AS week_start
    FROM competitor_packages
   WHERE lookup_status = 'hit' AND first_ad_date < $1::date
   ORDER BY first_ad_date DESC
   LIMIT 1`;

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Date → Monday of its ISO week. UTC only; never the local timezone. */
export function isoWeekStart(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
}

export function addWeeks(weekStart: string, n: number): string {
  return addDays(weekStart, n * 7);
}

/** Today in Asia/Shanghai, matching the 08:00 cron. */
export function shanghaiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildHighlights(input: HighlightInput): WeeklyHighlight[] {
  const { currentTeams, previousTeams, currentCategories, previousCategories } = input;
  const highlights: WeeklyHighlight[] = [];

  type TeamCandidate = { team: string; current: number; previous: number; change: number };
  let bestTeam: TeamCandidate | null = null;
  for (const team of new Set([...currentTeams.keys(), ...previousTeams.keys()])) {
    const current = currentTeams.get(team) ?? 0;
    const previous = previousTeams.get(team) ?? 0;
    const change = current - previous;
    if (Math.abs(change) < 3) continue;
    if (!bestTeam || Math.abs(change) > Math.abs(bestTeam.change) ||
        (Math.abs(change) === Math.abs(bestTeam.change) && team.localeCompare(bestTeam.team) < 0)) {
      bestTeam = { team, current, previous, change };
    }
  }
  if (bestTeam) {
    highlights.push({
      kind: "team_change", team: bestTeam.team,
      direction: bestTeam.change > 0 ? "up" : "down",
      change: bestTeam.change,
      changePct: bestTeam.previous > 0 ? bestTeam.change / bestTeam.previous : null,
      current: bestTeam.current, previous: bestTeam.previous,
    });
  }

  type CategoryCandidate = { category: string; current: number; previous: number; deltaPp: number };
  let bestCategory: CategoryCandidate | null = null;
  for (const category of new Set([...currentCategories.keys(), ...previousCategories.keys()])) {
    if (category === SHELF_UNKNOWN_KEY) continue;
    const current = currentCategories.get(category) ?? 0;
    const previous = previousCategories.get(category) ?? 0;
    // Threshold on the raw difference; the epsilon absorbs share subtraction
    // noise (0.30 - 0.25 = 4.999…pp) without letting 4.95pp round up into range.
    const rawDeltaPp = (current - previous) * 100;
    const deltaPp = Math.round(rawDeltaPp * 10) / 10;
    if (Math.abs(rawDeltaPp) < 5 - 1e-9) continue;
    if (!bestCategory || Math.abs(deltaPp) > Math.abs(bestCategory.deltaPp) ||
        (Math.abs(deltaPp) === Math.abs(bestCategory.deltaPp) && category.localeCompare(bestCategory.category) < 0)) {
      bestCategory = { category, current, previous, deltaPp };
    }
  }
  if (bestCategory) {
    highlights.push({
      kind: "category_change", category: bestCategory.category,
      direction: bestCategory.deltaPp > 0 ? "up" : "down",
      currentShare: bestCategory.current, previousShare: bestCategory.previous, deltaPp: bestCategory.deltaPp,
    });
  }

  return highlights;
}

type WeekTotals = { ingested: number; resolved: number };

type TeamStats = {
  resolved: number; categories: Map<string, number>; ios: Map<string, number>;
  iap: Map<string, number>; privacy: Map<string, number>;
};

function emptyTeamStats(): TeamStats {
  return { resolved: 0, categories: new Map(), ios: new Map(), iap: new Map(), privacy: new Map() };
}

function foldWeekRows(rows: WeekMainRow[], selectedWeek: string) {
  const weekTotals = new Map<string, WeekTotals>();
  const teamCounts = new Map<string, Map<string, number>>();
  const categoryCounts = new Map<string, Map<string, number>>();
  const currentTeams = new Map<string, TeamStats>();
  const distributions = {
    category: new Map<string, number>(), ios: new Map<string, number>(),
    iap: new Map<string, number>(), privacy: new Map<string, number>(),
  };

  for (const row of rows) {
    const totals = weekTotals.get(row.week_start) ?? { ingested: 0, resolved: 0 };
    totals.ingested += row.n;
    weekTotals.set(row.week_start, totals);
    if (row.lookup_status !== "hit") continue;

    totals.resolved += row.n;
    const teamMap = teamCounts.get(row.week_start) ?? new Map<string, number>();
    increment(teamMap, row.team, row.n);
    teamCounts.set(row.week_start, teamMap);

    const category = row.category?.trim() || SHELF_UNKNOWN_KEY;
    const categoryMap = categoryCounts.get(row.week_start) ?? new Map<string, number>();
    increment(categoryMap, category, row.n);
    categoryCounts.set(row.week_start, categoryMap);

    if (row.week_start !== selectedWeek) continue;
    const stats = currentTeams.get(row.team) ?? emptyTeamStats();
    stats.resolved += row.n;
    increment(stats.categories, category, row.n);
    const ios = iosBucket(row.minimum_os_version);
    increment(stats.ios, ios, row.n);
    const iap = row.iap_has ? "yes" : "no";
    increment(stats.iap, iap, row.n);
    const privacy = privacyHostKind(row.policy_url);
    increment(stats.privacy, privacy, row.n);
    currentTeams.set(row.team, stats);

    increment(distributions.category, category, row.n);
    increment(distributions.ios, ios, row.n);
    increment(distributions.iap, iap, row.n);
    increment(distributions.privacy, privacy, row.n);
  }

  return { weekTotals, teamCounts, categoryCounts, currentTeams, distributions };
}

function sharesByTotal(counts: Map<string, number> | undefined, total: number): Map<string, number> {
  const result = new Map<string, number>();
  if (!counts || total <= 0) return result;
  for (const [key, count] of counts) result.set(key, count / total);
  return result;
}

function sortPoints(points: WeeklyMetricPoint[]): WeeklyMetricPoint[] {
  return points.sort(
    (left, right) => left.weekStart.localeCompare(right.weekStart) || left.team.localeCompare(right.team),
  );
}

export function createWeeklyReport(pool: Pool): WeeklyReportRepo {
  return {
    async latestCompleteDataWeek(today) {
      // Rows from the current (incomplete) week are excluded by the Monday bound.
      const { rows } = await pool.query<{ week_start: string }>(LATEST_WEEK_SQL, [isoWeekStart(today)]);
      return rows[0]?.week_start ?? null;
    },

    async getWeeklyReport(rawWeekStart) {
      const weekStart = isoWeekStart(rawWeekStart);
      const weekEnd = addDays(weekStart, 6);
      const from = addWeeks(weekStart, -3);
      const previousWeek = addWeeks(weekStart, -1);

      const [mainResult, versionResult, metricResult, batchResult] = await Promise.all([
        pool.query<WeekMainRow>(WEEK_MAIN_SQL, [from, weekEnd]),
        pool.query<VersionCountRow>(VERSION_COUNTS_SQL, [weekStart, weekEnd]),
        pool.query<MetricRow>(METRICS_SQL, [from, weekEnd]),
        pool.query<BatchRow>(BATCH_SQL),
      ]);

      const folded = foldWeekRows(mainResult.rows, weekStart);
      const currentTotals = folded.weekTotals.get(weekStart) ?? { ingested: 0, resolved: 0 };
      const previousTotals = folded.weekTotals.get(previousWeek) ?? { ingested: 0, resolved: 0 };
      const previousTeams = folded.teamCounts.get(previousWeek) ?? new Map<string, number>();
      const resolvedPackages = currentTotals.resolved;

      const overallVersionCounts = new Map<string, number>();
      const teamVersionCounts = new Map<string, Map<string, number>>();
      for (const row of versionResult.rows) {
        increment(overallVersionCounts, row.bucket, row.n);
        const teamCounts = teamVersionCounts.get(row.team) ?? new Map<string, number>();
        increment(teamCounts, row.bucket, row.n);
        teamVersionCounts.set(row.team, teamCounts);
      }

      const teams: WeeklyTeam[] = [...folded.currentTeams]
        .sort(([leftTeam, left], [rightTeam, right]) =>
          right.resolved - left.resolved || leftTeam.localeCompare(rightTeam))
        .map(([team, stats], index) => {
          const previousResolvedPackages = previousTeams.get(team) ?? 0;
          const change = stats.resolved - previousResolvedPackages;
          const iapYes = stats.iap.get("yes") ?? 0;
          const iapNo = stats.iap.get("no") ?? 0;
          return {
            team, rank: index + 1, resolvedPackages: stats.resolved, previousResolvedPackages, change,
            changePct: previousResolvedPackages > 0 ? change / previousResolvedPackages : null,
            share: share(stats.resolved, resolvedPackages),
            versionCounts: versionBuckets(teamVersionCounts.get(team) ?? new Map(), stats.resolved),
            topCategories: topBuckets(stats.categories, stats.resolved, 3, CATEGORY_LABEL),
            iap: { yes: iapYes, no: iapNo, yesShare: share(iapYes, stats.resolved) },
            topIos: topBuckets(stats.ios, stats.resolved, 1, iosLabel, SHELF_IOS_BUCKET_ORDER)[0] ?? null,
            topPrivacies: topBuckets(stats.privacy, stats.resolved, 3, privacyHostLabel),
          };
        });

      const trendWeeks: WeeklyTrendWeek[] = [0, 1, 2, 3].map((offset) => {
        const start = addWeeks(from, offset);
        const totals = folded.weekTotals.get(start) ?? { ingested: 0, resolved: 0 };
        return {
          weekStart: start, weekEnd: addDays(start, 6),
          resolvedPackages: totals.resolved, ingestedPackages: totals.ingested,
          dataSufficient: totals.resolved > 0,
        };
      });

      const metricPoints: Record<WeeklyMetricKey, WeeklyMetricPoint[]> = {
        avgVersionGapDays: [], avgLatestVersionToAdDays: [], avgAdToOfflineDays: [],
      };
      const overallPoints: Record<WeeklyMetricKey, WeeklyMetricOverallPoint[]> = {
        avgVersionGapDays: [], avgLatestVersionToAdDays: [], avgAdToOfflineDays: [],
      };
      for (const row of metricResult.rows) {
        if (row.team === null) {
          const overall = {
            weekStart: row.week_start,
            packageCount: row.package_count,
            offlineCount: row.offline_count,
          };
          if (row.avg_gap_days !== null) {
            overallPoints.avgVersionGapDays.push({ ...overall, value: row.avg_gap_days });
          }
          if (row.avg_latest_to_ad_days !== null) {
            overallPoints.avgLatestVersionToAdDays.push({ ...overall, value: row.avg_latest_to_ad_days });
          }
          overallPoints.avgAdToOfflineDays.push({ ...overall, value: row.avg_ad_to_offline_days ?? 0 });
          continue;
        }
        const base = {
          weekStart: row.week_start, team: row.team,
          packageCount: row.package_count, offlineCount: row.offline_count,
        };
        if (row.avg_gap_days !== null) {
          metricPoints.avgVersionGapDays.push({ ...base, value: row.avg_gap_days });
        }
        if (row.avg_latest_to_ad_days !== null) {
          metricPoints.avgLatestVersionToAdDays.push({ ...base, value: row.avg_latest_to_ad_days });
        }
        // Zero offline packages is a real 0-day reading, not missing data.
        metricPoints.avgAdToOfflineDays.push({ ...base, value: row.avg_ad_to_offline_days ?? 0 });
      }
      const metrics: WeeklyMetricSeries[] = [
        {
          key: "avgVersionGapDays", title: "平均版本间隔（天）",
          points: sortPoints(metricPoints.avgVersionGapDays),
          overall: overallPoints.avgVersionGapDays,
        },
        {
          key: "avgLatestVersionToAdDays", title: "最新版本→投放（天）",
          points: sortPoints(metricPoints.avgLatestVersionToAdDays),
          overall: overallPoints.avgLatestVersionToAdDays,
        },
        {
          key: "avgAdToOfflineDays", title: "投放→下架（天）",
          points: sortPoints(metricPoints.avgAdToOfflineDays),
          overall: overallPoints.avgAdToOfflineDays,
        },
      ];

      const batch = batchResult.rows[0];
      const batchStatus = batch?.status === "ok" || batch?.status === "partial" || batch?.status === "failed"
        ? batch.status
        : null;
      const highlights = buildHighlights({
        currentTeams: new Map([...folded.currentTeams].map(([team, stats]) => [team, stats.resolved])),
        previousTeams,
        currentCategories: sharesByTotal(folded.categoryCounts.get(weekStart), resolvedPackages),
        previousCategories: sharesByTotal(folded.categoryCounts.get(previousWeek), previousTotals.resolved),
      });

      const change = resolvedPackages - previousTotals.resolved;
      return {
        weekStart,
        weekEnd,
        latestCompleteWeek: addWeeks(isoWeekStart(shanghaiToday()), -1),
        generatedAt: new Date().toISOString(),
        summary: {
          resolvedPackages,
          ingestedPackages: currentTotals.ingested,
          unresolvedPackages: currentTotals.ingested - resolvedPackages,
          teamCount: folded.currentTeams.size,
          previousResolvedPackages: previousTotals.resolved,
          change,
          changePct: previousTotals.resolved > 0 ? change / previousTotals.resolved : null,
          resolvedRate: share(resolvedPackages, currentTotals.ingested),
          batchStatus,
          dataThrough: batch?.data_through ?? null,
        },
        teams,
        versionCounts: versionBuckets(overallVersionCounts, resolvedPackages),
        distributions: {
          category: distributionBuckets(folded.distributions.category, resolvedPackages, CATEGORY_LABEL),
          ios: distributionBuckets(
            folded.distributions.ios, resolvedPackages, iosLabel, SHELF_IOS_BUCKET_ORDER,
          ),
          iap: iapBuckets(folded.distributions.iap, resolvedPackages),
          privacy: distributionBuckets(folded.distributions.privacy, resolvedPackages, privacyHostLabel),
        },
        trends: { weeks: trendWeeks, metrics },
        highlights,
      };
    },
  };
}
