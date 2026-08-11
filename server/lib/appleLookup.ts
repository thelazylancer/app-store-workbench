import type { LookupCandidate } from "../../shared/types";

type AppleLookupResponse = {
  results?: Array<{
    trackId?: unknown;
    trackName?: string;
    sellerName?: string;
    trackViewUrl?: string;
    artworkUrl512?: string;
    artworkUrl100?: string;
    description?: string;
    screenshotUrls?: string[];
    primaryGenreName?: string;
    version?: string;
    currentVersionReleaseDate?: string;
    releaseNotes?: string;
  }>;
};

type AppleLookupResult = NonNullable<AppleLookupResponse["results"]>[number];

function normalizeAppleId(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function buildVersionHistoryEntry(result: AppleLookupResult) {
  if (!result.version) {
    return [];
  }

  return [
    {
      version: result.version,
      releasedAt: result.currentVersionReleaseDate ?? null,
      notes: result.releaseNotes ?? "",
    },
  ];
}

export async function lookupAppStore(
  query: string,
  country: "us",
): Promise<LookupCandidate[]> {
  const params = new URLSearchParams({
    term: query,
    country,
    entity: "software",
  });

  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Apple search failed with ${response.status}`);
  }

  const body = (await response.json()) as AppleLookupResponse;

  return (body.results ?? [])
    .map((result): LookupCandidate | null => {
      const name = result.trackName;
      const developer = result.sellerName;
      const appStoreUrl = result.trackViewUrl;

      if (!name || !developer || !appStoreUrl) {
        return null;
      }

      const appleId = normalizeAppleId(result.trackId);

      return {
        name,
        developer,
        ...(appleId === undefined ? {} : { appleId }),
        appStoreUrl,
        iconUrl: result.artworkUrl512 ?? result.artworkUrl100 ?? "",
        description: result.description ?? "",
        screenshotUrls: result.screenshotUrls ?? [],
        category: result.primaryGenreName ?? null,
        versionHistory: buildVersionHistoryEntry(result),
      };
    })
    .filter((result): result is LookupCandidate => result !== null);
}
