import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { DayDetail, PackageDetail, SnapshotEntry } from "../../shared/competitorTypes";
import { compactDayDetail, compactPackageDetail, compactPackageHistory } from "./mcpCompact";

// Tools reuse the HTTP routes through inject, so validation and shape stay in one place.
async function request(
  app: FastifyInstance,
  method: "GET" | "POST" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
): Promise<unknown> {
  const response = await app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
  });
  const contentType = String(response.headers["content-type"] ?? "");
  const body = response.body && contentType.includes("application/json")
    ? (response.json() as unknown)
    : response.body;
  if (response.statusCode >= 400) {
    const message = typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : response.body;
    throw new Error(`HTTP ${response.statusCode}: ${message || response.statusMessage}`);
  }
  return body;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

async function run(action: () => Promise<unknown>) {
  try {
    return result(await action());
  } catch (error) {
    return {
      isError: true as const,
      content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }],
    };
  }
}

const DATE = "日期，格式 YYYY-MM-DD（北京时间业务日）";
const READ_ONLY = { readOnlyHint: true };

function registerTools(mcp: McpServer, app: FastifyInstance): void {
  mcp.registerTool("shelf_trend", {
    title: "自有货架趋势",
    description: "按周统计自有 App 货架：上架数、命中/未命中、iOS 版本、内购、隐私、类目、归因分布。用于了解自家产品线趋势。",
    inputSchema: {
      from: z.string().describe(DATE),
      to: z.string().describe(DATE),
      team: z.string().optional().describe("团队名，精确匹配；不传为全部团队"),
      group_by: z.enum(["category", "ios_version", "iap", "privacy", "attribution"]).optional().describe("分组维度，默认 category"),
    },
    annotations: READ_ONLY,
  }, async ({ from, to, team, group_by }) => run(() => request(
    app, "GET", `/api/public/shelf/trend${query({ from, to, team, group_by })}`,
  )));

  mcp.registerTool("shelf_packages", {
    title: "自有货架包列表",
    description: "列出时间范围内自有团队上架的 App 包，含名称、团队、上架/下架日期、版本、内购、隐私政策链接等。",
    inputSchema: {
      from: z.string().describe(DATE),
      to: z.string().describe(DATE),
      team: z.string().optional().describe("团队名，精确匹配；不传为全部团队"),
      limit: z.number().int().min(1).max(500).optional().describe("返回条数上限，默认 100"),
    },
    annotations: READ_ONLY,
  }, async ({ from, to, team, limit }) => run(() => request(
    app, "GET", `/api/public/shelf/packages${query({ from, to, team, limit: limit ?? 100 })}`,
  )));

  mcp.registerTool("competitor_days", {
    title: "竞品有数据的日期",
    description: "列出竞品快照存在的日期及每天包数、命中数、未命中数和批次状态。用于确定可查询的日期范围。",
    inputSchema: {
      start: z.string().describe(DATE),
      end: z.string().describe(DATE),
    },
    annotations: READ_ONLY,
  }, async ({ start, end }) => run(() => request(
    app, "GET", `/api/competitor/days${query({ start, end })}`,
  )));

  mcp.registerTool("competitor_day", {
    title: "竞品单日明细",
    description: "某一天的完整竞品快照：批次信息与所有包（App Store 详情、图标/截图、版本、内购、隐私、命中状态）。日期无数据时返回错误。默认返回紧凑投影，传 `compact: false` 可取全量。",
    inputSchema: {
      date: z.string().describe(DATE),
      date_kind: z.enum(["first_ad", "listing"]).optional().describe("按首次投放日或上架日筛选，默认 first_ad"),
      compact: z.boolean().optional().describe("默认 true：紧凑投影，省略长文本与原始 JSON；传 false 取全量"),
    },
    annotations: READ_ONLY,
  }, async ({ date, date_kind, compact }) => run(async () => {
    const data = await request(app, "GET", `/api/competitor/day/${encodeURIComponent(date)}${query({ date_kind })}`);
    return compact === false ? data : compactDayDetail(data as DayDetail);
  }));

  mcp.registerTool("competitor_batch", {
    title: "竞品批次状态",
    description: "某天的抓取批次元数据：sync_id、snapshot_id、数据更新时间、发布状态、是否完整/过期。",
    inputSchema: { date: z.string().describe(DATE) },
    annotations: READ_ONLY,
  }, async ({ date }) => run(() => request(
    app, "GET", `/api/competitor/batch/${encodeURIComponent(date)}`,
  )));

  mcp.registerTool("competitor_summary", {
    title: "竞品汇总",
    description: "按类目/团队/iOS 版本聚合竞品，含每组包数、命中/未命中/待处理数、竞争对手列表。传 date 查单日；传 from/to 查区间（from 与 date 互斥）。",
    inputSchema: {
      date: z.string().optional().describe(`${DATE}；与 from/to 二选一`),
      from: z.string().optional().describe(`${DATE}；与 to 一起传区间`),
      to: z.string().optional().describe(`${DATE}；与 from 一起传区间`),
      date_kind: z.enum(["first_ad", "listing"]).optional().describe("默认 first_ad"),
      group_by: z.enum(["category", "team", "ios_version"]).optional().describe("默认 category"),
    },
    annotations: READ_ONLY,
  }, async ({ date, from, to, date_kind, group_by }) => run(() => request(
    app, "GET", `/api/competitor/summary${query({ date, from, to, date_kind, group_by })}`,
  )));

  mcp.registerTool("competitor_package", {
    title: "竞品包详情",
    description: "按 Bundle ID（package_code）取竞品最新详情：App Store 信息、版本历史、内购、隐私、图标与商店图。默认返回紧凑投影，传 `compact: false` 可取全量。",
    inputSchema: {
      packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
      compact: z.boolean().optional().describe("默认 true：紧凑投影，省略长文本与原始 JSON；传 false 取全量"),
    },
    annotations: READ_ONLY,
  }, async ({ packageCode, compact }) => run(async () => {
    const data = await request(app, "GET", `/api/competitor/package/${encodeURIComponent(packageCode)}`);
    return compact === false ? data : compactPackageDetail(data as PackageDetail);
  }));

  mcp.registerTool("competitor_package_history", {
    title: "竞品包历史快照",
    description: "某竞品在日期区间内的每日快照，可看上下架、版本、类目、商店信息的变化。默认返回紧凑投影，传 `compact: false` 可取全量。",
    inputSchema: {
      packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
      from: z.string().describe(DATE),
      to: z.string().describe(DATE),
      compact: z.boolean().optional().describe("默认 true：紧凑投影，省略长文本与原始 JSON；传 false 取全量"),
    },
    annotations: READ_ONLY,
  }, async ({ packageCode, from, to, compact }) => run(async () => {
    const data = await request(
      app, "GET", `/api/competitor/package/${encodeURIComponent(packageCode)}/history${query({ from, to })}`,
    ) as { packageCode: string; snapshots: SnapshotEntry[] };
    return compact === false ? data : compactPackageHistory(data);
  }));

  mcp.registerTool("competitor_country_hits", {
    title: "竞品各国命中",
    description: "某竞品在各国 App Store 的命中结果（hit/not_found、苹果 ID、抓取时间），可判断可用地区与是否下架。",
    inputSchema: {
      packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
    },
    annotations: READ_ONLY,
  }, async ({ packageCode }) => run(() => request(
    app, "GET", `/api/competitor/package/${encodeURIComponent(packageCode)}/country-hits`,
  )));

  mcp.registerTool("search_apps", {
    title: "App Store 搜索",
    description: "实时查询 Apple App Store（不读本地库）。按名称搜索或按 Bundle ID 精确查找，返回候选、匹配结果、内购与隐私信息。每次查询约 5 秒、服务端并发 3，10 条约 16 秒，请耐心等待并分批调用。",
    inputSchema: {
      queries: z.array(z.object({
        name: z.string().optional().describe("应用名，可为空"),
        bundleId: z.string().optional().describe("Bundle ID，可为空"),
      })).min(1).max(10, {
        error: (issue) => `queries 数量超过上限 10（当前 ${Array.isArray(issue.input) ? issue.input.length : "未知"}），请拆分为多次调用，每次不超过 10 条`,
      }).describe("查询列表，每项至少填 name 或 bundleId；每次不超过 10 条"),
      country: z.string().optional().describe("店面代码，如 us/cn/hk/tw/jp/sg/gb/au，默认 us"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ queries, country }) => run(async () => {
    if (queries.length > 10) {
      throw new Error(`queries 数量超过上限 10（当前 ${queries.length}），请拆分为多次调用，每次不超过 10 条`);
    }
    return request(app, "POST", "/api/search-apps", { queries, country: country ?? "us" });
  }));

  mcp.registerTool("app_details", {
    title: "App Store 详情",
    description: "按苹果 ID 实时查询某国店面的 App 详情（名称、开发者、版本、内购、隐私等）。",
    inputSchema: {
      appleId: z.number().int().positive().describe("苹果 App ID，如 123456789"),
      country: z.string().optional().describe("店面代码，默认 us"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ appleId, country }) => run(() => request(
    app, "GET", `/api/app-details/${appleId}${query({ country: country ?? "us" })}`,
  )));

  mcp.registerTool("competitor_set_attribution", {
    title: "更新竞品归因",
    description: "按 Bundle ID 写入归因分类（如 adjust、appsflyer、branch、kochava），传 null 清除；值会转小写。批量最多 500 条，返回 updated 与 missing。用于下载 IPA 分析后回填。",
    inputSchema: {
      updates: z.array(z.object({
        packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
        attribution: z.string().nullable().describe("归因分类；null 表示清除"),
      })).min(1).max(500).describe("批量更新，最多 500 条"),
    },
    annotations: { destructiveHint: false, idempotentHint: true },
  }, async ({ updates }) => run(() => request(app, "POST", "/api/competitor/attribution", { updates })));

  mcp.registerTool("ipa_download_start", {
    title: "开始下载 IPA",
    description: "在服务器上用 ipatool 下载指定 Bundle ID 的 IPA。返回 job id，随后用 ipa_download_status 查询进度；若需 Apple 验证码，用 ipa_download_submit_code 提交。",
    inputSchema: {
      bundleId: z.string().describe("要下载的 Bundle ID"),
      team: z.string().optional().describe("来源团队，仅用于文件名"),
      appName: z.string().optional().describe("应用名，仅用于文件名"),
    },
    annotations: { destructiveHint: false, openWorldHint: true },
  }, async ({ bundleId, team, appName }) => run(() => request(
    app, "POST", "/api/ipa-download", { bundleId, ...(team ? { team } : {}), ...(appName ? { appName } : {}) },
  )));

  mcp.registerTool("ipa_download_status", {
    title: "IPA 下载状态",
    description: "查询 IPA 下载任务。完成后额外返回 fileApiPath，可用同源 GET 请求下载文件。",
    inputSchema: { id: z.string().describe("ipa_download_start 返回的任务 id") },
    annotations: READ_ONLY,
  }, async ({ id }) => run(async () => {
    const job = await request(app, "GET", `/api/ipa-download/${encodeURIComponent(id)}`);
    const status = typeof job === "object" && job !== null ? (job as { status?: unknown }).status : undefined;
    return status === "done"
      ? { ...(job as Record<string, unknown>), fileApiPath: `/api/ipa-download/${encodeURIComponent(id)}/file` }
      : job;
  }));

  mcp.registerTool("ipa_download_submit_code", {
    title: "提交 IPA 验证码",
    description: "向等待验证码的 IPA 下载任务提交 6 位 Apple 验证码。验证码不会被记录。",
    inputSchema: {
      id: z.string().describe("ipa_download_start 返回的任务 id"),
      code: z.string().regex(/^\d{6}$/).describe("6 位数字验证码"),
    },
    annotations: { destructiveHint: false },
  }, async ({ id, code }) => run(() => request(
    app, "POST", `/api/ipa-download/${encodeURIComponent(id)}/auth-code`, { code },
  )));

  mcp.registerTool("ipa_download_cancel", {
    title: "取消 IPA 下载",
    description: "取消尚未完成的 IPA 下载任务并清理文件。已结束的任务无法取消。",
    inputSchema: { id: z.string().describe("ipa_download_start 返回的任务 id") },
    annotations: { destructiveHint: true },
  }, async ({ id }) => run(() => request(
    app, "DELETE", `/api/ipa-download/${encodeURIComponent(id)}`,
  )));
}

export function registerMcpRoute(app: FastifyInstance): void {
  app.post("/mcp", async (request, reply) => {
    reply.hijack();
    // Stateless transports cannot be reused: the SDK requires a fresh one per request.
    const mcp = new McpServer({ name: "app-store-workbench", version: "1.0.0" });
    registerTools(mcp, app);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    let connected = false;
    try {
      await mcp.connect(transport);
      connected = true;
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      // After hijack Fastify cannot write the reply; emit a JSON-RPC error or drop the socket.
      // SDK validation messages can echo request values, so log only the type and stack frames.
      const name = error instanceof Error ? error.constructor.name : "NonError";
      // Keep only frames: message lines (which may echo request values) are not frames.
      const frames = error instanceof Error && typeof error.stack === "string"
        ? error.stack.split("\n").filter((line) => /^\s+at /.test(line)).join("\n")
        : "";
      console.error("[mcp]", name, frames);
      if (!reply.raw.headersSent) {
        const body = request.body;
        const rawId = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
        const id = typeof rawId === "string" || typeof rawId === "number" ? rawId : null;
        reply.raw.writeHead(500, { "content-type": "application/json" });
        reply.raw.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id,
        }));
      } else {
        reply.raw.destroy();
      }
    } finally {
      // A close failure must not mask the original transport error.
      if (connected) await transport.close().catch(() => undefined);
    }
  });

  const notAllowed = async (_request: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header("allow", "POST").send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    });
  app.get("/mcp", notAllowed);
  app.delete("/mcp", notAllowed);
}
