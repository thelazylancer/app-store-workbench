import path from "node:path";

try {
  process.loadEnvFile();
} catch {
  // .env is optional when the process already received environment variables.
}

import { createApp } from "./app";
import { lookupAppById, lookupAppByBundleId, lookupAppStore } from "./lib/appleLookup";
import { downloadAppAssets } from "./lib/assetStore";
import { createCompetitorRepo } from "./lib/competitorRepo";
import { startCompetitorScheduler } from "./lib/competitorScheduler";
import { createPool, runMigrations } from "./lib/db";
import { fetchFirstDeliveryPackages } from "./lib/firstDeliverySource";
import { fetchOfflinePackages } from "./lib/offlineSource";
import { buildIapHints } from "./lib/iapHints";
import { createIpaDownloadManager } from "./lib/ipaDownload";
import { fetchProductPageDetails as fetchProductPageDetailsUncached } from "./lib/productPage";
import { createCachedProductPageFetcher } from "./lib/productPageCache";
import { createShelfQueries } from "./lib/shelfQueries";
import { createWeeklyReport } from "./lib/weeklyReport";

const timeoutMinutes = Number(process.env.IPA_DOWNLOAD_TIMEOUT_MINUTES) || 0;
const productPageCacheTtlSeconds = Number(process.env.PRODUCT_PAGE_CACHE_TTL_SECONDS) || 600;
const productPageCacheMaxEntries = Number(process.env.PRODUCT_PAGE_CACHE_MAX_ENTRIES) || 200;

const fetchProductPageDetails = createCachedProductPageFetcher(fetchProductPageDetailsUncached, {
  ttlMs: productPageCacheTtlSeconds * 1000,
  maxEntries: productPageCacheMaxEntries,
});

const ipaDownload = createIpaDownloadManager({
  ipatoolBin: process.env.IPATOOL_BIN ?? "ipatool",
  downloadsDir: process.env.DOWNLOADS_DIR ?? path.resolve("downloads"),
  retentionDays: Number(process.env.IPA_RETENTION_DAYS) || undefined,
  timeoutMs: timeoutMinutes > 0 ? timeoutMinutes * 60 * 1000 : undefined,
  proxyUrl: process.env.IPATOOL_PROXY,
  persistJobs: true,
});

void ipaDownload.cleanupExpired().catch(() => {});
const cleanupTimer = setInterval(() => {
  void ipaDownload.cleanupExpired().catch(() => {});
}, 60 * 60 * 1000);
cleanupTimer.unref();

async function competitorRepoFromEnv(): Promise<{
  competitorRepo?: ReturnType<typeof createCompetitorRepo>;
  shelfQueries?: ReturnType<typeof createShelfQueries>;
  weeklyReport?: ReturnType<typeof createWeeklyReport>;
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return {};
  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    return {
      competitorRepo: createCompetitorRepo(pool),
      shelfQueries: createShelfQueries(pool),
      weeklyReport: createWeeklyReport(pool),
    };
  } catch (error) {
    console.error(
      `Competitor database unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    await pool.end().catch(() => {});
    return {};
  }
}

async function main() {
  const { competitorRepo, shelfQueries, weeklyReport } = await competitorRepoFromEnv();

  if (competitorRepo) {
    startCompetitorScheduler(
      {
        fetchSourcePackages: fetchFirstDeliveryPackages,
        lookupAppByBundleId,
        fetchProductPageDetails,
        downloadAssets: downloadAppAssets,
        repo: competitorRepo,
      },
      { fetchOfflinePackages, repo: competitorRepo },
    );
  }

  const app = createApp({
    lookupAppById,
    lookupAppStore,
    lookupAppByBundleId,
    fetchProductPageDetails,
    buildIapHints,
    ipaDownload,
    ...(competitorRepo ? { competitorRepo } : {}),
    ...(competitorRepo ? { competitorWriter: competitorRepo } : {}),
    ...(shelfQueries ? { shelfQueries } : {}),
    ...(weeklyReport ? { weeklyReport } : {}),
    competitorAssetsDir: process.env.COMPETITOR_DATA_DIR ?? path.resolve("data/competitor"),
  });

  const port = Number(process.env.PORT) || 3001;

  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server listening on http://localhost:${port}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
