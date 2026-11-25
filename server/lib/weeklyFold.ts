import { privacyHostKind } from "../../shared/privacyHost";
import { attributionKey } from "../../shared/attribution";
import { SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";
import { increment } from "./weeklyBuckets";
import { iosBucket } from "./shelfQueries";

export type WeekMainRow = {
  week_start: string; team: string; lookup_status: string; category: string | null;
  minimum_os_version: string | null; iap_has: boolean; policy_url: string | null;
  attribution: string | null; n: number;
};

type WeekTotals = { ingested: number; resolved: number };

type TeamStats = {
  ingested: number; resolved: number; categories: Map<string, number>; ios: Map<string, number>;
  iap: Map<string, number>; privacy: Map<string, number>; attribution: Map<string, number>;
};

function emptyTeamStats(): TeamStats {
  return {
    ingested: 0, resolved: 0, categories: new Map(), ios: new Map(), iap: new Map(),
    privacy: new Map(), attribution: new Map(),
  };
}

/** Folds WEEK_MAIN_SQL rows: counts cover every ingested package; mix stats stay resolved-only. */
export function foldWeekRows(rows: WeekMainRow[], selectedWeek: string) {
  const weekTotals = new Map<string, WeekTotals>();
  const teamIngested = new Map<string, Map<string, number>>();
  const categoryCounts = new Map<string, Map<string, number>>();
  const iapCounts = new Map<string, Map<string, number>>();
  const privacyCounts = new Map<string, Map<string, number>>();
  const currentTeams = new Map<string, TeamStats>();
  const distributions = {
    category: new Map<string, number>(), ios: new Map<string, number>(),
    iap: new Map<string, number>(), privacy: new Map<string, number>(),
    attribution: new Map<string, number>(),
  };

  for (const row of rows) {
    const totals = weekTotals.get(row.week_start) ?? { ingested: 0, resolved: 0 };
    totals.ingested += row.n;
    weekTotals.set(row.week_start, totals);

    const ingestedMap = teamIngested.get(row.week_start) ?? new Map<string, number>();
    increment(ingestedMap, row.team, row.n);
    teamIngested.set(row.week_start, ingestedMap);

    if (row.week_start === selectedWeek) {
      const stats = currentTeams.get(row.team) ?? emptyTeamStats();
      stats.ingested += row.n;
      currentTeams.set(row.team, stats);
    }

    if (row.lookup_status !== "hit") continue;

    totals.resolved += row.n;
    const category = row.category?.trim() || SHELF_UNKNOWN_KEY;
    const categoryMap = categoryCounts.get(row.week_start) ?? new Map<string, number>();
    increment(categoryMap, category, row.n);
    categoryCounts.set(row.week_start, categoryMap);

    const iap = row.iap_has ? "yes" : "no";
    const iapMap = iapCounts.get(row.week_start) ?? new Map<string, number>();
    increment(iapMap, iap, row.n);
    iapCounts.set(row.week_start, iapMap);

    const privacy = privacyHostKind(row.policy_url);
    const privacyMap = privacyCounts.get(row.week_start) ?? new Map<string, number>();
    increment(privacyMap, privacy, row.n);
    privacyCounts.set(row.week_start, privacyMap);

    const attribution = attributionKey(row.attribution);

    if (row.week_start !== selectedWeek) continue;
    const stats = currentTeams.get(row.team)!;
    stats.resolved += row.n;
    increment(stats.categories, category, row.n);
    const ios = iosBucket(row.minimum_os_version);
    increment(stats.ios, ios, row.n);
    increment(stats.iap, iap, row.n);
    increment(stats.privacy, privacy, row.n);
    increment(stats.attribution, attribution, row.n);

    increment(distributions.category, category, row.n);
    increment(distributions.ios, ios, row.n);
    increment(distributions.iap, iap, row.n);
    increment(distributions.privacy, privacy, row.n);
    increment(distributions.attribution, attribution, row.n);
  }

  return { weekTotals, teamIngested, categoryCounts, iapCounts, privacyCounts, currentTeams, distributions };
}
