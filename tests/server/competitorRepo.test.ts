import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import { syncCompetitorDay } from "../../server/lib/competitorSync";
import { runMigrations } from "../../server/lib/db";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";
import type { BatchRow, PackageRow } from "../../shared/competitorTypes";
import { STORE_COUNTRIES } from "../../shared/types";
import { openTestPool } from "./dbTestUtils";

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

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

describeDb("competitor repository writes", () => {
  beforeAll(async () => {
    await runMigrations(pool!);
  });

  afterAll(async () => {
    const pattern = `test.competitor.${suffix}%`;
    await pool!.query("DELETE FROM competitor_country_hits WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_assets WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_versions WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_snapshots WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_packages WHERE package_code LIKE $1", [pattern]);
    await pool!.query(
      "DELETE FROM competitor_batches WHERE target_date = ANY($1::date[])",
      [[targetDate, hitsDate, syncDate, fullSyncDate]],
    );
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

  it("keeps the newest target_date when an older day is backfilled", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.backfill`;
    const older = dateFor("01", 0);
    const newer = dateFor("02", 0);

    await repo.upsertPackage({ ...pkg, packageCode: code, targetDate: newer, firstAdDate: newer });
    await repo.upsertPackage({ ...pkg, packageCode: code, targetDate: older, firstAdDate: older });

    expect((await repo.getPackage(code))?.targetDate).toBe(newer);
    expect(await repo.listDays(older, newer)).toEqual([
      { date: newer, packageCount: 1, hitCount: 0, missCount: 0, batchStatus: null },
    ]);
  });

  it("keeps one country hit per country across reruns", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.hits`;
    await repo.upsertPackage({ ...pkg, packageCode: code, targetDate: hitsDate, firstAdDate: hitsDate });
    const hits = STORE_COUNTRIES.map((country, index) => ({
      country,
      status: index === 0 ? "hit" as const : "not_found" as const,
      appleId: index === 0 ? 42 : null,
      fetchedAt: "2026-11-18T02:00:00.000Z",
    }));

    await repo.upsertCountryHits(code, hits);
    await repo.upsertCountryHits(code, hits);

    const stored = await pool!.query<{ count: number; hits: number }>(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE status = 'hit')::int AS hits
         FROM competitor_country_hits WHERE package_code = $1`,
      [code],
    );
    expect(stored.rows[0]).toEqual({ count: 8, hits: 1 });
  });

  it("keeps one asset row per source URL and updates its local path", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.assets`;
    await repo.upsertPackage({ ...pkg, packageCode: code });
    const assets = [
      { type: "icon" as const, sourceUrl: "https://cdn.example/icon.png", localPath: "old/icon.png" },
      { type: "screenshot" as const, sourceUrl: "https://cdn.example/shot.jpg", localPath: "shot.jpg" },
    ];

    await repo.upsertAssets(code, assets);
    await repo.upsertAssets(code, assets.map((asset) => ({ ...asset, localPath: `new/${asset.localPath}` })));

    const stored = await pool!.query<{ count: number; paths: string[] }>(
      `SELECT count(*)::int AS count, array_agg(local_path ORDER BY source_url) AS paths
         FROM competitor_assets WHERE package_code = $1`,
      [code],
    );
    expect(stored.rows[0]!.count).toBe(2);
    expect(stored.rows[0]!.paths).toEqual([
      "new/old/icon.png",
      "new/shot.jpg",
    ]);
  });

  it("drops screenshot rows the new snapshot set no longer references", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.stale-shots`;
    await repo.upsertPackage({ ...pkg, packageCode: code });
    const large = { type: "screenshot" as const, sourceUrl: "https://cdn.example/a.png/1320x2868bb.jpg", localPath: "a-large.jpg" };
    const small = { type: "screenshot" as const, sourceUrl: "https://cdn.example/a.png/320x480bb.jpg", localPath: "a-small.jpg" };

    await repo.upsertAssets(code, [small, large]);
    await repo.upsertAssets(code, [large]);

    const stored = await pool!.query<{ source_url: string }>(
      "SELECT source_url FROM competitor_assets WHERE package_code = $1 ORDER BY source_url",
      [code],
    );
    expect(stored.rows.map((row) => row.source_url)).toEqual([large.sourceUrl]);
  });

  it("keeps version rows unique across reruns and updates notes", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.versions`;
    await repo.upsertPackage({ ...pkg, packageCode: code });
    const versions = [
      { version: "1.0", releasedAt: "2026-11-01T00:00:00.000Z", notes: "first" },
      { version: "2.0", releasedAt: "2026-11-02T00:00:00.000Z", notes: "second" },
    ];

    await repo.upsertVersions(code, versions);
    await repo.upsertVersions(code, versions.map((version) => ({ ...version, notes: "updated" })));

    const stored = await pool!.query<{ count: number; notes: string[] }>(
      `SELECT count(*)::int AS count, array_agg(notes ORDER BY version) AS notes
         FROM competitor_versions WHERE package_code = $1`,
      [code],
    );
    expect(stored.rows[0]).toEqual({ count: 2, notes: ["updated", "updated"] });
  });

  it("applies first_ad and listing date kinds inside the repository", async () => {
    const repo = createCompetitorRepo(pool!);
    const dayA = kindDayA;
    const dayB = kindDayB;
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
    const day = syncDate;
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
    const deps = {
      fetchSourcePackages: async () => source,
      lookupAppByBundleId: async () => null,
      fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
      downloadAssets: async () => ({ assets: [], status: "failed" as const }),
      repo,
    };

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

  it("keeps country hits, assets and versions stable when a hit package is synced twice", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.full-sync`;
    const day = fullSyncDate;
    const source: SourceBatch = {
      syncId: "sync-full",
      snapshotId: "snap-full",
      dataUpdatedAt: "2026-11-18T00:47:00.000Z",
      publishedAt: "2026-11-18T01:00:00.000Z",
      rangeComplete: true,
      stale: false,
      rows: [{
        packageCode: code, displayName: "iOS-Full", team: "Full Team",
        firstAdDate: day, listingDate: null, first100Date: null, offlineDate: null,
      }],
    };
    const candidate = {
      name: "Real Full App",
      developer: "Dev",
      appleId: 9001,
      bundleId: code,
      appStoreUrl: "https://apps.apple.com/us/app/id9001",
      iconUrl: "https://cdn.example/icon.png",
      description: "Description",
      screenshotUrls: [],
      category: "Utilities",
      minimumOsVersion: "16.0",
      versionHistory: [{ version: "1.0", releasedAt: null, notes: "" }],
    };
    const deps = {
      fetchSourcePackages: async () => source,
      lookupAppByBundleId: async (bundleId: string) => bundleId === code ? candidate : null,
      fetchProductPageDetails: async () => ({
        screenshotUrls: ["https://cdn.example/page-shot.jpg"],
        iapItems: [],
        versionHistory: [{ version: "2.0", releasedAt: "2026-11-01T00:00:00.000Z", notes: "Notes" }],
      }),
      downloadAssets: async () => ({
        assets: [
          { type: "icon" as const, sourceUrl: "https://cdn.example/icon.png", localPath: `${day}/${code}/icon.png` },
          { type: "screenshot" as const, sourceUrl: "https://cdn.example/page-shot.jpg", localPath: `${day}/${code}/shot.jpg` },
        ],
        status: "ok" as const,
      }),
      repo,
    };

    await syncCompetitorDay(day, deps);
    await syncCompetitorDay(day, deps);

    const counts = await pool!.query(
      `SELECT
         (SELECT count(*)::int FROM competitor_batches WHERE target_date = $2::date) AS batches,
         (SELECT count(*)::int FROM competitor_packages WHERE package_code = $1) AS packages,
         (SELECT count(*)::int FROM competitor_snapshots WHERE package_code = $1) AS snapshots,
         (SELECT count(*)::int FROM competitor_country_hits WHERE package_code = $1) AS country_hits,
         (SELECT count(*)::int FROM competitor_assets WHERE package_code = $1) AS assets,
         (SELECT count(*)::int FROM competitor_versions WHERE package_code = $1) AS versions`,
      [code, day],
    );
    expect(counts.rows[0]).toEqual({
      batches: 1, packages: 1, snapshots: 1, country_hits: 8, assets: 2, versions: 1,
    });

    const stored = await repo.getPackage(code);
    expect(stored).toMatchObject({
      lookupStatus: "hit",
      appleId: 9001,
      iconLocalPath: `${day}/${code}/icon.png`,
      screenshotLocalPaths: [`${day}/${code}/shot.jpg`],
    });
    expect(stored?.versions.map((entry) => entry.version)).toEqual(["2.0"]);
  });

  it("aggregates summary groups by package while competitors collapse by appleId", async () => {
    const repo = createCompetitorRepo(pool!);
    const summaryDate = dateFor("04", 0);
    const codeA = `test.competitor.${suffix}.summary-a`;
    const codeB = `test.competitor.${suffix}.summary-b`;
    const codeC = `test.competitor.${suffix}.summary-c`;
    const codeD = `test.competitor.${suffix}.summary-d`;
    const common = { ...pkg, targetDate: summaryDate, firstAdDate: summaryDate };

    await repo.upsertPackage({
      ...common, packageCode: codeA, team: "Team A", category: "Games",
      minimumOsVersion: "16.0", appVersion: "1.0", lookupStatus: "hit",
      listingDate: summaryDate,
      appStoreJson: {
        appleId: 1001, name: "Shared App",
        iapItems: [{ name: "Pack", price: "$4.99" }],
        versionHistory: [
          { version: "1.0", releasedAt: "2026-11-02T00:00:00.000Z" },
          { version: "0.9", releasedAt: "2026-10-01" },
        ],
      },
    });
    await repo.upsertPackage({
      ...common, packageCode: codeB, team: "Team A", category: "Games",
      minimumOsVersion: "17.0", appVersion: "2.0", lookupStatus: "hit",
      appStoreJson: { appleId: 1001, name: "Shared App", iapItems: [], versionHistory: [] },
    });
    await repo.upsertPackage({
      ...common, packageCode: codeC, team: "Team A", category: null,
      lookupStatus: "bundle_not_found",
    });
    await repo.upsertPackage({
      ...common, packageCode: codeD, team: "Team B", category: "Games",
      minimumOsVersion: "16.0", appVersion: "3.0", lookupStatus: "hit",
      listingDate: summaryDate,
      appStoreJson: { appleId: 2002, name: "Other App", iapItems: [], versionHistory: [{ version: "3.0" }] },
    });

    const byTeam = await repo.getSummary(summaryDate, "first_ad", "team");
    expect(byTeam.map((group) => [group.groupKey, group.packageCount, group.hitCount, group.missCount, group.competitorCount])).toEqual([
      ["Team A", 3, 2, 1, 1],
      ["Team B", 1, 1, 0, 1],
    ]);
    const teamA = byTeam[0]!;
    expect(teamA.competitors).toHaveLength(1);
    expect(teamA.competitors[0]).toMatchObject({ appleId: 1001, name: "Shared App", packageCount: 2 });
    expect(teamA.competitors[0]!.packages.map((item) => item.packageCode)).toEqual([codeA, codeB]);
    expect(teamA.competitors[0]!.packages.map(({ hasIap, versionCount }) => ({ hasIap, versionCount }))).toEqual([
      { hasIap: true, versionCount: 2 },
      { hasIap: false, versionCount: 0 },
    ]);
    expect(teamA.competitors[0]!.packages.map(({ earliestReleasedAt, latestReleasedAt }) => ({
      earliestReleasedAt, latestReleasedAt,
    }))).toEqual([
      { earliestReleasedAt: "2026-10-01", latestReleasedAt: "2026-11-02" },
      { earliestReleasedAt: null, latestReleasedAt: null },
    ]);
    expect(teamA.missedPackages.map((item) => item.packageCode)).toEqual([codeC]);
    expect(teamA.missedPackages[0]).toMatchObject({
      hasIap: false, versionCount: 0, earliestReleasedAt: null, latestReleasedAt: null,
    });
    expect(byTeam[1]!.competitors[0]!.packages[0]).toMatchObject({
      hasIap: false, versionCount: 1, earliestReleasedAt: null, latestReleasedAt: null,
    });
    expect(teamA.hitCount + teamA.missCount).toBe(teamA.packageCount);
    expect(teamA.timeline).toHaveLength(7);
    expect(teamA.timeline.at(-1)).toMatchObject({
      date: summaryDate, packageCount: 3, hitCount: 2, missCount: 1, batchStatus: null,
    });

    const byCategory = await repo.getSummary(summaryDate, "first_ad", "category");
    expect(byCategory.map((group) => [group.groupKey, group.packageCount]))
      .toEqual([["Games", 3], ["未知", 1]]);
    const byVersion = await repo.getSummary(summaryDate, "first_ad", "ios_version");
    expect(byVersion.map((group) => [group.groupKey, group.packageCount]))
      .toEqual([["16.0", 2], ["17.0", 1], ["未知", 1]]);
    for (const groups of [byTeam, byCategory, byVersion]) {
      expect(groups.reduce((sum, group) => sum + group.packageCount, 0)).toBe(4);
    }

    const byListing = await repo.getSummary(summaryDate, "listing", "team");
    expect(byListing.map((group) => [group.groupKey, group.packageCount])).toEqual([
      ["Team A", 1],
      ["Team B", 1],
    ]);
  });

  it("counts pending packages and keeps hit, miss and pending summing to packageCount", async () => {
    const repo = createCompetitorRepo(pool!);
    const day = dateFor("03", 0);
    const common = {
      ...pkg, targetDate: day, firstAdDate: day, team: "Pending Team",
      category: null, minimumOsVersion: null, appVersion: null,
    };
    const codeA = `test.competitor.${suffix}.pending-hit`;
    const codeB = `test.competitor.${suffix}.pending-miss`;
    const codeC = `test.competitor.${suffix}.pending-stuck`;

    await repo.upsertPackage({
      ...common, packageCode: codeA, lookupStatus: "hit",
      appStoreJson: { appleId: 3003, name: "Pending Hit" },
    });
    await repo.upsertPackage({ ...common, packageCode: codeB, lookupStatus: "bundle_not_found" });
    await repo.upsertPackage({ ...common, packageCode: codeC, lookupStatus: "pending" });

    const groups = await repo.getSummary(day, "first_ad", "team");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      packageCount: 3, hitCount: 1, missCount: 1, pendingCount: 1,
    });
    for (const group of groups) {
      expect(group.hitCount + group.missCount + group.pendingCount).toBe(group.packageCount);
    }
  });

  it("aggregates a date range with a per-day timeline and pending package list", async () => {
    const repo = createCompetitorRepo(pool!);
    const team = `Range Team ${suffix}`;
    const from = `${RUN_YEAR}-02-15`;
    const middle = `${RUN_YEAR}-02-16`;
    const to = `${RUN_YEAR}-02-17`;
    const pendingCode = `test.competitor.${suffix}.range-pending`;
    const hitCode = `test.competitor.${suffix}.range-hit`;
    const missCode = `test.competitor.${suffix}.range-miss`;
    const iconPath = `${from}/${pendingCode}/icon.png`;

    await repo.upsertPackage({
      ...pkg, packageCode: pendingCode, targetDate: from, firstAdDate: from,
      team, displayName: "iOS-Range-Pending", lookupStatus: "pending",
    });
    await repo.upsertAssets(pendingCode, [
      { type: "icon", sourceUrl: "https://cdn.example/range-icon.png", localPath: iconPath },
    ]);
    await repo.upsertPackage({
      ...pkg, packageCode: hitCode, targetDate: middle, firstAdDate: middle,
      team, displayName: "iOS-Range-Hit", lookupStatus: "hit",
      appStoreJson: { appleId: 7007, name: "Range App" },
    });
    await repo.upsertPackage({
      ...pkg, packageCode: missCode, targetDate: to, firstAdDate: to,
      team, displayName: "iOS-Range-Miss", lookupStatus: "bundle_not_found",
    });

    const groups = await repo.getSummary(to, "first_ad", "team", from);
    const group = groups.find((entry) => entry.groupKey === team)!;

    expect(group).toMatchObject({
      packageCount: 3, hitCount: 1, missCount: 1, pendingCount: 1, competitorCount: 1,
    });
    expect(group.pendingPackages).toEqual([{
      packageCode: pendingCode, displayName: "iOS-Range-Pending", team,
      appVersion: null, iconLocalPath: iconPath, hasIap: false, versionCount: 0,
      earliestReleasedAt: null, latestReleasedAt: null,
    }]);
    expect(group.timeline).toEqual([
      { date: from, packageCount: 1, hitCount: 0, missCount: 0, batchStatus: null },
      { date: middle, packageCount: 1, hitCount: 1, missCount: 0, batchStatus: null },
      { date: to, packageCount: 1, hitCount: 0, missCount: 1, batchStatus: null },
    ]);
  });

  it("returns only existing snapshots for a package, ordered by date", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.history`;
    const dayA = historyDayA;
    const dayB = historyDayB;

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
    expect(await repo.getPackageHistory(code, "2036-01-01", "2036-01-02")).toEqual([]);
  });
});
