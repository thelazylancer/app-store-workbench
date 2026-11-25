# 竞品周动态 `/weekly` 设计（DESIGN.md）

依据：`REQUIREMENTS.md`（需求唯一来源，口径不再重开）。章节号引用之。
本文是模块边界、API 契约与聚合策略的唯一规范；实现票据按本文拆解。

## 0. 总指挥拍板（2026-11-24）

1. 「今天/最近完整周」按 **Asia/Shanghai** 计算，与 cron 一致。
2. 显式请求未来周/当前未结束周：**服务端宽容返回空态，不 400**；前端按钮负责边界。
3. 允许把 `metricTicks` / `formatMetric` 从 `src/shelf/Metrics.tsx` 纯移动到 `src/lib/metricScale.ts`，既有测试守住行为。
4. 允许 `src/weekly` 直接 import `src/shelf/styles/charts.css` 与 `metrics.css` 的图表几何；页面布局放 `weekly.css`，「数据不足」斜纹放 `weekly-charts.css`（文件名以 `charts.css` 结尾，`styles.test.ts` 的零渐变守卫天然放行，无需改测试）。允许把 `WeekLabels` 的形参由 `ShelfTrendWeek[]` 放宽为结构类型 `readonly { weekStart: string; weekEnd: string }[]`（纯类型收窄，行为不变），因为 `WeeklyTrendWeek` 不含 shelf 的 `packageCount/groups/teams/distributions`。

---

## 1. 五个已拍板决策（先看这五条）

| # | 决策 | 理由 |
| --- | --- | --- |
| 1 | 新建 `server/lib/weeklyReport.ts`（pool + 工厂），**不进 competitorRepo** | `CompetitorQueryRepo`（`server/lib/competitorRepo/queries.ts:35`）是日报内部契约，全局约定冻结；其 `PACKAGE_SELECT` 携带 `display_name` 等公开命名空间禁出列，周报口径（周规范化、resolved-only、4 周窗口）与日报完全不同，塞进去把深模块改浅。`shelfQueries.ts` 已验证「pool + 工厂独立文件」模式（见 `docs/tickets/shelf-trend/BE-1` 同款决策）。 |
| 2 | 共享类型新建 `shared/weeklyReportTypes.ts`，复用 `ShelfIosBucket`、`privacyHostKind` 的类型 import | `shared/competitorTypes.ts` 语义是日报契约（154 行），`shelfTypes.ts` 是公开趋势契约；周报是第三个独立命名空间，先例一致。REQUIREMENTS §5.2 同建议。 |
| 3 | 前端复用 shelf 的**纯函数与图表原语**（`useChartTip`/`ChartTip`/`WeekLabels`/`teamClass`/`metricTicks` 几何、charts.css + metrics.css），**不复用 `WeeklyBarChart`/`DistributionBoard`/`MetricsBoard` 组件本身** | 三个组件都硬耦合 `onSelect: (selection: ShelfSelection) => void` 下钻交互（`src/shelf/Charts.tsx:119`、`Metrics.tsx:51`），而周报 §4.4/§4.6 明确只读、无筛选、无下钻；且 §4.5 的 100% 横条、§4.6 的「数据不足」斜纹柱是 shelf 没有的形态。复用组件要削掉交互再补两个形态，比新写只读组件更贵。 |
| 4 | `/weekly` 与 `/shelf` 靠**口径与形态**双重切分：resolved-only + `first_ad_date` vs 全量 + `target_date`；单周读数页 vs 多周看形页；不组合调用 shelf API 拼数据 | 数据口径本身不同（shelf trend 无品类环比、无版本数分布、含未解析包），拼装必然 N+1 且口径不一致。周报一次性由单端点返回，两页无同一张图。 |
| 5 | 聚合 = **4 条常量 SQL + `Promise.all` 并行**（同 `getShelfTrend` 模式，`shelfQueries.ts:299`），TS 折叠，零 N+1 | 见 §4。包量级每周 ~112，4 周窗口聚合行数 ≤ 数百，无需一次 mega-JOIN，可读性和真库测试都更好。 |

