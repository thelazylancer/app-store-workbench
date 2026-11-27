import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { handleFrameworkError, registerErrorHandlers } from "./lib/fastifyErrors";
import { parseExpressJson } from "./lib/expressJson";
import { registerCompetitorRoutes } from "./routes/competitor";
import { registerIpaDownloadRoutes } from "./routes/ipaDownload";
import { registerSearchRoutes } from "./routes/search";
import { registerShelfRoutes } from "./routes/shelf";
import { registerMcpRoute } from "./lib/mcp";
import type { CompetitorQueryRepo, CompetitorWriteRepo } from "./lib/competitorRepo";
import type { ShelfQueryRepo } from "./lib/shelfQueries";
import type { WeeklyReportRepo } from "./lib/weeklyReport";
import type { IpaDownloadManager } from "./lib/ipaDownload";
import type { IapHints, LookupCandidate, StoreCountry } from "../shared/types";
import type { ProductPageDetails } from "./lib/productPage";

export type AppDependencies = {
  lookupAppById: (appleId: number, country: StoreCountry) => Promise<LookupCandidate | null>;
  lookupAppStore: (query: string, country: StoreCountry) => Promise<LookupCandidate[]>;
  lookupAppByBundleId: (bundleId: string, country: StoreCountry) => Promise<LookupCandidate | null>;
  fetchProductPageDetails: (appStoreUrl: string) => Promise<ProductPageDetails>;
  buildIapHints: (items: ProductPageDetails["iapItems"] | null) => Promise<IapHints>;
  ipaDownload?: IpaDownloadManager;
  competitorRepo?: CompetitorQueryRepo;
  /** Analysis-derived writes exposed over HTTP/MCP; absent in read-only deployments. */
  competitorWriter?: Pick<CompetitorWriteRepo, "updateAttribution" | "updatePermissions">;
  shelfQueries?: ShelfQueryRepo;
  weeklyReport?: WeeklyReportRepo;
  competitorAssetsDir?: string;
};

// express.json() inflates compressed bodies before parsing.
function inflateBody(body: Buffer, encoding: unknown): Buffer {
  switch (typeof encoding === "string" ? encoding.toLowerCase() : "") {
    case "gzip": return gunzipSync(body);
    case "deflate": return inflateSync(body);
    case "br": return brotliDecompressSync(body);
    default: return body;
  }
}

export function createApp(deps: AppDependencies): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: Number.MAX_SAFE_INTEGER, // parser-level limits below; whole-file bodies must not buffer
    keepAliveTimeout: 5000,
    routerOptions: { maxParamLength: 255, ignoreTrailingSlash: true, caseSensitive: false },
    frameworkErrors: handleFrameworkError,
  });

  registerErrorHandlers(app);

  // express.json() limits only JSON bodies; all other content types are ignored.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer", bodyLimit: 100 * 1024 },
    (request, body, done) => {
      try {
        const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
        const inflated = inflateBody(raw, request.headers["content-encoding"]);
        done(null, parseExpressJson(inflated.toString("utf8")));
      } catch (error) {
        const err = error as Error & { statusCode?: number };
        err.statusCode = 400;
        done(err);
      }
    },
  );
  // express.json() ignores non-JSON bodies. Drain them without buffering so a
  // large body cannot grow memory; text/plain would otherwise hit Fastify's
  // buffering default parser, so let both fall through to the wildcard.
  app.removeContentTypeParser("text/plain");
  app.addContentTypeParser("*", (_request, payload, done) => {
    payload.resume();
    payload.once("end", () => done(null, undefined));
    payload.once("error", (error) => done(error));
  });

  // express.static 301s the bare directory to its slash form with a relative Location.
  app.addHook("onRequest", (request, reply, done) => {
    if ((request.raw.url ?? "").split("?")[0] === "/competitor-assets") {
      reply.code(301).header("location", "/competitor-assets/").send();
      return;
    }
    done();
  });

  void app.register(fastifyStatic, {
    root: deps.competitorAssetsDir ?? path.resolve("data/competitor"),
    prefix: "/competitor-assets/",
  });

  registerCompetitorRoutes(app, deps);
  registerShelfRoutes(app, deps);
  registerSearchRoutes(app, deps);
  registerIpaDownloadRoutes(app, deps);
  registerMcpRoute(app);

  return app;
}
