# QA-1 /shelf 契约回归与验收

- 依赖：BE-2、FE-1…FE-3 全部合入
- 角色：api-tester
- 对应 BRIEF「验收」七条、DESIGN.md §3.4（错误契约）、§7（测试计划）

## 范围

**做**：

1. 补齐并固化契约测试矩阵（`tests/server/shelfContract.test.ts`）：
   - 敏感字段泄露断言对两端点、对 200/400/503/500 全部响应体执行（`JSON.stringify` 后逐词检查：`displayName`、`firstAdDate`、`lookupStatus`、`enrichStatus`、`assetStatus`、`appStoreJson`、`syncId`、`snapshotId`、`stale`、`batchStatus`）。
   - 未解析包 fixture 的明细行只有 Bundle ID + 未知（`name/category/minimumOsVersion` 为 null、`iap=unknown`、`resolved=false`）。
2. 回归确认：`git grep -n "api/competitor" server/routes/shelf.ts` 零命中；`/api/competitor/*` 全部现有测试（`httpContract`、`competitorContract`、`competitorApi`）零改动零失败。
3. 全量门禁：`npm test`、`npx tsc --noEmit`、`npm run build`；`tests/lineLimit.test.ts` 确认无新豁免、shelf 线新文件全部达标。
4. 真库冒烟（本地有 `DATABASE_URL`）：对照 SQL 手工核对——
   - 周计数：`SELECT date_trunc('week', target_date)::date, count(*) FROM competitor_packages WHERE target_date BETWEEN :from AND :to GROUP BY 1` 与 `trend.weeks[].packageCount` 一致；
   - 未解析 17 个全部落 `unknown` 键/段；
   - 团队过滤后 `teams` 仍是全量；
   - `packages.total` = 同 WHERE 的 `count(*)`。
5. 浏览器手工验收 BRIEF 七条：`/shelf` 可访问、团队默认全部且 URL 保留筛选、只显示有数据周、周标签周一至周日、三维度与未知桶计数对齐、过滤三处联动、明细无投放日期。

**不做**：性能压测、并发测试、鉴权测试（BRIEF 明确不做）。

## 验收

1. 上述 1–3 全绿；第 4 项人工核对结果记录进本票据文件的勾选清单（执行时补写）。
2. 无 `DATABASE_URL` 环境下 `npm test` 仍全绿（真库用例 skip 不 fail）。

## 风险

真库核对依赖本地 5433 实例；CI 无库时第 4 项静默跳过——泄露断言与契约形状不依赖真库（fake repo），必须在 CI 强制执行。