## 2. 模块图与依赖方向

```text
shared/weeklyReportTypes.ts        （types only；import shelfTypes / privacyHost 的类型）
        ▲                          ▲
server/lib/weeklyReport.ts         src/lib/weeklyApi.ts
  WeeklyReportRepo（接口）           getWeeklyReport(week?) → fetch
  createWeeklyReport(pool)                  ▲
        ▲                                   │
server/routes/competitor.ts        src/weekly/App.tsx + 子组件
  + GET /api/competitor/weekly-report   （import ../shelf/Charts 的图表原语）
        ▲                                   │
server/app.ts: AppDependencies.weeklyReport?: WeeklyReportRepo
  server/index.ts: 有 pool 时与 competitorRepo 同时构造
```

- 依赖规则沿用 `docs/ARCH-react.md` §1：`shared/` 零依赖；`server/` 只依赖 `shared/`；`src/` 只依赖 `shared/`、`src/lib/`、同层目录。
- `src/weekly` 允许 import `src/shelf` 的**导出原语**（Charts.tsx 的 tip/labels/teamClass、buckets.ts 的标签函数）；不允许反向。ARCH 未禁止 shelf/weekly 互引，本设计固定单向。

## 3. API 契约

### 3.1 端点与校验（落在 `server/routes/competitor.ts`）

- `GET /api/competitor/weekly-report?week=YYYY-MM-DD`
- `week` 可选；`dateParam` 校验复用本文件已有函数（L14）。合法日期 → 规范化为所在 ISO 周周一（纯函数 `isoWeekStart`，§4.1）；非法 → `400 { message: "A valid week is required" }`。
- 缺省 → 「最近一个完整且已有数据的 ISO 周」（§4.2）；连该口径都无数据 → 回退最近完整周，返回空态结构（§7）。
- 503：`/api/competitor/*` 的 onRequest hook（competitor.ts L35-41）已覆盖本端点并给出需求要求的文案；`deps.weeklyReport` 缺失而 `competitorRepo` 存在（仅测试场景）时，路由体直接返回同文案 503。生产 `server/index.ts` 有 pool 即两者同生。
- 查询异常 → `500 { message: "Competitor query failed" }`，try/catch 模式同文件既有路由。
- 显式请求「未来周 / 当前未结束周」不报错：照常返回该周数据（多数为空态）。约束「下一周不超过最近完整周」由前端按钮实现（REQUIREMENTS §4.1），服务端宽容。
- 响应顶层携带 `latestCompleteWeek`（Asia/Shanghai 的最近一个完整 ISO 周周一，`YYYY-MM-DD`），无论请求哪一周都相同；前端只用它禁用「下一周」，不自行按 UTC/本地时区推算。

### 3.2 响应类型落点：`shared/weeklyReportTypes.ts`

按 REQUIREMENTS §5.2 逐字段落地，补充语义注释与两个别名：

```ts
import type { ShelfIosBucket } from "./shelfTypes";
import type { PrivacyHostKind } from "./privacyHost";

export type WeeklyBucketKey =
  | "1" | "2" | "3" | "4+" | "0"      // 版本数分桶，0 = 无记录
  | string;                            // category / ios / iap / privacy 复用原始键
export type WeeklyBucket = { key: string; label: string; count: number; share: number }; // share 0..1
export type WeeklyTeam = { /* REQUIREMENTS §5.2 原样 */ };
export type WeeklyTrendWeek = { weekStart: string; weekEnd: string; resolvedPackages: number; ingestedPackages: number; dataSufficient: boolean };
export type WeeklyMetricPoint = { weekStart: string; team: string; value: number; packageCount: number; offlineCount: number };
export type WeeklyMetricKey = "avgVersionGapDays" | "avgLatestVersionToAdDays" | "avgAdToOfflineDays";
export type WeeklyMetricSeries = { key: WeeklyMetricKey; title: string; points: WeeklyMetricPoint[] };
export type WeeklyIapPoint = { weekStart: string; iapPackages: number; resolvedPackages: number; share: number };
export type WeeklyVersionAveragePoint = { weekStart: string; versionedPackages: number; totalVersions: number; value: number };
export type WeeklyDistributionWeek = { weekStart: string; resolvedPackages: number; buckets: WeeklyBucket[] };
export type WeeklyHighlight = | { kind: "team_change"; ... } | { kind: "category_change"; ... };   // REQUIREMENTS §5.2 原样
export type WeeklyReportResponse = { /* REQUIREMENTS §5.2 原样，另加顶层 latestCompleteWeek */ };
```

