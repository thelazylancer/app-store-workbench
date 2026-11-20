import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "./createTestApp";
import type { CompetitorQueryRepo } from "../../server/lib/competitorRepo";
import type { IpaDownloadManager } from "../../server/lib/ipaDownload";
import type { IpaDownloadJob as Job } from "../../shared/types";

const JSON_TYPE = "application/json; charset=utf-8";
const HTML_TYPE = "text/html; charset=utf-8";
const dirs: string[] = [];

function weakEtag(text: string): string {
  const body = Buffer.from(text);
  if (body.length === 0) return 'W/"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"';
  const hash = createHash("sha1").update(body).digest("base64").substring(0, 27);
  return `W/"${body.length.toString(16)}-${hash}"`;
}

function htmlError(message: string): string {
  return "<!DOCTYPE html>\n"
    + "<html lang=\"en\">\n"
    + "<head>\n"
    + "<meta charset=\"utf-8\">\n"
    + "<title>Error</title>\n"
    + "</head>\n"
    + "<body>\n"
    + `<pre>${message}</pre>\n`
    + "</body>\n"
    + "</html>\n";
}

const baseDeps = {
  lookupAppById: async () => null,
  lookupAppStore: async () => [],
  lookupAppByBundleId: async () => null,
  fetchProductPageDetails: async () => ({ screenshotUrls: [], iapItems: [], versionHistory: [] }),
  buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" } as const),
};

function emptyRepo(): CompetitorQueryRepo {
  return {
    listDays: async () => [],
    getDay: async () => null,
    getPackage: async () => null,
    getPackageHistory: async () => [],
    getSummary: async () => [],
    getBatch: async () => null,
  };
}

function expectJson(response: request.Response, status: number, text: string): void {
  expect(response.status, response.text).toBe(status);
  expect(response.headers["content-type"]).toBe(JSON_TYPE);
  expect(response.headers["x-powered-by"]).toBe("Express");
  expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(text)));
  expect(response.headers.etag).toBe(weakEtag(text));
  expect(response.text).toBe(text);
}

function expectHtml(response: request.Response, status: number, text: string): void {
  expect(response.status, response.text).toBe(status);
  expect(response.headers["content-type"]).toBe(HTML_TYPE);
  expect(response.headers["content-security-policy"]).toBe("default-src 'none'");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
  expect(response.headers["x-powered-by"]).toBe("Express");
  expect(response.headers["content-length"]).toBe(String(Buffer.byteLength(text)));
  expect(response.headers.etag).toBeUndefined();
  expect(response.text).toBe(text);
}

