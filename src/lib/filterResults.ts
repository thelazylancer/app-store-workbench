import type { SearchResult } from "../../shared/types";

export type ResultStatusFilter = "all" | SearchResult["status"] | "unresolved";

export type ResultFilters = {
  status: ResultStatusFilter;
  screenshotsOnly: boolean;
  iapMatchedOnly: boolean;
};

function hasScreenshots(result: SearchResult) {
  return Boolean(result.app && result.app.screenshotUrls.length > 0);
}

function hasMatchedIapHint(result: SearchResult) {
  return Boolean(
    result.iapHints &&
      (result.iapHints["4.99"] === "found" || result.iapHints["9.99"] === "found"),
  );
}

export function filterResults(results: SearchResult[], filters: ResultFilters) {
  return results.filter((result) => {
    if (filters.status !== "all") {
      if (filters.status === "unresolved") {
        if (result.status !== "no_match" && result.status !== "search_failed") {
          return false;
        }
      } else if (result.status !== filters.status) {
        return false;
      }
    }

    if (filters.screenshotsOnly && !hasScreenshots(result)) {
      return false;
    }

    if (filters.iapMatchedOnly && !hasMatchedIapHint(result)) {
      return false;
    }

    return true;
  });
}