- `distributions` 键为 `"category" | "ios" | "iap" | "privacy"`（不是 shelf 的 `ios_version`）；`ios` 桶键即 `ShelfIosBucket`，`privacy` 桶键即 `PrivacyHostKind`，iap 键 `yes | no`（resolved-only，无 unknown 桶）。
- 排序遵守 §5.3：teams 按新增入库包数（含未解析）降序再团队名升序；`versionCounts` 固定序 `1 / 2 / 3 / 4+ / 0`；`distributions.*` count 降序、`unknown` 排最后；`topCategories`/`topIos`/`topPrivacies` count 降序、并列按 `SHELF_IOS_BUCKET_ORDER` / locale 序取前，`unknown` 不当选。
- 脚注数据在 `summary`（ingested/unresolved/dataThrough/batchStatus），响应不含包明细，永不携带 `display_name`、`app_store_json`、`lookup_status` 原值——沿用 `tests/server/shelfContract.test.ts` 的敏感字段断言。

## 4. 周规范化与聚合策略

### 4.1 周纯函数（server 端导出，可直测；前端不重复实现）

```ts
/** 日期 → 所在 ISO 周周一。纯字符串/UTC 运算，禁止本地时区。 */
export function isoWeekStart(date: string): string;          // date - ((getUTCDay()+6)%7)
export function addWeeks(weekStart: string, n: number): string; // ±7n 天
```

- 周归属一律由 SQL `date_trunc('week', first_ad_date::date)` 完成（Monday-based，与 `shelfQueries.ts:76` 同语义）；TS 侧 `isoWeekStart` 只用于参数规范化与窗口推导，两边用例互相锁定（周日归上周、周一起新周）。

### 4.2 默认周（「最近一个完整且已有数据的 ISO 周」）

- 「今天」按 Asia/Shanghai（与 cron 08:00 Asia/Shanghai 一致）：`new Date(Date.now() + 8h)` 的 UTC 日期。
- 最近完整周周一 `lastComplete = isoWeekStart(today) - 7`。
- 一条 SQL 找已有数据周：`SELECT to_char(date_trunc('week', first_ad_date)::date,'YYYY-MM-DD') AS w FROM competitor_packages WHERE lookup_status='hit' AND first_ad_date < isoWeekStart(today) ORDER BY first_ad_date DESC LIMIT 1`；取其周一并与 `lastComplete` 取小（数据晚于最近完整周时以 lastComplete 为准）。无行 → 回退 `lastComplete`，返回空态结构。

### 4.3 四条 SQL（`Promise.all`，零 N+1）

窗口：`from = addWeeks(weekStart, -3)`、`to = weekEnd`（4 个完整自然周）。

1. **WEEK_MAIN_SQL**（主干聚合，覆盖 4 周窗口）：
   `GROUP BY date_trunc('week', first_ad_date::date), team, lookup_status, category, minimum_os_version, iap_has(CASE), policy_url(CASE)` + `count(*)`。
   形状抄 `TREND_SQL`（`shelfQueries.ts:75`）但日期列换 `first_ad_date`。TS 折叠出：4 周 `resolvedPackages/ingestedPackages`、本周 teams/category/ios/iap/privacy、上周 teams/category（环比 + 品类变化），以及 4 周 `iapShare/categoryWeeks/privacyWeeks`。
