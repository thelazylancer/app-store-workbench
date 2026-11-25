import { vi } from "vitest";
import type {
  WeeklyBucket,
  WeeklyHighlight,
  WeeklyMetricSeries,
  WeeklyReportResponse,
  WeeklyTeam,
  WeeklyTrendWeek,
} from "../../shared/weeklyReportTypes";
import { addDays } from "../../src/lib/reportDate";

export const WEEK_START = "2026-11-16";
export const WEEK_END = "2026-11-22";

const bucket = (key: string, label: string, count: number, share: number): WeeklyBucket => ({
  key,
  label,
  count,
  share,
});

function versionBuckets(counts: [number, number, number, number, number], total: number): WeeklyBucket[] {
  const keys = ["1", "2", "3", "4+", "0"];
  const labels = ["1 个版本", "2 个版本", "3 个版本", "4+ 个版本", "无记录"];
  return keys.map((key, index) => bucket(key, labels[index]!, counts[index]!, total > 0 ? counts[index]! / total : 0));
}

const TEAMS: WeeklyTeam[] = [
  {
    team: "Alpha",
    rank: 1,
    resolvedPackages: 30,
    previousResolvedPackages: 28,
    change: 2,
    changePct: 2 / 28,
    share: 30 / 52,
    versionCounts: versionBuckets([5, 20, 4, 1, 0], 30),
    topCategories: [bucket("Utilities", "Utilities", 12, 12 / 30), bucket("Lifestyle", "Lifestyle", 10, 10 / 30), bucket("Productivity", "Productivity", 8, 8 / 30)],
    iap: { yes: 6, no: 24, yesShare: 6 / 30 },
    topIos: bucket("16", "16", 18, 18 / 30),
    topPrivacies: [
      bucket("own", "自有域名", 20, 20 / 30),
      bucket("generator", "模板站", 5, 5 / 30),
      bucket("cloudflare", "Cloudflare", 3, 3 / 30),
    ],
  },
  {
    team: "Beta",
    rank: 2,
    resolvedPackages: 20,
    previousResolvedPackages: 22,
    change: -2,
    changePct: -2 / 22,
    share: 20 / 52,
    versionCounts: versionBuckets([3, 14, 2, 1, 0], 20),
    topCategories: [bucket("Games", "Games", 8, 8 / 20), bucket("Finance", "Finance", 6, 6 / 20), bucket("Photo", "Photo", 6, 6 / 20)],
    iap: { yes: 1, no: 19, yesShare: 1 / 20 },
    topIos: bucket("15", "15", 12, 12 / 20),
    topPrivacies: [
      bucket("generator", "模板站", 12, 12 / 20),
      bucket("google", "Google", 4, 4 / 20),
      bucket("own", "自有域名", 2, 2 / 20),
    ],
  },
  {
    team: "Gamma",
    rank: 3,
    resolvedPackages: 2,
    previousResolvedPackages: 0,
    change: 2,
    changePct: null,
    share: 2 / 52,
    versionCounts: versionBuckets([2, 0, 0, 0, 0], 2),
    topCategories: [bucket("Utilities", "Utilities", 2, 1)],
    iap: { yes: 0, no: 2, yesShare: 0 },
    topIos: null,
    topPrivacies: [],
  },
];

const HIGHLIGHTS: WeeklyHighlight[] = [
  {
    kind: "team_change",
    team: "Alpha",
    direction: "up",
    change: 2,
    changePct: 2 / 28,
    current: 30,
    previous: 28,
  },
  {
    kind: "category_change",
    category: "Productivity",
    direction: "down",
    currentShare: 0.096,
    previousShare: 0.2,
    deltaPp: -10.4,
  },
];

function trendWeeks(weekStart: string): WeeklyTrendWeek[] {
  const starts = [-21, -14, -7, 0].map((offset) => addDays(weekStart, offset));
  const resolved = [0, 18, 50, 52];
  return starts.map((start, index) => ({
    weekStart: start,
    weekEnd: addDays(start, 6),
    resolvedPackages: resolved[index]!,
    ingestedPackages: resolved[index]! + 20,
    dataSufficient: resolved[index]! > 0,
  }));
}

function metricsFor(weekStart: string): WeeklyMetricSeries[] {
  const week = (offset: number) => addDays(weekStart, offset);
  return [
    {
      key: "avgVersionGapDays",
      title: "平均版本间隔（天）",
      points: [
        { weekStart: week(-14), team: "Alpha", value: 5, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), team: "Alpha", value: 7, packageCount: 28, offlineCount: 0 },
        { weekStart, team: "Alpha", value: 8.5, packageCount: 30, offlineCount: 0 },
        { weekStart: week(-7), team: "Beta", value: 5.5, packageCount: 22, offlineCount: 0 },
        { weekStart, team: "Beta", value: 6, packageCount: 20, offlineCount: 0 },
      ],
      overall: [
        { weekStart: week(-14), value: 6.5, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), value: 7, packageCount: 50, offlineCount: 0 },
        { weekStart, value: 8.5, packageCount: 52, offlineCount: 0 },
      ],
    },
    {
      key: "avgLatestVersionToAdDays",
      title: "最新版本→投放（天）",
      points: [
        { weekStart: week(-14), team: "Alpha", value: 5.5, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), team: "Alpha", value: 6.5, packageCount: 28, offlineCount: 0 },
        { weekStart, team: "Alpha", value: 7.2, packageCount: 30, offlineCount: 0 },
      ],
      overall: [
        { weekStart: week(-14), value: 5, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), value: 6.2, packageCount: 50, offlineCount: 0 },
        { weekStart, value: 7.2, packageCount: 52, offlineCount: 0 },
      ],
    },
    {
      key: "avgAdToOfflineDays",
      title: "投放→下架（天）",
      points: [
        { weekStart: week(-14), team: "Alpha", value: 0, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), team: "Alpha", value: 1, packageCount: 28, offlineCount: 1 },
        { weekStart, team: "Alpha", value: 0, packageCount: 30, offlineCount: 0 },
        { weekStart: week(-7), team: "Beta", value: 3, packageCount: 22, offlineCount: 1 },
        { weekStart, team: "Beta", value: 4, packageCount: 20, offlineCount: 2 },
      ],
      overall: [
        { weekStart: week(-14), value: 0, packageCount: 18, offlineCount: 0 },
        { weekStart: week(-7), value: 1, packageCount: 50, offlineCount: 1 },
        { weekStart, value: 2.5, packageCount: 52, offlineCount: 2 },
      ],
    },
  ];
}

