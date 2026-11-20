import type { Pool } from "pg";
import type {
  AssetRow,
  BatchRow,
  BatchStatus,
  DateKind,
  DayDetail,
  DaySummary,
  EnrichStatus,
  GroupBy,
  LookupStatus,
  PackageBrief,
  PackageDetail,
  PackageRow,
  SnapshotEntry,
  SummaryCompetitor,
  SummaryGroup,
  VersionEntry,
} from "../../../shared/competitorTypes";
import {
  PACKAGE_SELECT,
  appleIdFrom,
  batchFromRow,
  groupKeyFor,
  jsonObject,
  packageBrief,
  shiftDay,
  text,
  toPackageBase,
  withAssets,
} from "./rowMap";
import type { PackageRowResult } from "./rowMap";

export type CompetitorQueryRepo = {
  listDays(start: string, end: string): Promise<DaySummary[]>;
  getDay(date: string, dateKind: DateKind): Promise<DayDetail | null>;
  getPackage(packageCode: string): Promise<PackageDetail | null>;
  getPackageHistory(packageCode: string, from: string, to: string): Promise<SnapshotEntry[]>;
  /** With `from`, aggregates packages from `from` through `date`; without it, only `date`. */
  getSummary(date: string, dateKind: DateKind, groupBy: GroupBy, from?: string): Promise<SummaryGroup[]>;
  getBatch(date: string): Promise<BatchRow | null>;
};

type Queryable = Pick<Pool, "query">;

async function assetsByPackage(
  queryable: Queryable,
  packageCodes: string[],
): Promise<Map<string, AssetRow[]>> {
  const result = new Map<string, AssetRow[]>();
  if (packageCodes.length === 0) return result;

  const { rows } = await queryable.query<{
    package_code: string;
    type: AssetRow["type"];
    source_url: string;
    local_path: string;
  }>(
    `SELECT package_code, type, source_url, local_path
       FROM competitor_assets
      WHERE package_code = ANY($1::text[])
      ORDER BY package_code, type, local_path`,
    [packageCodes],
  );

  for (const row of rows) {
    const list = result.get(row.package_code) ?? [];
    list.push({ type: row.type, sourceUrl: row.source_url, localPath: row.local_path });
    result.set(row.package_code, list);
  }
  return result;
}

type PackageRangeRow = PackageRowResult & { day_date: string };

