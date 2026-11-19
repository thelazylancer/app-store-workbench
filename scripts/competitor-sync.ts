import { computeTargetDate, syncCompetitorDay } from "../server/lib/competitorSync";
import { lookupAppByBundleId } from "../server/lib/appleLookup";
import { downloadAppAssets } from "../server/lib/assetStore";
import { createCompetitorRepo } from "../server/lib/competitorRepo";
import { createPool, runMigrations } from "../server/lib/db";
import { fetchFirstDeliveryPackages } from "../server/lib/firstDeliverySource";
import { fetchProductPageDetails as fetchProductPageDetailsUncached } from "../server/lib/productPage";
import { createCachedProductPageFetcher } from "../server/lib/productPageCache";

try {
  process.loadEnvFile();
} catch {
  // .env is optional when the process already received environment variables.
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const targetDate = argValue("--date") ?? computeTargetDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error("--date must be YYYY-MM-DD");
  }

  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    const report = await syncCompetitorDay(targetDate, {
      fetchSourcePackages: fetchFirstDeliveryPackages,
      lookupAppByBundleId,
      fetchProductPageDetails: createCachedProductPageFetcher(fetchProductPageDetailsUncached, {
        ttlMs: 10 * 60 * 1000,
        maxEntries: 200,
      }),
      downloadAssets: downloadAppAssets,
      repo: createCompetitorRepo(pool),
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
