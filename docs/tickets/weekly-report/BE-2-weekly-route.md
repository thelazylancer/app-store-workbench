# BE-2 weekly-report 路由 + 依赖注入

- 依赖：BE-1
- 角色：backend-developer
- 对应 DESIGN.md §3.1、§6

## 背景

端点在 `/api/competitor/` 命名空间下，503 守卫 hook（`server/routes/competitor.ts:35-41`）已覆盖并给出需求要求的文案；路由加在本文件最省且语义一致。

## 范围

**做**：

1. `server/app.ts`：`AppDependencies` 增加 `weeklyReport?: WeeklyReportRepo`（import 类型，不 import 实现）。
2. `server/routes/competitor.ts`：新增 `GET /api/competitor/weekly-report`：
   - `week` 缺省 → `deps.weeklyReport.latestCompleteDataWeek(todayShanghai)`，null 回退 `isoWeekStart(todayShanghai) - 7`；「今天」按 Asia/Shanghai 计算。
   - `week` 存在 → `dateParam` 校验（复用本文件 L14），失败 `400 { message: "A valid week is required" }`；通过则 `isoWeekStart` 规范化。
   - `deps.weeklyReport` 缺失 → `503 { message: "Competitor data is unavailable" }`。
   - 查询异常 → `500 { message: "Competitor query failed" }`。
3. `server/index.ts`：`competitorRepoFromEnv` 在构造 `competitorRepo` 的同一 pool 下同时构造 `weeklyReport`，传入 `createApp`。
4. `tests/server/createTestApp.ts`：无需改动（deps 直传）；如类型要求补可选字段则补 `undefined`。

**不做**：任何既有路由行为变化；`shelfQueries`；前端。

## 验收

1. `tests/server/weeklyReportContract.test.ts` 全绿（fake repo + supertest，模式抄 `tests/server/shelfContract.test.ts`）：
   - 200：全字段响应、`week=2026-11-22`（周日）被规范化回 `weekStart=2026-11-16`；请求不同周时 `latestCompleteWeek` 恒为同一个 Asia/Shanghai 口径值。
   - 400：`week=abc`、`week=2026-13-99`。
   - 503：deps 无 weeklyReport（competitorRepo 存在）与 deps 全空两种路径文案一致。
   - 500：repo 抛错。
   - 敏感字段断言：响应文本不含 `display_name`/`firstAdDate`/`lookup_status`/`app_store_json`/`sync`/`snapshot`/`batch`（键名黑名单抄 shelfContract.test.ts 的 SENSITIVE_FIELDS，另加 `batch` 列外的白名单校验：`summary.batchStatus` 是枚举值、`dataThrough` 是日期）。
2. 既有 `tests/server/competitorApi.test.ts`、`httpContract.test.ts` 全绿（证明未动既有端点）。
3. `npx tsc --noEmit`；改动文件 ≤500 行。

## 测试点提示

「今天」用 Asia/Shanghai：contract 测试传固定 today 或注入时钟，避免跨午夜抖动；缺省周回退路径（库无数据 → 最近完整周）用 fake `latestCompleteDataWeek → null` 断言。
