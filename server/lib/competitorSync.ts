import type { BatchStatus, PackageRow, VersionRow } from "../../shared/competitorTypes";
import { STORE_COUNTRIES } from "../../shared/types";
import type { LookupCandidate, StoreCountry } from "../../shared/types";
import type { downloadAppAssets } from "./assetStore";
import type { CompetitorWriteRepo, CountryHitRow } from "./competitorRepo";
import { mapWithConcurrency } from "./concurrency";
import type { SourceBatch } from "./firstDeliverySource";
import type { ProductPageDetails } from "./productPage";

export type CompetitorSyncDeps = {
  fetchSourcePackages: (targetDate: string) => Promise<SourceBatch>;
  lookupAppByBundleId: (bundleId: string, country: StoreCountry) => Promise<LookupCandidate | null>;
  fetchProductPageDetails: (appStoreUrl: string) => Promise<ProductPageDetails>;
  downloadAssets: typeof downloadAppAssets;
  repo: Pick<
    CompetitorWriteRepo,
    "upsertBatch" | "upsertPackage" | "upsertCountryHits" | "upsertAssets" | "upsertVersions"
  >;
};

export type SyncReport = {
  targetDate: string;
  total: number;
  hit: number;
  missed: number;
  failed: number;
  status: BatchStatus;
};

type PackageOutcome = "hit" | "miss" | "failed";

/** Yesterday in UTC, formatted as YYYY-MM-DD. */
export function computeTargetDate(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function concurrency(): number {
  const configured = Number(process.env.COMPETITOR_SYNC_CONCURRENCY);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 3;
}

export async function syncCompetitorDay(
  targetDate: string,
  deps: CompetitorSyncDeps,
): Promise<SyncReport> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("Target date must be YYYY-MM-DD");
  }

  const source = await deps.fetchSourcePackages(targetDate);
  const fetchedAt = new Date().toISOString();

  const outcomes = await mapWithConcurrency(
    source.rows,
    concurrency(),
    async (row): Promise<PackageOutcome> => {
      const pkg: PackageRow = {
        packageCode: row.packageCode,
        targetDate,
        displayName: row.displayName,
        team: row.team,
        firstAdDate: row.firstAdDate,
        listingDate: row.listingDate,
        first100Date: row.first100Date,
        offlineDate: row.offlineDate,
        category: null,
        minimumOsVersion: null,
        appVersion: null,
        lookupStatus: "pending",
        enrichStatus: "pending",
        assetStatus: "pending",
        appStoreJson: {},
        fetchedAt,
      };

      try {
        // Persist the source row first so a lookup failure still leaves a visible package.
        await deps.repo.upsertPackage(pkg);

        const hits: CountryHitRow[] = [];
        let firstHit: LookupCandidate | null = null;
        for (const country of STORE_COUNTRIES) {
          const candidate = await deps.lookupAppByBundleId(row.packageCode, country);
          hits.push({
            country,
            status: candidate ? "hit" : "not_found",
            appleId: candidate?.appleId ?? null,
            fetchedAt,
          });
          if (candidate && !firstHit) firstHit = candidate;
        }
        await deps.repo.upsertCountryHits(row.packageCode, hits);

        let enrichStatus: PackageRow["enrichStatus"] = "pending";
        let assetStatus: PackageRow["assetStatus"] = "pending";
        let appVersion = firstHit?.versionHistory?.[0]?.version ?? null;
        let appStoreJson: Record<string, unknown> = firstHit ? { ...firstHit } : {};

        if (firstHit) {
          let screenshots = firstHit.screenshotUrls;
          let versions: VersionRow[] = [];
          try {
            const details = await deps.fetchProductPageDetails(firstHit.appStoreUrl);
            enrichStatus = "ok";
            screenshots = [...new Set([...firstHit.screenshotUrls, ...details.screenshotUrls])];
            versions = details.versionHistory.map((entry) => ({
              version: entry.version,
              releasedAt: entry.releasedAt ?? fetchedAt,
              notes: entry.notes,
            }));
            appVersion = details.versionHistory[0]?.version ?? appVersion;
            appStoreJson = {
              ...firstHit,
              screenshotUrls: screenshots,
              iapItems: details.iapItems,
              versionHistory: details.versionHistory,
            };
          } catch {
            // A failed product page must not stop the rest of the batch.
            enrichStatus = "failed";
          }

          const downloaded = await deps.downloadAssets(
            targetDate,
            row.packageCode,
            firstHit.iconUrl,
            screenshots,
          );
          await deps.repo.upsertAssets(row.packageCode, downloaded.assets);
          assetStatus = downloaded.status;

          if (versions.length > 0) {
            await deps.repo.upsertVersions(row.packageCode, versions);
          }
        }

        await deps.repo.upsertPackage({
          ...pkg,
          lookupStatus: firstHit ? "hit" : "bundle_not_found",
          enrichStatus,
          assetStatus,
          category: firstHit?.category ?? null,
          minimumOsVersion: firstHit?.minimumOsVersion ?? null,
          appVersion,
          appStoreJson,
        });
        return firstHit ? "hit" : "miss";
      } catch {
        // One bad package must not stop the rest of the day's batch.
        return "failed";
      }
    },
  );

  const hit = outcomes.filter((outcome) => outcome === "hit").length;
  const missed = outcomes.filter((outcome) => outcome === "miss").length;
  const failed = outcomes.filter((outcome) => outcome === "failed").length;
  const status: BatchStatus = failed === 0
    ? "ok"
    : failed === source.rows.length ? "failed" : "partial";

  await deps.repo.upsertBatch({
    targetDate,
    syncId: source.syncId,
    snapshotId: source.snapshotId,
    dataUpdatedAt: source.dataUpdatedAt,
    publishedAt: source.publishedAt,
    rangeComplete: source.rangeComplete,
    stale: source.stale,
    status,
    fetchedAt,
  });

  return { targetDate, total: source.rows.length, hit, missed, failed, status };
}