function ipaJob(id: string, status: Job["status"]): Job {
  return {
    id,
    bundleId: "com.example.app",
    status,
    progress: null,
    bytesDownloaded: null,
    queuePosition: null,
    activeJob: null,
    fileName: "job.ipa",
    sizeBytes: status === "done" ? 9 : null,
    errorCode: null,
    error: null,
    fileUrl: null,
    createdAt: "2026-11-20T00:00:00.000Z",
    updatedAt: "2026-11-20T00:00:00.000Z",
  };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "http-contract-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  while (dirs.length > 0) {
    await rm(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("HTTP contract", () => {
  it("keeps the competitor 503 guard and query errors byte-for-byte", async () => {
    const unavailable = await createTestApp(baseDeps);
    expectJson(
      await request(unavailable.server).get("/api/competitor/days?start=2026-11-01&end=2026-11-18"),
      503,
      '{"message":"Competitor data is unavailable"}',
    );
    expectJson(
      await request(unavailable.server).get("/api/competitor/package/not-there"),
      503,
      '{"message":"Competitor data is unavailable"}',
    );

    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });
    expectJson(
      await request(app.server).get("/api/competitor/days"),
      400,
      '{"message":"Valid start and end dates are required"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/summary?date=2026-11-18&date_kind=weekly"),
      400,
      '{"message":"Unsupported date_kind"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/summary?from=2026-11-01&to=2026-12-02"),
      400,
      '{"message":"Date range must not exceed 31 days"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/day/2026-11-18"),
      404,
      '{"message":"No competitor data for this date"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/batch/2026-11-18"),
      404,
      '{"message":"No batch for this date"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/package/-leading"),
      400,
      '{"message":"A valid package code is required"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/package/com.example.missing"),
      404,
      '{"message":"Package not found"}',
    );
    expectJson(
      await request(app.server).get("/api/competitor/package/com.example.app/history?from=2026-11-01"),
      400,
      '{"message":"Valid from and to dates are required"}',
    );
  });

  it("keeps app-details 400/404/502 bodies byte-for-byte", async () => {
    const app = await createTestApp(baseDeps);
    expectJson(
      await request(app.server).get("/api/app-details/0"),
      400,
      '{"message":"A positive Apple ID and supported country are required"}',
    );
    expectJson(
      await request(app.server).get("/api/app-details/123?country=de"),
      400,
      '{"message":"A positive Apple ID and supported country are required"}',
    );
    expectJson(
      await request(app.server).get("/api/app-details/123"),
      404,
      '{"message":"App unavailable in this storefront"}',
    );

    const failing = await createTestApp({
      ...baseDeps,
      lookupAppById: async () => { throw new Error("upstream down"); },
    });
    expectJson(
      await request(failing.server).get("/api/app-details/123"),
      502,
      '{"message":"App lookup failed"}',
    );
  });

  it("keeps search-apps validation errors and the no-match response byte-for-byte", async () => {
    const app = await createTestApp(baseDeps);
    expectJson(
      await request(app.server).post("/api/search-apps").send({}),
      400,
      '{"message":"Supply queries with a nonblank name, a Bundle ID, or both, or names as an array of strings"}',
    );
    expectJson(
      await request(app.server).post("/api/search-apps").send({ names: ["Funce"], country: "de" }),
      400,
      '{"message":"Unsupported App Store country"}',
    );
    expectJson(
      await request(app.server).post("/api/search-apps").send({ names: ["Funce"] }),
      200,
      '{"country":"us","results":[{"query":"Funce","candidates":[],"status":"no_match","app":null,"alternates":[],"iapHints":null,"message":"No App Store match found in US store"}]}',
    );
  });

  it("keeps IPA 503/400/404/409 bodies and download headers", async () => {
    const unavailable = await createTestApp(baseDeps);
    expectJson(
      await request(unavailable.server).post("/api/ipa-download").send({ bundleId: "com.example.app" }),
      503,
      '{"message":"IPA download is unavailable"}',
    );
    expectJson(
      await request(unavailable.server).get("/api/ipa-download/abc"),
      503,
      '{"message":"IPA download is unavailable"}',
    );
    expectJson(
      await request(unavailable.server).get("/api/ipa-download/abc/file"),
      503,
      '{"message":"IPA download is unavailable"}',
    );
    expectJson(
      await request(unavailable.server).post("/api/ipa-download/abc/auth-code").send({ code: "123456" }),
      503,
      '{"message":"IPA download is unavailable"}',
    );
    expectJson(
      await request(unavailable.server).delete("/api/ipa-download/abc"),
      503,
      '{"message":"IPA download is unavailable"}',
    );

    const dir = await tempDir();
    const filePath = path.join(dir, "job.ipa");
    await writeFile(filePath, "ipa-bytes");

    const jobs = new Map<string, Job>();
    jobs.set("awaiting", ipaJob("awaiting", "awaiting_auth_code"));
    jobs.set("done", ipaJob("done", "done"));
    jobs.set("running", ipaJob("running", "running"));
    const manager: IpaDownloadManager = {
      createJob: (bundleId) => ({ ...ipaJob("created", "queued"), bundleId }),
      getJob: (id) => jobs.get(id) ?? null,
      getFilePath: () => filePath,
      submitAuthCode: async (id) => (id === "awaiting" ? ipaJob("awaiting", "queued") : null),
      cancelJob: (id) => (id === "running" ? ipaJob("running", "cancelled") : null),
      cleanupExpired: async () => [],
    };
    const app = await createTestApp({ ...baseDeps, ipaDownload: manager });

    expectJson(
      await request(app.server).post("/api/ipa-download").send({ bundleId: "bad id" }),
      400,
      '{"message":"A valid Bundle ID is required"}',
    );
    expectJson(
      await request(app.server).get("/api/ipa-download/missing"),
      404,
      '{"message":"IPA download job not found"}',
    );
    expectJson(
      await request(app.server).post("/api/ipa-download/unknown/auth-code").send({ code: "123456" }),
      404,
      '{"message":"IPA download job not found"}',
    );
    expectJson(
      await request(app.server).post("/api/ipa-download/unknown/auth-code").send({ code: "123" }),
      400,
      '{"message":"A 6-digit verification code is required"}',
    );
    expectJson(
      await request(app.server).post("/api/ipa-download/done/auth-code").send({ code: "123456" }),
      409,
      '{"message":"This IPA download is not waiting for a verification code"}',
    );
    const accepted = await request(app.server)
      .post("/api/ipa-download/awaiting/auth-code").send({ code: "123456" });
    expect(accepted.status).toBe(202);
    expect(accepted.body).toMatchObject({ id: "awaiting", status: "queued" });

    expectJson(
      await request(app.server).delete("/api/ipa-download/missing"),
      404,
      '{"message":"IPA download job not found"}',
    );
    expectJson(
      await request(app.server).delete("/api/ipa-download/done"),
      409,
      '{"message":"This IPA download has already finished"}',
    );
    expect((await request(app.server).delete("/api/ipa-download/running")).status).toBe(202);

    expectJson(
      await request(app.server).get("/api/ipa-download/running/file"),
      404,
      '{"message":"IPA file is not ready"}',
    );
    const file = await request(app.server).get("/api/ipa-download/done/file");
    expect(file.status).toBe(200);
    expect(file.headers["content-type"]).toBe("application/octet-stream");
    expect(file.headers["content-disposition"]).toBe('attachment; filename="com.example.app.ipa"');
    expect(file.headers["content-length"]).toBe("9");
    expect(file.headers["accept-ranges"]).toBe("bytes");
    expect(file.headers["cache-control"]).toBe("public, max-age=0");
    expect(file.headers["last-modified"]).toBe((await stat(filePath)).mtime.toUTCString());
    expect(file.headers.etag).toMatch(/^W\/"9-[0-9a-f]+"$/);
    expect(file.headers["x-powered-by"]).toBe("Express");
    expect(file.body.toString()).toBe("ipa-bytes");

    const notModified = await request(app.server)
      .get("/api/ipa-download/done/file")
      .set("If-None-Match", String(file.headers.etag));
    expect(notModified.status).toBe(304);
    expect(notModified.headers["content-type"]).toBeUndefined();
    expect(notModified.headers["content-length"]).toBeUndefined();
    expect(notModified.headers["content-disposition"]).toBe('attachment; filename="com.example.app.ipa"');
    expect(notModified.headers["accept-ranges"]).toBe("bytes");
    expect(notModified.headers["cache-control"]).toBe("public, max-age=0");
    expect(notModified.headers.etag).toBe(file.headers.etag);

    const ranged = await request(app.server)
      .get("/api/ipa-download/done/file")
      .set("Range", "bytes=0-3");
    expect(ranged.status).toBe(206);
    expect(ranged.headers["content-range"]).toBe("bytes 0-3/9");
    expect(ranged.headers["content-length"]).toBe("4");
    expect(ranged.body.toString()).toBe("ipa-");

    const unsatisfiable = await request(app.server)
      .get("/api/ipa-download/done/file")
      .set("Range", "bytes=99-100");
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers["content-range"]).toBe("bytes */9");

    const byModified = await request(app.server)
      .get("/api/ipa-download/done/file")
      .set("If-Modified-Since", String(file.headers["last-modified"]));
    expect(byModified.status).toBe(304);
  });

  it("keeps Express routing defaults for slash, case, long params and gzip", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });
    for (const url of ["/api/competitor/days/", "/API/Competitor/DAYS"]) {
      expectJson(
        await request(app.server).get(url),
        400,
        '{"message":"Valid start and end dates are required"}',
      );
    }
    expectJson(
      await request(app.server).get(`/api/competitor/package/${"a".repeat(150)}`),
      404,
      '{"message":"Package not found"}',
    );

    const zipped = gzipSync('{"names":["Funce"]}');
    // inject carries a raw Buffer; supertest JSON-serialises non-string payloads.
    const gzipResponse = await app.inject({
      method: "POST",
      url: "/api/search-apps",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      payload: zipped,
    });
    expect(gzipResponse.statusCode).toBe(200);
    const badUrl = await app.inject({ method: "GET", url: "/api/competitor/package/%E0%A4%A" });
    expect([badUrl.statusCode, badUrl.headers["content-type"], badUrl.headers["x-powered-by"]])
      .toEqual([400, HTML_TYPE, "Express"]);
  });

  it("serves competitor assets from the configured root", async () => {
    const root = await tempDir();
    const dir = path.join(root, "2026-11-18", "com.example.app");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "icon.png"), "icon-bytes");
    const app = await createTestApp({ ...baseDeps, competitorAssetsDir: root });

    const icon = await request(app.server).get("/competitor-assets/2026-11-18/com.example.app/icon.png");
    expect(icon.status).toBe(200);
    expect(icon.headers["content-type"]).toBe("image/png");
    expect(icon.headers["x-powered-by"]).toBe("Express");
    expect(icon.headers["accept-ranges"]).toBe("bytes");
    expect(icon.headers["cache-control"]).toBe("public, max-age=0");
    expect(icon.headers["last-modified"]).toBe((await stat(path.join(dir, "icon.png"))).mtime.toUTCString());
    expect(icon.headers.etag).toMatch(/^W\/"a-[0-9a-f]+"$/);
    expect(icon.body.toString()).toBe("icon-bytes");
    expect((await request(app.server).get("/competitor-assets/missing.png")).status).toBe(404);
    const bare = await request(app.server).get("/competitor-assets");
    expect([bare.status, bare.headers.location]).toEqual([301, "/competitor-assets/"]);
  });

  it("keeps the Express 404 page, security headers and body byte-for-byte", async () => {
    const app = await createTestApp(baseDeps);
    const response = await request(app.server).get("/whatever");
    expectHtml(response, 404, htmlError("Cannot GET /whatever"));

    // encodeurl keeps existing %XX escapes instead of double-encoding them.
    const encoded = await request(app.server).get("/foo%20bar");
    expectHtml(encoded, 404, htmlError("Cannot GET /foo%20bar"));
  });

  it("keeps Express body-parser 413/400 responses in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const app = await createTestApp(baseDeps);

    const tooLarge = await request(app.server)
      .post("/api/search-apps")
      .set("content-type", "application/json")
      .send(JSON.stringify({ names: ["x".repeat(110000)] }));
    expectHtml(tooLarge, 413, htmlError("Payload Too Large"));

    const malformed = await request(app.server)
      .post("/api/ipa-download")
      .set("content-type", "application/json")
      .send('{"a":');
    expectHtml(malformed, 400, htmlError("Bad Request"));

    vi.stubEnv("NODE_ENV", "test");
    const dev = await request(app.server)
      .post("/api/ipa-download")
      .set("content-type", "application/json")
      .send('{"a":');
    expect(dev.status).toBe(400);
    expect(dev.headers["content-type"]).toBe(HTML_TYPE);
    expect(dev.headers["x-powered-by"]).toBe("Express");
    expect(dev.text.startsWith("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
      + "<title>Error</title>\n</head>\n<body>\n<pre>")).toBe(true);
    expect(dev.text.endsWith("</pre>\n</body>\n</html>\n")).toBe(true);
  });

  it("ignores non-JSON request bodies like express.json()", async () => {
    const manager: IpaDownloadManager = {
      createJob: () => ipaJob("created", "queued"),
      getJob: () => null,
      getFilePath: () => null,
      submitAuthCode: async () => null,
      cancelJob: () => null,
      cleanupExpired: async () => [],
    };
    const app = await createTestApp({ ...baseDeps, ipaDownload: manager });
    const searchMessage = '{"message":"Supply queries with a nonblank name, a Bundle ID, or both, or names as an array of strings"}';

    expectJson(
      await request(app.server).post("/api/search-apps")
        .set("content-type", "text/plain").send(JSON.stringify({ names: ["Funce"] })),
      400,
      searchMessage,
    );
    expectJson(
      await request(app.server).post("/api/search-apps")
        .set("content-type", "application/x-www-form-urlencoded").send("names=Funce"),
      400,
      searchMessage,
    );
    // Only application/json has express.json()'s 100KB limit; large non-JSON bodies are ignored.
    expectJson(
      await request(app.server).post("/api/search-apps")
        .set("content-type", "text/plain").send("x".repeat(110000)),
      400,
      searchMessage,
    );
    // One-off 10MB smoke run: the wildcard parser must drain, not buffer.
    expectJson(
      await request(app.server).post("/api/search-apps")
        .set("content-type", "text/plain").send(Buffer.alloc(10 * 1024 * 1024, "x")),
      400,
      searchMessage,
    );
    expectJson(
      await request(app.server).post("/api/ipa-download")
        .set("content-type", "text/plain").send(JSON.stringify({ bundleId: "com.example.app" })),
      400,
      '{"message":"A valid Bundle ID is required"}',
    );
  });

  it("revalidates weak JSON ETags with 304 like Express", async () => {
    const app = await createTestApp({ ...baseDeps, competitorRepo: emptyRepo() });
    const first = await request(app.server).get("/api/competitor/days?start=2026-11-01&end=2026-11-18");
    expect(first.status).toBe(200);
    const etag = String(first.headers.etag);
    expect(etag).toBe(weakEtag('{"days":[]}'));

    const notModified = await request(app.server)
      .get("/api/competitor/days?start=2026-11-01&end=2026-11-18")
      .set("If-None-Match", etag.replace(/^W\//, ""));
    expect(notModified.status).toBe(304);
    expect(notModified.headers.etag).toBe(etag);
    expect(notModified.headers["x-powered-by"]).toBe("Express");
    expect(notModified.headers["content-type"]).toBeUndefined();
    expect(notModified.headers["content-length"]).toBeUndefined();
  });
});
