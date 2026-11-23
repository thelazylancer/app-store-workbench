# 架构设计：竞品入库趋势页 /shelf

依据 `docs/tickets/shelf-trend/BRIEF.md`（产品已确认，不可推翻）、`docs/ARCH-react.md`（分层与依赖规则）、`docs/ARCH-competitor-daily.md`（数据层）。本文只做模块边界、契约与查询策略设计，不含业务实现代码。共享类型契约 = `shared/shelfTypes.ts`（随本设计交付）。

---

## 1. 模块图（文字）

```text
                    ┌────────── shared/ ──────────┐
                    │ shelfTypes.ts（新）            │  公开趋势契约，前后端唯一类型 seam
                    └─────────▲───────────▲────────┘
                              │           │
   ┌──────────────────────────┴───┐   ┌──┴──────────────────────────────────┐
   │ server/                       │   │ src/                                 │
   │ lib/shelfQueries.ts（新）      │   │ lib/shelfApi.ts（新）                 │
   │   ShelfQueryRepo 深模块：       │   │ shelf/App.tsx（新）                   │
   │   周分桶 + 维度归一 + 白名单     │   │ shelf/Charts.tsx / PackageTable.tsx   │
   │ routes/shelf.ts（新）           │   │ shelf/buckets.ts / states.tsx /       │
   │ app.ts：+shelfQueries? 可选依赖 │   │ shelf/filters.ts / styles/*.css      │
   │ index.ts：同 pool 组装          │   │ app/routes.tsx、app/navItems.ts       │
   └──────────────▲────────────────┘   └─▲─────────────────────────────────────┘
                  │ HTTP /api/public/shelf/*           │ fetch
                  └───────────────────────────────────┘
```

依赖方向遵守 ARCH-react §1：`shared/` 不依赖任何层；`server/` 只依赖 `shared/`；`src/shelf/` 不 import `src/competitor/`、`src/search/` 内部模块（壳除外），反之亦然。

## 2. 关键决策（已定夺）

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 查询落点 | **新建 `server/lib/shelfQueries.ts`**，不进 `CompetitorQueryRepo` | 内部 `/api/competitor/*` 契约冻结（硬约束），`queries.ts` 的 `PACKAGE_SELECT`/`rowMap` 携带 `display_name`、`first_ad_date` 等敏感列，复用即有泄露面。shelf 是公开命名空间，白名单独立成模块，删掉它复杂度不会在别处重现，符合删除测试 |
| 依赖注入 | `AppDependencies` 追加一个可选字段 `shelfQueries?: ShelfQueryRepo`，模式照抄 `competitorRepo?`；`index.ts` 用同一个 pool 组装 | 不新增注入机制，最小改动 |
| 周分桶 | SQL `date_trunc('week', target_date)::date`（Postgres 默认周一开始），TS 拼 `weekEnd = weekStart+6` | 一次 SQL 完成分桶，走 `idx_competitor_packages_target_date` |
| 维度归一 | **TS 内做**（iOS 大版本解析、类目未知规则），SQL 只输出原始列 + 聚合去重 | iOS 解析正则放 SQL 会不可测、不可读；TS 纯函数可单测（`iosBucket` 等）。SQL 每请求最多返回「周 × 类目 × iOS 原值 × lookup_status × iap」的组合行，量级远小于包数 |
| IAP 判定 | SQL `CASE`：`lookup_status='hit' AND jsonb_typeof(app_store_json->'iapItems')='array' AND jsonb_array_length(...)>0` → TRUE | `jsonb_typeof` 守卫非数组值；判定严格按 BRIEF（未命中=未知） |
| 团队选项 | 单独 `SELECT DISTINCT team ... ORDER BY team`，**不受 team 过滤影响** | 团队下拉必须显示全部可选项，否则选了某团队后切不走 |
| 明细分页 | 首版只做 `limit`（默认 200、上限 500）+ 响应 `total`，不做 offset | BRIEF「首版保持简单」；前端显示「共 N 条，显示前 M 条」 |
| 图表 | CSS/SVG 手绘，不引库 | BRIEF 明令；两根柱子的规模用不上图表库 |
| 状态管理 | team 走 URL `?team=`（`src/shelf/filters.ts` 唯一读写口），`group_by` 与时间窗为组件内存态 | BRIEF 只要求 team 入 URL |

## 3. API 契约（公开命名空间，与 `/api/competitor/*` 完全隔离）

### 3.1 `GET /api/public/shelf/trend`

Query：

