import type { SearchAppsResponse } from "../../shared/types";

export async function searchApps(names: string[]): Promise<SearchAppsResponse> {
  const response = await fetch("/api/search-apps", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ names }),
  });

  if (!response.ok) {
    throw new Error("Search request failed");
  }

  return (await response.json()) as SearchAppsResponse;
}
