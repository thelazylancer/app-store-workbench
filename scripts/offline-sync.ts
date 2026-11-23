import { createCompetitorRepo } from "../server/lib/competitorRepo";
import { createPool, runMigrations } from "../server/lib/db";
import { computeBackfillWindow, syncOfflinePackages } from "../server/lib/offlineSync";
import { fetchOfflinePackages } from "../server/lib/offlineSource";

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

  const rawDays = argValue("--days");
  const days = rawDays === undefined ? 30 : Number(rawDays);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("--days must be a positive integer");
  }

  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    const report = await syncOfflinePackages(computeBackfillWindow(new Date(), days), {
      fetchOfflinePackages,
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
