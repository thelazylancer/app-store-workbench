import type { FastifyInstance } from "fastify";
import { mapWithConcurrency } from "../lib/concurrency";
import { classifyCandidates } from "../lib/matchResults";
import { STORE_COUNTRIES } from "../../shared/types";
import type {
  AppSearchQuery,
  IapHints,
  LookupCandidate,
  MatchedApp,
  SearchAppsRequest,
  SearchAppsResponse,
  SearchResult,
  StoreCountry,
} from "../../shared/types";
import type { AppDependencies } from "../app";

const configuredSearchConcurrency = Number(process.env.SEARCH_CONCURRENCY);
const SEARCH_CONCURRENCY = Number.isSafeInteger(configuredSearchConcurrency) && configuredSearchConcurrency > 0
  ? configuredSearchConcurrency
  : 3;

function isSearchAppsRequest(value: unknown): value is SearchAppsRequest {
  if (typeof value !== "object" || value === null) return false;
  if ("queries" in value) {
    return !("names" in value) && Array.isArray(value.queries) && value.queries.every(
      (item: unknown) => {
        if (typeof item !== "object" || item === null) return false;
        const { name, bundleId } = item as { name?: unknown; bundleId?: unknown };
        if (name !== undefined && typeof name !== "string") return false;
        if (bundleId !== undefined && typeof bundleId !== "string") return false;
        return (typeof name === "string" && name.trim().length > 0) ||
          (typeof bundleId === "string" && bundleId.trim().length > 0);
      },
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

export function registerSearchRoutes(app: FastifyInstance, deps: AppDependencies): void {
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

  app.get("/api/app-details/:appleId", async (request, reply) => {
    const country = parseCountry((request.query as Record<string, unknown>).country);
    const { appleId: rawAppleId } = request.params as { appleId: string };
    const appleId = Number(rawAppleId);
    if (!country || !/^\d+$/.test(rawAppleId) || !Number.isSafeInteger(appleId) || appleId <= 0) {
      return reply.code(400).send({ message: "A positive Apple ID and supported country are required" });
    }
    try {
      const candidate = await deps.lookupAppById(appleId, country);
      if (!candidate || candidate.appleId !== appleId) {
        return reply.code(404).send({ message: "App unavailable in this storefront" });
      }
      return reply.send({ country, ...await enrichApp(candidate, country) });
    } catch {
      return reply.code(502).send({ message: "App lookup failed" });
    }
  });

  app.post("/api/search-apps", async (request, reply) => {
    const body = request.body;
    if (!isSearchAppsRequest(body)) {
      return reply.code(400).send({ message: "Supply queries with a nonblank name, a Bundle ID, or both, or names as an array of strings" });
    }
    const country = parseCountry(body.country);
    if (!country) return reply.code(400).send({ message: "Unsupported App Store country" });

    const queries: AppSearchQuery[] = body.queries ?? body.names?.map((name) => ({ name })) ?? [];
    const results = await mapWithConcurrency(queries, SEARCH_CONCURRENCY, async ({ name: query, bundleId }) => {
      const nameQuery = query ?? "";
      const requestedBundleId = bundleId?.trim();
      try {
        let candidates: LookupCandidate[];
        if (nameQuery.trim()) {
          candidates = await deps.lookupAppStore(nameQuery, country);
        } else {
          const candidate = requestedBundleId
            ? await deps.lookupAppByBundleId(requestedBundleId, country)
            : null;
          candidates = candidate ? [candidate] : [];
        }
        const result = classifyCandidates(nameQuery, candidates, requestedBundleId);

        if (result.app) {
          Object.assign(result, await enrichApp(result.app, country));
        }
        if (result.status === "no_match" && !requestedBundleId) {
          result.message = `No App Store match found in ${country.toUpperCase()} store`;
        }

        return result;
      } catch {
        return {
          query: nameQuery,
          ...(requestedBundleId ? { requestedBundleId } : {}),
          status: "search_failed",
          app: null,
          candidates: [],
          alternates: [],
          iapHints: null,
          message: "Search failed",
        } satisfies SearchResult;
      }
    });

    const responseBody: SearchAppsResponse = { country, results };
    return reply.send(responseBody);
  });
}
