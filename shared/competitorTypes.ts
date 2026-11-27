export type DateKind = "first_ad" | "listing";
export type GroupBy = "team" | "category" | "ios_version";
export type LookupStatus = "pending" | "hit" | "bundle_not_found" | "offline";
export type EnrichStatus = "pending" | "ok" | "failed";
export type AssetStatus = "pending" | "ok" | "partial" | "failed" | "skipped";
export type BatchStatus = "ok" | "partial" | "failed";

export type BatchRow = {
  targetDate: string; // YYYY-MM-DD
  syncId: string;
  snapshotId: string;
  dataUpdatedAt: string;
  publishedAt: string;
  rangeComplete: boolean;
  stale: boolean;
  status: BatchStatus;
  fetchedAt: string;
};

export type PackageRow = {
  packageCode: string;
  targetDate: string;
  displayName: string;
  team: string;
  firstAdDate: string;
  listingDate: string | null;
  first100Date: string | null;
  offlineDate: string | null;
  category: string | null;
  minimumOsVersion: string | null;
  appVersion: string | null;
  lookupStatus: LookupStatus;
  enrichStatus: EnrichStatus;
  assetStatus: AssetStatus;
  appStoreJson: Record<string, unknown>;
  fetchedAt: string;
};

export type AssetRow = {
  type: "icon" | "screenshot";
  sourceUrl: string;
  localPath: string;
};

export type VersionRow = {
  version: string;
  releasedAt: string;
  notes: string | null;
};

export type DaySummary = {
  date: string;
  packageCount: number;
  hitCount: number;
  missCount: number;
  batchStatus: BatchStatus | null;
};

export type VersionEntry = VersionRow & { capturedAt: string };

export type PackageDetail = {
  packageCode: string;
  targetDate: string;
  displayName: string;
  team: string;
  firstAdDate: string;
  listingDate: string | null;
  first100Date: string | null;
  offlineDate: string | null;
  category: string | null;
  minimumOsVersion: string | null;
  appVersion: string | null;
  lookupStatus: LookupStatus;
  enrichStatus: EnrichStatus;
  assetStatus: AssetStatus;
  appleId: number | null;
  /** Analysis-derived attribution vendor; null when not analyzed. Latest package only, not per-snapshot. */
  attribution: string | null;
  /** IPA-derived NS*UsageDescription keys; null = not analyzed, [] = analyzed with none. */
  permissions: string[] | null;
  appStoreJson: Record<string, unknown>;
  iconLocalPath: string | null;
  screenshotLocalPaths: string[];
  versions: VersionEntry[];
  fetchedAt: string;
};

export type DayDetail = {
  date: string;
  dateKind: DateKind;
  batch: BatchRow | null;
  packages: PackageDetail[];
};

export type SnapshotEntry = {
  targetDate: string;
  team: string;
  lookupStatus: LookupStatus;
  enrichStatus: EnrichStatus;
  assetStatus: AssetStatus;
  category: string | null;
  minimumOsVersion: string | null;
  appVersion: string | null;
  appStoreJson: Record<string, unknown>;
  fetchedAt: string;
};

export type PackageBrief = {
  packageCode: string;
  displayName: string;
  team: string;
  appVersion: string | null;
  offlineDate: string | null;
  iconLocalPath: string | null;
  hasIap: boolean;
  versionCount: number;
  earliestReleasedAt: string | null;
  latestReleasedAt: string | null;
};

export type SummaryCompetitor = {
  appleId: number | null;
  name: string;
  packageCount: number;
  packages: PackageBrief[];
};

export type TimelinePoint = {
  date: string;
  packageCount: number;
  hitCount: number;
  missCount: number;
  batchStatus: BatchStatus | null;
};

export type SummaryGroup = {
  groupKey: string;
  packageCount: number;
  hitCount: number;
  missCount: number;
  pendingCount: number;
  competitorCount: number;
  competitors: SummaryCompetitor[];
  missedPackages: PackageBrief[];
  pendingPackages: PackageBrief[];
  timeline: TimelinePoint[];
};

export type SummaryResponse = {
  date: string; // range mode: the `to` date
  from?: string; // present only in range mode
  to?: string; // present only in range mode
  dateKind: DateKind;
  groupBy: GroupBy;
  pendingCount: number;
  groups: SummaryGroup[];
};