| 参数 | 必填 | 规则 |
| --- | --- | --- |
| `from` | 是 | `YYYY-MM-DD` 真实日历日；缺失/格式错 → 400 |
| `to` | 是 | 同上；`from > to` → 400；`from..to` 含端点超过 366 天 → 400 |
| `team` | 否 | 省略/空串 = 全部；非空即对 `competitor_packages.team` 精确匹配；长度 > 255 → 400（不存在的团队返回空 weeks，不算错误） |
| `group_by` | 否 | 省略默认 `category`；仅允许 `category\|ios_version\|iap`，其他 → 400 |

200 响应（类型 = `shared/shelfTypes.ts` 的 `ShelfTrendResponse`）：

```json
{
  "from": "2026-08-22",
  "to": "2026-11-20",
  "team": null,
  "groupBy": "category",
  "teams": ["A团队", "B团队"],
  "weeks": [
    {
      "weekStart": "2026-11-16",
      "weekEnd": "2026-11-22",
      "packageCount": 42,
      "groups": [{ "key": "Games", "count": 10 }, { "key": "unknown", "count": 3 }]
    }
  ],
  "totals": { "packageCount": 93, "groups": [{ "key": "Games", "count": 18 }, { "key": "unknown", "count": 17 }] }
}
```

语义：

- `weeks` 只含有数据的周，按 `weekStart` 升序；`to` 落在本周（未完整）也照常返回本周。
- `packageCount` = 该周**全部**入库包数，含未解析包；未解析包进 `groups` 的 `unknown` 键。
- `groups` 按 `count` 降序、`key` 升序（确定性，golden 测试可断言）；`totals.groups` 是全区间同规则聚合。
- `team` 回显：入参为空时 `null`，否则原样字符串。
- `teams` 来自 `[from, to]` 全量包（含未解析包），不受 `team` 过滤影响，升序。

### 3.2 `GET /api/public/shelf/packages`

Query：`from`、`to`、`team` 同 3.1；追加 `limit`（可选，整数 1..500，默认 200，非法 → 400）。

200 响应（`ShelfPackagesResponse`）：

```json
{
  "from": "2026-08-22",
  "to": "2026-11-20",
  "team": null,
  "total": 93,
  "limit": 200,
  "rows": [
    {
      "packageCode": "com.example.app",
      "name": "Real App",
      "team": "A团队",
      "targetDate": "2026-11-18",
      "weekStart": "2026-11-16",
      "category": "Games",
      "minimumOsVersion": "16.0",
      "appVersion": "2.3.1",
      "iap": "yes",
      "listingDate": "2026-11-15",
      "offlineDate": null,
      "resolved": true
    }
  ]
}
```

语义：

- 行序：`targetDate` 升序，再 `package_code` 升序。
- 未解析包（`lookup_status != 'hit'`）：`name/category/minimumOsVersion/appVersion` 为 `null`、`iap = "unknown"`、`resolved = false`，只剩 `packageCode` + 团队 + 入库/上架/下架日期；**不回退源展示名**。
- `listingDate` / `offlineDate` 是上架/下架日期，不是投放日期；未解析包也可能有这两个日期（源数据提供），用于核对，不视为敏感字段。
- `name` 取 `app_store_json.name`，空则 `trackName`（仅命中行有值，SQL 内 CASE 守卫）。
- `total` 为满足过滤的行数（忽略 limit），用于「显示前 M / 共 N」文案。

### 3.3 分组键规则（`shared/shelfTypes.ts` 固化）

| 维度 | 键 | 规则 |
| --- | --- | --- |
| `category` | 原始类目字符串；缺失/未命中 → `UNKNOWN_KEY`（`"unknown"`） | Top 6 + 其他、中文映射由**前端**做（数据会变，服务端不硬编码 Top N） |
| `ios_version` | `lte14 / 15 / 16 / 17 / 18 / 26plus / unknown` | 解析 `minimum_os_version` 首段整数：≤14 归 `lte14`；15–18 各自成键；≥19 归 `26plus`（Apple 自 18 跳 26，19–25 空档出现即并入，防碎片化）；非数字/空/未命中 → `unknown`。顺序由 `SHELF_IOS_BUCKET_ORDER` 固化 |
| `iap` | `yes / no / unknown` | 命中且 `iapItems` 非空数组 = `yes`；命中且空/缺失 = `no`；未命中 = `unknown` |

三个维度共用一个 `"unknown"` 键常量，前端统一渲染中性色。

### 3.4 错误契约（全部 `{ message }`，风格照抄 `routes/competitor.ts`）

| 状态码 | message | 触发 |
| --- | --- | --- |
| 400 | `Valid from and to dates are required` | from/to 缺失或格式非法 |
| 400 | `from must not be after to` | from > to |
| 400 | `Date range must not exceed 366 days` | 区间 > 366 天 |
| 400 | `Unsupported group_by` | group_by 非白名单（仅 trend） |
| 400 | `limit must be an integer between 1 and 500` | limit 非法（仅 packages） |
| 400 | `Unsupported team` | team 长度 > 255 |
| 503 | `Shelf data is unavailable` | 未配置数据库（`shelfQueries` 缺失，onRequest 前置守卫，模式同 `/api/competitor` 503） |
| 500 | `Shelf query failed` | SQL 异常兜底 |

