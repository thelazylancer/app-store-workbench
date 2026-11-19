import express from "express";
import type { DateKind, GroupBy } from "../../shared/competitorTypes";
import type { CompetitorQueryRepo } from "./competitorRepo";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PACKAGE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const MAX_SUMMARY_RANGE_DAYS = 31;

function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

function dateParam(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function dateKindParam(value: unknown): DateKind | null {
  if (value === undefined) return "first_ad";
  if (value === "first_ad" || value === "listing") return value;
  return null;
}

function groupByParam(value: unknown): GroupBy | null {
  if (value === undefined) return "team";
  if (value === "team" || value === "category" || value === "ios_version") return value;
  return null;
}

export function createCompetitorRouter(repo: CompetitorQueryRepo): express.Router {
  const router = express.Router();

  router.get("/days", async (req, res) => {
    const start = dateParam(req.query.start);
    const end = dateParam(req.query.end);
    if (!start || !end || start > end) {
      return res.status(400).json({ message: "Valid start and end dates are required" });
    }
    try {
      return res.json({ days: await repo.listDays(start, end) });
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  router.get("/summary", async (req, res) => {
    const isRange = req.query.from !== undefined || req.query.to !== undefined;
    const date = dateParam(req.query.date);
    const from = dateParam(req.query.from);
    const to = dateParam(req.query.to);
    const dateKind = dateKindParam(req.query.date_kind);
    const groupBy = groupByParam(req.query.group_by);
    if (isRange) {
      if (req.query.date !== undefined) {
        return res.status(400).json({ message: "Pass either date or from/to, not both" });
      }
      if (!from || !to) return res.status(400).json({ message: "Valid from and to dates are required" });
      if (from > to) return res.status(400).json({ message: "from must not be after to" });
      if (inclusiveDays(from, to) > MAX_SUMMARY_RANGE_DAYS) {
        return res.status(400).json({ message: `Date range must not exceed ${MAX_SUMMARY_RANGE_DAYS} days` });
      }
    } else if (!date) {
      return res.status(400).json({ message: "A valid date is required" });
    }
    if (!dateKind) return res.status(400).json({ message: "Unsupported date_kind" });
    if (!groupBy) return res.status(400).json({ message: "Unsupported group_by" });
    try {
      const groups = isRange
        ? await repo.getSummary(to!, dateKind, groupBy, from!)
        : await repo.getSummary(date!, dateKind, groupBy);
      return res.json({
        date: isRange ? to! : date!,
        ...(isRange ? { from: from!, to: to! } : {}),
        dateKind,
        groupBy,
        pendingCount: groups.reduce((total, group) => total + group.pendingCount, 0),
        groups,
      });
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  router.get("/day/:date", async (req, res) => {
    const date = dateParam(req.params.date);
    const dateKind = dateKindParam(req.query.date_kind);
    if (!date) return res.status(400).json({ message: "A valid date is required" });
    if (!dateKind) return res.status(400).json({ message: "Unsupported date_kind" });
    try {
      const day = await repo.getDay(date, dateKind);
      if (!day) return res.status(404).json({ message: "No competitor data for this date" });
      return res.json(day);
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  router.get("/batch/:date", async (req, res) => {
    const date = dateParam(req.params.date);
    if (!date) return res.status(400).json({ message: "A valid date is required" });
    try {
      const batch = await repo.getBatch(date);
      if (!batch) return res.status(404).json({ message: "No batch for this date" });
      return res.json(batch);
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  router.get("/package/:packageCode/history", async (req, res) => {
    const packageCode = req.params.packageCode;
    if (!PACKAGE_CODE_PATTERN.test(packageCode)) {
      return res.status(400).json({ message: "A valid package code is required" });
    }
    const from = dateParam(req.query.from);
    const to = dateParam(req.query.to);
    if (!from || !to || from > to) {
      return res.status(400).json({ message: "Valid from and to dates are required" });
    }
    try {
      return res.json({
        packageCode,
        snapshots: await repo.getPackageHistory(packageCode, from, to),
      });
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  router.get("/package/:packageCode", async (req, res) => {
    const packageCode = req.params.packageCode;
    if (!PACKAGE_CODE_PATTERN.test(packageCode)) {
      return res.status(400).json({ message: "A valid package code is required" });
    }
    try {
      const pkg = await repo.getPackage(packageCode);
      if (!pkg) return res.status(404).json({ message: "Package not found" });
      return res.json(pkg);
    } catch {
      return res.status(500).json({ message: "Competitor query failed" });
    }
  });

  return router;
}
