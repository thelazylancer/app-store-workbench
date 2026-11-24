import { vi } from "vitest";
import type {
  ShelfGroupBy,
  ShelfGroupCount,
  ShelfPackageRow,
  ShelfPackagesResponse,
  ShelfTeamWeekStats,
  ShelfTrendResponse,
} from "../../shared/shelfTypes";

export const WEEKS = [
  { weekStart: "2026-11-09", weekEnd: "2026-11-15" },
  { weekStart: "2026-11-16", weekEnd: "2026-11-22" },
];

const WEEK_TEAMS: ShelfGroupCount[][] = [
  [{ key: "团队 A", count: 3 }],
  [{ key: "团队 B", count: 2 }],
];

function groupsFor(groupBy: ShelfGroupBy, week: number): ShelfGroupCount[] {
  if (groupBy === "ios_version") {
    return week === 0
      ? [{ key: "16", count: 1 }, { key: "17", count: 1 }, { key: "unknown", count: 1 }]
      : [{ key: "15", count: 1 }, { key: "unknown", count: 1 }];
  }
  if (groupBy === "iap") {
    return week === 0
      ? [{ key: "yes", count: 1 }, { key: "no", count: 1 }, { key: "unknown", count: 1 }]
      : [{ key: "no", count: 1 }, { key: "unknown", count: 1 }];
  }
  if (groupBy === "privacy") {
    return week === 0
      ? [{ key: "generator", count: 1 }, { key: "cloudflare", count: 1 }, { key: "unknown", count: 1 }]
      : [{ key: "own", count: 1 }, { key: "unknown", count: 1 }];
  }
  return week === 0
    ? [{ key: "Games", count: 2 }, { key: "unknown", count: 1 }]
    : [{ key: "Utilities", count: 1 }, { key: "unknown", count: 1 }];
}

function sumGroups(weeks: number[], groupBy: ShelfGroupBy): ShelfGroupCount[] {
  const map = new Map<string, number>();
  for (const week of weeks) {
    for (const group of groupsFor(groupBy, week)) {
      map.set(group.key, (map.get(group.key) ?? 0) + group.count);
    }
  }
  return [...map].map(([key, count]) => ({ key, count }));
}

function teamWeekStatsFor(team: string | null, weekIndexes: number[]): ShelfTeamWeekStats[] {
  const rows: ShelfTeamWeekStats[] = [
    {
      weekStart: WEEKS[0]!.weekStart,
      team: "团队 A",
      packageCount: 3,
      avgVersionCount: 2.5,
      avgVersionGapDays: 7,
      avgLatestVersionToAdDays: 3.5,
      avgAdToOfflineDays: null,
    },
    {
      weekStart: WEEKS[1]!.weekStart,
      team: "团队 B",
      packageCount: 2,
      avgVersionCount: 3,
      avgVersionGapDays: null,
      avgLatestVersionToAdDays: 12,
      avgAdToOfflineDays: 4,
    },
  ];
  return rows.filter((row) =>
    weekIndexes.includes(WEEKS.findIndex((week) => week.weekStart === row.weekStart))
    && (team === null || row.team === team));
}

export function trendFor(team: string | null, groupBy: ShelfGroupBy): ShelfTrendResponse {
  const knownTeam = team === null || team === "团队 A" || team === "团队 B";
  const weekIndexes = !knownTeam ? [] : team === "团队 A" ? [0] : team === "团队 B" ? [1] : [0, 1];
  const weeks = weekIndexes.map((index) => ({
    ...WEEKS[index]!,
    packageCount: groupsFor(groupBy, index).reduce((sum, group) => sum + group.count, 0),
    groups: groupsFor(groupBy, index),
    teams: WEEK_TEAMS[index]!.filter((entry) => team === null || entry.key === team),
    distributions: {
      category: groupsFor("category", index),
      ios_version: groupsFor("ios_version", index),
      iap: groupsFor("iap", index),
      privacy: groupsFor("privacy", index),
    },
  }));
  return {
    from: "2026-08-22",
    to: "2026-11-20",
    team,
    groupBy,
    teams: ["团队 A", "团队 B"],
    weeks,
    totals: {
      packageCount: weeks.reduce((sum, week) => sum + week.packageCount, 0),
      groups: sumGroups(weekIndexes, groupBy),
    },
    distributions: {
      category: sumGroups(weekIndexes, "category"),
      ios_version: sumGroups(weekIndexes, "ios_version"),
      iap: sumGroups(weekIndexes, "iap"),
      privacy: sumGroups(weekIndexes, "privacy"),
    },
    teamWeekStats: teamWeekStatsFor(team, weekIndexes),
  };
}

