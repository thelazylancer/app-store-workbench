import type {
  AlternateApp,
  LookupCandidate,
  MatchedApp,
  SearchResult,
} from "../../shared/types";

function toMatchedApp(candidate: LookupCandidate): MatchedApp {
  return {
    name: candidate.name,
    developer: candidate.developer,
    ...(candidate.appleId === undefined ? {} : { appleId: candidate.appleId }),
    ...(candidate.bundleId === undefined ? {} : { bundleId: candidate.bundleId }),
    ...(candidate.averageUserRating === undefined ? {} : { averageUserRating: candidate.averageUserRating }),
    ...(candidate.userRatingCount === undefined ? {} : { userRatingCount: candidate.userRatingCount }),
    ...(candidate.price === undefined ? {} : { price: candidate.price }),
    ...(candidate.formattedPrice === undefined ? {} : { formattedPrice: candidate.formattedPrice }),
    ...(candidate.currency === undefined ? {} : { currency: candidate.currency }),
    ...(candidate.fileSizeBytes === undefined ? {} : { fileSizeBytes: candidate.fileSizeBytes }),
    ...(candidate.minimumOsVersion === undefined ? {} : { minimumOsVersion: candidate.minimumOsVersion }),
    appStoreUrl: candidate.appStoreUrl,
    iconUrl: candidate.iconUrl,
    description: candidate.description,
    screenshotUrls: candidate.screenshotUrls,
    category: candidate.category ?? null,
    versionHistory: candidate.versionHistory ?? [],
    iapItems: [],
  };
}

function toAlternateApp(candidate: LookupCandidate): AlternateApp {
  return {
    name: candidate.name,
    developer: candidate.developer,
    ...(candidate.appleId === undefined ? {} : { appleId: candidate.appleId }),
    ...(candidate.bundleId === undefined ? {} : { bundleId: candidate.bundleId }),
    ...(candidate.averageUserRating === undefined ? {} : { averageUserRating: candidate.averageUserRating }),
    ...(candidate.userRatingCount === undefined ? {} : { userRatingCount: candidate.userRatingCount }),
    ...(candidate.price === undefined ? {} : { price: candidate.price }),
    ...(candidate.formattedPrice === undefined ? {} : { formattedPrice: candidate.formattedPrice }),
    ...(candidate.currency === undefined ? {} : { currency: candidate.currency }),
    ...(candidate.fileSizeBytes === undefined ? {} : { fileSizeBytes: candidate.fileSizeBytes }),
    ...(candidate.minimumOsVersion === undefined ? {} : { minimumOsVersion: candidate.minimumOsVersion }),
    appStoreUrl: candidate.appStoreUrl,
    iconUrl: candidate.iconUrl,
    category: candidate.category ?? null,
    screenshotUrls: candidate.screenshotUrls,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function classifyCandidates(
  query: string,
  candidates: LookupCandidate[],
): SearchResult {
  const normalizedQuery = query.trim().toLowerCase();
  const wholeWord = new RegExp(`(^|\\s)${escapeRegExp(normalizedQuery)}(\\s|$)`);
  const normalized = candidates.map((candidate) => ({
    ...candidate,
    normalizedName: candidate.name.toLowerCase(),
  }));

  const exact = normalized.filter(
    (candidate) => candidate.normalizedName === normalizedQuery,
  );

  if (exact.length === 1) {
    return {
      query,
      candidates,
      status: "matched",
      app: toMatchedApp(exact[0]),
      alternates: [],
      iapHints: null,
      message: null,
    };
  }

  const plausible = normalized.filter(
    (candidate) =>
      normalizedQuery.length >= 4 &&
      (candidate.normalizedName.startsWith(normalizedQuery) ||
        wholeWord.test(candidate.normalizedName) ||
        (normalizedQuery.length >= 5 &&
          candidate.normalizedName.includes(normalizedQuery))),
  );

  if (plausible.length === 1) {
    return {
      query,
      candidates,
      status: "matched",
      app: toMatchedApp(plausible[0]),
      alternates: [],
      iapHints: null,
      message: null,
    };
  }

  if (plausible.length > 1) {
    return {
      query,
      candidates,
      status: "uncertain_match",
      app: toMatchedApp(plausible[0]),
      alternates: plausible.slice(1, 3).map(toAlternateApp),
      iapHints: null,
      message: "Possible match found; review alternates",
    };
  }

  return {
    query,
    candidates,
    status: "no_match",
    app: null,
    alternates: [],
    iapHints: null,
    message: "No App Store match found in US store",
  };
}
