import path from "node:path";
import { createApp } from "./app";
import { lookupAppById, lookupAppStore } from "./lib/appleLookup";
import { buildIapHints } from "./lib/iapHints";
import { createIpaDownloadManager } from "./lib/ipaDownload";
import { fetchProductPageDetails } from "./lib/productPage";

const timeoutMinutes = Number(process.env.IPA_DOWNLOAD_TIMEOUT_MINUTES) || 0;

const ipaDownload = createIpaDownloadManager({
  ipatoolBin: process.env.IPATOOL_BIN ?? "ipatool",
  downloadsDir: process.env.DOWNLOADS_DIR ?? path.resolve("downloads"),
  retentionDays: Number(process.env.IPA_RETENTION_DAYS) || undefined,
  timeoutMs: timeoutMinutes > 0 ? timeoutMinutes * 60 * 1000 : undefined,
  proxyUrl: process.env.IPATOOL_PROXY,
});

void ipaDownload.cleanupExpired().catch(() => {});
const cleanupTimer = setInterval(() => {
  void ipaDownload.cleanupExpired().catch(() => {});
}, 60 * 60 * 1000);
cleanupTimer.unref();

const app = createApp({
  lookupAppById,
  lookupAppStore,
  fetchProductPageDetails,
  buildIapHints,
  ipaDownload,
});

const port = 3001;

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
