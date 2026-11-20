export type InputRow = {
  team: string;
  firstLaunchDate: string;
  packageName: string;
  searchName: string;
  pkgName: string;
  listingDate: string;
  hundredFirstDay: string;
  delistingDate: string;
};

export type MatchStatus = "matched" | "needs_review" | "not_found_us" | "fetch_failed";

export type NameCandidate = {
  name: string | null;
  bundleId: string | null;
  sellerName: string | null;
  trackId: number | null;
  url: string | null;
  minimumOsVersion: string | null;
};

export type RawCache = {
  fetchedAt: string;
  source: InputRow;
  lookupUrl: string;
  lookup: any | null;
  nameSearchUrl: string | null;
  nameSearch: any | null;
  detailUrl: string | null;
  detail: any | null;
  error: string | null;
};
