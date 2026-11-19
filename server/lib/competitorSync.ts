import type { BatchStatus, PackageRow } from "../../shared/competitorTypes";
import type { CompetitorWriteRepo } from "./competitorRepo";
import { mapWithConcurrency } from "./concurrency";
import type { SourceBatch } from "./firstDeliverySource";

export type CompetitorSyncDeps = {
  fetchSourcePackages: (targetDate: string) => Promise<SourceBatch>;
  repo: Pick<CompetitorWriteRepo, "upsertBatch" | "upsertPackage">;
};

export type SyncReport = {
  targetDate: string;
  total: number;
  hit: number;
  missed: number;
  failed: number;
  status: BatchStatus;
};

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

  const stored = await mapWithConcurrency(source.rows, concurrency(), async (row) => {
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
      await deps.repo.upsertPackage(pkg);
      return true;
    } catch {
      // One bad package must not stop the rest of the day's batch.
      return false;
    }
  });

  const failed = stored.filter((ok) => !ok).length;
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

  return {
    targetDate,
    total: source.rows.length,
    hit: 0,
    missed: 0,
    failed,
    status,
  };
}
