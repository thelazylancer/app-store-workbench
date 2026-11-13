import express from "express";
import { stat } from "node:fs/promises";
import { classifyCandidates } from "./lib/matchResults";
import type { IpaDownloadManager } from "./lib/ipaDownload";
import { STORE_COUNTRIES } from "../shared/types";
import type {
  AppSearchQuery,
  IapHints,
  LookupCandidate,
  MatchedApp,
  SearchAppsRequest,
  SearchAppsResponse,
  SearchResult,
  StoreCountry,
} from "../shared/types";
import type { ProductPageDetails } from "./lib/productPage";

type AppDependencies = {
  lookupAppById: (appleId: number, country: StoreCountry) => Promise<LookupCandidate | null>;
  lookupAppStore: (query: string, country: StoreCountry) => Promise<LookupCandidate[]>;
  fetchProductPageDetails: (appStoreUrl: string) => Promise<ProductPageDetails>;
  buildIapHints: (items: ProductPageDetails["iapItems"] | null) => Promise<IapHints>;
  ipaDownload?: IpaDownloadManager;
};

const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

function isSearchAppsRequest(value: unknown): value is SearchAppsRequest {
  if (typeof value !== "object" || value === null) return false;
  if ("queries" in value) {
    return !("names" in value) && Array.isArray(value.queries) && value.queries.every(
      (item: unknown) => typeof item === "object" && item !== null &&
        "name" in item && typeof item.name === "string" && item.name.trim().length > 0 &&
        (!("bundleId" in item) || typeof item.bundleId === "string"),
    );
  }
  return "names" in value && Array.isArray(value.names) &&
    value.names.every((item: unknown) => typeof item === "string");
}

function parseCountry(value: unknown): StoreCountry | null {
  if (value === undefined) return "us";
  if (typeof value !== "string") return null;
  const country = value.toLowerCase();
  return STORE_COUNTRIES.includes(country as StoreCountry) ? country as StoreCountry : null;
}

export function createApp(deps: AppDependencies) {
  const app = express();

  app.use(express.json());

  async function enrichApp(baseline: LookupCandidate, country: StoreCountry) {
    const app: MatchedApp = {
      ...baseline,
      category: baseline.category ?? null,
      versionHistory: baseline.versionHistory ?? [],
      appStoreUrl: baseline.appStoreUrl.replace(
        /^(https:\/\/apps\.apple\.com\/)[a-z]{2}\//i,
        `$1${country}/`,
      ),
      iapItems: [],
    };
    let iapHints: IapHints;

    try {
      const pageUrl = new URL(app.appStoreUrl);
      if (!Number.isSafeInteger(app.appleId) || !app.appleId || app.appleId <= 0
        || pageUrl.protocol !== "https:" || pageUrl.hostname !== "apps.apple.com") {
        return { app, iapHints: await deps.buildIapHints(null) };
      }
      pageUrl.searchParams.set("l", "en");
      const productPage = await deps.fetchProductPageDetails(pageUrl.toString());
      if (productPage.screenshotUrls.length > 0) app.screenshotUrls = productPage.screenshotUrls;
      app.iapItems = productPage.iapItems;
      if (productPage.versionHistory.length > 0) app.versionHistory = productPage.versionHistory;
      iapHints = await deps.buildIapHints(country === "us" ? productPage.iapItems : null);
    } catch {
      iapHints = await deps.buildIapHints(null);
    }

    return { app, iapHints };
  }

  app.get("/api/app-details/:appleId", async (req, res) => {
    const country = parseCountry(req.query.country);
    const appleId = Number(req.params.appleId);
    if (!country || !/^\d+$/.test(req.params.appleId) || !Number.isSafeInteger(appleId) || appleId <= 0) {
      return res.status(400).json({ message: "A positive Apple ID and supported country are required" });
    }
    try {
      const candidate = await deps.lookupAppById(appleId, country);
      if (!candidate || candidate.appleId !== appleId) {
        return res.status(404).json({ message: "App unavailable in this storefront" });
      }
      return res.json({ country, ...await enrichApp(candidate, country) });
    } catch {
      return res.status(502).json({ message: "App lookup failed" });
    }
  });

  app.post("/api/search-apps", async (req, res) => {
    if (!isSearchAppsRequest(req.body)) {
      return res.status(400).json({ message: "Supply queries with nonblank names and optional string Bundle IDs, or names as an array of strings" });
    }
    const country = parseCountry(req.body.country);
    if (!country) return res.status(400).json({ message: "Unsupported App Store country" });

    const queries: AppSearchQuery[] = req.body.queries ?? req.body.names?.map((name) => ({ name })) ?? [];
    const results: SearchResult[] = [];

    for (const { name: query, bundleId } of queries) {
      const requestedBundleId = bundleId?.trim();
      try {
        const candidates = await deps.lookupAppStore(query, country);
        const result = classifyCandidates(query, candidates, requestedBundleId);

        if (result.app) {
          Object.assign(result, await enrichApp(result.app, country));
        }
        if (result.status === "no_match" && !requestedBundleId) {
          result.message = `No App Store match found in ${country.toUpperCase()} store`;
        }

        results.push(result);
      } catch {
        results.push({
          query,
          ...(requestedBundleId ? { requestedBundleId } : {}),
          status: "search_failed",
          app: null,
          candidates: [],
          alternates: [],
          iapHints: null,
          message: "Search failed",
        });
      }
    }

    const body: SearchAppsResponse = { country, results };
    return res.json(body);
  });

  app.post("/api/ipa-download", (req, res) => {
    if (!deps.ipaDownload) {
      return res.status(503).json({ message: "IPA download is unavailable" });
    }
    const bundleId = typeof req.body?.bundleId === "string" ? req.body.bundleId.trim() : "";
    if (!BUNDLE_ID_PATTERN.test(bundleId)) {
      return res.status(400).json({ message: "A valid Bundle ID is required" });
    }
    return res.status(202).json(deps.ipaDownload.createJob(bundleId));
  });

  app.get("/api/ipa-download/:id", (req, res) => {
    if (!deps.ipaDownload) {
      return res.status(503).json({ message: "IPA download is unavailable" });
    }
    const job = deps.ipaDownload.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "IPA download job not found" });
    }
    return res.json(job);
  });

  app.post("/api/ipa-download/:id/auth-code", (req, res) => {
    if (!deps.ipaDownload) {
      return res.status(503).json({ message: "IPA download is unavailable" });
    }
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "A 6-digit verification code is required" });
    }
    const job = deps.ipaDownload.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "IPA download job not found" });
    }
    if (job.status !== "awaiting_auth_code") {
      return res.status(409).json({ message: "This IPA download is not waiting for a verification code" });
    }
    const updated = deps.ipaDownload.submitAuthCode(req.params.id, code);
    if (!updated) {
      return res.status(409).json({ message: "This IPA download is not waiting for a verification code" });
    }
    return res.status(202).json(updated);
  });

  app.get("/api/ipa-download/:id/file", async (req, res) => {
    if (!deps.ipaDownload) {
      return res.status(503).json({ message: "IPA download is unavailable" });
    }
    const job = deps.ipaDownload.getJob(req.params.id);
    const filePath = job?.status === "done" ? deps.ipaDownload.getFilePath(req.params.id) : null;
    if (!job || !filePath) {
      return res.status(404).json({ message: "IPA file is not ready" });
    }
    try {
      await stat(filePath);
    } catch {
      return res.status(404).json({ message: "IPA file is not available" });
    }
    return res.download(filePath, `${job.bundleId}.ipa`);
  });

  return app;
}
