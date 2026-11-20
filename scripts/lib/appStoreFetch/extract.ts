import { collectMediaByType, flattenMediaByPrefix } from "./media";

export function extractAppDetails(lookupResult: any, detailBody: any): Record<string, any> | null {
  if (!lookupResult && !detailBody) {
    return null;
  }

  const results = detailBody?.storePlatformData?.["product-dv"]?.results;
  const detailApp: any =
    results && typeof results === "object" ? Object.values(results)[0] ?? null : null;
  const pageData = detailBody?.pageData ?? null;
  const softwareInfo = detailApp?.softwareInfo ?? {};
  const offers = Array.isArray(detailApp?.offers) ? detailApp.offers : [];
  const firstOffer = offers[0] ?? null;
  const addOns = Array.isArray(pageData?.addOns) ? pageData.addOns : [];
  const versionEntries = Array.isArray(pageData?.versionHistory) ? pageData.versionHistory : [];
  const screenshotsByType = collectMediaByType(detailApp?.screenshotsByType);
  const previewVideosByType = collectMediaByType(detailApp?.videoPreviewByType);
  const iphoneScreenshotsFromDetail = flattenMediaByPrefix(screenshotsByType, "iphone");
  const ipadScreenshots = flattenMediaByPrefix(screenshotsByType, "ipad");
  const lookupScreenshotUrls = Array.isArray(lookupResult?.screenshotUrls)
    ? lookupResult.screenshotUrls
    : [];
  const iphoneScreenshots =
    iphoneScreenshotsFromDetail.length > 0 ? iphoneScreenshotsFromDetail : lookupScreenshotUrls;  const otherScreenshots = [...new Set(
    Object.entries(screenshotsByType)
      .filter(([type]) => !type.toLowerCase().startsWith("iphone") && !type.toLowerCase().startsWith("ipad"))
      .flatMap(([, items]) => items.map((item) => item.url)),
  )];
  const previewVideos = [...new Set(
    Object.values(previewVideosByType).flatMap((items) => items.map((item) => item.url)),
  )];
  const languages =
    typeof softwareInfo.languagesDisplayString === "string"
      ? softwareInfo.languagesDisplayString.split(/,\s*/).filter(Boolean)
      : Array.isArray(lookupResult?.languageCodesISO2A)
        ? lookupResult.languageCodesISO2A
        : [];

  return {
    trackId: lookupResult?.trackId ?? null,
    bundleId: lookupResult?.bundleId ?? detailApp?.bundleId ?? null,
    name: detailApp?.name ?? lookupResult?.trackName ?? null,
    subtitle: detailApp?.subtitle ?? null,
    description: detailApp?.description?.standard ?? lookupResult?.description ?? "",
    url: detailApp?.url ?? lookupResult?.trackViewUrl ?? null,
    shortUrl: detailApp?.shortUrl ?? null,
    trackViewUrl: lookupResult?.trackViewUrl ?? null,
    iconUrl: lookupResult?.artworkUrl512 ?? lookupResult?.artworkUrl100 ?? null,
    developer: detailApp?.artistName ?? lookupResult?.sellerName ?? null,
    seller: softwareInfo.seller ?? lookupResult?.sellerName ?? null,
    developerId: detailApp?.artistId ?? lookupResult?.artistId ?? null,
    developerUrl: detailApp?.artistUrl ?? lookupResult?.artistViewUrl ?? null,
    supportUrl: softwareInfo.supportUrl ?? null,
    websiteUrl: softwareInfo.websiteUrl ?? null,
    eulaUrl: softwareInfo.eulaUrl ?? null,
    privacyPolicyUrl: softwareInfo.privacyPolicyUrl ?? null,
    privacyPolicyTextUrl: softwareInfo.privacyPolicyTextUrl ?? null,
    primaryGenre: lookupResult?.primaryGenreName ?? detailApp?.genreNames?.[0] ?? null,
    genres: Array.isArray(lookupResult?.genres)
      ? lookupResult.genres
      : Array.isArray(detailApp?.genreNames)
        ? detailApp.genreNames
        : [],
    contentRating:
      detailApp?.contentRatingsBySystem?.appsApple?.name ??
      lookupResult?.contentAdvisoryRating ??
      null,
    rating: lookupResult?.averageUserRating ?? detailApp?.userRating?.value ?? null,
    ratingCount: lookupResult?.userRatingCount ?? detailApp?.userRating?.ratingCount ?? null,
    price: lookupResult?.price ?? firstOffer?.price ?? null,
    formattedPrice: lookupResult?.formattedPrice ?? firstOffer?.priceFormatted ?? null,
    currency: lookupResult?.currency ?? null,
    hasInAppPurchases: detailApp?.hasInAppPurchases === true || addOns.length > 0,
    iapItems: addOns.map((item: any) => ({ name: item?.name ?? null, price: item?.price ?? null })),
    languages,
    fileSizeBytes:
      Number(lookupResult?.fileSizeBytes) ||
      firstOffer?.assets?.[0]?.size ||
      null,
    contentAdvisoryRating: lookupResult?.contentAdvisoryRating ?? null,
    advisories: lookupResult?.advisories ?? [],
    minimumOsVersion: lookupResult?.minimumOsVersion ?? detailApp?.minimumOSVersion ?? null,
    requirementsString:
      softwareInfo.requirementsString ??
      (lookupResult?.minimumOsVersion
        ? `Requires iOS ${lookupResult.minimumOsVersion} or later.`
        : null),
    releaseDate: lookupResult?.releaseDate ?? detailApp?.releaseDate ?? null,
    currentVersion: lookupResult?.version ?? firstOffer?.version?.display ?? null,
    currentVersionReleaseDate: lookupResult?.currentVersionReleaseDate ?? null,
    releaseNotes: lookupResult?.releaseNotes ?? versionEntries[0]?.releaseNotes ?? null,
    versionHistory: versionEntries.map((entry: any) => ({
      version: entry?.versionString ?? null,
      releasedAt: entry?.releaseDate ?? null,
      notes: entry?.releaseNotes ?? "",
    })),
    screenshotsByType,
    iphoneScreenshots,
    ipadScreenshots,
    otherScreenshots,
    lookupScreenshotUrls,
    previewVideosByType,
    previewVideos,
    deviceFamilies: detailApp?.deviceFamilies ?? [],
    requiredCapabilities: detailApp?.requiredCapabilities ?? null,
    supportedDevices: lookupResult?.supportedDevices ?? [],
    isGameCenterEnabled: lookupResult?.isGameCenterEnabled ?? null,
    copyright: detailApp?.copyright ?? null,
  };
}
