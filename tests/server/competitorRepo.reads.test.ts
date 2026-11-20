import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import { runMigrations } from "../../server/lib/db";
import { createCompetitorRepoFixtures } from "./competitorRepoTestUtils";
import { openTestPool } from "./dbTestUtils";

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

const { suffix, RUN_YEAR, dateFor, historyDayA, historyDayB, pkg } = createCompetitorRepoFixtures();

describeDb("competitor repository reads", () => {
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
    await pool!.end();
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
