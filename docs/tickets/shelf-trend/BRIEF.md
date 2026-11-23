# 竞品入库趋势页（/shelf）— 已确认简报

## 目标

给研发一个内网可访问的竞品包趋势页：按入库周展示包数量、类目 / 最低 iOS / 内购分布，支持团队过滤，并附一张临时核对明细表。

## 已确认的产品决策

- 横轴：**入库日期**，内部使用 `competitor_packages.target_date`；按周一至周日分周，标签 `YYYY-MM-DD ~ YYYY-MM-DD`。
- 范围：过去 3 个月；只展示有数据的周；本周未完整也展示；不补零、不标注。
- 柱高：该周**全部入库包数**，包含未解析包。
- 分布图：**数量堆叠**（不是百分比）；维度切换：类目 / 最低 iOS / 是否有内购。
- 类目：Top 6 + 其他，未知单独成段；类目值做中文映射，缺映射回退英文。
- 最低 iOS：`≤14 / 15 / 16 / 17 / 18 / 26+ / 未知`，按大版本归并。
- 内购：有 / 无 / 未知。
- 未解析包统一进“未知”，仍计入总数。
- 团队过滤：下拉，默认“全部”；选项来自当前时间范围内实际出现的团队；作用于两张图和明细表；URL 使用 `?team=`；团队不进入分布维度。
- 明细：简单平铺 table，复用现有包信息，额外加“入库周”列；不显示投放日期；标明“核对明细（临时）”，后续删除。
- 不做：下架趋势、历史回填、环比、鉴权、复杂交互、导出。

## 数据口径

- `target_date` 作为入库日期；不返回、不显示 `first_ad_date`（投放日期）。
- 未解析 = App Store 查询不到（`bundle_not_found` 等）；状态显示“未知”，不叫“已下架”。
- 内购判定：命中 App Store 且 `appStoreJson.iapItems` 非空 = 有；命中且为空 = 无；未命中 = 未知。
- 类目 / 最低 iOS / 内购都是当前抓取值，不是上架当天的历史快照。
- 按包计数，不按 appleId 去重。
- 团队过滤用 `competitor_packages.team` 精确匹配。

## 当前数据实况（不要硬编码）

- 93 个包，17 个未解析（15 个有 `offline_date`），76 个命中。
- 7 个抓取批次（11-13 ~ 11-19），按入库周只有 2 周有数据。
- 76 个命中包里 72 个有 `listing_date`，4 个没有；0 个命中包有 `offline_date`。
- 最低 iOS 已出现 26.2；类目 Top 6 覆盖约 75%。
- 7 个批次全部 ok，最近抓取时间 2026-11-20 02:02。

## API

新增独立公开命名空间，不复用内部 `/api/competitor/*` 响应：

```text
GET /api/public/shelf/trend?from=&to=&team=&group_by=category|ios_version|iap
GET /api/public/shelf/packages?from=&to=&team=
```

要求：

- `team` 省略或为空 = 全部。
- `trend` 返回 `teams` 列表、每周 `packageCount`、每周分组 `{ key, count }`、`totals`。
- `packages` 返回明细行，只含白名单字段。
- 不返回：`first_ad_date`、`display_name`、batch/sync/stale、`lookup_status` / `enrich_status` / `asset_status`、原始 `app_store_json`。
- 未解析包明细只显示 Bundle ID + “未知”，不回退源展示名。
- 校验 `from` / `to`、`group_by`、`team`，非法参数 400。
- 共享类型由架构师写入 `shared/shelfTypes.ts`，前后端共同引用。

## UI

- 路由 `/shelf`，顶部导航加“竞品趋势”。
- 修正 `isNavActive`：访问 `/shelf` 时“竞品日报”不应高亮。
- 复用现有 `wxTheme` / Astryx；不引入图表库；用 CSS / SVG 画柱状图。
- 需要加载、错误、空状态；响应式；键盘可访问；图有可读标签和数值。
- 颜色使用现有 token；未知使用中性色；堆叠图需要图例和数值。

## 工程约束

- 单文件 ≤ 500 行（`tests/lineLimit.test.ts` 强制）。
- 不新增依赖。
- TypeScript strict；遵循现有分层：`server/routes`、`server/lib`、`src/app`、`src/lib`、功能目录、`tests/server`、`tests/frontend`。
- 不修改现有 `/api/competitor/*` 行为。
- 新逻辑必须有测试；contract 测试断言敏感字段不泄露。
- 完成前运行 `npm test`、`npx tsc --noEmit`、`npm run build`。

## 验收

1. `/shelf` 可访问，团队默认“全部”，URL 保留筛选。
2. 每周柱状图只显示有数据周，周标签为周一至周日。
3. 三个分布维度和“未知”桶计数正确，与 SQL 对齐。
4. 团队过滤同时影响两张图和明细表。
5. 明细 table 可核对，未解析包显示 Bundle ID / 未知，不显示投放日期。
6. 公开 API 不含敏感字段。
7. 现有测试全绿，`tsc` 与 build 通过。

## 文件边界（参考）

- 架构师：`docs/tickets/shelf-trend/*`、`shared/shelfTypes.ts`
- UI 设计师：`docs/design/shelf-trend.md`
- 后端：`server/lib/shelfQueries.ts`、`server/routes/shelf.ts`、`server/app.ts`
- 前端：`src/shelf/*`、`src/lib/shelfApi.ts`、`src/app/routes.tsx`、`src/app/navItems.ts`
- 测试：`tests/server/shelf*.test.ts`、`tests/frontend/shelf*.test.tsx`

## 已知风险

- `target_date` 是数据日期，不是严格的首次入库时间戳；将来同一包重复入库会让历史分桶漂移。
- 初期只有 2 个入库周，图里只有约 2 根柱子。
- 未解析包占比高（17/93），分布必须保留“未知”。
- 类目 / 最低 iOS / 内购是当前值近似。