2. **VERSION_COUNTS_SQL**（仅本周窗口，hit-only）：
   `competitor_packages LEFT JOIN (SELECT package_code, count(DISTINCT version) FROM competitor_versions GROUP BY 1)` → `GROUP BY team, bucket(0/1/2/3/4+)`。TS 折叠出整体 + 团队两层分布。
3. **METRICS_SQL**（4 周窗口，hit-only，按 `first_ad_date` 分周）：
   抄 `TEAM_WEEK_STATS_SQL`（`shelfQueries.ts:109`）的结构，改动三点：日期列换 `first_ad_date`、加 `lookup_status='hit'` 过滤、增列 `count(ad_to_offline_days) AS offline_count` 与 `count(*) FILTER (gap 有值且 ≤30)`。gap >30 丢弃用 `avg(gap_days) FILTER (WHERE gap_days <= 30)`（同 shelf 现行实现）。
4. **BATCH_SQL**：`SELECT to_char(target_date,...), status FROM competitor_batches ORDER BY target_date DESC, fetched_at DESC LIMIT 1` → `dataThrough/batchStatus`。
5. **VERSION_TREND_SQL**（4 周窗口，hit-only）：
   `pkg_versions = competitor_versions GROUP BY package_code` → 左连 `competitor_packages`，按周统计 `versionedPackages = count(*) FILTER (version_count > 0)` 与 `totalVersions = sum(version_count)`；TS 算 `value = total / versioned`，只保留 `versioned > 0` 的周。无版本记录的包分子分母都不计。

`iapShare` 复用 WEEK_MAIN_SQL 的 iap_has 计数（`yesCount / resolvedPackages`），只保留 `resolved > 0` 的周；`categoryWeeks/privacyWeeks` 复用同一行的 category / policy_url 折叠，排序与 `distributions.*` 相同（count 降序、unknown 最后）。

不聚合 `app_store_json` 以外的任何包级明细；单响应一次返回全部区块，前端不再二次请求。

### 4.4 公式落点（SQL 出均值，TS 只折叠）

| 指标 | SQL 值 | 空值 → WeeklyMetricPoint |
| --- | --- | --- |
| 平均版本间隔 | `avg(gap_days) FILTER (gap_days ≤ 30)`；gap 仅 `release_dates > 1` 的包有值 | 该团队该周无 ≤30 的可用 gap → **不生成 point**（前端留空画 `—`） |
| 最新版本→投放 | `avg(first_ad_date - last_release)`，仅 `last_release IS NOT NULL` 的包 | 无版本记录包 → 不生成 point |
| 投放→下架 | `avg(offline_date - first_ad_date)` + `offline_count` | `offline_count = 0` → 生成 `value = 0` 的 point（§3.4 要求显示 0 + 上下文） |

`dataSufficient = ingestedPackages > 0`（新增包趋势含未解析）；`resolvedRate = resolved / ingested`；已解析环比 `changePct = previousResolved > 0 ? change / previousResolved : null`；摘要用新增包环比 `ingestedChangePct = previousIngested > 0 ? ingestedChange / previousIngested : null`。

### 4.5 关注项（纯函数 `buildHighlights`，server 导出直测）

页面已不展示关注项；函数与 `highlights` 字段保留在 API 中（兼容既有契约）。

- 输入：本周/上周 `Map<team, ingested>`（含未解析）、本周/上周 `Map<category, share>`。
- 团队变化：`|Δ|` 最大且 ≥3；`direction = Δ>0 ? up : down`；上周 0 → `changePct = null`（文案「新增」语义由前端处理）。
- 品类变化：`|Δpp|` 最大且 ≥5，`deltaPp = (curShare - prevShare) * 100`。
- 不满足 → `[]`；团队变化在前。

