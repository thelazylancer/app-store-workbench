import { createHash } from "node:crypto";
import { STATUS_CODES } from "node:http";
import type { FastifyInstance, FastifyReply } from "fastify";

const HTML_TYPE = "text/html; charset=utf-8";

function escapeHtml(value: string): string {
  return value.replace(/["'&<>]/g, (char) => {
    switch (char) {
      case '"': return "&quot;";
      case "&": return "&amp;";
      case "'": return "&#39;";
      case "<": return "&lt;";
      default: return "&gt;";
    }
  });
}

export function expressErrorHtml(message: string): string {
  const body = escapeHtml(message)
    .replaceAll("\n", "<br>")
    .replaceAll("  ", " &nbsp;");
  return "<!DOCTYPE html>\n"
    + "<html lang=\"en\">\n"
    + "<head>\n"
    + "<meta charset=\"utf-8\">\n"
    + "<title>Error</title>\n"
    + "</head>\n"
    + "<body>\n"
    + `<pre>${body}</pre>\n`
    + "</body>\n"
    + "</html>\n";
}

function sendHtml(reply: FastifyReply, status: number, message: string): void {
  const body = expressErrorHtml(message);
  reply
    .code(status)
    .header("content-security-policy", "default-src 'none'")
    .header("x-content-type-options", "nosniff")
    .header("content-type", HTML_TYPE)
    .header("content-length", String(Buffer.byteLength(body)))
    .send(body);
}

function errorStatus(error: unknown): number {
  const err = error as { statusCode?: unknown; status?: unknown };
  const value = typeof err.statusCode === "number" ? err.statusCode : err.status;
  return typeof value === "number" && value >= 400 && value < 600 ? value : 500;
}

function errorMessage(error: unknown, status: number): string {
  const env = process.env.NODE_ENV ?? "development";
  if (env !== "production") {
    const err = error as { stack?: unknown; toString?: () => string };
    const stack = typeof err.stack === "string" ? err.stack : undefined;
    if (stack) return stack;
    if (typeof err.toString === "function") return err.toString();
  }
  return STATUS_CODES[status] ?? "Error";
}

function weakEtag(body: Buffer): string {
  if (body.length === 0) return 'W/"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"';
  const hash = createHash("sha1").update(body).digest("base64").substring(0, 27);
  return `W/"${body.length.toString(16)}-${hash}"`;
}

// Same weak comparison as Express `req.fresh` (via the fresh package).
export function isFresh(
  headers: Record<string, unknown>,
  etag: string,
  lastModified?: number,
): boolean {
  const noneMatch = headers["if-none-match"];
  const modifiedSince = headers["if-modified-since"];
  if (typeof noneMatch !== "string" && typeof modifiedSince !== "string") return false;
  const cacheControl = headers["cache-control"];
  if (typeof cacheControl === "string"
    && /(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(cacheControl)) return false;
  if (typeof noneMatch === "string" && noneMatch !== "*") {
    const matched = noneMatch.split(",").some((token) => {
      const match = token.trim();
      return match === etag || match === `W/${etag}` || `W/${match}` === etag;
    });
    if (!matched) return false;
  }
  if (typeof modifiedSince === "string") {
    if (lastModified === undefined) return false;
    const since = Date.parse(modifiedSince);
    if (Number.isNaN(since) || lastModified > since) return false;
  }
  return true;
}

// Express finalhandler runs `encodeurl`, which keeps existing %XX escapes.
function encodeUrlPath(pathname: string): string {
  return encodeURI(pathname).replace(/%25([0-9a-fA-F]{2})/g, "%$1");
}

function sendHtmlReply(reply: FastifyReply, method: string, status: number, message: string): void {
  if (!reply.hasHeader("x-powered-by")) reply.header("x-powered-by", "Express");
  if (method === "HEAD") {
    reply.code(status)
      .header("content-security-policy", "default-src 'none'")
      .header("x-content-type-options", "nosniff")
      .header("content-type", HTML_TYPE)
      .header("content-length", String(Buffer.byteLength(expressErrorHtml(message))))
      .send();
    return;
  }
  sendHtml(reply, status, message);
}

function sendErrorReply(reply: FastifyReply, method: string, error: unknown): void {
  const status = errorStatus(error);
  sendHtmlReply(reply, method, status, errorMessage(error, status));
}

// Fastify raises routing errors (e.g. malformed %XX) before hooks, so they need
// the same Express-shaped response as setErrorHandler.
export function handleFrameworkError(error: Error, request: { method: string }, reply: FastifyReply): void {
  sendErrorReply(reply, request.method, error);
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    if (!reply.hasHeader("x-powered-by")) reply.header("x-powered-by", "Express");

    const contentType = reply.getHeader("content-type");
    if (!reply.hasHeader("etag") && typeof contentType === "string"
      && contentType.startsWith("application/json")) {
      const body = typeof payload === "string"
        ? Buffer.from(payload)
        : Buffer.isBuffer(payload) ? payload : null;
      if (body) {
        const etag = weakEtag(body);
        reply.header("etag", etag);
        const status = reply.statusCode;
        if (status >= 200 && status < 300 && isFresh(request.headers, etag)) {
          reply.code(304);
          reply.removeHeader("content-type");
          reply.removeHeader("content-length");
          return null;
        }
      }
    }

    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    sendErrorReply(reply, request.method, error);
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = (request.raw.url ?? "/").split("?")[0] || "/";
    sendHtmlReply(reply, request.method, 404, `Cannot ${request.method} ${encodeUrlPath(pathname)}`);
  });
}
