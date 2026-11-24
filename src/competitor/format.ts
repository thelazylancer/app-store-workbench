import type { DateKind, GroupBy } from "../../shared/competitorTypes";
import type { StatusFilter } from "../lib/reportDate";

export { addDays, daySpan, isDateString, todayUtc, yesterdayUtc } from "../lib/reportDate";
export type { StatusFilter } from "../lib/reportDate";

/** Home list presentation: dense rows or the store-screenshot strip. */
export type ViewMode = "list" | "shots";

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
