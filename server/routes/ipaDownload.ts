import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isFresh } from "../lib/fastifyErrors";
import type { AppDependencies } from "../app";

const BUNDLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

type Body = { bundleId?: unknown; code?: unknown } | undefined;

type ByteRange = { start: number; end: number };

// One range only; `send` also falls back to the full body for multi-range requests.
function parseByteRange(header: string, size: number): ByteRange | "unsatisfiable" | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  if (size === 0) return "unsatisfiable";
  const [, rawStart = "", rawEnd = ""] = match;
  const start = rawStart === "" ? Math.max(size - Number(rawEnd), 0) : Number(rawStart);
  if (rawStart === "" && Number(rawEnd) === 0) return "unsatisfiable";
  const end = rawStart === "" || rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}

function ifRangeMatches(header: unknown, etag: string, modified: number): boolean {
  if (typeof header !== "string") return true;
  if (header === etag) return true;
  const time = Date.parse(header);
  return !Number.isNaN(time) && modified <= time;
}

export function registerIpaDownloadRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.post("/api/ipa-download", async (request, reply) => {
    if (!deps.ipaDownload) {
      return reply.code(503).send({ message: "IPA download is unavailable" });
    }
    const body = request.body as Body;
    const bundleId = typeof body?.bundleId === "string" ? body.bundleId.trim() : "";
    if (!BUNDLE_ID_PATTERN.test(bundleId)) {
      return reply.code(400).send({ message: "A valid Bundle ID is required" });
    }
    return reply.code(202).send(deps.ipaDownload.createJob(bundleId));
  });

  app.get("/api/ipa-download/:id", async (request, reply) => {
    if (!deps.ipaDownload) {
      return reply.code(503).send({ message: "IPA download is unavailable" });
    }
    const job = deps.ipaDownload.getJob((request.params as { id: string }).id);
    if (!job) {
      return reply.code(404).send({ message: "IPA download job not found" });
    }
    return reply.send(job);
  });

  app.post("/api/ipa-download/:id/auth-code", async (request, reply) => {
    if (!deps.ipaDownload) {
      return reply.code(503).send({ message: "IPA download is unavailable" });
    }
    const body = request.body as Body;
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return reply.code(400).send({ message: "A 6-digit verification code is required" });
    }
    const id = (request.params as { id: string }).id;
    const job = deps.ipaDownload.getJob(id);
    if (!job) {
      return reply.code(404).send({ message: "IPA download job not found" });
    }
    if (job.status !== "awaiting_auth_code") {
      return reply.code(409).send({ message: "This IPA download is not waiting for a verification code" });
    }
    const updated = await deps.ipaDownload.submitAuthCode(id, code);
    if (!updated) {
      return reply.code(409).send({ message: "This IPA download is not waiting for a verification code" });
    }
    return reply.code(202).send(updated);
  });

  app.delete("/api/ipa-download/:id", async (request, reply) => {
    if (!deps.ipaDownload) {
      return reply.code(503).send({ message: "IPA download is unavailable" });
    }
    const id = (request.params as { id: string }).id;
    const existing = deps.ipaDownload.getJob(id);
    if (!existing) {
      return reply.code(404).send({ message: "IPA download job not found" });
    }
    const cancelled = deps.ipaDownload.cancelJob(id);
    if (!cancelled) {
      return reply.code(409).send({ message: "This IPA download has already finished" });
    }
    return reply.code(202).send(cancelled);
  });

  app.get("/api/ipa-download/:id/file", async (request, reply) => {
    if (!deps.ipaDownload) {
      return reply.code(503).send({ message: "IPA download is unavailable" });
    }
    const id = (request.params as { id: string }).id;
    const job = deps.ipaDownload.getJob(id);
    const filePath = job?.status === "done" ? deps.ipaDownload.getFilePath(id) : null;
    if (!job || !filePath) {
      return reply.code(404).send({ message: "IPA file is not ready" });
    }
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(filePath);
    } catch {
      return reply.code(404).send({ message: "IPA file is not available" });
    }
    const etag = `W/"${info.size.toString(16)}-${info.mtime.getTime().toString(16)}"`;
    const modified = Date.parse(info.mtime.toUTCString());
    reply
      .header("content-disposition", `attachment; filename="${job.bundleId}.ipa"`)
      .header("content-type", "application/octet-stream")
      .header("accept-ranges", "bytes")
      .header("cache-control", "public, max-age=0")
      .header("last-modified", info.mtime.toUTCString())
      .header("etag", etag);
    if (isFresh(request.headers, etag, modified)) {
      reply.code(304).removeHeader("content-type").removeHeader("content-length");
      return reply.send();
    }
    let range: ByteRange | null = null;
    if (typeof request.headers.range === "string" && ifRangeMatches(request.headers["if-range"], etag, modified)) {
      const parsed = parseByteRange(request.headers.range, info.size);
      if (parsed === "unsatisfiable") {
        reply.code(416).header("content-range", `bytes */${info.size}`);
        return reply.send();
      }
      range = parsed;
    }
    reply.header("content-length", String(range ? range.end - range.start + 1 : info.size));
    if (range) {
      reply.code(206).header("content-range", `bytes ${range.start}-${range.end}/${info.size}`);
    }
    return reply.send(createReadStream(filePath, range ?? undefined));
  });
}