## 5. 前端设计

### 5.1 文件落点（每文件 ≤500，css ≤300）

```text
src/lib/weeklyApi.ts        getWeeklyReport(week?) + WeeklyApiError（抄 shelfApi.ts 错误分类：503/400/网络）
src/weekly/App.tsx          状态机 + 周头 + 摘要 + 脚注 + 组装（~260）
src/weekly/TeamCards.tsx    团队卡网格（§4.3，含 <3 包的 — 规则）（~170）
src/weekly/StructureBars.tsx 单周结构 4 条 100% 横条 + 版本数分布横条（§4.5）（~150）
src/weekly/TrendBars.tsx    近 4 周新增柱 + 数据不足斜纹柱（§4.6）（~80）
src/weekly/TrendScale.tsx   新增与结构：新增包数通栏 + 内购比例 / 包版本数（~140）
src/weekly/TopChanges.tsx   品类 / 隐私域名 Top10 变化（~120）
src/weekly/MetricBars.tsx   三指标 × 近 4 周整体只读柱（§4.4，无团队层）（~105）
src/weekly/states.tsx       Loading/Error/Empty 薄壳（data-role="weekly-*"）（~60）
src/weekly/styles/weekly.css 页面布局、团队卡、结构条、图表几何（≤300）
src/weekly/styles/weekly-charts.css 仅「数据不足」斜纹（文件名命中 charts.css 守卫豁免）
```

### 5.2 复用矩阵

| 复用 | 来源 | 方式 |
| --- | --- | --- |
| `useChartTip` / `ChartTip` / `WeekLabels` / `teamClass` | `src/shelf/Charts.tsx` | 直接 import（把 `WeekLabels` 形参放宽为 `{ weekStart; weekEnd }[]`，`WeeklyTrendWeek` 结构兼容） |
| `metricTicks` / `formatMetric` | `src/shelf/Metrics.tsx` | 提取为 `src/lib/metricScale.ts` 纯函数，shelf 与 weekly 同 import（唯一一次改 shelf 文件，纯移动） |
| `iosBucketLabel` / `iapLabel` / `categoryLabel` | `src/shelf/buckets.ts` | 直接 import |
| `privacyHostLabel` / `privacyHostKind` | `shared/privacyHost.ts` | 直接 import |
| `teamLabel` / `addDays` | `src/lib/teamLabel.ts` / `reportDate.ts` | 直接 import |
| 图表几何 CSS | `src/shelf/styles/charts.css` + `metrics.css` | weekly App 顶部 import（`wx-chart-*`/`wx-metric-*` 纯几何类，跨页无害） |
| `useDocumentTitle` | `src/app/useDocumentTitle` | 「竞品周动态 · App搜索工作台」 |
| **不复用** | `WeeklyBarChart` / `DistributionBoard` / `MetricsBoard` / `ShelfDetailDialog` / `useShelfFilters` | 硬耦合 `ShelfSelection` 下钻与团队筛选；周报只读 |

### 5.3 路由与导航

- `src/app/navItems.ts`：NAV_ITEMS 插入 `{ to: "/weekly", label: "竞品周动态" }` 于 `/shelf` 之后；`isNavActive("/")` 增加排除 `/weekly`（现为 `!startsWith("/search") && !startsWith("/shelf")`，L14）。
- `src/app/routes.tsx`：`<Route path="/weekly" element={<WeeklyPage />} />`。
- 切周用 `?week=` 写 URL（`replace`，不污染后退栈，模式同 shelf `filters.ts`）。

### 5.4 视觉口径（执行 `docs/design/shelf-trend.md` 既有 token）

