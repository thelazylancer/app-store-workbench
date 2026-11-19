import type { DateKind, GroupBy } from "../../shared/competitorTypes";

export type StatusFilter = "all" | "hit" | "exception";

export const DATE_KIND_LABEL: Record<DateKind, string> = {
  first_ad: "投放日期",
  listing: "上架日期",
};

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  team: "团队",
  category: "类目",
  ios_version: "iOS 版本",
};

const WEEKDAY_LABEL = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

/** Inclusive day span, e.g. 2026-11-01 → 2026-11-01 is 1. */
export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function formatMonthDay(value: string): string {
  return value.slice(5);
}

export function weekdayLabel(value: string): string {
  return WEEKDAY_LABEL[new Date(`${value}T00:00:00Z`).getUTCDay()] ?? "";
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
  if (status === "hit") return "命中";
  if (status === "exception") return "异常";
  return "全部";
}
