export type SearchAppsRequest = {
  names: string[];
};

export type LookupCandidate = {
  name: string;
  developer: string;
  appleId?: number;
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
      status: "matched";
      app: MatchedApp;
      alternates: AlternateApp[];
      iapHints: IapHints | null;
      message: null;
    }
  | {
      query: string;
      status: "uncertain_match";
      app: MatchedApp;
      alternates: AlternateApp[];
      iapHints: IapHints | null;
      message: string;
    }
  | {
      query: string;
      status: "no_match" | "search_failed";
      app: null;
      alternates: AlternateApp[];
      iapHints: null;
      message: string;
    };

export type SearchAppsResponse = {
  results: SearchResult[];
};