- 「数据不足」斜纹柱：`--color-track` 底 + CSS repeating-linear-gradient 斜纹（唯一新增装饰性 CSS；颜色仍是中性墨系，非琥珀）。
- 100% 横条：段高固定，宽度按 `share`；分母文案写在条头。已知桶配色沿用 shelf 蓝阶（§4.4 配色表）；`unknown` 永远最后。
- 团队卡 `<3` 包时，团队内比例类字段（versionCounts share、iap yesShare）显示 `—`；计数类（`N / 112`、品类包数、IAP 有/无、topIos/topPrivacies 包数）照常显示。卡主数字、排名、环比与 `N / 112` 按新增包口径，与 `resolvedPackages` 无关。
- 手机宽度：卡片单列；指标图容器 `useScrollRegion` 同款横向滚动。

## 6. 错误与空状态矩阵

| 状态 | 行为 |
| --- | --- |
| 加载中 | 周头 + `weekly-loading` 骨架；不渲染旧周数据（state 置 null 后再画） |
| 503 / 网络 / 500 | `weekly-error` 卡 + 重试（文案分类同 `shelfApi.ts`） |
| 400（非法 week，仅手改 URL 触发） | 错误卡；重试回最近完整周 |
| 该周无已解析包（`resolvedPackages = 0`） | 保留周头 + 周切换 + 脚注（summary 有 ingested/unresolved/dataThrough）；`weekly-empty` 占数据区；不渲染团队卡/指标/趋势 |
| 某周/某团队指标缺数据 | 槽位空 + `—`，不画 0 柱（`投放→下架` 例外：0 + `已下架 n/m`） |
| 未来周（手改 URL） | 空态 + 「下一周」按钮禁用，不 404 |

## 7. 测试计划

| 层 | 文件 | 覆盖 |
| --- | --- | --- |
| server 纯函数 | `tests/server/weeklyReport.test.ts`（真库部分 `DATABASE_URL` 缺失 skip，模式抄 `competitorRepo.reads.test.ts`） | `isoWeekStart`（周日归上周/周一起新周/跨年）、`buildHighlights` 阈值与排序、版本分桶折叠、resolved-only、三指标空值规则、默认周回退 |
| server HTTP | `tests/server/weeklyReportContract.test.ts`（fake repo + supertest，模式抄 `shelfContract.test.ts`） | 200 全字段、非法 week 400、repo 缺失 503、repo 抛错 500、敏感字段不出现、排序契约 |
| frontend | `tests/frontend/weeklyPage.test.tsx`、`weeklyFormat.test.ts` | 导航顺序与 `/weekly` 高亮互斥、周切换按钮边界（不能超最近完整周）、摘要/脚注文案、空周空态、指标 `—`、斜纹柱 |
| 既有测试回归 | `tests/frontend/routes.test.tsx` 等随导航改动更新 | `/`、`/shelf`、`/search` 高亮不变 |

验收基准数字以 REQUIREMENTS §7.1（2026-11-16 周）为准，QA-1 在真库走查。

## 8. 风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 历史周数字漂移 | 按当前包表计算，包状态后续变化影响历史周 | REQUIREMENTS §3.2/§8.7 已接受，不做快照；DESIGN 不提供回溯接口 |
| 时区口径 | 「完整周」判定若用服务器本地时区会偏一天 | 固定 Asia/Shanghai 计算 today；纯函数可直测 |
| `iapItems` 形状 | 非数组值会使 jsonb 函数报错 | 沿用 `jsonb_typeof` CASE 守卫（TREND_SQL 同款），fixture 含非数组用例 |
| shelf 文件被改坏 | `metricTicks`/`formatMetric` 提取触碰 Metrics.tsx | 纯移动不改逻辑；shelfMetrics.test.ts 既有断言守住 |
| 两页视觉趋同漂移 | weekly 复用 shelf CSS，shelf 改版会波及 | 接受——视觉语言本就要求一致；weekly 只新增 weekly.css |

## 9. 明确不做

不做包明细、下架列表、日期选择器、团队筛选、快照回溯、MCP 接入、未解析率优化；不改 `/api/competitor/*` 既有端点与 `/api/public/shelf/*`；不新增表与 cron。
