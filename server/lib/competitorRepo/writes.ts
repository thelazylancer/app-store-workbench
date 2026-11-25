import type { Pool } from "pg";
import type { StoreCountry } from "../../../shared/types";
import type { DownloadedAsset } from "../assetStore";
import type { BatchRow, PackageRow, VersionRow } from "../../../shared/competitorTypes";

export type CountryHitRow = {
  country: StoreCountry;
  status: "hit" | "not_found";
  appleId: number | null;
  fetchedAt: string;
};

export type OfflineDateUpdate = { packageCode: string; offlineDate: string };

export type AttributionUpdate = { packageCode: string; attribution: string | null };

export type CompetitorWriteRepo = {
  upsertBatch(batch: BatchRow): Promise<void>;
  /** Writes the latest package row and its per-day snapshot in one transaction. */
  upsertPackage(pkg: PackageRow): Promise<void>;
  upsertCountryHits(packageCode: string, hits: CountryHitRow[]): Promise<void>;
  upsertAssets(packageCode: string, assets: DownloadedAsset[]): Promise<void>;
  upsertVersions(packageCode: string, versions: VersionRow[]): Promise<void>;
  /** Overwrites offline_date for existing packages; returns the matched codes. */
  updateOfflineDates(entries: OfflineDateUpdate[]): Promise<string[]>;
  /** Overwrites attribution (null clears) for existing packages; returns the matched codes. */
  updateAttribution(entries: AttributionUpdate[]): Promise<string[]>;
};

export function createCompetitorWrites(pool: Pool): CompetitorWriteRepo {
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
             target_date = GREATEST(competitor_packages.target_date, EXCLUDED.target_date),
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

    async upsertCountryHits(packageCode, hits) {
      for (const hit of hits) {
        await pool.query(
          `INSERT INTO competitor_country_hits (package_code, country, status, apple_id, fetched_at)
           VALUES ($1, $2, $3, $4, $5::timestamptz)
           ON CONFLICT (package_code, country) DO UPDATE SET
             status = EXCLUDED.status,
             apple_id = EXCLUDED.apple_id,
             fetched_at = EXCLUDED.fetched_at`,
          [packageCode, hit.country, hit.status, hit.appleId, hit.fetchedAt],
        );
      }
    },

    async upsertAssets(packageCode, assets) {
      for (const asset of assets) {
        await pool.query(
          `INSERT INTO competitor_assets (package_code, type, source_url, local_path, fetched_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (package_code, type, source_url) DO UPDATE SET
             local_path = EXCLUDED.local_path,
             fetched_at = EXCLUDED.fetched_at`,
          [packageCode, asset.type, asset.sourceUrl, asset.localPath],
        );
      }
      // Drop screenshot rows the current snapshot no longer references (e.g. the
      // old small-size twin of an image now stored at full resolution).
      const screenshotUrls = assets.filter((asset) => asset.type === "screenshot").map((asset) => asset.sourceUrl);
      if (screenshotUrls.length > 0) {
        await pool.query(
          `DELETE FROM competitor_assets
            WHERE package_code = $1 AND type = 'screenshot' AND source_url <> ALL($2::text[])`,
          [packageCode, screenshotUrls],
        );
      }
    },

    async upsertVersions(packageCode, versions) {
      for (const version of versions) {
        await pool.query(
          `INSERT INTO competitor_versions (package_code, version, released_at, notes, captured_at)
           VALUES ($1, $2, $3::timestamptz, $4, now())
           ON CONFLICT (package_code, version, released_at) DO UPDATE SET
             notes = EXCLUDED.notes,
             captured_at = EXCLUDED.captured_at`,
          [packageCode, version.version, version.releasedAt, version.notes],
        );
      }
    },

    async updateOfflineDates(entries) {
      if (entries.length === 0) return [];
      // PostgreSQL leaves the winner undefined when UNNEST repeats a code, so
      // keep the last write per code; callers also collapse to the max upstream.
      const byCode = new Map(entries.map((entry) => [entry.packageCode, entry.offlineDate]));
      const { rows } = await pool.query<{ package_code: string }>(
        `UPDATE competitor_packages AS cp
            SET offline_date = u.offline_date
           FROM UNNEST($1::text[], $2::date[]) AS u(package_code, offline_date)
          WHERE cp.package_code = u.package_code
          RETURNING cp.package_code`,
        [[...byCode.keys()], [...byCode.values()]],
      );
      return rows.map((row) => row.package_code);
    },

    async updateAttribution(entries) {
      if (entries.length === 0) return [];
      // Last write per code wins, matching updateOfflineDates.
      const byCode = new Map(entries.map((entry) => [entry.packageCode, entry.attribution]));
      const { rows } = await pool.query<{ package_code: string }>(
        `UPDATE competitor_packages AS cp
            SET attribution = u.attribution
           FROM UNNEST($1::text[], $2::text[]) AS u(package_code, attribution)
          WHERE cp.package_code = u.package_code
          RETURNING cp.package_code`,
        [[...byCode.keys()], [...byCode.values()]],
      );
      return rows.map((row) => row.package_code);
    },
  };
}
