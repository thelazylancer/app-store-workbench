import type {
  DayDetail,
  PackageDetail,
  SnapshotEntry,
} from "../../shared/competitorTypes";

// MCP-only projection: HTTP routes and the frontend keep the full payload.
const DESCRIPTION_LIMIT = 160;
const IAP_LIMIT = 5;
const VERSION_LIMIT = 5;

const STORE_KEYS = [
  "name",
  "developer",
  "formattedPrice",
  "currency",
  "averageUserRating",
  "userRatingCount",
  "privacy",
] as const;

type StoreSubset = {
  name?: unknown;
  developer?: unknown;
  formattedPrice?: unknown;
  currency?: unknown;
  averageUserRating?: unknown;
  userRatingCount?: unknown;
  privacy?: unknown;
  description?: string;
  descriptionTruncated?: true;
  iapItems?: unknown[];
  iapItemsTruncated?: true;
};

export type CompactPackage = {
  packageCode: string;
  targetDate: string;
  displayName: string;
  team: string;
  firstAdDate: string;
  listingDate: string | null;
  offlineDate: string | null;
  category: string | null;
  appVersion: string | null;
  minimumOsVersion: string | null;
  lookupStatus: PackageDetail["lookupStatus"];
  enrichStatus: PackageDetail["enrichStatus"];
  assetStatus: PackageDetail["assetStatus"];
  attribution: string | null;
  permissions: string[] | null;
  appleId: number | null;
  hasIcon: boolean;
  screenshotCount: number;
  versionCount: number;
  store?: StoreSubset;
  latestVersions?: Array<{ version: string; releasedAt: string }>;
  versionsTruncated?: true;
};

export type CompactDayDetail = {
  date: string;
  dateKind: DayDetail["dateKind"];
  batch: DayDetail["batch"];
  packages: CompactPackage[];
};

export type CompactHistoryEntry = {
  targetDate: string;
  team: string;
  lookupStatus: SnapshotEntry["lookupStatus"];
  enrichStatus: SnapshotEntry["enrichStatus"];
  assetStatus: SnapshotEntry["assetStatus"];
  category: string | null;
  minimumOsVersion: string | null;
  appVersion: string | null;
  store?: StoreSubset;
};

export type CompactHistory = {
  packageCode: string;
  snapshots: CompactHistoryEntry[];
};

function compactStoreJson(json: Record<string, unknown>): StoreSubset {
  const store: Record<string, unknown> = {};
  for (const key of STORE_KEYS) {
    if (Object.hasOwn(json, key)) store[key] = json[key];
  }

  if (typeof json.description === "string") {
    // Spread by code point so a surrogate pair is never split.
    const points = [...json.description];
    if (points.length > DESCRIPTION_LIMIT) {
      store.description = points.slice(0, DESCRIPTION_LIMIT).join("");
      store.descriptionTruncated = true;
    } else {
      store.description = json.description;
    }
  }

  if (Array.isArray(json.iapItems)) {
    store.iapItems = json.iapItems.slice(0, IAP_LIMIT);
    if (json.iapItems.length > IAP_LIMIT) store.iapItemsTruncated = true;
  }

  return store as StoreSubset;
}

function compactPackage(pkg: PackageDetail, opts: { withVersions: boolean }): CompactPackage {
  const compact: CompactPackage = {
    packageCode: pkg.packageCode,
    targetDate: pkg.targetDate,
    displayName: pkg.displayName,
    team: pkg.team,
    firstAdDate: pkg.firstAdDate,
    listingDate: pkg.listingDate,
    offlineDate: pkg.offlineDate,
    category: pkg.category,
    appVersion: pkg.appVersion,
    minimumOsVersion: pkg.minimumOsVersion,
    lookupStatus: pkg.lookupStatus,
    enrichStatus: pkg.enrichStatus,
    assetStatus: pkg.assetStatus,
    attribution: pkg.attribution,
    permissions: pkg.permissions,
    appleId: pkg.appleId,
    hasIcon: pkg.iconLocalPath !== null,
    screenshotCount: pkg.screenshotLocalPaths.length,
    versionCount: pkg.versions.length,
    ...(pkg.lookupStatus === "hit" ? { store: compactStoreJson(pkg.appStoreJson) } : {}),
  };

  if (opts.withVersions) {
    compact.latestVersions = pkg.versions
      .slice(0, VERSION_LIMIT)
      .map(({ version, releasedAt }) => ({ version, releasedAt }));
    if (pkg.versions.length > VERSION_LIMIT) compact.versionsTruncated = true;
  }

  return compact;
}

export function compactDayDetail(day: DayDetail): CompactDayDetail {
  return {
    date: day.date,
    dateKind: day.dateKind,
    batch: day.batch,
    packages: day.packages.map((pkg) => compactPackage(pkg, { withVersions: false })),
  };
}

export function compactPackageDetail(pkg: PackageDetail): CompactPackage {
  return compactPackage(pkg, { withVersions: true });
}

export function compactPackageHistory(
  response: { packageCode: string; snapshots: SnapshotEntry[] },
): CompactHistory {
  return {
    packageCode: response.packageCode,
    snapshots: response.snapshots.map((snapshot) => ({
      targetDate: snapshot.targetDate,
      team: snapshot.team,
      lookupStatus: snapshot.lookupStatus,
      enrichStatus: snapshot.enrichStatus,
      assetStatus: snapshot.assetStatus,
      category: snapshot.category,
      minimumOsVersion: snapshot.minimumOsVersion,
      appVersion: snapshot.appVersion,
      ...(snapshot.lookupStatus === "hit" ? { store: compactStoreJson(snapshot.appStoreJson) } : {}),
    })),
  };
}
