import type { SearchResult, StoreCountry } from "../../shared/types";

export const COUNTRY_OPTIONS: { value: StoreCountry; label: string }[] = [
  { value: "us", label: "美国 · US" },
  { value: "cn", label: "中国大陆 · CN" },
  { value: "hk", label: "中国香港 · HK" },
  { value: "tw", label: "中国台湾 · TW" },
  { value: "jp", label: "日本 · JP" },
  { value: "sg", label: "新加坡 · SG" },
  { value: "gb", label: "英国 · GB" },
  { value: "au", label: "澳大利亚 · AU" },
];

const NO_BUNDLE_MATCH_MESSAGE = "No App Store candidate matched the supplied Bundle ID";

export function translateMessage(message: string | null | undefined) {
  if (!message) {
    return null;
  }

  switch (message) {
    case "Search failed":
      return "搜索失败";
    case "No App Store match found in US store":
      return "未在美国区 App Store 找到结果";
    case "Possible match found; review alternates":
      return "可能匹配，请检查备选结果";
    case NO_BUNDLE_MATCH_MESSAGE:
      return "未找到与指定 Bundle ID 匹配的候选应用";
    default: {
      const store = message.match(/^No App Store match found in ([A-Z]{2}) store$/);
      return store ? `未在 ${store[1]} 区 App Store 找到结果` : message;
    }
  }
}

export function candidateCount(result: SearchResult) {
  if (result.candidates) {
    return result.candidates.length;
  }

  return (result.app ? 1 : 0) + result.alternates.length;
}

export function statusLabel(result: SearchResult) {
  switch (result.status) {
    case "matched":
      return "已匹配";
    case "uncertain_match":
      return "待确认";
    case "no_match":
      return candidateCount(result) > 0 ? "未自动匹配" : "未找到";
    case "search_failed":
      return "失败";
  }
}

export type StatusCounts = {
  all: number;
  matched: number;
  uncertain_match: number;
  unresolved: number;
};

export function getStatusCounts(items: SearchResult[]): StatusCounts {
  return {
    all: items.length,
    matched: items.filter((item) => item.status === "matched").length,
    uncertain_match: items.filter((item) => item.status === "uncertain_match").length,
    unresolved: items.filter(
      (item) => item.status === "no_match" || item.status === "search_failed",
    ).length,
  };
}

export function summarize(items: SearchResult[]) {
  const matched = items.filter((item) => item.status === "matched").length;
  const uncertain = items.filter((item) => item.status === "uncertain_match").length;
  const failed = items.filter(
    (item) => item.status === "no_match" || item.status === "search_failed",
  ).length;
  const withScreenshots = items.filter(
    (item) => item.app && item.app.screenshotUrls.length > 0,
  ).length;

  return (
    `共 ${items.length} 项 · ` +
    `已匹配 ${matched} · ` +
    `待确认 ${uncertain} · ` +
    `有截图 ${withScreenshots} · ` +
    `未解决 ${failed}`
  );
}

export function defaultSelectedIndex(items: SearchResult[]) {
  let index = items.findIndex((result) => result.status === "matched");
  if (index === -1) index = items.findIndex((result) => result.status === "uncertain_match");
  if (index === -1) index = items.findIndex((result) => result.app !== null);
  return index === -1 ? 0 : index;
}

export function formatIapItemCount(count: number) {
  return count > 0 ? `${count} 个内购` : "未提取到内购价格";
}

export function formatReleaseDate(value: string | null) {
  if (!value) {
    return "日期未知";
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return value.split("T")[0] ?? "日期未知";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}