export function weeklyReport(overrides: Partial<WeeklyReportResponse> = {}): WeeklyReportResponse {
  const base: WeeklyReportResponse = {
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    latestCompleteWeek: WEEK_START,
    generatedAt: "2026-11-24T01:00:00.000Z",
    summary: {
      resolvedPackages: 52,
      ingestedPackages: 112,
      unresolvedPackages: 60,
      teamCount: 3,
      previousResolvedPackages: 50,
      change: 2,
      changePct: 0.04,
      resolvedRate: 52 / 112,
      batchStatus: "ok",
      dataThrough: "2026-11-23",
    },
    teams: TEAMS,
    versionCounts: versionBuckets([10, 36, 6, 0, 0], 52),
    distributions: {
      category: [
        bucket("Utilities", "Utilities", 14, 14 / 52),
        bucket("Lifestyle", "Lifestyle", 10, 10 / 52),
        bucket("Games", "Games", 8, 8 / 52),
        bucket("Finance", "Finance", 6, 6 / 52),
        bucket("Productivity", "Productivity", 5, 5 / 52),
        bucket("Photo", "Photo", 4, 4 / 52),
        bucket("Music", "Music", 3, 3 / 52),
        bucket("unknown", "未知", 2, 2 / 52),
      ],
      ios: [
        bucket("16", "16", 18, 18 / 52),
        bucket("15", "15", 12, 12 / 52),
        bucket("17", "17", 8, 8 / 52),
        bucket("lte14", "≤14", 6, 6 / 52),
        bucket("18", "18", 4, 4 / 52),
        bucket("26plus", "26+", 2, 2 / 52),
        bucket("unknown", "未知", 2, 2 / 52),
      ],
      iap: [bucket("no", "无", 45, 45 / 52), bucket("yes", "有", 7, 7 / 52)],
      privacy: [
        bucket("own", "自有域名", 24, 24 / 52),
        bucket("generator", "模板站", 9, 9 / 52),
        bucket("cloudflare", "Cloudflare", 6, 6 / 52),
        bucket("google", "Google", 5, 5 / 52),
        bucket("github", "Github", 4, 4 / 52),
        bucket("vercel", "Vercel", 2, 2 / 52),
        bucket("unknown", "未知", 2, 2 / 52),
      ],
    },
    trends: { weeks: trendWeeks(WEEK_START), metrics: metricsFor(WEEK_START) },
    highlights: HIGHLIGHTS,
  };
  return { ...base, ...overrides };
}

export function reportForWeek(weekStart: string, latestCompleteWeek = weekStart): WeeklyReportResponse {
  return weeklyReport({
    weekStart,
    weekEnd: addDays(weekStart, 6),
    latestCompleteWeek,
    trends: { weeks: trendWeeks(weekStart), metrics: metricsFor(weekStart) },
  });
}

export function emptyReportForWeek(weekStart: string, latestCompleteWeek = weekStart): WeeklyReportResponse {
  const base = reportForWeek(weekStart, latestCompleteWeek);
  return {
    ...base,
    summary: {
      ...base.summary,
      resolvedPackages: 0,
      unresolvedPackages: base.summary.ingestedPackages,
      teamCount: 0,
      previousResolvedPackages: 50,
      change: -50,
      changePct: -1,
      resolvedRate: 0,
    },
    teams: [],
    versionCounts: versionBuckets([0, 0, 0, 0, 0], 52),
    distributions: { category: [], ios: [], iap: [], privacy: [] },
    trends: {
      weeks: base.trends.weeks.map((week, index) => (
        index === base.trends.weeks.length - 1
          ? { ...week, resolvedPackages: 0, dataSufficient: false }
          : week
      )),
      metrics: [],
    },
    highlights: [],
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function mockWeekly(options: {
  latest?: string;
  emptyWeek?: string;
  failFirst?: number;
} = {}) {
  let remainingFailures = options.failFirst ?? 0;
  return vi.fn(async (input: string | URL | Request) => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return json({ message: "Competitor data is unavailable" }, 503);
    }
    const url = new URL(String(input), "http://localhost");
    if (!url.pathname.endsWith("/api/competitor/weekly-report")) {
      return json({ message: "not found" }, 404);
    }
    const weekStart = url.searchParams.get("week") ?? WEEK_START;
    const latest = options.latest ?? weekStart;
    return json(
      options.emptyWeek === weekStart
        ? emptyReportForWeek(weekStart, latest)
        : reportForWeek(weekStart, latest),
    );
  });
}
