# BE-1 新建 server/lib/shelfQueries.ts（公开趋势查询模块）

- 依赖：无（`shared/shelfTypes.ts` 已存在）
- 角色：backend-developer
- 对应 DESIGN.md §2（决策）、§4（查询策略）、§6（边界条件）

## 背景

`/shelf` 需要一个与内部 `/api/competitor/*` 隔离的公开查询 seam。不进 `CompetitorQueryRepo`：内部契约冻结，且其 `PACKAGE_SELECT` 携带 `display_name`、`first_ad_date` 等公开命名空间禁出列。新模块按 `server/lib/competitorRepo/queries.ts` 的「pool + 工厂」模式独立成文件。

## 范围

**做**：新建 `server/lib/shelfQueries.ts`，导出 `ShelfTrendParams` / `ShelfPackagesParams` / `ShelfQueryRepo` / `createShelfQueries(pool)`（接口见 DESIGN.md §4 代码块）。实现：

1. `getShelfTrend`：teams 去重查询（**不受 team 过滤**）+ 聚合行 SQL（DESIGN.md §4 第 2 条，含 `date_trunc('week', target_date)::date` 与 `jsonb_typeof` 守卫的 `iap_has` CASE）+ TS 折叠（周 `packageCount` 求和、三维度键归一、groups 排序 count desc / key asc、totals）。
2. `getShelfPackages`：`total` 计数 + 白名单投影明细（`week_start` 由 `date_trunc` 直出；`name` 的 `lookup_status='hit'` CASE 守卫 + `COALESCE(NULLIF(name,''),NULLIF(trackName,''))`；同时投影 `app_version`、`listing_date`、`offline_date`，未解析行前三项可为 null；`ORDER BY target_date, package_code LIMIT $4`）。
3. iOS 键归一纯函数 `iosBucket`：`/^\s*(\d+)/` 首段整数 → ≤14 `lte14`、15–18 各自成键、≥19 `26plus`、解析失败/未命中 `unknown`；类目键：命中且非空取原值，否则 `unknown`；iap：命中时 `iap_has ? "yes" : "no"`，未命中 `unknown`。

**不做**：路由、`app.ts`/`index.ts` 组装（BE-2）；HTTP 校验。

## 验收

1. `tests/server/shelfQueries.test.ts` 全绿：纯函数直测（`26.2→26plus`、`16.0→16`、乱码→unknown）；SQL 用例真连 PG（`DATABASE_URL` 缺失 skip，模式抄 `tests/server/competitorRepo.reads.test.ts`），覆盖：跨周分桶（周日包归上一周、周一起新周）、team 过滤、teams 全量不受过滤、未解析包计入 `packageCount` 且进 `unknown` 键、limit 截断且 `total` 不受影响。
2. 响应逐字段符合 `shared/shelfTypes.ts`；`weeks` 只有有数据周、升序。
3. `npx tsc --noEmit` 通过；新文件 ≤500 行。

## 风险

`app_store_json.iapItems` 形状依赖商品页抓取写入；fixture 必须用真实形状（数组含对象），并加一条非数组值守卫用例。
