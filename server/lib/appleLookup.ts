import type { LookupCandidate } from "../../shared/types";

type AppleLookupResponse = {
  results?: Array<{
    trackId?: unknown;
    bundleId?: unknown;
    averageUserRating?: unknown;
    userRatingCount?: unknown;
    price?: unknown;
    formattedPrice?: unknown;
    currency?: unknown;
    fileSizeBytes?: unknown;
    minimumOsVersion?: unknown;
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
      const bundleId = typeof result.bundleId === "string" ? result.bundleId.trim() : "";
      const formattedPrice = typeof result.formattedPrice === "string" ? result.formattedPrice.trim() : "";
      const currency = typeof result.currency === "string" ? result.currency.trim().toUpperCase() : "";
      const fileSizeBytes = typeof result.fileSizeBytes === "string" && /^\d+$/.test(result.fileSizeBytes.trim())
        ? Number(result.fileSizeBytes.trim())
        : result.fileSizeBytes;
      const minimumOsVersion = typeof result.minimumOsVersion === "string" ? result.minimumOsVersion.trim() : "";

      return {
        name,
        developer,
        ...(appleId === undefined ? {} : { appleId }),
        ...(bundleId ? { bundleId } : {}),
        ...(typeof result.averageUserRating === "number" &&
        Number.isFinite(result.averageUserRating) &&
        result.averageUserRating >= 0 && result.averageUserRating <= 5
          ? { averageUserRating: result.averageUserRating }
          : {}),
        ...(typeof result.userRatingCount === "number" &&
        Number.isSafeInteger(result.userRatingCount) && result.userRatingCount >= 0
          ? { userRatingCount: result.userRatingCount }
          : {}),
        ...(typeof result.price === "number" && Number.isFinite(result.price) && result.price >= 0
          ? { price: result.price }
          : {}),
        ...(formattedPrice ? { formattedPrice } : {}),
        ...(/^[A-Z]{3}$/.test(currency) ? { currency } : {}),
        ...(typeof fileSizeBytes === "number" && Number.isSafeInteger(fileSizeBytes) && fileSizeBytes >= 0
          ? { fileSizeBytes }
          : {}),
        ...(minimumOsVersion ? { minimumOsVersion } : {}),
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
