import { addDays } from "../lib/reportDate";
import { formatMetric } from "../lib/metricScale";

export type BatchStatus = "ok" | "partial" | "failed" | null;

/** API fractions (0..1) render as one-decimal percentages. */
export function formatPercent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function formatSignedPercent(share: number | null): string {
  if (share === null) return "";
  const value = share * 100;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Card / highlight change: `+4（+40.0%）`, `-5（-27.8%）`, `0`, or `新增 8`. */
export function formatChange(change: number, changePct: number | null): string {
  if (change === 0) return "0";
  if (changePct === null) return change > 0 ? `新增 ${change}` : String(change);
  return `${formatSigned(change)}（${formatSignedPercent(changePct)}）`;
}

/** `deltaPp` is already in percentage points; do not multiply again. */
export function formatPp(deltaPp: number): string {
  return `${deltaPp > 0 ? "+" : ""}${deltaPp.toFixed(1)}pp`;
}

/** Days keep one decimal below 100 and drop a trailing `.0`, matching shelf charts. */
export function formatDay(value: number): string {
  return formatMetric(value);
}

export function batchStatusLabel(status: BatchStatus): string {
  if (status === "ok") return "正常";
  if (status === "partial") return "部分";
  if (status === "failed") return "失败";
  return "—";
}

export function weekRange(weekStart: string): string {
  return `${weekStart} ~ ${addDays(weekStart, 6)}`;
}

/** `11-22`, used inside the summary sentence only. */
export function shortDate(date: string): string {
  return date.slice(5);
}

/** Fixed short version labels for the card fingerprint and structure row. */
export function versionLabel(key: string): string {
  if (key === "0") return "无记录";
  if (key === "4+") return "4+";
  return `${key}个`;
}

/** Version bucket → the shared weekly palette class. */
export function versionClassName(key: string): string {
  if (key === "0") return "wx-weekly-v0";
  if (key === "4+") return "wx-weekly-v4";
  return `wx-weekly-v${key}`;
}
