import type { FastifyInstance } from "fastify";
import type { DateKind, GroupBy } from "../../shared/competitorTypes";
import type { CompetitorQueryRepo } from "../lib/competitorRepo";
import { addWeeks, isoWeekStart, shanghaiToday, type WeeklyReportRepo } from "../lib/weeklyReport";
import type { AppDependencies } from "../app";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PACKAGE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const ATTRIBUTION_PATTERN = /^[\x20-\x7E]{1,64}$/;
const PERMISSION_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,63}UsageDescription$/;
const MAX_SUMMARY_RANGE_DAYS = 31;
const MAX_ANALYSIS_UPDATES = 500;
const MAX_PERMISSIONS_PER_PACKAGE = 100;

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

type Query = Record<string, unknown>;

export function registerCompetitorRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.addHook("onRequest", async (request, reply) => {
    if (deps.competitorRepo) return;
    const url = request.raw.url ?? "";
    if (url === "/api/competitor" || url.startsWith("/api/competitor/") || url.startsWith("/api/competitor?")) {
      return reply.code(503).send({ message: "Competitor data is unavailable" });
    }
  });

  if (!deps.competitorRepo) return;
  const repo: CompetitorQueryRepo = deps.competitorRepo;

  app.get("/api/competitor/weekly-report", async (request, reply) => {
    const weekly: WeeklyReportRepo | undefined = deps.weeklyReport;
    if (!weekly) return reply.code(503).send({ message: "Competitor data is unavailable" });

    const query = request.query as Query;
    let weekStart: string;
    if (query.week !== undefined) {
      const week = dateParam(query.week);
      if (!week) return reply.code(400).send({ message: "A valid week is required" });
      weekStart = isoWeekStart(week);
    } else {
      try {
        const today = shanghaiToday();
        const latest = await weekly.latestCompleteDataWeek(today);
        // No hit data before this week → fall back to the last complete week (empty state).
        weekStart = latest ?? addWeeks(isoWeekStart(today), -1);
      } catch {
        return reply.code(500).send({ message: "Competitor query failed" });
      }
    }

    try {
      return reply.send(await weekly.getWeeklyReport(weekStart));
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/days", async (request, reply) => {
    const query = request.query as Query;
    const start = dateParam(query.start);
    const end = dateParam(query.end);
    if (!start || !end || start > end) {
      return reply.code(400).send({ message: "Valid start and end dates are required" });
    }
    try {
      return reply.send({ days: await repo.listDays(start, end) });
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/summary", async (request, reply) => {
    const query = request.query as Query;
    const isRange = query.from !== undefined || query.to !== undefined;
    const date = dateParam(query.date);
    const from = dateParam(query.from);
    const to = dateParam(query.to);
    const dateKind = dateKindParam(query.date_kind);
    const groupBy = groupByParam(query.group_by);
    if (isRange) {
      if (query.date !== undefined) {
        return reply.code(400).send({ message: "Pass either date or from/to, not both" });
      }
      if (!from || !to) return reply.code(400).send({ message: "Valid from and to dates are required" });
      if (from > to) return reply.code(400).send({ message: "from must not be after to" });
      if (inclusiveDays(from, to) > MAX_SUMMARY_RANGE_DAYS) {
        return reply.code(400).send({ message: `Date range must not exceed ${MAX_SUMMARY_RANGE_DAYS} days` });
      }
    } else if (!date) {
      return reply.code(400).send({ message: "A valid date is required" });
    }
    if (!dateKind) return reply.code(400).send({ message: "Unsupported date_kind" });
    if (!groupBy) return reply.code(400).send({ message: "Unsupported group_by" });
    try {
      const groups = isRange
        ? await repo.getSummary(to!, dateKind, groupBy, from!)
        : await repo.getSummary(date!, dateKind, groupBy);
      return reply.send({
        date: isRange ? to! : date!,
        ...(isRange ? { from: from!, to: to! } : {}),
        dateKind,
        groupBy,
        pendingCount: groups.reduce((total, group) => total + group.pendingCount, 0),
        groups,
      });
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/day/:date", async (request, reply) => {
    const { date: rawDate } = request.params as { date: string };
    const date = dateParam(rawDate);
    const dateKind = dateKindParam((request.query as Query).date_kind);
    if (!date) return reply.code(400).send({ message: "A valid date is required" });
    if (!dateKind) return reply.code(400).send({ message: "Unsupported date_kind" });
    try {
      const day = await repo.getDay(date, dateKind);
      if (!day) return reply.code(404).send({ message: "No competitor data for this date" });
      return reply.send(day);
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/batch/:date", async (request, reply) => {
    const date = dateParam((request.params as { date: string }).date);
    if (!date) return reply.code(400).send({ message: "A valid date is required" });
    try {
      const batch = await repo.getBatch(date);
      if (!batch) return reply.code(404).send({ message: "No batch for this date" });
      return reply.send(batch);
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/package/:packageCode/history", async (request, reply) => {
    const { packageCode } = request.params as { packageCode: string };
    if (!PACKAGE_CODE_PATTERN.test(packageCode)) {
      return reply.code(400).send({ message: "A valid package code is required" });
    }
    const query = request.query as Query;
    const from = dateParam(query.from);
    const to = dateParam(query.to);
    if (!from || !to || from > to) {
      return reply.code(400).send({ message: "Valid from and to dates are required" });
    }
    try {
      return reply.send({
        packageCode,
        snapshots: await repo.getPackageHistory(packageCode, from, to),
      });
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.get("/api/competitor/package/:packageCode/country-hits", async (request, reply) => {
    const { packageCode } = request.params as { packageCode: string };
    if (!PACKAGE_CODE_PATTERN.test(packageCode)) {
      return reply.code(400).send({ message: "A valid package code is required" });
    }
    try {
      return reply.send({ packageCode, hits: await repo.getCountryHits(packageCode) });
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });

  app.post("/api/competitor/attribution", async (request, reply) => {
    const writer = deps.competitorWriter;
    if (!writer) return reply.code(503).send({ message: "Competitor data is unavailable" });

    const body = request.body;
    const rawUpdates = typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as { updates?: unknown }).updates
      : undefined;
    if (!Array.isArray(rawUpdates) || rawUpdates.length === 0 || rawUpdates.length > MAX_ANALYSIS_UPDATES) {
      return reply.code(400).send({
        message: `updates must be an array of 1..${MAX_ANALYSIS_UPDATES} entries`,
      });
    }

    // Last write per code wins, matching the repo's update semantics.
    const updates = new Map<string, string | null>();
    for (const entry of rawUpdates) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return reply.code(400).send({ message: "Every update needs packageCode and attribution" });
      }
      const { packageCode, attribution } = entry as { packageCode?: unknown; attribution?: unknown };
      if (typeof packageCode !== "string" || !PACKAGE_CODE_PATTERN.test(packageCode)) {
        return reply.code(400).send({ message: "A valid package code is required" });
      }
      if (attribution !== null && typeof attribution !== "string") {
        return reply.code(400).send({ message: "attribution must be a string or null" });
      }
      const normalized = typeof attribution === "string" ? attribution.trim().toLowerCase() : null;
      if (normalized !== null && !ATTRIBUTION_PATTERN.test(normalized)) {
        return reply.code(400).send({ message: "attribution must be 1..64 printable characters" });
      }
      updates.set(packageCode, normalized);
    }

    try {
      const matched = await writer.updateAttribution(
        [...updates].map(([packageCode, attribution]) => ({ packageCode, attribution })),
      );
      const matchedSet = new Set(matched);
      return reply.send({
        updated: matched,
        missing: [...updates.keys()].filter((packageCode) => !matchedSet.has(packageCode)),
      });
    } catch {
      return reply.code(500).send({ message: "Competitor update failed" });
    }
  });

  app.post("/api/competitor/permissions", async (request, reply) => {
    const writer = deps.competitorWriter;
    if (!writer) return reply.code(503).send({ message: "Competitor data is unavailable" });

    const body = request.body;
    const rawUpdates = typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as { updates?: unknown }).updates
      : undefined;
    if (!Array.isArray(rawUpdates) || rawUpdates.length === 0 || rawUpdates.length > MAX_ANALYSIS_UPDATES) {
      return reply.code(400).send({
        message: `updates must be an array of 1..${MAX_ANALYSIS_UPDATES} entries`,
      });
    }

    // Last write per code wins, matching the repo's update semantics.
    const updates = new Map<string, string[] | null>();
    for (const entry of rawUpdates) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return reply.code(400).send({ message: "Every update needs packageCode and permissions" });
      }
      const { packageCode, permissions } = entry as { packageCode?: unknown; permissions?: unknown };
      if (typeof packageCode !== "string" || !PACKAGE_CODE_PATTERN.test(packageCode)) {
        return reply.code(400).send({ message: "A valid package code is required" });
      }
      if (permissions !== null && !Array.isArray(permissions)) {
        return reply.code(400).send({ message: "permissions must be an array of plist keys or null" });
      }
      let normalized: string[] | null = null;
      if (permissions !== null) {
        if (permissions.length > MAX_PERMISSIONS_PER_PACKAGE) {
          return reply.code(400).send({
            message: `permissions must contain at most ${MAX_PERMISSIONS_PER_PACKAGE} keys`,
          });
        }
        const keys: string[] = [];
        for (const key of permissions) {
          if (typeof key !== "string" || !PERMISSION_PATTERN.test(key)) {
            return reply.code(400).send({
              message: "permissions keys must be NS*UsageDescription identifiers",
            });
          }
          if (!keys.includes(key)) keys.push(key);
        }
        normalized = keys.sort();
      }
      updates.set(packageCode, normalized);
    }

    try {
      const matched = await writer.updatePermissions(
        [...updates].map(([packageCode, permissions]) => ({ packageCode, permissions })),
      );
      const matchedSet = new Set(matched);
      return reply.send({
        updated: matched,
        missing: [...updates.keys()].filter((packageCode) => !matchedSet.has(packageCode)),
      });
    } catch {
      return reply.code(500).send({ message: "Competitor update failed" });
    }
  });

  app.get("/api/competitor/package/:packageCode", async (request, reply) => {
    const { packageCode } = request.params as { packageCode: string };
    if (!PACKAGE_CODE_PATTERN.test(packageCode)) {
      return reply.code(400).send({ message: "A valid package code is required" });
    }
    try {
      const pkg = await repo.getPackage(packageCode);
      if (!pkg) return reply.code(404).send({ message: "Package not found" });
      return reply.send(pkg);
    } catch {
      return reply.code(500).send({ message: "Competitor query failed" });
    }
  });
}
