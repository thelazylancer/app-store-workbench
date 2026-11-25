/**
 * Shared contract for the weekly competitor report (`/api/competitor/weekly-report`).
 * Referenced by server/lib/weeklyReport.ts, server/routes/competitor.ts and src/lib/weeklyApi.ts.
 * Types only — no implementation here. See docs/tickets/weekly-report/REQUIREMENTS.md §5.2.
 */

import type { PrivacyHostKind } from "./privacyHost";
import type { ShelfIosBucket } from "./shelfTypes";

/** `key` is an iOS bucket. */
export type WeeklyIosBucket = ShelfIosBucket;
/** `key` is a privacy hosting bucket. */
export type WeeklyPrivacyBucket = PrivacyHostKind;

/**
 * One distribution cell. `share` is a 0..1 fraction (the view multiplies by 100).
 * Version buckets use keys "1" | "2" | "3" | "4+" | "0" in that fixed order.
 */
export type WeeklyBucket = {
  key: string;
  label: string;
  count: number;
  share: number;
};

export type WeeklyTeam = {
  team: string;
  rank: number;
  resolvedPackages: number;
  previousResolvedPackages: number;
  change: number;
  /** null when last week had zero resolved packages (display "新增"). */
  changePct: number | null;
  /** Share of this week's resolved packages, 0..1. */
  share: number;
  /** Fixed order: 1 / 2 / 3 / 4+ / 0 (no version records). */
  versionCounts: WeeklyBucket[];
  /** Top 3 known categories, count desc then category name; "unknown" never chosen. */
  topCategories: WeeklyBucket[];
  iap: { yes: number; no: number; yesShare: number };
  /** Highest-count known iOS bucket; null when every package is unknown. */
  topIos: WeeklyBucket | null;
  /** Top 3 known privacy hosts, count desc; "unknown" never chosen. */
  topPrivacies: WeeklyBucket[];
};

export type WeeklyTrendWeek = {
  weekStart: string;
  weekEnd: string;
  resolvedPackages: number;
  ingestedPackages: number;
  /** resolvedPackages > 0; false weeks render as "data insufficient". */
  dataSufficient: boolean;
};

export type WeeklyMetricPoint = {
  weekStart: string;
  team: string;
  value: number;
  /** Resolved packages for the team-week (the m in "已下架 n/m"). */
  packageCount: number;
  /** Packages with offline_date set; 0 is valid for avgAdToOfflineDays (value 0). */
  offlineCount: number;
};

export type WeeklyMetricKey = "avgVersionGapDays" | "avgLatestVersionToAdDays" | "avgAdToOfflineDays";

/** All-team aggregate for a metric-week, weighted by each package's own sample. */
export type WeeklyMetricOverallPoint = {
  weekStart: string;
  value: number;
  packageCount: number;
  offlineCount: number;
};

export type WeeklyMetricSeries = {
  key: WeeklyMetricKey;
  title: string;
  /** weekStart asc, then team asc. Missing data produces no point. */
  points: WeeklyMetricPoint[];
  /** weekStart asc; all teams combined. */
  overall: WeeklyMetricOverallPoint[];
};

export type WeeklyHighlight =
  | {
      kind: "team_change";
      team: string;
      direction: "up" | "down";
      change: number;
      changePct: number | null;
      current: number;
      previous: number;
    }
  | {
      kind: "category_change";
      category: string;
      direction: "up" | "down";
      currentShare: number;
      previousShare: number;
      deltaPp: number;
    };

export type WeeklyReportResponse = {
  weekStart: string;
  weekEnd: string;
  /**
   * Monday of the most recent complete ISO week in Asia/Shanghai. Same value for
   * every requested week; the view uses it to disable "next week".
   */
  latestCompleteWeek: string;
  generatedAt: string;
  summary: {
    resolvedPackages: number;
    ingestedPackages: number;
    unresolvedPackages: number;
    teamCount: number;
    previousResolvedPackages: number;
    change: number;
    /** null when last week had zero resolved packages. */
    changePct: number | null;
    /** resolved / ingested, 0..1; 0 when the week has no packages. */
    resolvedRate: number;
    batchStatus: "ok" | "partial" | "failed" | null;
    /** Latest competitor_batches.target_date, or null when no batch exists. */
    dataThrough: string | null;
  };
  /** resolved count desc, then team name asc. */
  teams: WeeklyTeam[];
  /** Fixed order: 1 / 2 / 3 / 4+ / 0. */
  versionCounts: WeeklyBucket[];
  distributions: Record<"category" | "ios" | "iap" | "privacy", WeeklyBucket[]>;
  trends: {
    /** Always four Monday-start weeks ending at the selected week, ascending. */
    weeks: WeeklyTrendWeek[];
    metrics: WeeklyMetricSeries[];
  };
  /** Team change first, then category change. */
  highlights: WeeklyHighlight[];
};
