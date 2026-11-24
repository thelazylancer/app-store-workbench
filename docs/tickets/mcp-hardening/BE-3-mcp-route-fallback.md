# BE-3 /mcp 路由异常兜底（hijack 后的 JSON-RPC error）

- 依赖：无（独立可开工）
- 角色：backend-developer
- 对应 DESIGN.md §2（兜底两行）、§6、§7

## 背景

`POST /mcp` 在 `reply.hijack()` 后把请求交给 `StreamableHTTPServerTransport.handleRequest`。若其内部抛错，Fastify 已交出响应权，客户端可能只收到空 500。需要兜底写 JSON-RPC 2.0 error，且日志不得含请求体（MCP 客户端可能经工具参数携带 6 位验证码，服务端日志面必须干净）。

## 精确改动点

只改 `server/lib/mcp.ts` 的 `registerMcpRoute` 中 `app.post("/mcp", ...)` handler：

1. `transport.handleRequest(...)` 外层加 `catch`（`finally` 的 `transport.close()` 保持现状不动）：

   ```text
   catch (error):
     日志（唯一落点 console.error，模式同 server/index.ts）：
       const name = error instanceof Error ? error.constructor.name : typeof error 之外兜底 String
       const frames = error instanceof Error && typeof error.stack === "string"
         ? error.stack.split("\n").slice(1).join("\n") : ""     // 去掉首行 message——它可能内嵌请求值
       console.error("[mcp]", name, frames)
     if (!reply.raw.headersSent):
       const id = request.body 中 id 为 string|number 时原样回显，否则 null
       reply.raw.writeHead(500, { "content-type": "application/json" })
       reply.raw.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id }))
     else:
       reply.raw.destroy()      // 头已发，状态码不可改写，断开让客户端感知失败
   ```

2. `request.body` 已由 Fastify 在 hijack 前解析完成（`app.ts` 的 content-type parser），直接读 `id`，不再重新解析；body 非法/缺失时 `id` 落 `null`。
3. `app.get("/mcp")` / `app.delete("/mcp")` 的 405 handler **一字不动**。

**不做**：SSE、鉴权、重试、请求体日志（明确禁止）；不动 `run()` 的 tool 级错误通道（那是 tool result，不是 transport 级）。

## 验收标准

1. 新建 `tests/server/mcpRouteFallback.test.ts` 全绿（`vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js"` 伪造 transport，注释标注当前 SDK 版本）：
   - 用例 1：mock `handleRequest` 同步 reject → 响应 500、`content-type: application/json`、体为 `{ jsonrpc: "2.0", error: { code: -32603, ... }, id: <回显值> }`。
   - 用例 2：mock 先对 `reply.raw` `writeHead(200)` 再 reject → 无未捕获异常、连接被销毁（supertest 断言请求以错误或空响应终结即可）。
   - 用例 3：`vi.spyOn(console, "error")`，fixture 请求体里埋哨兵字符串（模拟敏感值）→ 日志参数串起来不含哨兵；且含错误类型名。
   - 用例 4：GET / DELETE 仍 405 且 `allow: POST`（回归现有行为，mock 在场时同样成立）。
2. 现有 `tests/server/mcpContract.test.ts` 零改动零失败（正常路径不受影响）。
3. `npx tsc --noEmit` 通过；`mcp.ts` 行数达标、无豁免。

## 测试点速记

`headersSent` 两分支都要走到；`id` 回显只接受 string|number（对象/数组 id 落 null，防伪造 JSON-RPC 规格外的响应）；`error.stack` 首行必须剥掉（message 可能含请求值）；`finally` 里 `transport.close()` 在错误路径同样执行（现有代码语义保持）。
