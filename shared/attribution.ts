/**
 * Attribution vendor helpers shared by the shelf trend and weekly report.
 * Values are free-form lowercase strings set via POST /api/competitor/attribution;
 * NULL / empty means the package has not been analyzed yet.
 */

import { SHELF_UNKNOWN_KEY } from "./shelfTypes";

const ATTRIBUTION_LABELS: Record<string, string> = {
  none: "无归因",
  adjust: "Adjust",
  appsflyer: "AppsFlyer",
  branch: "Branch",
  kochava: "Kochava",
  singular: "Singular",
  tenjin: "Tenjin",
  appmetrica: "AppMetrica",
};

/** Bucket key for a stored value; blank → the shared unknown key. */
export function attributionKey(value: string | null | undefined): string {
  const key = value?.trim().toLowerCase() ?? "";
  return key || SHELF_UNKNOWN_KEY;
}

/** Known vendors get their brand spelling; unanalyzed packages are 未知, anything else shows as stored. */
export function attributionLabel(key: string): string {
  if (key === SHELF_UNKNOWN_KEY) return "未知";
  return ATTRIBUTION_LABELS[key] ?? key;
}
