import type {
  DayDetail,
  PackageBrief,
  PackageDetail,
  SummaryCompetitor,
  SummaryGroup,
} from "../../shared/competitorTypes";
import type { QueryFilters } from "../app/useQueryFilters";
import type { StatusFilter } from "./format";

type VersionEntry = { releasedAt?: unknown };

/** Day payloads leave `versions` empty; the history lives on appStoreJson. */
export function versionEntries(pkg: PackageDetail): VersionEntry[] {
  const history = pkg.appStoreJson.versionHistory;
  if (Array.isArray(history) && history.length > 0) return history as VersionEntry[];
  return pkg.versions;
}

export function releaseDates(entries: VersionEntry[]): {
  earliestReleasedAt: string | null;
  latestReleasedAt: string | null;
} {
  const dates = entries
    .map((entry) => (typeof entry.releasedAt === "string" ? entry.releasedAt.slice(0, 10) : ""))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return {
    earliestReleasedAt: dates[0] ?? null,
    latestReleasedAt: dates.at(-1) ?? null,
  };
}

export function briefFrom(pkg: PackageDetail): PackageBrief {
  const iap = pkg.appStoreJson.iapItems;
  const versions = versionEntries(pkg);
  return {
    packageCode: pkg.packageCode,
    displayName: pkg.displayName,
    team: pkg.team,
    appVersion: pkg.appVersion,
    offlineDate: pkg.offlineDate,
    iconLocalPath: pkg.iconLocalPath,
    hasIap: Array.isArray(iap) && iap.length > 0,
    versionCount: versions.length,
    ...releaseDates(versions),
  };
}

/** App Store name: appStoreJson.name → trackName → displayName. */
export function storeName(pkg: PackageDetail): string {
  for (const key of ["name", "trackName"]) {
    const value = pkg.appStoreJson[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return pkg.displayName;
}

export function categoryOf(pkg: PackageDetail): string {
  return pkg.category ?? "未分类";
}

export function inScope(day: DayDetail, filters: QueryFilters): boolean {
  return filters.date === null || day.date === filters.date;
}

export function inCategory(pkg: PackageDetail, filters: QueryFilters): boolean {
  return !filters.category || categoryOf(pkg) === filters.category;
}

export function matches(pkg: PackageDetail, filters: QueryFilters): boolean {
  if (filters.team && pkg.team !== filters.team) return false;
  return inCategory(pkg, filters);
}

export function scopeDays(days: DayDetail[], filters: QueryFilters): DayDetail[] {
  return days.filter((day) => inScope(day, filters)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Latest snapshot of each package in the window. */
export function dedupedPackages(days: DayDetail[]): PackageDetail[] {
  const byCode = new Map<string, PackageDetail>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const pkg of day.packages) byCode.set(pkg.packageCode, pkg);
  }
  return [...byCode.values()];
}

export function groupsFrom(
  days: DayDetail[],
  filters: QueryFilters,
  applyFilters: boolean,
): SummaryGroup[] {
  const packages = dedupedPackages(days).filter((pkg) => !applyFilters || matches(pkg, filters));
  const buckets = new Map<string, PackageDetail[]>();
  for (const pkg of packages) {
    const list = buckets.get(pkg.team) ?? [];
    list.push(pkg);
    buckets.set(pkg.team, list);
  }
  return [...buckets.entries()].map(([team, list]) => {
    const hits = list.filter((pkg) => pkg.lookupStatus === "hit");
    const missed = list.filter((pkg) => pkg.lookupStatus === "bundle_not_found");
    const pending = list.filter((pkg) => pkg.lookupStatus === "pending");
    const byKey = new Map<string, PackageDetail[]>();
    for (const pkg of hits) {
      const key = pkg.appleId !== null ? `apple:${pkg.appleId}` : `pkg:${pkg.packageCode}`;
      const grouped = byKey.get(key) ?? [];
      grouped.push(pkg);
      byKey.set(key, grouped);
    }
    const competitors: SummaryCompetitor[] = [...byKey.values()].map((grouped) => {
      const sorted = [...grouped].sort((a, b) => a.packageCode.localeCompare(b.packageCode));
      const first = sorted[0]!;
      return {
        appleId: first.appleId,
        name: storeName(first),
        packageCount: sorted.length,
        packages: sorted.map(briefFrom),
      };
    });
    return {
      groupKey: team,
      packageCount: list.length,
      hitCount: hits.length,
      missCount: missed.length,
      pendingCount: pending.length,
      competitorCount: competitors.length,
      competitors,
      missedPackages: missed.map(briefFrom),
      pendingPackages: pending.map(briefFrom),
      timeline: [],
    };
  });
}

export function scopedPackages(days: DayDetail[], filters: QueryFilters): PackageDetail[] {
  return dedupedPackages(scopeDays(days, filters)).filter((pkg) => matches(pkg, filters));
}

export function totals(
  days: DayDetail[],
  filters: QueryFilters,
): { total: number; competitors: number; hit: number; exception: number } {
  const packages = scopedPackages(days, filters);
  const hits = packages.filter((pkg) => pkg.lookupStatus === "hit");
  const keys = new Set(
    hits.map((pkg) => (pkg.appleId !== null ? `apple:${pkg.appleId}` : `pkg:${pkg.packageCode}`)),
  );
  return {
    total: packages.length,
    competitors: keys.size,
    hit: hits.length,
    exception: packages.length - hits.length,
  };
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh"));
}

/** Teams are ranked by package count, then by Chinese name. */
export function tabTeams(days: DayDetail[], filters: QueryFilters): string[] {
  const counts = new Map<string, number>();
  for (const pkg of dedupedPackages(scopeDays(days, filters)).filter((pkg) => inCategory(pkg, filters))) {
    counts.set(pkg.team, (counts.get(pkg.team) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .map(([team]) => team);
}

export function visibleOnDay(pkg: PackageDetail, filters: QueryFilters): boolean {
  if (filters.team && pkg.team !== filters.team) return false;
  if (!inCategory(pkg, filters)) return false;
  if (filters.status === "hit") return pkg.lookupStatus === "hit";
  if (filters.status === "exception") return pkg.lookupStatus !== "hit";
  return true;
}

/** How many rows a team block shows under the status filter. */
export function groupShown(group: SummaryGroup, status: StatusFilter): number {
  const hits: SummaryCompetitor[] = status === "exception" ? [] : group.competitors;
  const exceptions: number = status === "hit" ? 0 : group.missedPackages.length + group.pendingPackages.length;
  return hits.reduce((sum, competitor) => sum + competitor.packageCount, 0) + exceptions;
}

export function visibleCount(days: DayDetail[], filters: QueryFilters): number {
  return scopeDays(days, filters).reduce(
    (sum, day) =>
      sum + groupsFrom([day], filters, true).reduce((daySum, group) => daySum + groupShown(group, filters.status), 0),
    0,
  );
}

export function abnormalDays(days: DayDetail[]): DayDetail[] {
  return days.filter((day) => {
    const batch = day.batch;
    return !batch || !batch.rangeComplete || batch.stale || batch.status !== "ok";
  });
}
