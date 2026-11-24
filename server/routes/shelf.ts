import type { FastifyInstance } from "fastify";
import type { ShelfGroupBy } from "../../shared/shelfTypes";
import type { ShelfQueryRepo } from "../lib/shelfQueries";
import type { AppDependencies } from "../app";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHELF_PREFIX = "/api/public/shelf";
const MAX_RANGE_DAYS = 366;
const MAX_TEAM_LENGTH = 255;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type Query = Record<string, unknown>;

function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

function dateParam(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function groupByParam(value: unknown): ShelfGroupBy | null {
  if (value === undefined) return "category";
  if (value === "category" || value === "ios_version" || value === "iap" || value === "privacy") return value;
  return null;
}

function teamParam(value: unknown): { ok: true; team: string | null } | { ok: false } {
  if (value === undefined || value === "") return { ok: true, team: null };
  if (typeof value !== "string" || value.length > MAX_TEAM_LENGTH) return { ok: false };
  return { ok: true, team: value };
}

function limitParam(value: unknown): number | null {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const limit = Number(value);
  return limit >= 1 && limit <= MAX_LIMIT ? limit : null;
}

function isShelfUrl(url: string): boolean {
  return url === SHELF_PREFIX || url.startsWith(`${SHELF_PREFIX}/`) || url.startsWith(`${SHELF_PREFIX}?`);
}

export function registerShelfRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.addHook("onRequest", async (request, reply) => {
    if (deps.shelfQueries) return;
    if (isShelfUrl(request.raw.url ?? "")) {
      return reply.code(503).send({ message: "Shelf data is unavailable" });
    }
  });

  if (!deps.shelfQueries) return;
  const repo: ShelfQueryRepo = deps.shelfQueries;

  app.get(`${SHELF_PREFIX}/trend`, async (request, reply) => {
    const query = request.query as Query;
    const from = dateParam(query.from);
    const to = dateParam(query.to);
    if (!from || !to) {
      return reply.code(400).send({ message: "Valid from and to dates are required" });
    }
    if (from > to) return reply.code(400).send({ message: "from must not be after to" });
    if (inclusiveDays(from, to) > MAX_RANGE_DAYS) {
      return reply.code(400).send({ message: "Date range must not exceed 366 days" });
    }
    const groupBy = groupByParam(query.group_by);
    if (!groupBy) return reply.code(400).send({ message: "Unsupported group_by" });
    const team = teamParam(query.team);
    if (!team.ok) return reply.code(400).send({ message: "Unsupported team" });

    try {
      return reply.send(await repo.getShelfTrend({ from, to, team: team.team, groupBy }));
    } catch {
      return reply.code(500).send({ message: "Shelf query failed" });
    }
  });

  app.get(`${SHELF_PREFIX}/packages`, async (request, reply) => {
    const query = request.query as Query;
    const from = dateParam(query.from);
    const to = dateParam(query.to);
    if (!from || !to) {
      return reply.code(400).send({ message: "Valid from and to dates are required" });
    }
    if (from > to) return reply.code(400).send({ message: "from must not be after to" });
    if (inclusiveDays(from, to) > MAX_RANGE_DAYS) {
      return reply.code(400).send({ message: "Date range must not exceed 366 days" });
    }
    const team = teamParam(query.team);
    if (!team.ok) return reply.code(400).send({ message: "Unsupported team" });
    const limit = limitParam(query.limit);
    if (!limit) return reply.code(400).send({ message: "limit must be an integer between 1 and 500" });

    try {
      return reply.send(await repo.getShelfPackages({ from, to, team: team.team, limit }));
    } catch {
      return reply.code(500).send({ message: "Shelf query failed" });
    }
  });
}
