# BE-2 search_apps 批量上限（MCP 工具层）

- 依赖：无（独立可开工）
- 角色：backend-developer
- 对应 DESIGN.md §2（search 两行）、§5、§7

## 背景

`search_apps` 实时查 Apple，单查约 4.75 s、服务端并发 3、耗时线性。MCP 工具层无数量上限，agent 一次传大量 queries 会触发客户端超时。20 条约 32 s 已越过常见 30 s 超时线；**10 条约 16 s**，留近一倍余量，故定上限 10。

## 精确改动点

只改 `server/lib/mcp.ts` 的 `search_apps` 工具（`registerTools` 内），两处：

1. `inputSchema.queries`：`z.array(z.object({...})).min(1)` → `.min(1).max(10)`（zod 层双保险）。
2. handler 在 `request()` **之前**加检查：

   ```ts
   if (queries.length > 10) {
     throw new Error(`queries 数量超过上限 10（当前 ${queries.length}），请拆分为多次调用，每次不超过 10 条`);
   }
   ```

   `run()` 现有 catch 会把它转成 `isError: true` 的 tool result，不新增错误通道。超限时不得发起任何 `app.inject`。

3. `description` 追加一句延迟提示：「每次查询约 5 秒、服务端并发 3，10 条约 16 秒，请耐心等待并分批调用」。

**不做**：`POST /api/search-apps` 路由任何改动；并发数调整；分批逻辑（由 agent 分批）。

## 验收标准

1. `tests/server/mcpContract.test.ts` 新用例全绿：11 条 queries → `isError === true` 且 `text` 含「上限 10」与实际数量；同时 `deps.lookupAppStore`（`vi.fn`）零调用，证明超限时上游不被触碰。
2. 10 条 queries → 非 `isError`，行为与改动前一致（现有断言不回归）。
3. zod 层 `.max(10)` 存在（schema 报错为次级防线即可，文案不苛求）。
4. `npx tsc --noEmit` 通过；`mcp.ts` 行数仍在 `tests/lineLimit.test.ts` 限内。

## 测试点速记

超限错误必须发生在任何网络副作用之前（断言 mock 零调用，而非只断言文案）；恰 10 条是合法边界，不误伤。
