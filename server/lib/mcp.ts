import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

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
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
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
    description: "按周统计自有 App 货架：上架数、命中/未命中、iOS 版本、内购、隐私、类目分布。用于了解自家产品线趋势。",
    inputSchema: {
      from: z.string().describe(DATE),
      to: z.string().describe(DATE),
      team: z.string().optional().describe("团队名，精确匹配；不传为全部团队"),
      group_by: z.enum(["category", "ios_version", "iap", "privacy"]).optional().describe("分组维度，默认 category"),
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
    description: "某一天的完整竞品快照：批次信息与所有包（App Store 详情、图标/截图、版本、内购、隐私、命中状态）。日期无数据时返回错误。",
    inputSchema: {
      date: z.string().describe(DATE),
      date_kind: z.enum(["first_ad", "listing"]).optional().describe("按首次投放日或上架日筛选，默认 first_ad"),
    },
    annotations: READ_ONLY,
  }, async ({ date, date_kind }) => run(() => request(
    app, "GET", `/api/competitor/day/${encodeURIComponent(date)}${query({ date_kind })}`,
  )));

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
    description: "按 Bundle ID（package_code）取竞品最新详情：App Store 信息、版本历史、内购、隐私、图标与商店图。",
    inputSchema: {
      packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
    },
    annotations: READ_ONLY,
  }, async ({ packageCode }) => run(() => request(
    app, "GET", `/api/competitor/package/${encodeURIComponent(packageCode)}`,
  )));

  mcp.registerTool("competitor_package_history", {
    title: "竞品包历史快照",
    description: "某竞品在日期区间内的每日快照，可看上下架、版本、类目、商店信息的变化。",
    inputSchema: {
      packageCode: z.string().describe("Bundle ID，也是系统内的 package_code"),
      from: z.string().describe(DATE),
      to: z.string().describe(DATE),
    },
    annotations: READ_ONLY,
  }, async ({ packageCode, from, to }) => run(() => request(
    app, "GET", `/api/competitor/package/${encodeURIComponent(packageCode)}/history${query({ from, to })}`,
  )));

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
    description: "实时查询 Apple App Store（不读本地库）。按名称搜索或按 Bundle ID 精确查找，返回候选、匹配结果、内购与隐私信息。",
    inputSchema: {
      queries: z.array(z.object({
        name: z.string().optional().describe("应用名，可为空"),
        bundleId: z.string().optional().describe("Bundle ID，可为空"),
      })).min(1).describe("查询列表，每项至少填 name 或 bundleId"),
      country: z.string().optional().describe("店面代码，如 us/cn/hk/tw/jp/sg/gb/au，默认 us"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ queries, country }) => run(() => request(
    app, "POST", "/api/search-apps", { queries, country: country ?? "us" },
  )));

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
    await mcp.connect(transport);
    try {
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } finally {
      await transport.close();
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
