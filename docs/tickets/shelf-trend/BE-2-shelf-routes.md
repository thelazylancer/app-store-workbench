# BE-2 新增 /api/public/shelf/* 路由与组装

- 依赖：BE-1
- 角色：backend-developer
- 对应 DESIGN.md §3（API 契约）、§4（模块图）

## 背景

公开命名空间走独立路由文件，挂接方式照抄 `server/routes/competitor.ts`：`onRequest` 前置 503 守卫（仅匹配 `/api/public/shelf` 前缀，与 `/api/competitor` 守卫零重叠）+ `if (!deps.shelfQueries) return;`。

## 范围

**做**：

1. `server/app.ts`：`AppDependencies` 追加可选字段 `shelfQueries?: ShelfQueryRepo`；`createApp` 内调用新文件导出的 `registerShelfRoutes(app, deps)`（模式同 `registerCompetitorRoutes`）。
2. `server/routes/shelf.ts`（新，~130 行）：`GET /api/public/shelf/trend` 与 `GET /api/public/shelf/packages`。参数校验风格照抄 `routes/competitor.ts` 的 `dateParam` 模式（本地小助手，不跨文件共享）；错误 message 与状态码**逐字**按 DESIGN.md §3.4 表格（含 `limit` 1..500 默认 200、`team` 长度 > 255 → 400）。
3. `server/index.ts`：`competitorRepoFromEnv` 改为同时产出 `shelfQueries = createShelfQueries(pool)`，随 `competitorRepo` 一起可选传入 `createApp`；无 DB 时两者都缺省，shelf 路由 503。
4. `tests/server/shelfContract.test.ts`：supertest + `createTestApp({ ..., shelfQueries: fake })`（fake 模式抄 `competitorContract.test.ts` 的 `emptyRepo`）：400 矩阵（缺 from、from>to、>366 天、非法 group_by、非法 limit）、503（不传 `shelfQueries`）、200 形状对照 `shared/shelfTypes.ts`、**敏感字段泄露断言**——两端点响应 `JSON.stringify` 后不含 `displayName`、`firstAdDate`、`lookupStatus`、`enrichStatus`、`assetStatus`、`appStoreJson`、`syncId`、`snapshotId`、`stale`、`batchStatus`。

**不做**：改任何 `/api/competitor/*` 路由、守卫、文案；改 `shared/competitorTypes.ts`。

## 验收

1. `npm test` 全绿；现有 `httpContract.test.ts`、`competitorContract.test.ts` 零改动零失败。
2. `curl` 冒烟：无 `DATABASE_URL` 起服务 → `/api/public/shelf/trend?from=2026-11-01&to=2026-11-20` 返回 503 `{message:"Shelf data is unavailable"}`；有库时返回 DESIGN.md §3.1 形状。
3. `npx tsc --noEmit` 通过；`server/routes/shelf.ts` ≤500 行。

## 风险

`index.ts` 组装顺序变化只允许「新增可选依赖」这一种 diff；`app.ts` 已 93 行，本票只加 2 行（类型字段 + 注册调用），不重构。
