import { mapWithConcurrency } from "../server/lib/concurrency";
import { createPool } from "../server/lib/db";
import { fetchProductPageDetails } from "../server/lib/productPage";

try {
  process.loadEnvFile();
} catch {
  // .env is optional when the process already received environment variables.
}

type PackageRow = { package_code: string; app_store_json: Record<string, unknown> };

/** One-off: enrich already-synced packages with App Privacy data added later. */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const pool = createPool(databaseUrl);
  try {
    const { rows } = await pool.query<PackageRow>(
      `SELECT package_code, app_store_json
         FROM competitor_packages
        WHERE lookup_status = 'hit'
          AND (jsonb_typeof(app_store_json->'privacy') IS NULL
               OR jsonb_array_length(COALESCE(app_store_json->'privacy'->'groups', '[]'::jsonb)) = 0)
        ORDER BY package_code`,
    );

    const outcomes = await mapWithConcurrency(rows, 3, async (row) => {
      const url = row.app_store_json.trackViewUrl ?? row.app_store_json.appStoreUrl;
      if (typeof url !== "string") return "skipped";
      const details = await fetchProductPageDetails(url).catch(() => null);
      if (!details?.privacy) return "skipped";
      await pool.query(
        `UPDATE competitor_packages
            SET app_store_json = app_store_json || jsonb_build_object('privacy', $2::jsonb)
          WHERE package_code = $1`,
        [row.package_code, JSON.stringify(details.privacy)],
      );
      return "updated";
    });

    console.log(JSON.stringify({
      candidates: rows.length,
      updated: outcomes.filter((outcome) => outcome === "updated").length,
      skipped: outcomes.filter((outcome) => outcome === "skipped").length,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