const ROWS: ShelfPackageRow[] = [
  {
    packageCode: "com.alpha.ios",
    name: "Alpha App",
    sourceName: "iOS-AlphaIOS",
    team: "团队 A",
    targetDate: "2026-11-10",
    weekStart: "2026-11-09",
    category: "Games",
    minimumOsVersion: "16.0",
    appVersion: "2.3.1",
    iap: "yes",
    privacyHost: "generator",
    listingDate: "2026-10-01",
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.beta.ios",
    name: "Beta App",
    sourceName: "iOS-BetaIOS",
    team: "团队 A",
    targetDate: "2026-11-11",
    weekStart: "2026-11-09",
    category: "Games",
    minimumOsVersion: "17.0",
    appVersion: "1.0.0",
    iap: "no",
    privacyHost: "cloudflare",
    listingDate: null,
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.unresolved.ios",
    name: null,
    sourceName: "iOS-UnresolvedIOS",
    team: "团队 A",
    targetDate: "2026-11-12",
    weekStart: "2026-11-09",
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    iap: "unknown",
    privacyHost: "unknown",
    listingDate: null,
    offlineDate: null,
    resolved: false,
  },
  {
    packageCode: "com.gamma.ios",
    name: "Gamma App",
    sourceName: "iOS-GammaIOS",
    team: "团队 B",
    targetDate: "2026-11-17",
    weekStart: "2026-11-16",
    category: "Utilities",
    minimumOsVersion: "15.0",
    appVersion: "3.0.0",
    iap: "no",
    privacyHost: "own",
    listingDate: "2026-11-01",
    offlineDate: null,
    resolved: true,
  },
  {
    packageCode: "com.delta.ios",
    name: null,
    sourceName: "iOS-DeltaIOS",
    team: "团队 B",
    targetDate: "2026-11-18",
    weekStart: "2026-11-16",
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    iap: "unknown",
    privacyHost: "unknown",
    listingDate: null,
    offlineDate: null,
    resolved: false,
  },
];

export function packagesFor(team: string | null, from: string, to: string, totalOverride?: number): ShelfPackagesResponse {
  const rows = ROWS.filter((row) =>
    (team === null || row.team === team) && row.targetDate >= from && row.targetDate <= to);
  return { from, to, team, total: totalOverride ?? rows.length, limit: 500, rows };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function mockShelf(options: { totalOverride?: number; failFirst?: number } = {}) {
  let remainingFailures = options.failFirst ?? 0;
  return vi.fn(async (input: string | URL | Request) => {
    if (remainingFailures > 0) {
      remainingFailures -= 1;
      return json({ message: "Shelf data is unavailable" }, 503);
    }
    const url = new URL(String(input), "http://localhost");
    const team = url.searchParams.get("team");
    if (url.pathname.endsWith("/api/public/shelf/trend")) {
      const groupBy = (url.searchParams.get("group_by") ?? "category") as ShelfGroupBy;
      return json(trendFor(team, groupBy));
    }
    if (url.pathname.endsWith("/api/public/shelf/packages")) {
      return json(packagesFor(
        team,
        url.searchParams.get("from") ?? "",
        url.searchParams.get("to") ?? "",
        options.totalOverride,
      ));
    }
    return json({ message: "not found" }, 404);
  });
}
