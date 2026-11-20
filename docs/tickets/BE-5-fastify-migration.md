# BE-5 Express 5 → Fastify（HTTP 契约逐字节不变）

- 依赖：BE-1、BE-2 先合入更稳（非硬阻塞）
- 角色：backend-developer
- 对应 ARCH §3（保真语义表 §3.1、文件结构 §3.2、测试策略 §3.3）

## 背景

后端框架从 Express 5 换 Fastify。所有已定义端点的路径、方法、状态码、JSON 字段、错误文案、Content-Type、下载文件名保持不变；前端与现有测试的请求行零改动；Express 依赖移除。涉及端点全景：

- `GET /api/competitor/{days,summary,day/:date,batch/:date,package/:code,package/:code/history}`（无 repo 时整前缀 503）
- `GET /api/app-details/:appleId`（400/404/502）
- `POST /api/search-apps`（400×2、200）
- `POST /api/ipa-download`（503/400/202）、`GET /api/ipa-download/:id`（503/404/200）、`POST /api/ipa-download/:id/auth-code`（503/400/404/409/202）、`DELETE /api/ipa-download/:id`（503/404/409/202）、`GET /api/ipa-download/:id/file`（503/404/下载流）
- 静态 `/competitor-assets/*`

## 施工步骤（顺序执行）

1. **先写 golden 契约测试**（在 Express 版上生成）：新增 `tests/server/httpContract.test.ts`，用 supertest 逐端点把 状态码 + 响应正文序列化为 golden 字符串（错误路径逐个触发：无 repo 的 503、非法 country 400、未找到 404、auth-code 409 等）。Express 版上必须先全绿——这是「迁移前规范」。
2. **建 Fastify 骨架**：`server/app.ts` 重写为组装 root（≤80 行），`createApp(deps)` 返回 Fastify 实例（依赖注入接口 `AppDependencies` 不变）。
3. **错误形状**：新增 `server/lib/fastifyErrors.ts`——`setErrorHandler` 统一输出 `{message}`；未定义路径 404 也走它（ARCH §6 已知差异第 1 条）。
4. **路由平移**（以现行 `server/app.ts` 与 `server/lib/competitorApi.ts` 为唯一规范）：
   - `server/routes/competitor.ts`：`/api/competitor/*` + `onRequest` 503 守卫（文案 `"Competitor data is unavailable"`）。
   - `server/routes/search.ts`：`/api/app-details/:appleId`、`/api/search-apps`（含 `enrichApp`、`mapWithConcurrency` 并发 3、`BUNDLE_ID_PATTERN` 之外 country 校验文案）。
   - `server/routes/ipaDownload.ts`：五个端点 + 下载流。下载用 `reply.header("content-disposition", 'attachment; filename="<bundleId>.ipa"')` + `send(stream)`，Content-Type 与 Express `res.download` 一致（`application/octet-stream`）。
5. **静态资源**：`@fastify/static` 挂 `/competitor-assets`，root 同现状（`deps.competitorAssetsDir ?? data/competitor`）。
6. **body 解析**：Fastify 内建 JSON parser；不引入 JSON Schema 校验（会改变 400 的正文与文案）。
7. **测试样板**：`tests/server/*` 的 supertest 请求行零改动，只把 `beforeAll` 启动样板改为 `await app.ready(); request(app.server)`（允许改的就是这两三行）。
8. **依赖**：`npm rm express @types/express`；`npm i fastify @fastify/static`（精确锁版本）。

## 验收

1. `npx vitest run tests/server` 全绿，`httpContract.test.ts` golden 逐字节通过（除 ARCH §6 已知差异）。
2. `git grep express -- server/ package.json` 无业务命中（仅历史注释除外）。
3. `server/app.ts` + `server/routes/*` + `server/lib/fastifyErrors.ts` 各 ≤500 行。
4. 手工冒烟：`POST /api/search-apps`（含非法 body 400 文案对拍）、`GET /api/competitor/days`、`POST /api/ipa-download` 全流程、下载文件响应头含 `attachment; filename="<bundleId>.ipa"`。
5. `dev:server` 脚本仍可用（tsx watch 不变），node-cron 08:00 行为不变（`server/index.ts` 只改 import 与启动样板）。

## 风险

- 错误正文格式：Fastify 默认 `{statusCode, error, message}`，必须被全局 handler 覆盖成 `{message}`——golden 测试逐条兜底。
- 下载流：Express `res.download` 自带 `Content-Length`/`Content-Type`；Fastify 侧用 `stat` 后补齐，用 curl `-D` 对拍响应头。
- cron 与 Fastify 同进程：`server/index.ts` 在 `app.listen` 后注册 cron，顺序同现状。
