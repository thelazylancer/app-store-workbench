import type { DateKind, GroupBy } from "../../shared/competitorTypes";

export type StatusFilter = "all" | "hit" | "miss";

export const DATE_KIND_LABEL: Record<DateKind, string> = {
  first_ad: "投放日期",
  listing: "上架日期",
};

export const DATE_KIND_SHORT: Record<DateKind, string> = {
  first_ad: "投放日",
  listing: "上架日",
};

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  team: "团队",
  category: "类目",
  ios_version: "iOS 版本",
};

export function todayUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

/** Default report date: yesterday in UTC, matching the backend sync target. */
export function yesterdayUtc(now = new Date()): string {
  return addDays(todayUtc(now), -1);
}

export function addDays(date: string, delta: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

export function isDateString(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10).slice(5);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const date = new Date(timestamp);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatGroupName(groupKey: string, groupBy: GroupBy): string {
  if (groupKey === "未知" || groupKey === "unknown" || groupKey === "") {
    if (groupBy === "category") return "未分类";
    if (groupBy === "ios_version") return "未知 iOS 版本";
    return "未知团队";
  }
  return groupKey;
}

export function statusFilterLabel(status: StatusFilter): string {
  return status === "hit" ? "命中" : status === "miss" ? "未命中" : "全部";
}
