import path from "node:path";
import { createApp } from "./app";
import { lookupAppById, lookupAppStore } from "./lib/appleLookup";
import { createCompetitorRepo, type CompetitorQueryRepo } from "./lib/competitorRepo";
import { createPool, runMigrations } from "./lib/db";
import { buildIapHints } from "./lib/iapHints";
import { createIpaDownloadManager } from "./lib/ipaDownload";
import { fetchProductPageDetails as fetchProductPageDetailsUncached } from "./lib/productPage";
import { createCachedProductPageFetcher } from "./lib/productPageCache";

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

async function competitorRepoFromEnv(): Promise<CompetitorQueryRepo | undefined> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;
  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    return createCompetitorRepo(pool);
  } catch (error) {
    console.error(
      `Competitor database unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    await pool.end().catch(() => {});
    return undefined;
  }
}

async function main() {
  const competitorRepo = await competitorRepoFromEnv();
  const app = createApp({
    lookupAppById,
    lookupAppStore,
    fetchProductPageDetails,
    buildIapHints,
    ipaDownload,
    ...(competitorRepo ? { competitorRepo } : {}),
  });

  const port = 3001;

  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
