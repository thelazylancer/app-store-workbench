import express from "express";
import { classifyCandidates } from "./lib/matchResults";
import { STORE_COUNTRIES } from "../shared/types";
import type {
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
};

function isSearchAppsRequest(value: unknown): value is SearchAppsRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SearchAppsRequest).names) &&
    (value as SearchAppsRequest).names.every((item) => typeof item === "string")
  );
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
      return res.status(400).json({ message: "names must be an array of strings" });
    }
    const country = parseCountry(req.body.country);
    if (!country) return res.status(400).json({ message: "Unsupported App Store country" });

    const results: SearchResult[] = [];

    for (const query of req.body.names) {
      try {
        const candidates = await deps.lookupAppStore(query, country);
        const result = classifyCandidates(query, candidates);

        if (result.app) {
          Object.assign(result, await enrichApp(result.app, country));
        }
        if (result.status === "no_match") {
          result.message = `No App Store match found in ${country.toUpperCase()} store`;
        }

        results.push(result);
      } catch {
        results.push({
          query,
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

  return app;
}