export function createCompetitorQueries(pool: Pool): CompetitorQueryRepo {
  const dateColumn = (dateKind: DateKind) => dateKind === "listing" ? "listing_date" : "first_ad_date";

  async function selectPackagesByDate(date: string, dateKind: DateKind) {
    const { rows } = await pool.query<PackageRowResult>(
      `SELECT ${PACKAGE_SELECT}
         FROM competitor_packages
        WHERE ${dateColumn(dateKind)} = $1::date
        ORDER BY display_name, package_code`,
      [date],
    );
    return rows;
  }

  async function selectPackagesInRange(start: string, end: string, dateKind: DateKind) {
    const column = dateColumn(dateKind);
    const { rows } = await pool.query<PackageRangeRow>(
      `SELECT to_char(${column}, 'YYYY-MM-DD') AS day_date, ${PACKAGE_SELECT}
         FROM competitor_packages
        WHERE ${column} BETWEEN $1::date AND $2::date`,
      [start, end],
    );
    return rows;
  }

  const queries: CompetitorQueryRepo = {
    async listDays(start, end) {
      const { rows } = await pool.query<{
        date: string;
        package_count: number;
        hit_count: number;
        miss_count: number;
        batch_status: BatchStatus | null;
      }>(
        `WITH dates AS (
           SELECT target_date FROM competitor_batches
            WHERE target_date BETWEEN $1::date AND $2::date
           UNION
           SELECT target_date FROM competitor_packages
            WHERE target_date BETWEEN $1::date AND $2::date
         )
         SELECT
           to_char(d.target_date, 'YYYY-MM-DD') AS date,
           (SELECT count(*)::int FROM competitor_packages p
             WHERE p.target_date = d.target_date) AS package_count,
           (SELECT count(*)::int FROM competitor_packages p
             WHERE p.target_date = d.target_date AND p.lookup_status = 'hit') AS hit_count,
           (SELECT count(*)::int FROM competitor_packages p
             WHERE p.target_date = d.target_date AND p.lookup_status = 'bundle_not_found') AS miss_count,
           b.status AS batch_status
         FROM dates d
         LEFT JOIN competitor_batches b ON b.target_date = d.target_date
         ORDER BY d.target_date DESC`,
        [start, end],
      );

      return rows.map((row) => ({
        date: row.date,
        packageCount: row.package_count,
        hitCount: row.hit_count,
        missCount: row.miss_count,
        batchStatus: row.batch_status,
      }));
    },

    async getDay(date, dateKind) {
      const rows = await selectPackagesByDate(date, dateKind);
      const batch = await queries.getBatch(date);
      if (!batch && rows.length === 0) return null;

      const assets = await assetsByPackage(pool, rows.map((row) => row.package_code));
      return {
        date,
        dateKind,
        batch,
        packages: rows.map((row) => {
          const base = toPackageBase(row);
          return withAssets(base, assets.get(base.packageCode) ?? []);
        }),
      };
    },

    async getSummary(end, dateKind, groupBy, from) {
      const timelineStart = from ?? shiftDay(end, -6);
      const rangeRows = from === undefined ? null : await selectPackagesInRange(from, end, dateKind);
      const rows = rangeRows ?? await selectPackagesByDate(end, dateKind);
      const assets = await assetsByPackage(pool, rows.map((row) => row.package_code));

      type Accumulator = {
        groupKey: string;
        packageCount: number;
        hitCount: number;
        missCount: number;
        pendingCount: number;
        competitors: Map<string, SummaryCompetitor>;
        missed: PackageBrief[];
        pending: PackageBrief[];
      };
      const groups = new Map<string, Accumulator>();

      for (const row of rows) {
        const key = groupKeyFor(row, groupBy);
        let group = groups.get(key);
        if (!group) {
          group = {
            groupKey: key,
            packageCount: 0,
            hitCount: 0,
            missCount: 0,
            pendingCount: 0,
            competitors: new Map(),
            missed: [],
            pending: [],
          };
          groups.set(key, group);
        }
        group.packageCount += 1;
        const brief = packageBrief(row, assets.get(row.package_code) ?? []);

        if (row.lookup_status === "bundle_not_found") {
          group.missCount += 1;
          group.missed.push(brief);
          continue;
        }
        if (row.lookup_status !== "hit") {
          if (row.lookup_status === "pending") {
            group.pendingCount += 1;
            group.pending.push(brief);
          }
          continue;
        }

        group.hitCount += 1;
        const base = toPackageBase(row);
        const appleId = appleIdFrom(base.appStoreJson);
        const realName = base.appStoreJson.name;
        const name = typeof realName === "string" && realName.trim() ? realName : base.displayName;
        const competitorKey = appleId === null ? `name:${name}` : `apple:${appleId}`;
        let competitor = group.competitors.get(competitorKey);
        if (!competitor) {
          competitor = { appleId, name, packageCount: 0, packages: [] };
          group.competitors.set(competitorKey, competitor);
        }
        competitor.packageCount += 1;
        competitor.packages.push(brief);
      }

      const counts = new Map<string, { packageCount: number; hitCount: number; missCount: number }>();
      const timelineRows = rangeRows ?? await selectPackagesInRange(timelineStart, end, dateKind);
      for (const row of timelineRows) {
        const key = `${row.day_date}|${groupKeyFor(row, groupBy)}`;
        const point = counts.get(key) ?? { packageCount: 0, hitCount: 0, missCount: 0 };
        point.packageCount += 1;
        if (row.lookup_status === "hit") point.hitCount += 1;
        if (row.lookup_status === "bundle_not_found") point.missCount += 1;
        counts.set(key, point);
      }

      const { rows: batchRows } = await pool.query<{ day_date: string; status: BatchStatus }>(
        `SELECT to_char(target_date, 'YYYY-MM-DD') AS day_date, status
           FROM competitor_batches
          WHERE target_date BETWEEN $1::date AND $2::date`,
        [timelineStart, end],
      );
      const batchStatusByDate = new Map(batchRows.map((row) => [row.day_date, row.status]));

      return [...groups.values()]
        .sort((left, right) => right.packageCount - left.packageCount || left.groupKey.localeCompare(right.groupKey))
        .map((group): SummaryGroup => {
          const competitors = [...group.competitors.values()]
            .map((competitor) => ({
              ...competitor,
              packages: competitor.packages.sort((a, b) => a.packageCode.localeCompare(b.packageCode)),
            }))
            .sort((left, right) => left.name.localeCompare(right.name));
          const missedPackages = group.missed.sort((a, b) => a.packageCode.localeCompare(b.packageCode));
          const pendingPackages = group.pending.sort((a, b) => a.packageCode.localeCompare(b.packageCode));
          const dayCount = Math.round(
            (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${timelineStart}T00:00:00Z`)) / 86_400_000,
          ) + 1;
          const timeline = Array.from({ length: dayCount }, (_, index) => shiftDay(timelineStart, index)).map((day) => {
            const point = counts.get(`${day}|${group.groupKey}`)
              ?? { packageCount: 0, hitCount: 0, missCount: 0 };
            return {
              date: day,
              packageCount: point.packageCount,
              hitCount: point.hitCount,
              missCount: point.missCount,
              batchStatus: batchStatusByDate.get(day) ?? null,
            };
          });

          return {
            groupKey: group.groupKey,
            packageCount: group.packageCount,
            hitCount: group.hitCount,
            missCount: group.missCount,
            pendingCount: group.pendingCount,
            competitorCount: competitors.length,
            competitors,
            missedPackages,
            pendingPackages,
            timeline,
          };
        });
    },

    async getPackage(packageCode) {
      const { rows } = await pool.query<PackageRowResult>(
        `SELECT ${PACKAGE_SELECT} FROM competitor_packages WHERE package_code = $1`,
        [packageCode],
      );
      const row = rows[0];
      if (!row) return null;

      const base = toPackageBase(row);
      const assets = await assetsByPackage(pool, [packageCode]);
      const versions = await pool.query<{
        version: string;
        released_at: unknown;
        notes: string | null;
        captured_at: unknown;
      }>(
        `SELECT version, released_at, notes, captured_at
           FROM competitor_versions
          WHERE package_code = $1
          ORDER BY released_at DESC, version DESC`,
        [packageCode],
      );

      return {
        ...withAssets(base, assets.get(packageCode) ?? []),
        versions: versions.rows.map((entry): VersionEntry => ({
          version: entry.version,
          releasedAt: text(entry.released_at),
          notes: entry.notes,
          capturedAt: text(entry.captured_at),
        })),
      };
    },

    async getPackageHistory(packageCode, from, to) {
      const { rows } = await pool.query<{
        target_date: string;
        team: string;
        lookup_status: LookupStatus;
        enrich_status: EnrichStatus;
        asset_status: PackageRow["assetStatus"];
        category: string | null;
        minimum_os_version: string | null;
        app_version: string | null;
        app_store_json: unknown;
        fetched_at: unknown;
      }>(
        `SELECT to_char(target_date, 'YYYY-MM-DD') AS target_date,
                team, lookup_status, enrich_status, asset_status,
                category, minimum_os_version, app_version,
                app_store_json, fetched_at
           FROM competitor_snapshots
          WHERE package_code = $1
            AND target_date BETWEEN $2::date AND $3::date
          ORDER BY target_date ASC`,
        [packageCode, from, to],
      );

      return rows.map((row) => ({
        targetDate: row.target_date,
        team: row.team,
        lookupStatus: row.lookup_status,
        enrichStatus: row.enrich_status,
        assetStatus: row.asset_status,
        category: row.category,
        minimumOsVersion: row.minimum_os_version,
        appVersion: row.app_version,
        appStoreJson: jsonObject(row.app_store_json),
        fetchedAt: text(row.fetched_at),
      }));
    },

    async getBatch(date) {
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT to_char(target_date, 'YYYY-MM-DD') AS target_date,
                sync_id, snapshot_id, data_updated_at, published_at,
                range_complete, stale, status, fetched_at
           FROM competitor_batches
          WHERE target_date = $1::date`,
        [date],
      );
      return rows[0] ? batchFromRow(rows[0]) : null;
    },
  };

  return queries;
}
