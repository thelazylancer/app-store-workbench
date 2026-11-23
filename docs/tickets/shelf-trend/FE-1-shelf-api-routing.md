# FE-1 shelfApi + /shelf 路由与导航修正

- 依赖：BE-2（契约测试需要真实路由）
- 角色：frontend-developer
- 对应 DESIGN.md §3（契约）、§5（前端模块）

## 背景

前端取数层与路由骨架先行，页面在 FE-2 落地。`isNavActive`（`src/app/navItems.ts` L13）只排除 `/search`，加 `/shelf` 后访问它会错误高亮「竞品日报」——本票修正。

## 范围

**做**：

1. `src/lib/shelfApi.ts`（新，~90 行）：`getShelfTrend({from,to,team,groupBy})`、`getShelfPackages({from,to,team,limit?})`、`ShelfApiError`。风格逐行对照 `src/lib/competitorApi.ts`：503 → 「竞品趋势暂不可用：服务端未配置数据库」、网络失败 → 「网络请求失败，请检查服务是否可用」、其余透传 HTTP 状态。`team` 为 null 时省略 query 参数。
2. `src/app/routes.tsx`：`NAV_ITEMS` 加 `{ to: "/shelf", label: "竞品趋势" }`（顺序：竞品日报、竞品趋势、App Store 搜索）；`<Route path="/shelf" element={<ShelfTrendPage />} />`；`ShelfTrendPage` 本票先导出一个复用 `Placeholder` 的占位（标题「竞品趋势」，FE-2 替换实现）。
3. `src/app/navItems.ts`：`isNavActive` 的 `to === "/"` 分支改为 `!pathname.startsWith("/search") && !pathname.startsWith("/shelf")`。`/package/:code` 归属竞品日报的现状语义不变。
4. 测试：`tests/frontend/shelfApi.test.ts` 用 `competitorContract.test.ts` 的 `stubFetchToApp` 模式走真实 Fastify 路由断言参数往返与错误映射；`tests/frontend/routes.test.tsx` 追加断言：访问 `/shelf` 时「竞品趋势」高亮且「竞品日报」**不**高亮，`/package/x` 仍高亮「竞品日报」。

**不做**：页面实现（FE-2）、图表（FE-3）；不改 `useQueryFilters`。

## 验收

1. `npm test` 全绿（含追加的 routes 断言）；`npx tsc --noEmit`、`npm run build` 通过。
2. dev 打开 `/shelf`：导航出现「竞品趋势」且自身高亮、「竞品日报」不高亮；`/` 与 `/package/:code` 高亮行为与改动前一致。
3. 新文件 ≤500 行。

## 风险

`isNavActive` 是共享函数，改动可能波及 `/`、`/search` 的高亮；routes 测试必须覆盖三个既有路径回归后再改实现。
