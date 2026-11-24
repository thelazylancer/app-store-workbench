import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../server/lib/db";
import {
  addWeeks, createWeeklyReport, isoWeekStart, shanghaiToday,
} from "../../server/lib/weeklyReport";
import type { WeeklyReportRepo } from "../../server/lib/weeklyReport";
import { openTestPool } from "./dbTestUtils";

// Extra contract coverage not exercised by weeklyReport.test.ts: repo-level
// week normalization, latestCompleteWeek being request-independent, and the
// full empty shape. No fixtures are written; skips without PostgreSQL.
const pool = await openTestPool();
const describeDb = pool ? describe : describe.skip;

describeDb("weekly report edge contract against PostgreSQL", () => {
  let repo: WeeklyReportRepo;

  beforeAll(async () => {
    await runMigrations(pool!);
    repo = createWeeklyReport(pool!);
  });

  afterAll(async () => {
    await pool!.end();
  });

  it("normalizes Sunday and cross-year requests to their ISO Monday", async () => {
    const sunday = await repo.getWeeklyReport("2026-11-22");
    expect([sunday.weekStart, sunday.weekEnd]).toEqual(["2026-11-16", "2026-11-22"]);

    const crossYear = await repo.getWeeklyReport("2025-01-01");
    expect(crossYear.weekStart).toBe("2024-12-30");
    expect(crossYear.weekEnd).toBe("2025-01-05");
    expect(crossYear.trends.weeks.map((week) => week.weekStart)).toEqual([
      "2024-12-09", "2024-12-16", "2024-12-23", "2024-12-30",
    ]);
  });

  it("keeps latestCompleteWeek constant across requested weeks", async () => {
    // Allow either side of the Asia/Shanghai midnight boundary in case the
    // suite happens to run across it.
    const before = addWeeks(isoWeekStart(shanghaiToday()), -1);
    const reports = await Promise.all([
      repo.getWeeklyReport("2026-11-16"),
      repo.getWeeklyReport("2025-01-01"),
      repo.getWeeklyReport("2099-01-05"),
    ]);
    const after = addWeeks(isoWeekStart(shanghaiToday()), -1);
    const allowed = new Set([before, after]);

    for (const report of reports) {
      expect(allowed.has(report.latestCompleteWeek), report.latestCompleteWeek).toBe(true);
      expect(isoWeekStart(report.latestCompleteWeek)).toBe(report.latestCompleteWeek);
    }
    expect(new Set(reports.map((report) => report.latestCompleteWeek)).size).toBe(1);
  });

  it("returns a complete empty shape for a future week", async () => {
    const report = await repo.getWeeklyReport("2099-01-05");

    expect(report.summary).toMatchObject({
      resolvedPackages: 0, ingestedPackages: 0, unresolvedPackages: 0,
      teamCount: 0, resolvedRate: 0, changePct: null,
    });
    expect(report.teams).toEqual([]);
    expect(report.highlights).toEqual([]);
    expect(report.versionCounts.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["1", 0], ["2", 0], ["3", 0], ["4+", 0], ["0", 0],
    ]);
    expect(report.distributions.category).toEqual([]);
    expect(report.distributions.ios).toEqual([]);
    expect(report.distributions.privacy).toEqual([]);
    expect(report.distributions.iap.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["yes", 0], ["no", 0],
    ]);
    expect(report.trends.weeks).toHaveLength(4);
    expect(report.trends.weeks.every((week) => !week.dataSufficient && week.resolvedPackages === 0)).toBe(true);
    expect(report.trends.metrics.map((series) => [series.key, series.points.length])).toEqual([
      ["avgVersionGapDays", 0], ["avgLatestVersionToAdDays", 0], ["avgAdToOfflineDays", 0],
    ]);
  });
});
