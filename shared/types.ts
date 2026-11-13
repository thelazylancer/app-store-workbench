export const STORE_COUNTRIES = ["us", "cn", "hk", "tw", "jp", "sg", "gb", "au"] as const;
export type StoreCountry = (typeof STORE_COUNTRIES)[number];

export type AppSearchQuery = {
  name: string;
  bundleId?: string;
};

export type SearchAppsRequest = (
  | { queries: AppSearchQuery[]; names?: never }
  | { names: string[]; queries?: never }
) & {
  country?: StoreCountry;
};

export type LookupCandidate = {
  name: string;
  developer: string;
  appleId?: number;
  bundleId?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  price?: number;
  formattedPrice?: string;
  currency?: string;
  fileSizeBytes?: number;
  minimumOsVersion?: string;
  appStoreUrl: string;
  iconUrl: string;
  description: string;
  screenshotUrls: string[];
  category?: string | null;
  versionHistory?: AppVersionHistoryItem[];
};

export type IapItem = {
  name: string;
  price: string;
};

export type AppVersionHistoryItem = {
  version: string;
  releasedAt: string | null;
  notes: string;
};

export type MatchedApp = LookupCandidate & {
  category: string | null;
  iapItems: IapItem[];
  versionHistory: AppVersionHistoryItem[];
};

export type AlternateApp = Pick<
  LookupCandidate,
  | "name"
  | "developer"
  | "appleId"
  | "bundleId"
  | "averageUserRating"
  | "userRatingCount"
  | "price"
  | "formattedPrice"
  | "currency"
  | "fileSizeBytes"
  | "minimumOsVersion"
  | "appStoreUrl"
  | "iconUrl"
  | "category"
  | "screenshotUrls"
>;

export type IapHintState = "found" | "not_found" | "unavailable";

export type IapHints = {
  "4.99": IapHintState;
  "9.99": IapHintState;
  source: "best_effort" | "rendered_page";
};

export type SearchResult =
  | {
      query: string;
      requestedBundleId?: string;
      status: "matched";
      app: MatchedApp;
      candidates: LookupCandidate[];
      alternates: AlternateApp[];
      iapHints: IapHints | null;
      message: null;
    }
  | {
      query: string;
      requestedBundleId?: string;
      status: "uncertain_match";
      app: MatchedApp;
      candidates: LookupCandidate[];
      alternates: AlternateApp[];
      iapHints: IapHints | null;
      message: string;
    }
  | {
      query: string;
      requestedBundleId?: string;
      status: "no_match" | "search_failed";
      app: null;
      candidates: LookupCandidate[];
      alternates: AlternateApp[];
      iapHints: null;
      message: string;
    };

export type AppDetailsResponse = {
  country: StoreCountry;
  app: MatchedApp;
  iapHints: IapHints;
};

export type SearchAppsResponse = {
  country: StoreCountry;
  results: SearchResult[];
};

export type IpaDownloadStatus = "queued" | "running" | "awaiting_auth_code" | "done" | "failed";

export type IpaDownloadErrorCode =
  | "terms_required"
  | "purchase_auth_required"
  | "auth_code_invalid"
  | "not_authenticated"
  | "storefront_unavailable"
  | "timeout"
  | "unknown";

export type IpaDownloadActiveJob = {
  bundleId: string;
  status: IpaDownloadStatus;
  progress: number | null;
};

export type IpaDownloadJob = {
  id: string;
  bundleId: string;
  status: IpaDownloadStatus;
  progress: number | null;
  bytesDownloaded: number | null;
  queuePosition: number | null;
  activeJob: IpaDownloadActiveJob | null;
  fileName: string | null;
  sizeBytes: number | null;
  errorCode: IpaDownloadErrorCode | null;
  error: string | null;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
