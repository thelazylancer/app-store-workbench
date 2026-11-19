import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import { syncCompetitorDay } from "../../server/lib/competitorSync";
import { runMigrations } from "../../server/lib/db";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";
import type { BatchRow, PackageRow } from "../../shared/competitorTypes";
import { openTestPool } from "./dbTestUtils";

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

const suffix = randomUUID().slice(0, 8);
const packageCode = `test.competitor.${suffix}`;
const targetDate = `2035-06-${String((Number.parseInt(suffix.slice(0, 2), 16) % 28) + 1).padStart(2, "0")}`;

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

describeDb("competitor repository writes", () => {
  beforeAll(async () => {
    await runMigrations(pool!);
  });

  afterAll(async () => {
    await pool!.query("DELETE FROM competitor_snapshots WHERE package_code LIKE $1", [`test.competitor.${suffix}%`]);
    await pool!.query("DELETE FROM competitor_packages WHERE package_code LIKE $1", [`test.competitor.${suffix}%`]);
    await pool!.query("DELETE FROM competitor_batches WHERE target_date BETWEEN $1::date AND $2::date", ["2035-06-01", "2035-08-28"]);
    await pool!.end();
  });

  it("keeps batch, package and snapshot rows single when the same day is synced twice", async () => {
    const repo = createCompetitorRepo(pool!);

    await repo.upsertBatch(batch);
    await repo.upsertBatch(batch);
    await repo.upsertPackage(pkg);
    await repo.upsertPackage({ ...pkg, lookupStatus: "hit", appStoreJson: { appleId: 42, name: "Real App" } });

    const counts = await pool!.query<{
      batches: number;
      packages: number;
      snapshots: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM competitor_batches WHERE target_date = $2::date) AS batches,
         (SELECT count(*)::int FROM competitor_packages WHERE package_code = $1) AS packages,
         (SELECT count(*)::int FROM competitor_snapshots WHERE package_code = $1) AS snapshots`,
      [packageCode, targetDate],
    );
    expect(counts.rows[0]).toEqual({ batches: 1, packages: 1, snapshots: 1 });

    const stored = await repo.getPackage(packageCode);
    expect(stored).toMatchObject({
      packageCode,
      displayName: "iOS-Test",
      team: "Test Team",
      lookupStatus: "hit",
      appStoreJson: { appleId: 42, name: "Real App" },
      appleId: 42,
    });

    const snapshot = await pool!.query(
      `SELECT lookup_status, app_store_json
         FROM competitor_snapshots
        WHERE package_code = $1 AND target_date = $2::date`,
      [packageCode, targetDate],
    );
    expect(snapshot.rows[0]).toMatchObject({ lookup_status: "hit", app_store_json: { appleId: 42, name: "Real App" } });
    expect(await repo.getBatch(targetDate)).toEqual(batch);
  });

  it("applies first_ad and listing date kinds inside the repository", async () => {
    const repo = createCompetitorRepo(pool!);
    const dayA = "2035-07-11";
    const dayB = "2035-08-12";
    const codeA = `test.competitor.${suffix}.kind-a`;
    const codeB = `test.competitor.${suffix}.kind-b`;

    await repo.upsertPackage({
      ...pkg,
      packageCode: codeA,
      targetDate: dayA,
      firstAdDate: dayA,
      listingDate: dayB,
      team: "Ad Team",
    });
    await repo.upsertPackage({
      ...pkg,
      packageCode: codeB,
      targetDate: dayB,
      firstAdDate: dayB,
      listingDate: null,
      team: "Listing Team",
    });

    const codes = (day: Awaited<ReturnType<typeof repo.getDay>>) =>
      day?.packages.map((item) => item.packageCode) ?? [];

    expect(codes(await repo.getDay(dayA, "first_ad"))).toEqual([codeA]);
    expect(await repo.getDay(dayA, "listing")).toBeNull();
    expect(codes(await repo.getDay(dayB, "first_ad"))).toEqual([codeB]);
    expect(codes(await repo.getDay(dayB, "listing"))).toEqual([codeA]);

    const days = await repo.listDays(dayA, dayB);
    expect(days).toEqual([
      { date: dayB, packageCount: 1, hitCount: 0, missCount: 0, batchStatus: null },
      { date: dayA, packageCount: 1, hitCount: 0, missCount: 0, batchStatus: null },
    ]);
  });

  it("keeps all row counts stable when the same day is synced twice", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.sync`;
    const day = "2035-08-20";
    const source: SourceBatch = {
      syncId: "sync-twice",
      snapshotId: "snap-twice",
      dataUpdatedAt: "2026-11-18T00:47:00.000Z",
      publishedAt: "2026-11-18T01:00:00.000Z",
      rangeComplete: true,
      stale: false,
      rows: [{
        packageCode: code, displayName: "iOS-Sync", team: "Sync Team",
        firstAdDate: day, listingDate: null, first100Date: null, offlineDate: null,
      }],
    };
    const deps = { fetchSourcePackages: async () => source, repo };

    await syncCompetitorDay(day, deps);
    await syncCompetitorDay(day, deps);

    const counts = await pool!.query<{ batches: number; packages: number; snapshots: number }>(
      `SELECT
         (SELECT count(*)::int FROM competitor_batches WHERE target_date = $2::date) AS batches,
         (SELECT count(*)::int FROM competitor_packages WHERE package_code = $1) AS packages,
         (SELECT count(*)::int FROM competitor_snapshots WHERE package_code = $1) AS snapshots`,
      [code, day],
    );
    expect(counts.rows[0]).toEqual({ batches: 1, packages: 1, snapshots: 1 });
  });

  it("returns only existing snapshots for a package, ordered by date", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.history`;
    const dayA = "2035-07-15";
    const dayB = "2035-08-16";

    await repo.upsertPackage({
      ...pkg, packageCode: code, targetDate: dayA, firstAdDate: dayA,
      lookupStatus: "hit", appVersion: "1.0", category: "Games",
    });
    await repo.upsertPackage({
      ...pkg, packageCode: code, targetDate: dayB, firstAdDate: dayA,
      lookupStatus: "hit", appVersion: "2.0", category: "Utilities",
    });

    const history = await repo.getPackageHistory(code, dayA, dayB);
    expect(history.map((row) => [row.targetDate, row.appVersion, row.category])).toEqual([
      [dayA, "1.0", "Games"],
      [dayB, "2.0", "Utilities"],
    ]);
    expect(await repo.getPackageHistory(code, "2035-09-01", "2035-09-02")).toEqual([]);
  });
});