- 守卫前缀仅匹配 `/api/public/shelf`，与 `/api/competitor` 守卫零重叠；现有路由行为不动。
- 不返回字段黑名单（contract 测试逐项断言）：`firstAdDate`、`displayName`、`syncId`/`snapshotId`/`batchStatus`/`stale`、`lookupStatus`/`enrichStatus`/`assetStatus`、原始 `appStoreJson`。`resolved` 是为「未解析=未知」展示而生的粗粒度布尔，不泄露上述任何状态明细，属白名单允许项。

## 4. 查询策略（`server/lib/shelfQueries.ts`）

```ts
export type ShelfTrendParams = { from: string; to: string; team: string | null; groupBy: ShelfGroupBy };
export type ShelfPackagesParams = { from: string; to: string; team: string | null; limit: number };

export type ShelfQueryRepo = {
  getShelfTrend(params: ShelfTrendParams): Promise<ShelfTrendResponse>;
  getShelfPackages(params: ShelfPackagesParams): Promise<ShelfPackagesResponse>;
};

export function createShelfQueries(pool: Pool): ShelfQueryRepo;
```

深模块：调用方（routes）只传已校验参数拿完整响应；周分桶、维度归一、白名单投影全部藏在实现内。

`getShelfTrend` 三条 SQL（全部参数化）：

1. `SELECT DISTINCT team ... WHERE target_date BETWEEN $1 AND $2 ORDER BY team`（忽略 team 过滤）。
2. 聚合行（去重降量）：

```sql
SELECT to_char(date_trunc('week', target_date)::date, 'YYYY-MM-DD') AS week_start,
       lookup_status, category, minimum_os_version,
       CASE WHEN lookup_status = 'hit'
              AND jsonb_typeof(app_store_json->'iapItems') = 'array'
              AND jsonb_array_length(app_store_json->'iapItems') > 0
            THEN true ELSE false END AS iap_has,
       count(*)::int AS n
  FROM competitor_packages
 WHERE target_date BETWEEN $1::date AND $2::date
   AND ($3::text IS NULL OR team = $3)
 GROUP BY 1, lookup_status, category, minimum_os_version, iap_has
```

3. TS 折叠：按 `weekStart` 分桶求和得 `packageCount`；按 `groupBy` 用 `iosBucket()`/类目规则/iap 三态映射到键；周内与全区间各自聚出 `groups`，同序排序。

`getShelfPackages` 两条 SQL：同 WHERE 的 `count(*)` 得 `total`；明细行（白名单投影）`ORDER BY target_date, package_code LIMIT $4`，`week_start` 由 `date_trunc('week', target_date)::date` 直出，`name` 用 `CASE WHEN lookup_status='hit' THEN COALESCE(NULLIF(app_store_json->>'name',''), NULLIF(app_store_json->>'trackName','')) ELSE NULL END`。

性能：`WHERE target_date BETWEEN` 命中 `idx_competitor_packages_target_date`，team 过滤命中 `idx_competitor_packages_team`；93 包量级毫秒级，不新建索引、不改表。

## 5. 前端模块

```text
src/shelf/
  filters.ts        (~40)  ?team= 唯一读写口（模式照抄 useQueryFilters：读、update(patch)、clear）
  buckets.ts        (~120) 纯函数：iosBucket、IOS 桶顺序与中文标签、类目中文映射+英文回退、
                          foldTopCategories(groups, topN=6) → Top6+其他+未知 段列表
  App.tsx           (~220) 时间窗（from = 今天-90、to = 今天，内存态）；trend+packages 并行取数；
                          团队 Selector、维度 SegmentedControl、加载/错误/空态、明细表挂载
  Charts.tsx        (~220) WeeklyBarChart（周总量柱）+ StackedBarChart（维度数量堆叠柱），
                          CSS 伸缩柱 + 数值标签 + 团队中性色 unknown 段 + 图例；键盘可访问
  PackageTable.tsx  (~130) 平铺 table，表头「核对明细（临时）」，含入库周列，无投放日期列
  states.tsx        (~60)  Skeleton/Banner/EmptyState 包装（本地小文件，不跨 feature import）
  styles/shelf.css  (≤300)
src/lib/shelfApi.ts (~90)  fetch 封装 + ShelfApiError（503→「服务端未配置数据库」文案，同 competitorApi 模式）
```

路由与导航（改 `src/app/` 两处）：

