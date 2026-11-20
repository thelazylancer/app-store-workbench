import { randomUUID } from "node:crypto";
import type { BatchRow, PackageRow } from "../../shared/competitorTypes";

/**
 * Per-file fixtures for the competitor repository tests. Each test file gets
 * its own suffix so cleanup can stay scoped to the rows it created.
 */
export function createCompetitorRepoFixtures() {
  const suffix = randomUUID().slice(0, 8);
  const packageCode = `test.competitor.${suffix}`;
  const dayNumber = (offset: number) => (Number.parseInt(suffix.slice(offset, offset + 2), 16) % 28) + 1;
  // A per-run year keeps fixtures from earlier runs from polluting date-scoped queries.
  const RUN_YEAR = 2100 + (Math.floor(Date.now() / 1000) % 1000);
  const dateFor = (month: string, offset: number) => `${RUN_YEAR}-${month}-${String(dayNumber(offset)).padStart(2, "0")}`;
  const targetDate = dateFor("06", 0);
  const hitsDate = dateFor("12", 0);
  const syncDate = dateFor("11", 2);
  const fullSyncDate = dateFor("05", 1);
  const kindDayA = dateFor("07", 0);
  const kindDayB = dateFor("08", 2);
  const historyDayA = dateFor("09", 0);
  const historyDayB = dateFor("10", 2);

  const batch: BatchRow = {
    targetDate,
    syncId: "sync-test",
    snapshotId: "snapshot-test",
    dataUpdatedAt: "2026-11-18T00:47:00.000Z",
    publishedAt: "2026-11-18T01:00:00.000Z",
    rangeComplete: true,
    stale: false,
    status: "ok",
    fetchedAt: "2026-11-18T02:00:00.000Z",
  };

  const pkg: PackageRow = {
    packageCode,
    targetDate,
    displayName: "iOS-Test",
    team: "Test Team",
    firstAdDate: targetDate,
    listingDate: null,
    first100Date: null,
    offlineDate: null,
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    lookupStatus: "pending",
    enrichStatus: "pending",
    assetStatus: "pending",
    appStoreJson: {},
    fetchedAt: "2026-11-18T02:00:00.000Z",
  };

  return {
    suffix,
    packageCode,
    RUN_YEAR,
    dateFor,
    targetDate,
    hitsDate,
    syncDate,
    fullSyncDate,
    kindDayA,
    kindDayB,
    historyDayA,
    historyDayB,
    batch,
    pkg,
  };
}
