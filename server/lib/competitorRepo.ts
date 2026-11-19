import type { Pool } from "pg";
import type {
  AssetRow,
  BatchRow,
  BatchStatus,
  DateKind,
  DayDetail,
  DaySummary,
  EnrichStatus,
  LookupStatus,
  PackageDetail,
  PackageRow,
  SnapshotEntry,
  VersionEntry,
} from "../../shared/competitorTypes";

export type CompetitorWriteRepo = {
  upsertBatch(batch: BatchRow): Promise<void>;
  /** Writes the latest package row and its per-day snapshot in one transaction. */
  upsertPackage(pkg: PackageRow): Promise<void>;
};

export type CompetitorQueryRepo = {
  listDays(start: string, end: string): Promise<DaySummary[]>;
  getDay(date: string, dateKind: DateKind): Promise<DayDetail | null>;
  getPackage(packageCode: string): Promise<PackageDetail | null>;
  getPackageHistory(packageCode: string, from: string, to: string): Promise<SnapshotEntry[]>;
  getBatch(date: string): Promise<BatchRow | null>;
};

type Queryable = Pick<Pool, "query">;

function text(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function jsonObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function appleIdFrom(value: Record<string, unknown>): number | null {
  return typeof value.appleId === "number" && Number.isSafeInteger(value.appleId) ? value.appleId : null;
}

type PackageRowResult = {
  package_code: string;
  target_date: string;
  display_name: string;
  team: string;
  first_ad_date: string;
  listing_date: string | null;
  first_100_date: string | null;
  offline_date: string | null;
  category: string | null;
  minimum_os_version: string | null;
  app_version: string | null;
  lookup_status: LookupStatus;
  enrich_status: EnrichStatus;
  asset_status: PackageRow["assetStatus"];
  app_store_json: unknown;
  fetched_at: unknown;
};

const PACKAGE_SELECT = `
  package_code,
  to_char(target_date, 'YYYY-MM-DD') AS target_date,
  display_name,
  team,
  to_char(first_ad_date, 'YYYY-MM-DD') AS first_ad_date,
  to_char(listing_date, 'YYYY-MM-DD') AS listing_date,
  to_char(first_100_date, 'YYYY-MM-DD') AS first_100_date,
  to_char(offline_date, 'YYYY-MM-DD') AS offline_date,
  category,
  minimum_os_version,
  app_version,
  lookup_status,
  enrich_status,
  asset_status,
  app_store_json,
  fetched_at`;

function toPackageBase(row: PackageRowResult) {
  return {
    packageCode: row.package_code,
    targetDate: row.target_date,
    displayName: row.display_name,
    team: row.team,
    firstAdDate: row.first_ad_date,
    listingDate: row.listing_date,
    first100Date: row.first_100_date,
    offlineDate: row.offline_date,
    category: row.category,
    minimumOsVersion: row.minimum_os_version,
    appVersion: row.app_version,
    lookupStatus: row.lookup_status,
    enrichStatus: row.enrich_status,
    assetStatus: row.asset_status,
    appStoreJson: jsonObject(row.app_store_json),
    fetchedAt: text(row.fetched_at),
  };
}

function batchFromRow(row: Record<string, unknown>): BatchRow {
  return {
    targetDate: text(row.target_date),
    syncId: text(row.sync_id),
    snapshotId: text(row.snapshot_id),
    dataUpdatedAt: text(row.data_updated_at),
    publishedAt: text(row.published_at),
    rangeComplete: Boolean(row.range_complete),
    stale: Boolean(row.stale),
    status: text(row.status) as BatchStatus,
    fetchedAt: text(row.fetched_at),
  };
}

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

function withAssets(base: ReturnType<typeof toPackageBase>, assets: AssetRow[]): PackageDetail {
  return {
    ...base,
    appleId: appleIdFrom(base.appStoreJson),
    iconLocalPath: assets.find((asset) => asset.type === "icon")?.localPath ?? null,
    screenshotLocalPaths: assets
      .filter((asset) => asset.type === "screenshot")
      .map((asset) => asset.localPath),
    versions: [],
  };
}

export function createCompetitorRepo(pool: Pool): CompetitorWriteRepo & CompetitorQueryRepo {
  return {
    async upsertBatch(batch) {
      await pool.query(
        `INSERT INTO competitor_batches
           (target_date, sync_id, snapshot_id, data_updated_at, published_at,
            range_complete, stale, status, fetched_at)
         VALUES ($1::date, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9::timestamptz)
         ON CONFLICT (target_date) DO UPDATE SET
           sync_id = EXCLUDED.sync_id,
           snapshot_id = EXCLUDED.snapshot_id,
           data_updated_at = EXCLUDED.data_updated_at,
           published_at = EXCLUDED.published_at,
           range_complete = EXCLUDED.range_complete,
           stale = EXCLUDED.stale,
           status = EXCLUDED.status,
           fetched_at = EXCLUDED.fetched_at`,
        [
          batch.targetDate,
          batch.syncId,
          batch.snapshotId,
          batch.dataUpdatedAt,
          batch.publishedAt,
          batch.rangeComplete,
          batch.stale,
          batch.status,
          batch.fetchedAt,
        ],
      );
    },

    async upsertPackage(pkg) {
      const packageJson = JSON.stringify(pkg.appStoreJson ?? {});
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO competitor_packages
             (package_code, target_date, display_name, team,
              first_ad_date, listing_date, first_100_date, offline_date,
              category, minimum_os_version, app_version,
              lookup_status, enrich_status, asset_status, app_store_json, fetched_at)
           VALUES ($1, $2::date, $3, $4,
                   $5::date, $6::date, $7::date, $8::date,
                   $9, $10, $11,
                   $12, $13, $14, $15::jsonb, $16::timestamptz)
           ON CONFLICT (package_code) DO UPDATE SET
             target_date = EXCLUDED.target_date,
             display_name = EXCLUDED.display_name,
             team = EXCLUDED.team,
             first_ad_date = EXCLUDED.first_ad_date,
             listing_date = EXCLUDED.listing_date,
             first_100_date = EXCLUDED.first_100_date,
             offline_date = EXCLUDED.offline_date,
             category = EXCLUDED.category,
             minimum_os_version = EXCLUDED.minimum_os_version,
             app_version = EXCLUDED.app_version,
             lookup_status = EXCLUDED.lookup_status,
             enrich_status = EXCLUDED.enrich_status,
             asset_status = EXCLUDED.asset_status,
             app_store_json = EXCLUDED.app_store_json,
             fetched_at = EXCLUDED.fetched_at`,
          [
            pkg.packageCode,
            pkg.targetDate,
            pkg.displayName,
            pkg.team,
            pkg.firstAdDate,
            pkg.listingDate,
            pkg.first100Date,
            pkg.offlineDate,
            pkg.category,
            pkg.minimumOsVersion,
            pkg.appVersion,
            pkg.lookupStatus,
            pkg.enrichStatus,
            pkg.assetStatus,
            packageJson,
            pkg.fetchedAt,
          ],
        );
        await client.query(
          `INSERT INTO competitor_snapshots
             (package_code, target_date, team, lookup_status, enrich_status,
              asset_status, category, minimum_os_version, app_version,
              app_store_json, fetched_at)
           VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::timestamptz)
           ON CONFLICT (package_code, target_date) DO UPDATE SET
             team = EXCLUDED.team,
             lookup_status = EXCLUDED.lookup_status,
             enrich_status = EXCLUDED.enrich_status,
             asset_status = EXCLUDED.asset_status,
             category = EXCLUDED.category,
             minimum_os_version = EXCLUDED.minimum_os_version,
             app_version = EXCLUDED.app_version,
             app_store_json = EXCLUDED.app_store_json,
             fetched_at = EXCLUDED.fetched_at`,
          [
            pkg.packageCode,
            pkg.targetDate,
            pkg.team,
            pkg.lookupStatus,
            pkg.enrichStatus,
            pkg.assetStatus,
            pkg.category,
            pkg.minimumOsVersion,
            pkg.appVersion,
            packageJson,
            pkg.fetchedAt,
          ],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

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
      const column = dateKind === "listing" ? "listing_date" : "first_ad_date";
      const { rows } = await pool.query<PackageRowResult>(
        `SELECT ${PACKAGE_SELECT}
           FROM competitor_packages
          WHERE ${column} = $1::date
          ORDER BY display_name, package_code`,
        [date],
      );
      const batch = await this.getBatch(date);
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
}
