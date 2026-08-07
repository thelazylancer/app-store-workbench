import express from "express";
import { classifyCandidates } from "./lib/matchResults";
import type {
  IapHints,
  LookupCandidate,
  MatchedApp,
  SearchAppsRequest,
  SearchAppsResponse,
  SearchResult,
} from "../shared/types";
import type { ProductPageDetails } from "./lib/productPage";

type AppDependencies = {
  lookupAppStore: (query: string, country: "us") => Promise<LookupCandidate[]>;
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

export function createApp(deps: AppDependencies) {
  const app = express();

  app.use(express.json());

  app.post("/api/search-apps", async (req, res) => {
    if (!isSearchAppsRequest(req.body)) {
      return res.status(400).json({ message: "names must be an array of strings" });
    }

    const results: SearchResult[] = [];

    for (const query of req.body.names) {
      try {
        const candidates = await deps.lookupAppStore(query, "us");
        const result = classifyCandidates(query, candidates);

        if (result.status === "matched" || result.status === "uncertain_match") {
          const appWithIapItems: MatchedApp = {
            ...result.app,
            iapItems: [],
          };

          result.app = appWithIapItems;

          try {
            const productPage = await deps.fetchProductPageDetails(result.app.appStoreUrl);

            if (productPage.screenshotUrls.length > 0) {
              result.app.screenshotUrls = productPage.screenshotUrls;
            }

            result.app.iapItems = productPage.iapItems;
            if (productPage.versionHistory.length > 0) {
              result.app.versionHistory = productPage.versionHistory;
            }
            result.iapHints = await deps.buildIapHints(productPage.iapItems);
          } catch {
            result.iapHints = await deps.buildIapHints(null);
          }
        }

        results.push(result);
      } catch {
        results.push({
          query,
          status: "search_failed",
          app: null,
          alternates: [],
          iapHints: null,
          message: "Search failed",
        });
      }
    }

    const body: SearchAppsResponse = { results };
    return res.json(body);
  });

  return app;
}
