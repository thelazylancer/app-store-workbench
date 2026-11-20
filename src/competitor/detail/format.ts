import type { AssetStatus, LookupStatus, PackageDetail } from "../../../shared/competitorTypes";
import { storeName } from "../selectors";
import type { IapEntry, MissingStatus } from "./types";

export function jsonString(json: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = json[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function dateOnly(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "—";
}

export function iapEntries(json: Record<string, unknown>): IapEntry[] {
  if (!Array.isArray(json.iapItems)) return [];
  return (json.iapItems as Array<{ name?: unknown; price?: unknown }>)
    .filter((item) => typeof item?.name === "string" && item.name.trim())
    .map((item) => ({
      name: String(item.name).trim(),
      price: typeof item.price === "string" ? item.price.trim() : "",
    }));
}

export function formatSize(bytes: unknown): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "—";
  return `${(bytes / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} MB`;
}

export function assetStatusLabel(status: AssetStatus): string {
  switch (status) {
    case "ok": return "完整";
    case "partial": return "图片部分缺失";
    case "failed": return "图片缺失";
    case "pending": return "待下载";
    case "skipped": return "无需下载";
    default: return "未知";
  }
}

export function detailName(packageDetail: PackageDetail): string {
  return storeName(packageDetail);
}

/** Only a bundle miss hides the App Store sections; pending still renders them. */
export function missingStatus(status: LookupStatus): MissingStatus {
  return status === "bundle_not_found" ? "miss" : null;
}

export function appStoreUrl(packageDetail: PackageDetail): string | null {
  if (packageDetail.lookupStatus === "bundle_not_found") return null;
  const json = packageDetail.appStoreJson;
  return safeExternalUrl(jsonString(json, ["trackViewUrl", "appStoreUrl"]))
    ?? (packageDetail.appleId !== null ? `https://apps.apple.com/app/id${packageDetail.appleId}` : null);
}
