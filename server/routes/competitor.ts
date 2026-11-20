import type { FastifyInstance } from "fastify";
import type { DateKind, GroupBy } from "../../shared/competitorTypes";
import type { CompetitorQueryRepo } from "../lib/competitorRepo";
import type { AppDependencies } from "../app";

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
