import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import type { CompetitorWriteRepo } from "../../server/lib/competitorRepo";
import { runMigrations } from "../../server/lib/db";
import { createShelfQueries, iosBucket } from "../../server/lib/shelfQueries";
import type { ShelfQueryRepo } from "../../server/lib/shelfQueries";
import type { PackageRow } from "../../shared/competitorTypes";
import { openTestPool } from "./dbTestUtils";

describe("iosBucket", () => {
  it("groups major versions, folding 19+ into 26plus and unparseable values into unknown", () => {
    expect(iosBucket("26.2")).toBe("26plus");
    expect(iosBucket("19.0")).toBe("26plus");
    expect(iosBucket("18.4")).toBe("18");
    expect(iosBucket("17.2")).toBe("17");
    expect(iosBucket(" 16.0")).toBe("16");
    expect(iosBucket("15")).toBe("15");
    expect(iosBucket("14.9")).toBe("lte14");
    expect(iosBucket("13")).toBe("lte14");
    expect(iosBucket("garbage")).toBe("unknown");
    expect(iosBucket("abc16")).toBe("unknown");
    expect(iosBucket("")).toBe("unknown");
    expect(iosBucket(null)).toBe("unknown");
  });
});

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

const suffix = randomUUID().slice(0, 8);
const pattern = `test.shelf.${suffix}%`;
// Far-future safe year derived from the run suffix, away from real and other test data.
const RUN_YEAR = 1800 + (Number.parseInt(suffix.slice(0, 4), 16) % 100);
const alpha = `Shelf Alpha ${suffix}`;
const beta = `Shelf Beta ${suffix}`;
const gamma = `Shelf Gamma ${suffix}`;

