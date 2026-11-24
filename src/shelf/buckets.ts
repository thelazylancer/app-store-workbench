import {
  SHELF_IOS_BUCKET_ORDER,
  SHELF_UNKNOWN_KEY,
  type ShelfGroupBy,
  type ShelfGroupCount,
} from "../../shared/shelfTypes";

export const OTHER_KEY = "__other__";

export type ShelfSegment = {
  key: string;
  label: string;
  count: number;
};

export function iosBucketLabel(bucket: string): string {
  if (bucket === "lte14") return "≤14";
  if (bucket === "26plus") return "26+";
  if (bucket === SHELF_UNKNOWN_KEY) return "Unknown";
  return bucket;
}

export function iapLabel(value: string): string {
  if (value === "yes") return "有";
  if (value === "no") return "无";
  return "Unknown";
}

/** App Store's own category name, shown as-is; a missing value renders as Unknown. */
export function categoryLabel(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw || raw === SHELF_UNKNOWN_KEY) return "Unknown";
  return raw;
}

// Source display names carry tracking markers, e.g. "iOS-CheezsiiOSjufeng".
const SOURCE_NAME_MARKERS = [/-(?:LC|L|S)$/i, /(?:iOS)?jufeng$/i, /iosL$|iO[Ss]$/i, /^[*\s]+|[*\s]+$/g];

/** Readable app name from a source display name; falls back to the raw value. */
export function sourceAppName(sourceName: string): string {
  let name = sourceName.trim().replace(/^iOS-/, "");
  for (const marker of SOURCE_NAME_MARKERS) name = name.replace(marker, "");
  return name.trim() || sourceName;
}

function countMap(groups: ShelfGroupCount[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) map.set(group.key, (map.get(group.key) ?? 0) + group.count);
  return map;
}

/**
 * Top N known categories by range totals, then Other, then Unknown last.
 * Zero-count segments are omitted; ties sort by key (zh locale) for stability.
 * `labelOf` lets other dimensions (privacy hosting) reuse the same folding.
 */
export function foldTopCategories(
  groups: ShelfGroupCount[],
  topN = 6,
  labelOf: (key: string) => string = categoryLabel,
): ShelfSegment[] {
  const known = [...countMap(groups)]
    .filter(([key, count]) => key !== SHELF_UNKNOWN_KEY && count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh"));
  const top = known.slice(0, topN);
  const otherCount = known.slice(topN).reduce((sum, [, count]) => sum + count, 0);
  const unknownCount = countMap(groups).get(SHELF_UNKNOWN_KEY) ?? 0;

  const segments: ShelfSegment[] = top.map(([key, count]) => ({
    key,
    label: labelOf(key),
    count,
  }));
  if (otherCount > 0) segments.push({ key: OTHER_KEY, label: "Other", count: otherCount });
  if (unknownCount > 0) {
    segments.push({ key: SHELF_UNKNOWN_KEY, label: "Unknown", count: unknownCount });
  }
  return segments;
}

/** Segments in fixed render order; iOS/IAP include zero buckets for a stable table. */
export function segmentGroups(groupBy: ShelfGroupBy, totals: ShelfGroupCount[]): ShelfSegment[] {
  if (groupBy === "category") return foldTopCategories(totals);
  const counts = countMap(totals);

  if (groupBy === "ios_version") {
    return SHELF_IOS_BUCKET_ORDER.map((key) => ({
      key,
      label: iosBucketLabel(key),
      count: counts.get(key) ?? 0,
    }));
  }

  return (["yes", "no", "unknown"] as const).map((key) => ({
    key,
    label: iapLabel(key),
    count: counts.get(key) ?? 0,
  }));
}

/** Fold one week's raw categories into the same segment keys as the range totals. */
export function foldWeekGroups(groups: ShelfGroupCount[], segments: ShelfSegment[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const segment of segments) result[segment.key] = 0;
  const topKeys = new Set(
    segments
      .map((segment) => segment.key)
      .filter((key) => key !== OTHER_KEY && key !== SHELF_UNKNOWN_KEY),
  );

  for (const group of groups) {
    const key = group.key !== SHELF_UNKNOWN_KEY && !topKeys.has(group.key) ? OTHER_KEY : group.key;
    if (key in result) result[key] = (result[key] ?? 0) + group.count;
  }
  return result;
}

/** Category / iOS / IAP display order is fixed; unknown always renders last. */
export function isUnknownKey(key: string): boolean {
  return key === SHELF_UNKNOWN_KEY;
}
