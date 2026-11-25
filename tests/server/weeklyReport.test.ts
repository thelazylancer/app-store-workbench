import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCompetitorRepo } from "../../server/lib/competitorRepo";
import type { CompetitorWriteRepo } from "../../server/lib/competitorRepo";
import { runMigrations } from "../../server/lib/db";
import {
  addWeeks,
  buildHighlights,
  createWeeklyReport,
  isoWeekStart,
  shanghaiToday,
} from "../../server/lib/weeklyReport";
import type { PackageRow } from "../../shared/competitorTypes";
import type { WeeklyReportRepo } from "../../server/lib/weeklyReport";
import { openTestPool } from "./dbTestUtils";

describe("weekly report pure functions", () => {
  it("normalizes any date to the Monday of its ISO week in UTC", () => {
    expect(isoWeekStart("2026-11-16")).toBe("2026-11-16");
    expect(isoWeekStart("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the previous week
    expect(isoWeekStart("2026-11-23")).toBe("2026-11-23"); // Monday starts a new week
    expect(isoWeekStart("2025-01-01")).toBe("2024-12-30"); // cross-year
    expect(isoWeekStart("2024-12-30")).toBe("2024-12-30");
  });

  it("moves whole weeks and computes Shanghai today", () => {
    expect(addWeeks("2026-11-16", -3)).toBe("2026-10-26");
    expect(addWeeks("2026-11-16", 1)).toBe("2026-11-23");
    // 2026-11-22T17:00Z is already 2026-11-23 in Asia/Shanghai.
    expect(shanghaiToday(new Date("2026-11-22T17:00:00.000Z"))).toBe("2026-11-23");
    expect(shanghaiToday(new Date("2026-11-22T15:59:59.000Z"))).toBe("2026-11-22");
  });

  const noCategories = { currentCategories: new Map<string, number>(), previousCategories: new Map<string, number>() };

  it("includes a team change at the |Δ| >= 3 boundary", () => {
    expect(buildHighlights({
      currentTeams: new Map([["A", 5]]),
      previousTeams: new Map([["A", 2]]),
      ...noCategories,
    })).toEqual([{
      kind: "team_change", team: "A", direction: "up", change: 3, changePct: 1.5, current: 5, previous: 2,
    }]);
  });

  it("drops a team change below three packages and marks declines as down", () => {
    expect(buildHighlights({
      currentTeams: new Map([["A", 4]]),
      previousTeams: new Map([["A", 2]]),
      ...noCategories,
    })).toEqual([]);

    expect(buildHighlights({
      currentTeams: new Map([["A", 1]]),
      previousTeams: new Map([["A", 5]]),
      ...noCategories,
    })).toEqual([{
      kind: "team_change", team: "A", direction: "down", change: -4, changePct: -0.8, current: 1, previous: 5,
    }]);
  });

  it("uses null changePct when last week had zero packages", () => {
    expect(buildHighlights({
      currentTeams: new Map([["A", 3]]),
      previousTeams: new Map(),
      ...noCategories,
    })).toEqual([{
      kind: "team_change", team: "A", direction: "up", change: 3, changePct: null, current: 3, previous: 0,
    }]);
  });

  it("includes a category change at exactly 5pp and excludes 4.9pp", () => {
    expect(buildHighlights({
      currentTeams: new Map(),
      previousTeams: new Map(),
      currentCategories: new Map([["Games", 0.3]]),
      previousCategories: new Map([["Games", 0.25]]),
    })).toEqual([{
      kind: "category_change", category: "Games", direction: "up",
      currentShare: 0.3, previousShare: 0.25, deltaPp: 5,
    }]);

    expect(buildHighlights({
      currentTeams: new Map(),
      previousTeams: new Map(),
      currentCategories: new Map([["Games", 0.299]]),
      previousCategories: new Map([["Games", 0.25]]),
    })).toEqual([]);

    // 4.95pp displays as 5.0pp but must not cross the raw threshold.
    expect(buildHighlights({
      currentTeams: new Map(),
      previousTeams: new Map(),
      currentCategories: new Map([["Games", 0.2995]]),
      previousCategories: new Map([["Games", 0.25]]),
    })).toEqual([]);
  });

  it("ignores unknown categories and returns [] when nothing crosses a threshold", () => {
    expect(buildHighlights({
      currentTeams: new Map([["A", 1]]),
      previousTeams: new Map([["A", 1]]),
      currentCategories: new Map([["unknown", 0.5]]),
      previousCategories: new Map([["unknown", 0]]),
    })).toEqual([]);
  });

  it("orders team change before category change", () => {
    const highlights = buildHighlights({
      currentTeams: new Map([["A", 6]]),
      previousTeams: new Map([["A", 3]]),
      currentCategories: new Map([["Games", 0.2]]),
      previousCategories: new Map([["Games", 0.3]]),
    });
    expect(highlights.map((item) => item.kind)).toEqual(["team_change", "category_change"]);
    expect(highlights[1]).toMatchObject({ category: "Games", direction: "down", deltaPp: -10 });
  });
});

const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

const suffix = randomUUID().slice(0, 8);
const pattern = `test.weekly.${suffix}%`;
// Far-future year keeps fixtures away from real data and other test files.
const RUN_YEAR = 2100 + (Number.parseInt(suffix.slice(0, 4), 16) % 100);
const teamAlpha = `Weekly Alpha ${suffix}`;
const teamBeta = `Weekly Beta ${suffix}`;
const teamGamma = `Weekly Gamma ${suffix}`;

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

const week3 = mondayOf(`${RUN_YEAR}-06-15`);
const week2 = shiftDay(week3, -7);
const week1 = shiftDay(week3, -14);
const week0 = shiftDay(week3, -21);

const code = (name: string) => `test.weekly.${suffix}.${name}`;

function packageRow(
  overrides: Partial<PackageRow> & Pick<PackageRow, "packageCode" | "targetDate" | "team">,
): PackageRow {
  return {
    displayName: "iOS-Weekly",
    firstAdDate: overrides.targetDate,
    listingDate: null,
    first100Date: null,
    offlineDate: null,
    category: null,
    minimumOsVersion: null,
    appVersion: null,
    lookupStatus: "hit",
    enrichStatus: "ok",
    assetStatus: "skipped",
    appStoreJson: {},
    fetchedAt: "2026-11-20T02:00:00.000Z",
    ...overrides,
  };
}

describeDb("weekly report against PostgreSQL", () => {
  let repo: WeeklyReportRepo;
  let writes: CompetitorWriteRepo;

  beforeAll(async () => {
    await runMigrations(pool!);
    writes = createCompetitorRepo(pool!);
    repo = createWeeklyReport(pool!);

    const hit = (
      name: string,
      day: string,
      team: string,
      overrides: Partial<PackageRow>,
    ) => writes.upsertPackage(packageRow({
      packageCode: code(name), targetDate: day, firstAdDate: day, team,
      lookupStatus: "hit", ...overrides,
    }));

    // Selected week: Alpha 6 resolved, Beta 1 resolved, plus three unresolved rows.
    await hit("a1", week3, teamAlpha, {
      category: "Games", minimumOsVersion: "16.0", offlineDate: shiftDay(week3, 5),
      appStoreJson: { iapItems: [{ name: "Coins" }], privacy: { policyUrl: "https://docs.google.com/doc" } },
    });
    await hit("a2", shiftDay(week3, 2), teamAlpha, {
      category: null, minimumOsVersion: "17.2",
      appStoreJson: { iapItems: { not: "array" } },
    });
    await hit("a3", shiftDay(week3, 3), teamAlpha, {
      category: "Games", minimumOsVersion: "18.1",
      appStoreJson: { iapItems: [], privacy: { policyUrl: "https://alpha.example.com/privacy" } },
    });
    await hit("a4", shiftDay(week3, 4), teamAlpha, {
      category: "Utilities", minimumOsVersion: "26.0", appStoreJson: { iapItems: [] },
    });
    await hit("a5", shiftDay(week3, 5), teamAlpha, {
      category: "Utilities", minimumOsVersion: "15.0", offlineDate: shiftDay(week3, 5),
      appStoreJson: { iapItems: [] },
    });
    await hit("a6", shiftDay(week3, 6), teamAlpha, {
      category: "Games", minimumOsVersion: null, appStoreJson: { iapItems: [] },
    });
    await hit("b1", shiftDay(week3, 1), teamBeta, {
      category: "Games", minimumOsVersion: "15.0", appStoreJson: { iapItems: [] },
    });
    await writes.upsertPackage(packageRow({
      packageCode: code("u1"), targetDate: shiftDay(week3, 1), team: teamAlpha,
      firstAdDate: shiftDay(week3, 1), lookupStatus: "bundle_not_found", category: "Leaky",
    }));
    await writes.upsertPackage(packageRow({
      packageCode: code("u2"), targetDate: shiftDay(week3, 2), team: teamAlpha,
      firstAdDate: shiftDay(week3, 2), lookupStatus: "offline", category: "Leaky",
    }));
    await writes.upsertPackage(packageRow({
      packageCode: code("u3"), targetDate: shiftDay(week3, 3), team: teamBeta,
      firstAdDate: shiftDay(week3, 3), lookupStatus: "pending",
    }));

    // Previous week: Alpha 3 hits, Gamma 1 hit (no version records).
    for (const name of ["p1", "p2", "p3"]) {
      await hit(name, week2, teamAlpha, { category: "Games", appStoreJson: {} });
    }
    await hit("g1", week2, teamGamma, { category: "Utilities", appStoreJson: {} });

    // Version histories drive the bucket distribution and all three metrics.
    const versions = (name: string, days: string[]) =>
      writes.upsertVersions(code(name), days.map((day, index) => ({
        version: `${index + 1}.0`, releasedAt: `${day}T00:00:00.000Z`, notes: null,
      })));
    await versions("a1", [shiftDay(week3, -30), shiftDay(week3, -20)]); // gap 10, latest→ad 20
    await versions("a3", [shiftDay(week3, -40), shiftDay(week3, -30), shiftDay(week3, -20), shiftDay(week3, -10)]);
    await versions("a4", [shiftDay(week3, -15), shiftDay(week3, -9), shiftDay(week3, -3)]); // gap 6, latest→ad 3
    await versions("a5", [shiftDay(week3, -2)]); // single release, no gap
    await versions("a6", [shiftDay(week3, -61), shiftDay(week3, -1)]); // gap 60 dropped, latest→ad 1
    await versions("b1", [shiftDay(week3, -5)]); // latest→ad 6
  });

  afterAll(async () => {
    await pool!.query("DELETE FROM competitor_country_hits WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_assets WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_versions WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_snapshots WHERE package_code LIKE $1", [pattern]);
    await pool!.query("DELETE FROM competitor_packages WHERE package_code LIKE $1", [pattern]);
    await pool!.end();
  });

  it("counts resolved-only teams and keeps unresolved rows in ingested totals", async () => {
    const report = await repo.getWeeklyReport(week3);

    expect(report.weekStart).toBe(week3);
    expect(report.weekEnd).toBe(shiftDay(week3, 6));
    // Derived from Asia/Shanghai today, independent of the requested week.
    expect(isoWeekStart(report.latestCompleteWeek)).toBe(report.latestCompleteWeek);
    expect(report.latestCompleteWeek < week3).toBe(true);
    expect(report.summary).toMatchObject({
      resolvedPackages: 7,
      ingestedPackages: 10,
      unresolvedPackages: 3,
      teamCount: 2,
      previousResolvedPackages: 4,
      previousIngestedPackages: 4,
      change: 3,
      changePct: 0.75,
      ingestedChange: 6,
      ingestedChangePct: 1.5,
      resolvedRate: 0.7,
    });
    expect(report.teams.map((team) => [
      team.team, team.rank, team.resolvedPackages, team.previousResolvedPackages, team.change, team.changePct,
    ])).toEqual([
      [teamAlpha, 1, 6, 3, 3, 1],
      [teamBeta, 2, 1, 0, 1, null],
    ]);
    expect(report.teams[0]!.share).toBeCloseTo(6 / 7);
    expect(report.teams[1]!.share).toBeCloseTo(1 / 7);
  });

  it("folds version counts into 1 / 2 / 3 / 4+ / 0 at overall and team level", async () => {
    const report = await repo.getWeeklyReport(week3);

    expect(report.versionCounts.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["1", 2], ["2", 2], ["3", 1], ["4+", 1], ["0", 1],
    ]);
    expect(report.versionCounts[0]!.share).toBeCloseTo(2 / 7);
    expect(report.teams[0]!.versionCounts.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["1", 1], ["2", 2], ["3", 1], ["4+", 1], ["0", 1],
    ]);
    expect(report.teams[1]!.versionCounts.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["1", 1], ["2", 0], ["3", 0], ["4+", 0], ["0", 0],
    ]);
  });

  it("builds team cards with unknown excluded from top buckets", async () => {
    const report = await repo.getWeeklyReport(week3);
    const alpha = report.teams[0]!;
    const beta = report.teams[1]!;

    expect(alpha.topCategories.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["Games", 3], ["Utilities", 2],
    ]);
    expect(alpha.iap).toMatchObject({ yes: 1, no: 5 });
    expect(alpha.iap.yesShare).toBeCloseTo(1 / 6);
    expect(alpha.topIos).toMatchObject({ key: "15", count: 1 });
    expect(alpha.topPrivacies[0]).toMatchObject({ key: "google", count: 1 });
    expect(beta.topPrivacies).toEqual([]);

    expect(report.distributions.category.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["Games", 4], ["Utilities", 2], ["unknown", 1],
    ]);
    expect(report.distributions.ios.map((bucket) => bucket.key)).toEqual([
      "15", "16", "17", "18", "26plus", "unknown",
    ]);
    expect(report.distributions.iap.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["no", 6], ["yes", 1],
    ]);
    expect(report.distributions.privacy.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["google", 1], ["own", 1], ["unknown", 5],
    ]);
  });

  it("computes the three metrics with gap drops and the offline-zero rule", async () => {
    const report = await repo.getWeeklyReport(week3);
    const [gap, latest, offline] = report.trends.metrics;

    expect(gap!.key).toBe("avgVersionGapDays");
    expect(gap!.points.map((point) => [point.weekStart, point.team])).toEqual([[week3, teamAlpha]]);
    expect(gap!.points[0]!.value).toBeCloseTo(26 / 3); // 60-day gap dropped
    expect(gap!.points[0]).toMatchObject({ packageCount: 6, offlineCount: 2 });

    expect(latest!.points.map((point) => [
      point.weekStart, point.team, point.value,
    ])).toEqual([
      [week3, teamAlpha, 10.8],
      [week3, teamBeta, 6],
    ]);

    expect(gap!.overall.map((point) => [point.weekStart, point.value])).toEqual([[week3, 26 / 3]]);
    expect(latest!.overall.map((point) => [point.weekStart, point.value])).toEqual([[week3, 10]]);
    expect(offline!.overall.map((point) => [
      point.weekStart, point.value, point.offlineCount, point.packageCount,
    ])).toEqual([
      [week2, 0, 0, 4],
      [week3, 2.5, 2, 7],
    ]);

    expect(offline!.points.map((point) => [
      point.weekStart, point.team, point.value, point.offlineCount, point.packageCount,
    ])).toEqual([
      [week2, teamAlpha, 0, 0, 3],
      [week2, teamGamma, 0, 0, 1],
      [week3, teamAlpha, 2.5, 2, 6],
      [week3, teamBeta, 0, 0, 1],
    ]);
  });

  it("fills four trend weeks, including empty weeks as insufficient", async () => {
    const report = await repo.getWeeklyReport(week3);

    expect(report.trends.weeks).toEqual([
      { weekStart: week0, weekEnd: shiftDay(week0, 6), resolvedPackages: 0, ingestedPackages: 0, dataSufficient: false },
      { weekStart: week1, weekEnd: shiftDay(week1, 6), resolvedPackages: 0, ingestedPackages: 0, dataSufficient: false },
      { weekStart: week2, weekEnd: shiftDay(week2, 6), resolvedPackages: 4, ingestedPackages: 4, dataSufficient: true },
      { weekStart: week3, weekEnd: shiftDay(week3, 6), resolvedPackages: 7, ingestedPackages: 10, dataSufficient: true },
    ]);
  });

  it("derives IAP share, mean versions and weekly Top distributions", async () => {
    const report = await repo.getWeeklyReport(week3);

    expect(report.trends.iapShare).toEqual([
      { weekStart: week2, iapPackages: 0, resolvedPackages: 4, share: 0 },
      { weekStart: week3, iapPackages: 1, resolvedPackages: 7, share: 1 / 7 },
    ]);
    // Only week3 has version records; no-version packages leave the denominator.
    expect(report.trends.avgVersions).toEqual([
      { weekStart: week3, versionedPackages: 6, totalVersions: 13, value: 13 / 6 },
    ]);

    expect(report.trends.categoryWeeks.map((week) => [week.weekStart, week.resolvedPackages]))
      .toEqual([[week2, 4], [week3, 7]]);
    expect(report.trends.categoryWeeks[1]!.buckets.map((bucket) => [bucket.key, bucket.count]))
      .toEqual([["Games", 4], ["Utilities", 2], ["unknown", 1]]);

    expect(report.trends.privacyWeeks.map((week) => week.weekStart)).toEqual([week2, week3]);
    const privacy = new Map(
      report.trends.privacyWeeks[1]!.buckets.map((bucket) => [bucket.key, bucket.count]),
    );
    expect(privacy.get("own")).toBe(1);
    expect(privacy.get("google")).toBe(1);
    expect(privacy.get("unknown")).toBe(5);
  });

  it("builds highlights from team and category changes", async () => {
    const report = await repo.getWeeklyReport(week3);

    expect(report.highlights).toHaveLength(2);
    expect(report.highlights[0]).toEqual({
      kind: "team_change", team: teamAlpha, direction: "up",
      change: 3, changePct: 1, current: 6, previous: 3,
    });
    expect(report.highlights[1]).toMatchObject({
      kind: "category_change", category: "Games", direction: "down", deltaPp: -17.9,
    });
  });

  it("returns a complete empty structure for a week without data", async () => {
    const report = await repo.getWeeklyReport(week1);

    expect(report.summary).toMatchObject({
      resolvedPackages: 0, ingestedPackages: 0, unresolvedPackages: 0, teamCount: 0, resolvedRate: 0,
    });
    expect(report.teams).toEqual([]);
    expect(report.highlights).toEqual([]);
    expect(report.versionCounts.every((bucket) => bucket.count === 0)).toBe(true);
    expect(report.trends.weeks).toHaveLength(4);
    expect(report.trends.weeks.every((week) => !week.dataSufficient)).toBe(true);
    expect(report.distributions.category).toEqual([]);
    expect(report.distributions.iap.map((bucket) => [bucket.key, bucket.count])).toEqual([["yes", 0], ["no", 0]]);
  });

  it("returns Monday week starts strictly before the current week", async () => {
    // The query is global, so another test file's fixtures may win; assert the
    // boundary contract (Monday start, strictly before the current week) instead
    // of a database-wide latest value.
    const latest = await repo.latestCompleteDataWeek(shiftDay(week3, 7));
    expect(latest).not.toBeNull();
    expect(isoWeekStart(latest!)).toBe(latest);
    expect(latest! < shiftDay(week3, 7)).toBe(true);

    const beforeSelected = await repo.latestCompleteDataWeek(week3);
    expect(beforeSelected).not.toBeNull();
    expect(isoWeekStart(beforeSelected!)).toBe(beforeSelected);
    expect(beforeSelected! < week3).toBe(true);
  });
});
