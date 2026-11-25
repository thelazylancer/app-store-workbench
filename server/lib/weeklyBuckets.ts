import { SHELF_UNKNOWN_KEY } from "../../shared/shelfTypes";
import type { WeeklyBucket } from "../../shared/weeklyReportTypes";

/** Share helpers shared by every weekly distribution (0..1, 0 when the denominator is 0). */
export function share(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

export function increment(map: Map<string, number>, key: string, n: number): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

const VERSION_BUCKETS = [
  { key: "1", label: "1 个版本" },
  { key: "2", label: "2 个版本" },
  { key: "3", label: "3 个版本" },
  { key: "4+", label: "4+ 个版本" },
  { key: "0", label: "无记录" },
] as const;

export const CATEGORY_LABEL = (key: string) => key === SHELF_UNKNOWN_KEY ? "未知" : key;
const IOS_LABELS: Record<string, string> = { lte14: "≤14", "26plus": "26+", [SHELF_UNKNOWN_KEY]: "未知" };
const IAP_LABELS: Record<string, string> = { yes: "有", no: "无" };
export const iosLabel = (key: string) => IOS_LABELS[key] ?? key;
const iapLabel = (key: string) => IAP_LABELS[key] ?? key;

function compareCounts(tieOrder?: readonly string[]) {
  return (left: [string, number], right: [string, number]): number => {
    if (right[1] !== left[1]) return right[1] - left[1];
    const byOrder = tieOrder ? tieOrder.indexOf(left[0]) - tieOrder.indexOf(right[0]) : 0;
    return byOrder || left[0].localeCompare(right[0], "zh");
  };
}

function knownCounts(counts: Map<string, number>, tieOrder?: readonly string[]): [string, number][] {
  return [...counts]
    .filter(([key, count]) => key !== SHELF_UNKNOWN_KEY && count > 0)
    .sort(compareCounts(tieOrder));
}

/** Present buckets only, count desc; `unknown` always last. */
export function distributionBuckets(
  counts: Map<string, number>, total: number, labelOf: (key: string) => string, tieOrder?: readonly string[],
): WeeklyBucket[] {
  const buckets = knownCounts(counts, tieOrder).map(([key, count]) => ({
    key, label: labelOf(key), count, share: share(count, total),
  }));
  const unknownCount = counts.get(SHELF_UNKNOWN_KEY) ?? 0;
  if (unknownCount > 0) {
    buckets.push({
      key: SHELF_UNKNOWN_KEY, label: labelOf(SHELF_UNKNOWN_KEY),
      count: unknownCount, share: share(unknownCount, total),
    });
  }
  return buckets;
}

export function topBuckets(
  counts: Map<string, number>, total: number, limit: number,
  labelOf: (key: string) => string, tieOrder?: readonly string[],
): WeeklyBucket[] {
  return knownCounts(counts, tieOrder)
    .slice(0, limit)
    .map(([key, count]) => ({ key, label: labelOf(key), count, share: share(count, total) }));
}

export function versionBuckets(counts: Map<string, number>, total: number): WeeklyBucket[] {
  return VERSION_BUCKETS.map(({ key, label }) => {
    const count = counts.get(key) ?? 0;
    return { key, label, count, share: share(count, total) };
  });
}

export function iapBuckets(counts: Map<string, number>, total: number): WeeklyBucket[] {
  const yes = counts.get("yes") ?? 0;
  const no = counts.get("no") ?? 0;
  const entries: [string, number][] = yes >= no ? [["yes", yes], ["no", no]] : [["no", no], ["yes", yes]];
  return entries.map(([key, count]) => ({ key, label: iapLabel(key), count, share: share(count, total) }));
}
