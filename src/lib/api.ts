import type {
  AppDetailsResponse,
  AppSearchQuery,
  IpaDownloadJob,
  SearchAppsResponse,
  StoreCountry,
} from "../../shared/types";

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

export async function startIpaDownload(bundleId: string): Promise<IpaDownloadJob> {
  const response = await fetch("/api/ipa-download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bundleId }),
  });
  if (!response.ok) throw new Error("IPA download request failed");
  return (await response.json()) as IpaDownloadJob;
}

export async function getIpaDownload(id: string): Promise<IpaDownloadJob> {
  const response = await fetch(`/api/ipa-download/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("IPA download status request failed");
  return (await response.json()) as IpaDownloadJob;
}

export async function submitIpaAuthCode(id: string, code: string): Promise<IpaDownloadJob> {
  const response = await fetch(`/api/ipa-download/${encodeURIComponent(id)}/auth-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error("IPA auth code submission failed");
  return (await response.json()) as IpaDownloadJob;
}
