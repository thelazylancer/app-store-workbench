import type {
  IapHintState,
  LookupCandidate,
  MatchedApp,
  SearchResult,
} from "../../../shared/types";

export type ComparisonFact = readonly [label: string, value: string];

export function candidateKey(app: Pick<LookupCandidate, "appleId" | "appStoreUrl">) {
  return typeof app.appleId === "number" && Number.isSafeInteger(app.appleId) && app.appleId > 0
    ? `id:${app.appleId}`
    : `url:${app.appStoreUrl}`;
}

export function hasAppleId(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function getCandidates(result: SearchResult): LookupCandidate[] {
  if (result.candidates) {
    return result.candidates;
  }

  return [
    ...(result.app ? [result.app] : []),
    ...result.alternates.map((app) => ({ ...app, description: "", versionHistory: [] })),
  ];
}

export function toMatchedApp(candidate: LookupCandidate): MatchedApp {
  return {
    ...candidate,
    category: candidate.category ?? null,
    versionHistory: candidate.versionHistory ?? [],
    iapItems: [],
  };
}

export function formatHint(state: IapHintState) {
  return state === "found" ? "命中" : state === "not_found" ? "未命中" : "未获取";
}

export function formatPrice(app: Pick<LookupCandidate, "price" | "formattedPrice" | "currency">) {
  if (app.price === undefined) {
    return "未提供";
  }
  if (app.price === 0) {
    return "免费";
  }
  return `${app.formattedPrice ?? String(app.price)} · ${app.currency ?? "币种未提供"}`;
}

export function formatRating(
  app: Pick<LookupCandidate, "averageUserRating" | "userRatingCount">,
) {
  const rating =
    app.averageUserRating === undefined
      ? "未提供"
      : `${app.averageUserRating.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} / 5`;
  const count =
    app.userRatingCount === undefined ? "" : ` · ${app.userRatingCount.toLocaleString("zh-CN")} 条评分`;
  return `${rating}${count}`;
}

export function formatFileSize(app: Pick<LookupCandidate, "fileSizeBytes">) {
  return app.fileSizeBytes === undefined
    ? "未提供"
    : `${(app.fileSizeBytes / 1_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} MB`;
}

export function formatMinimumOs(app: Pick<LookupCandidate, "minimumOsVersion">) {
  return app.minimumOsVersion?.trim() ? `${app.minimumOsVersion}+` : "未提供";
}

export function getComparisonFacts(app: LookupCandidate): ComparisonFact[] {
  return [
    ["应用价格", formatPrice(app)],
    ["评分", formatRating(app)],
    ["安装包大小", formatFileSize(app)],
    ["最低 iOS", formatMinimumOs(app)],
  ];
}

export function getHighResolutionScreenshotUrl(src: string) {
  try {
    const url = new URL(src);
    const sizeSuffix = /\/\d+x\d+bb(?:-\d+)?(?=\.[^/]+$)/;

    if (!sizeSuffix.test(url.pathname)) {
      return src;
    }

    url.pathname = url.pathname.replace(sizeSuffix, "/1290x2796bb");
    return url.toString();
  } catch {
    return src;
  }
}