function shiftDay(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  const weekday = parsed.getUTCDay();
  parsed.setUTCDate(parsed.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return parsed.toISOString().slice(0, 10);
}

const monday = mondayOf(`${RUN_YEAR}-06-15`);
const sunday = shiftDay(monday, -1);
const previousMonday = shiftDay(monday, -7);
const week2End = shiftDay(monday, 6);

const codeA = `test.shelf.${suffix}.a`;
const codeB = `test.shelf.${suffix}.b`;
const codeC = `test.shelf.${suffix}.c`;
const codeD = `test.shelf.${suffix}.d`;
const codeE = `test.shelf.${suffix}.e`;
const codeF = `test.shelf.${suffix}.f`;

function packageRow(
  overrides: Partial<PackageRow> & Pick<PackageRow, "packageCode" | "targetDate" | "team">,
): PackageRow {
  return {
    displayName: "iOS-Source-Display",
    firstAdDate: overrides.targetDate,
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
    fetchedAt: "2026-11-20T02:00:00.000Z",
    ...overrides,
  };
}

describeDb("shelf queries against PostgreSQL", () => {
  let repo: ShelfQueryRepo;
  let writes: CompetitorWriteRepo;

  beforeAll(async () => {
    await runMigrations(pool!);
    writes = createCompetitorRepo(pool!);
    repo = createShelfQueries(pool!);

    // Week 1: a Sunday belongs to the previous Monday-start week.
    await writes.upsertPackage(packageRow({
      packageCode: codeA, targetDate: sunday, team: alpha,
      lookupStatus: "hit", category: "Games", minimumOsVersion: "16.0", appVersion: "1.0",
      listingDate: shiftDay(sunday, -30), offlineDate: null,
      appStoreJson: { appleId: 1, name: "Alpha Game", iapItems: [{ name: "Coins" }] },
    }));

    // Week 2: a Monday starts a new week.
    await writes.upsertPackage(packageRow({
      packageCode: codeB, targetDate: monday, team: alpha,
      lookupStatus: "hit", category: "Utilities", minimumOsVersion: "26.2", appVersion: "2.0",
      listingDate: shiftDay(monday, -10), offlineDate: null,
      appStoreJson: { appleId: 2, name: "Beta Utility", iapItems: [] },
    }));
    await writes.upsertPackage(packageRow({
      packageCode: codeC, targetDate: shiftDay(monday, 2), team: beta,
      lookupStatus: "bundle_not_found", category: "Leaky Category",
      minimumOsVersion: "17.0", appVersion: "9.9.9",
      listingDate: shiftDay(monday, -40), offlineDate: shiftDay(monday, 1),
      appStoreJson: {},
    }));
    await writes.upsertPackage(packageRow({
      packageCode: codeD, targetDate: shiftDay(monday, 3), team: beta,
      lookupStatus: "pending", category: null, minimumOsVersion: null, appVersion: null,
      appStoreJson: {},
    }));
    await writes.upsertPackage(packageRow({
      packageCode: codeE, targetDate: shiftDay(monday, 4), team: alpha,
      lookupStatus: "hit", category: "Games", minimumOsVersion: "15.1", appVersion: "2.3",
      appStoreJson: { name: "", trackName: "Track Only", iapItems: { not: "array" } },
    }));
    await writes.upsertPackage(packageRow({
      packageCode: codeF, targetDate: shiftDay(monday, 5), team: gamma,
      lookupStatus: "hit", category: null, minimumOsVersion: "garbage",
      appStoreJson: { name: "Gamma App", iapItems: [] },
    }));

    // Version history: A has one 3-day gap; B a single release; E two 5-day gaps.
    await writes.upsertVersions(codeA, [
      { version: "1.0", releasedAt: `${shiftDay(sunday, -4)}T00:00:00.000Z`, notes: null },
      { version: "1.1", releasedAt: `${shiftDay(sunday, -1)}T00:00:00.000Z`, notes: null },
    ]);
    await writes.upsertVersions(codeB, [
      { version: "2.0", releasedAt: `${shiftDay(monday, -20)}T00:00:00.000Z`, notes: null },
    ]);
    await writes.upsertVersions(codeE, [
      { version: "1.0", releasedAt: `${shiftDay(monday, -6)}T00:00:00.000Z`, notes: null },
      { version: "2.0", releasedAt: `${shiftDay(monday, -1)}T00:00:00.000Z`, notes: null },
      { version: "3.0", releasedAt: `${shiftDay(monday, 4)}T00:00:00.000Z`, notes: null },
    ]);
  });

  afterAll(async () => {
    await pool!.query("DELETE FROM competitor_country_hits WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_assets WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_versions WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_snapshots WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_packages WHERE package_code LIKE $1", [pattern]);
    await pool!.end();
  });

  it("buckets Monday-start weeks, including the Sunday belonging to the previous week", async () => {
    const trend = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "category" });

    expect(trend.weeks.map((week) => [week.weekStart, week.weekEnd, week.packageCount])).toEqual([
      [previousMonday, sunday, 1],
      [monday, week2End, 5],
    ]);
    expect(trend.weeks.map((week) => week.teams)).toEqual([
      [{ key: alpha, count: 1 }],
      [{ key: alpha, count: 2 }, { key: beta, count: 2 }, { key: gamma, count: 1 }],
    ]);
    expect(trend.totals.packageCount).toBe(6);
    expect(trend.from).toBe(sunday);
    expect(trend.to).toBe(week2End);
    expect(trend.team).toBeNull();
    expect(trend.groupBy).toBe("category");
  });

  it("keeps the full team list regardless of the team filter", async () => {
    const all = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "category" });
    expect(all.teams).toEqual([alpha, beta, gamma]);

    const filtered = await repo.getShelfTrend({ from: sunday, to: week2End, team: alpha, groupBy: "category" });
    expect(filtered.teams).toEqual([alpha, beta, gamma]);
    expect(filtered.team).toBe(alpha);
    expect(filtered.weeks.map((week) => [week.weekStart, week.packageCount])).toEqual([
      [previousMonday, 1],
      [monday, 2],
    ]);
    expect(filtered.totals.packageCount).toBe(3);

    const empty = await repo.getShelfTrend({
      from: sunday, to: week2End, team: `Shelf None ${suffix}`, groupBy: "category",
    });
    expect(empty.teams).toEqual([alpha, beta, gamma]);
    expect(empty.weeks).toEqual([]);
    expect(empty.totals).toEqual({ packageCount: 0, groups: [] });
  });

  it("maps unresolved packages into the category unknown bucket", async () => {
    const trend = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "category" });
    expect(trend.weeks[1]!.groups).toEqual([
      { key: "unknown", count: 3 },
      { key: "Games", count: 1 },
      { key: "Utilities", count: 1 },
    ]);
    expect(trend.totals.groups).toEqual([
      { key: "unknown", count: 3 },
      { key: "Games", count: 2 },
      { key: "Utilities", count: 1 },
    ]);
    // All three dimensions in one response, independent of groupBy.
    expect(trend.distributions).toEqual({
      category: [
        { key: "unknown", count: 3 },
        { key: "Games", count: 2 },
        { key: "Utilities", count: 1 },
      ],
      ios_version: [
        { key: "unknown", count: 3 },
        { key: "15", count: 1 },
        { key: "16", count: 1 },
        { key: "26plus", count: 1 },
      ],
      iap: [
        { key: "no", count: 3 },
        { key: "unknown", count: 2 },
        { key: "yes", count: 1 },
      ],
    });
    // Every week also carries all three dimensions, for the per-row weekly trends.
    expect(trend.weeks[0]!.distributions).toEqual({
      category: [{ key: "Games", count: 1 }],
      ios_version: [{ key: "16", count: 1 }],
      iap: [{ key: "yes", count: 1 }],
    });
    expect(trend.weeks[1]!.distributions).toEqual({
      category: [
        { key: "unknown", count: 3 },
        { key: "Games", count: 1 },
        { key: "Utilities", count: 1 },
      ],
      ios_version: [
        { key: "unknown", count: 3 },
        { key: "15", count: 1 },
        { key: "26plus", count: 1 },
      ],
      iap: [
        { key: "no", count: 3 },
        { key: "unknown", count: 2 },
      ],
    });
  });

  it("maps minimum OS majors into ios buckets", async () => {
    const trend = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "ios_version" });
    expect(trend.weeks[0]!.groups).toEqual([{ key: "16", count: 1 }]);
    expect(trend.weeks[1]!.groups).toEqual([
      { key: "unknown", count: 3 },
      { key: "15", count: 1 },
      { key: "26plus", count: 1 },
    ]);
  });

  it("maps iap tri-state and guards non-array iapItems", async () => {
    const trend = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "iap" });
    expect(trend.weeks[0]!.groups).toEqual([{ key: "yes", count: 1 }]);
    expect(trend.weeks[1]!.groups).toEqual([
      { key: "no", count: 3 },
      { key: "unknown", count: 2 },
    ]);
  });

  it("aggregates version cadence and launch timings per team-week", async () => {
    const trend = await repo.getShelfTrend({ from: sunday, to: week2End, team: null, groupBy: "category" });
    expect(trend.teamWeekStats).toEqual([
      {
        weekStart: previousMonday,
        team: alpha,
        packageCount: 1,
        avgVersionCount: 2,
        avgVersionGapDays: 3,
        avgLatestVersionToAdDays: 1,
        avgAdToOfflineDays: null,
      },
      {
        weekStart: monday,
        team: alpha,
        packageCount: 2,
        avgVersionCount: 2, // (1 + 3) / 2
        avgVersionGapDays: 5, // only E has two release dates
        avgLatestVersionToAdDays: 10, // (20 + 0) / 2
        avgAdToOfflineDays: null,
      },
      {
        weekStart: monday,
        team: beta,
        packageCount: 2,
        avgVersionCount: null, // no version records at all
        avgVersionGapDays: null,
        avgLatestVersionToAdDays: null,
        avgAdToOfflineDays: -1,
      },
      {
        weekStart: monday,
        team: gamma,
        packageCount: 1,
        avgVersionCount: null,
        avgVersionGapDays: null,
        avgLatestVersionToAdDays: null,
        avgAdToOfflineDays: null,
      },
    ]);

    const filtered = await repo.getShelfTrend({ from: sunday, to: week2End, team: alpha, groupBy: "category" });
    expect(filtered.teamWeekStats.map((row) => [row.weekStart, row.team])).toEqual([
      [previousMonday, alpha],
      [monday, alpha],
    ]);
  });

  it("projects only whitelisted detail fields and truncates by limit, not total", async () => {
    const page = await repo.getShelfPackages({ from: sunday, to: week2End, team: null, limit: 2 });
    expect(page.total).toBe(6);
    expect(page.limit).toBe(2);
    expect(page.rows.map((row) => row.packageCode)).toEqual([codeA, codeB]);

    const full = await repo.getShelfPackages({ from: sunday, to: week2End, team: null, limit: 500 });
    expect(full.rows).toHaveLength(6);
    expect(full.rows.map((row) => row.packageCode)).toEqual([codeA, codeB, codeC, codeD, codeE, codeF]);

    const unresolved = full.rows.find((row) => row.packageCode === codeC)!;
    expect(unresolved).toEqual({
      packageCode: codeC,
      name: null,
      team: beta,
      targetDate: shiftDay(monday, 2),
      weekStart: monday,
      category: null,
      minimumOsVersion: null,
      appVersion: null,
      iap: "unknown",
      listingDate: shiftDay(monday, -40),
      offlineDate: shiftDay(monday, 1),
      resolved: false,
    });
    expect(unresolved).not.toHaveProperty("displayName");
    expect(unresolved).not.toHaveProperty("firstAdDate");
    expect(unresolved).not.toHaveProperty("lookupStatus");

    const nonArrayIap = full.rows.find((row) => row.packageCode === codeE)!;
    expect(nonArrayIap).toMatchObject({
      name: "Track Only",
      category: "Games",
      minimumOsVersion: "15.1",
      appVersion: "2.3",
      iap: "no",
      resolved: true,
    });

    const unparseable = full.rows.find((row) => row.packageCode === codeF)!;
    expect(unparseable).toMatchObject({
      name: "Gamma App",
      category: null,
      minimumOsVersion: "garbage",
      appVersion: null,
      iap: "no",
      resolved: true,
    });

    const alphaPage = await repo.getShelfPackages({ from: sunday, to: week2End, team: alpha, limit: 500 });
    expect(alphaPage.total).toBe(3);
    expect(alphaPage.rows.every((row) => row.team === alpha)).toBe(true);
  });
});
