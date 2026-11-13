import type { AppDetailsResponse, AppSearchQuery, SearchAppsResponse, StoreCountry } from "../../shared/types";

export async function searchApps(queries: AppSearchQuery[], country: StoreCountry = "us"): Promise<SearchAppsResponse> {
  const response = await fetch("/api/search-apps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ queries, country }),
  });

  if (!response.ok) {
    throw new Error("Search request failed");
  }

  return (await response.json()) as SearchAppsResponse;
}

export async function getAppDetails(appleId: number, country: StoreCountry): Promise<AppDetailsResponse> {
  const response = await fetch(`/api/app-details/${appleId}?country=${country}`);
  if (!response.ok) throw new Error("App detail request failed");
  return (await response.json()) as AppDetailsResponse;
}
