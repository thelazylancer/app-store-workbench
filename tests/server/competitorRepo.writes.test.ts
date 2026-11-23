import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import { syncCompetitorDay } from "../../server/lib/competitorSync";
import { runMigrations } from "../../server/lib/db";
import type { SourceBatch } from "../../server/lib/firstDeliverySource";
import { fetchOfflinePackages } from "../../server/lib/offlineSource";
import { syncOfflinePackages } from "../../server/lib/offlineSync";
import { STORE_COUNTRIES } from "../../shared/types";
import { createCompetitorRepoFixtures } from "./competitorRepoTestUtils";
import { openTestPool } from "./dbTestUtils";

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

const {
  suffix, packageCode, dateFor, targetDate, hitsDate, syncDate, fullSyncDate,
  kindDayA, kindDayB, batch, pkg,
} = createCompetitorRepoFixtures();

describeDb("competitor repository writes", () => {
  beforeAll(async () => {
    await runMigrations(pool!);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {    const pattern = `test.competitor.${suffix}%`;
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

  it("updates offline_date only for packages that already exist", async () => {
    const repo = createCompetitorRepo(pool!);
    const codeA = `test.competitor.${suffix}.offline-a`;
    const codeB = `test.competitor.${suffix}.offline-b`;
    const missing = `test.competitor.${suffix}.offline-missing`;
    await repo.upsertPackage({ ...pkg, packageCode: codeA });
    await repo.upsertPackage({ ...pkg, packageCode: codeB });
    const before = await repo.getPackage(codeA);
    const snapshotHash = () => pool!.query<{ hash: string }>(
      `SELECT md5(string_agg(t::text, '|' ORDER BY t.package_code, t.target_date)) AS hash
         FROM competitor_snapshots t WHERE t.package_code = ANY($1::text[])`,
      [[codeA, codeB]],
    );
    const snapshotsBefore = await snapshotHash();

    const returned = await repo.updateOfflineDates([
      { packageCode: codeA, offlineDate: "2026-11-10" },
      { packageCode: codeB, offlineDate: "2026-11-11" },
      { packageCode: missing, offlineDate: "2026-11-12" },
    ]);

    expect(returned.sort()).toEqual([codeA, codeB].sort());
    expect((await repo.getPackage(codeA))?.offlineDate).toBe("2026-11-10");
    expect((await repo.getPackage(codeB))?.offlineDate).toBe("2026-11-11");
    expect(await repo.getPackage(missing)).toBeNull();

    const after = await repo.getPackage(codeA);
    expect(after).toMatchObject({
      displayName: before!.displayName,
      team: before!.team,
      lookupStatus: before!.lookupStatus,
      fetchedAt: before!.fetchedAt,
    });

    expect((await snapshotHash()).rows).toEqual(snapshotsBefore.rows);
  });

  it("writes valid rows even when the source contains calendar-invalid dates", async () => {
    const repo = createCompetitorRepo(pool!);
    const good = `test.competitor.${suffix}.offline-good`;
    const bad = `test.competitor.${suffix}.offline-bad`;
    await repo.upsertPackage({ ...pkg, packageCode: good });
    await repo.upsertPackage({ ...pkg, packageCode: bad });

    vi.stubEnv("FIRST_DELIVERY_API_URL", "http://source.test");
    vi.stubEnv("FIRST_DELIVERY_API_KEY", "test-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: "ok",
      request_id: "req_test",
      data: [
        { package_code: good, offline_date: "2026-11-20" },
        { package_code: bad, offline_date: "2026-13-99" },
        { package_code: bad, offline_date: "2026-02-31" },
      ],
      meta: { page: 1, page_size: 200, total_count: 3 },
    })));

    const report = await syncOfflinePackages(
      { start: "2026-11-20", end: "2026-11-22" },
      { fetchOfflinePackages, repo },
    );

    expect((await repo.getPackage(good))?.offlineDate).toBe("2026-11-20");
    expect((await repo.getPackage(bad))?.offlineDate).toBeNull();
    expect(report).toMatchObject({ fetched: 3, matched: 1, updated: 1, unmatched: 0, failed: 2 });
    expect(report.fetched).toBe(report.matched + report.unmatched + report.failed);
  });

  it("returns an empty array without querying when no entries are given", async () => {
    const repo = createCompetitorRepo(pool!);
    const query = vi.spyOn(pool!, "query");

    await expect(repo.updateOfflineDates([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("lets a later duplicate code overwrite an earlier one", async () => {
    const repo = createCompetitorRepo(pool!);
    const code = `test.competitor.${suffix}.offline-dup`;
    await repo.upsertPackage({ ...pkg, packageCode: code });

    const returned = await repo.updateOfflineDates([
      { packageCode: code, offlineDate: "2026-11-10" },
      { packageCode: code, offlineDate: "2026-11-20" },
    ]);

    expect(returned).toEqual([code]);
    expect((await repo.getPackage(code))?.offlineDate).toBe("2026-11-20");
  });
});