- `routes.tsx`：`<Route path="/shelf" element={<ShelfTrendPage />} />`。
- `navItems.ts`：`NAV_ITEMS` 插入 `{ to: "/shelf", label: "竞品趋势" }`；**修正 `isNavActive`**：`to === "/"` 分支改为 `!pathname.startsWith("/search") && !pathname.startsWith("/shelf")`——否则访问 `/shelf` 时「竞品日报」错误高亮（现 L13 只排除 `/search`）。`/package/:code` 仍归竞品日报（现状语义保留）。

图表数据流：`trend.weeks` → 每周 `packageCount` 画总量柱；维度切换只重发 trend 请求（packages 不变）或直接由三维度各自键折叠——**不**三维度同时取，`group_by` 切换即 refetch（接口就是单维度）。分布图是**数量堆叠**，柱段高度 = 该组 count，不做百分比换算。类目段顺序：Top 6（按 totals 降序）→ 其他 → 未知（末位、中性色）。

## 6. 边界条件

- 只有两周数据 → 图只两根柱，属预期（BRIEF 已知），空态文案区分「区间内无数据」与「团队过滤后无数据」。
- `team` 选项列表永远全量（不受自身过滤），选到无数据团队时 weeks 空、200 返回。
- 本周未完整：`to = today` 自然包含本周部分数据，不补零、不标注。
- 未解析包 17/93：三个维度的 `unknown` 键与明细行的 `null` 字段是主要回归点。
- `minimum_os_version = "26.2"` → `26plus`；`"16.0"` → `16`；空串/乱码 → `unknown`。
- `limit < total` 时明细表截断并显示计数提示，不静默丢行。
- 366 天上限保证 SQL 有界；前端固定 90 天窗不会触发。
- 时区：`target_date` 是 DATE 列，分桶在 SQL 服务端完成，前端只收字符串，不引入时区换算。

## 7. 测试计划

| 层 | 文件 | 手段与要点 |
| --- | --- | --- |
| 维度归一 | `tests/server/shelfQueries.test.ts` | `iosBucket`/类目/iap 规则纯函数直测；SQL 侧真连 PG（`DATABASE_URL` 缺失 skip，模式同 `competitorRepo.reads.test.ts`）：周分桶含跨周边界（周日/周一各一包）、team 过滤、teams 全量、limit 截断、未解析包白名单 |
| HTTP 契约 | `tests/server/shelfContract.test.ts` | supertest + `createTestApp({ shelfQueries: fake })`（模式同 `competitorContract.test.ts`）：400 矩阵、503（不传 shelfQueries）、200 形状、**敏感字段泄露断言**（对两端点响应 JSON.stringify 断言不含 `displayName/firstAdDate/lookupStatus/enrichStatus/assetStatus/appStoreJson/syncId/stale`） |
| 前端 API | `tests/frontend/shelfApi.test.ts` | `stubFetchToApp` 模式走真实路由 |
| 纯函数 | `tests/frontend/shelfBuckets.test.ts` | Top6+其他+未知折叠、中文映射回退、iOS 键顺序 |
| 页面 | `tests/frontend/shelfPage.test.tsx` | 加载/错误/空态、team 过滤三处联动（两图+表）、明细行未解析渲染、URL ?team= 还原 |
| 导航 | `tests/frontend/routes.test.tsx` 追加 | `/shelf` 时「竞品日报」不高亮、「竞品趋势」高亮 |
| 行数 | `tests/lineLimit.test.ts` | 新文件全部 ≤500（css ≤300），不新增豁免 |

## 8. 风险

BRIEF 已列四条（target_date 非严格入库时刻、初期仅 2 周、未解析占比高、维度是当前值近似）之外，本设计识别：

1. **`target_date` 会漂移**：`upsertPackage` 的 `GREATEST(target_date, EXCLUDED.target_date)` 意味着包重跑更早日期不会回移，但**首次**给旧日期补录会把包放进旧周——趋势图历史周会随补录变化。简报接受此口径，趋势页文案应说明「按数据日期入库」。
2. **`app_store_json` 的 `iapItems` 形状假设**：判定依赖商品页抓取写入的键名与数组类型；`jsonb_typeof` 守卫防抛错，但若上游改名会全量落 `no`。缓解：contract 测试用带真实形状的 fixture。
3. **`teams` 无过滤**：若未来团队数膨胀，下拉全量返回也会膨胀；当前 7 个团队量级无虞，不预做搜索。
4. **`/shelf` 高亮回归面**：`isNavActive` 修复动的是共享导航函数，`tests/frontend/routes.test.tsx` 必须先红后绿，防止误伤 `/package/:code` 归属。
5. **公开命名空间的暴露面**：`/api/public/*` 未来若真对外，本契约未做鉴权与限流（BRIEF 明确不做）；上线时依赖内网边界，需在部署说明中标注。
