# 架构设计：每日竞品 App Store 详情快照

依据：`docs/PRD-competitor-app-store.md`（第 9 节表结构、第 10 节 API 为最终决定）、`PRODUCT.md`。
本文只做模块划分与接口设计，不含业务实现代码。

已拍板决策（不再讨论替代方案）：本机 PostgreSQL（`DATABASE_URL`，端口 5433）；`package_code` 主键；索引只建 `first_ad_date / listing_date / target_date / team`；首版包含 `competitor_snapshots` 快照表（每天每包一条，缺记录按"当天未入库"处理）；node-cron 进程内调度（北京时间 09:30）；国家范围 us/cn/hk/tw/jp/sg/gb/au 只作后端抓取；源密钥只在 `.env`；vitest + supertest 测试。

---

## 1. 数据流总览

```text
每日 09:30 (Asia/Shanghai, node-cron)
  └─ targetDate = 昨天 (UTC)
     └─ syncCompetitorDay(targetDate)            server/lib/competitorSync.ts
        ├─ fetchFirstDeliveryPackages(targetDate) server/lib/firstDeliverySource.ts
        │    过滤 team≠灵蜂 / display_name 含 ios / 按 package_code 去重
        ├─ upsertBatch + upsertPackage(主表 + 快照行)   server/lib/competitorRepo.ts
        ├─ 8 国 lookupAppByBundleId               server/lib/appleLookup.ts (新增函数)
        │    upsertCountryHits + 更新主表/快照的 lookup_status、appleId、
        │    category、minimum_os_version、app_store_json
        ├─ 命中包：fetchProductPageDetails(us 优先的首个命中国家)
        │    upsertVersions (版本历史快照)
        ├─ downloadAppAssets                       server/lib/assetStore.ts
        │    data/competitor/<target_date>/<package_code>/
        │    upsertAssets + asset_status
        └─ 产出 SyncReport（总包数 / 命中 / 未命中 / 失败）

查询侧（Express Router, server/lib/competitorApi.ts）
  /api/competitor/*  ──读── competitorRepo 查询函数──> PostgreSQL
  /competitor-assets/* ──静态──> data/competitor/ 本地图片
前端（competitor.html + src/competitor/）──> 查询 API
```

主表 `competitor_packages`（`package_code` 唯一）保留最新状态；快照表 `competitor_snapshots`（`package_code + target_date` 唯一）保留每天状态。sync 的每个阶段都同步 upsert 两张表：先写源字段（`lookup_status` 等为初始态），补全/图片/版本阶段完成后再次 upsert 同一行覆盖状态与详情字段。同一天重跑因 upsert 幂等不产生重复行。

---

## 2. 新增模块与接口

### 2.1 `server/lib/firstDeliverySource.ts` — 源数据抓取（深模块）

把源接口的 URL、鉴权、过滤规则全部藏在接口后面，调用方只拿到干净行。

```ts
export type SourcePackageRow = {
  packageCode: string;      // 可靠 Bundle ID
  displayName: string;
  team: string;
  firstAdDate: string;      // YYYY-MM-DD
  listingDate: string | null;
  first100Date: string | null;
  offlineDate: string | null;
};

export type SourceBatch = {
  syncId: string;
  snapshotId: string;
  dataUpdatedAt: string;
  publishedAt: string;
  rangeComplete: boolean;
  stale: boolean;
  rows: SourcePackageRow[]; // 已过滤、已按 package_code 去重
};

export async function fetchFirstDeliveryPackages(targetDate: string): Promise<SourceBatch>;
```

- 接口不变量：抛错 = 源接口不可达/鉴权失败；返回即代表已过滤（`team != 灵蜂`、`display_name` 不区分大小写包含 `ios`、去重）。
- 配置：`FIRST_DELIVERY_API_URL`（默认值取 PRODUCT.md 中的内网地址）、`FIRST_DELIVERY_API_KEY`（只从 `process.env` 读，绝不写入文档或代码）。
- 内部复用 `fetch` + `AbortSignal.timeout`，模式同 `server/lib/appleLookup.ts`。

### 2.2 `server/lib/appleLookup.ts` — 新增 `lookupAppByBundleId`

在现有文件追加一个导出函数，复用已有 `normalizeResults`：

```ts
export async function lookupAppByBundleId(
  bundleId: string,
  country: StoreCountry,
): Promise<LookupCandidate | null>;
```

- `https://itunes.apple.com/lookup?bundleId=...&country=...&entity=software`。
- 不变式：只接受返回 `bundleId` 与入参精确匹配（trim 后相等）的第一条结果，否则返回 `null`。
- 国家类型直接用 `shared/types.ts` 的 `STORE_COUNTRIES`，正好就是 8 个抓取国家，不另建常量。

### 2.3 `server/lib/competitorSync.ts` — 每日同步编排（深模块，一个入口）

```ts
export type CompetitorSyncDeps = {
  fetchSourcePackages: (targetDate: string) => Promise<SourceBatch>;
  lookupAppByBundleId: (bundleId: string, country: StoreCountry) => Promise<LookupCandidate | null>;
  fetchProductPageDetails: (appStoreUrl: string) => Promise<ProductPageDetails>;
  downloadAssets: typeof downloadAppAssets;
  repo: CompetitorWriteRepo;
};

export type SyncReport = {
  targetDate: string;
  total: number;
  hit: number;      // 至少一国命中
  missed: number;   // lookup_status = bundle_not_found
  failed: number;   // 单包流程异常但不阻断整批
  status: "ok" | "partial" | "failed";
};

export function computeTargetDate(now: Date): string; // 昨天 UTC，纯函数，单独测试
export async function syncCompetitorDay(
  targetDate: string,
  deps: CompetitorSyncDeps,
): Promise<SyncReport>;
```

- 遍历包用现有 `mapWithConcurrency`（`server/lib/concurrency.ts`），并发度沿用 `SEARCH_CONCURRENCY` 的 env 模式，新增 `COMPETITOR_SYNC_CONCURRENCY`，默认 3。
- 商品页补全国家取 `STORE_COUNTRIES` 顺序中首个命中国家（us 优先）。
- 单包任何异常吞掉计入 `failed`，不阻断整批（PRD WWA-002 验收）。
- 商品页详情写入 `app_store_json`（JSONB 原样存 `LookupCandidate` + `ProductPageDetails` 合并结果），`category`、`minimum_os_version`、`app_version` 提升为独立列。

### 2.4 `server/lib/assetStore.ts` — 本地图片下载

```ts
export type DownloadedAsset = { type: "icon" | "screenshot"; sourceUrl: string; localPath: string };
export type AssetDownloadResult = { assets: DownloadedAsset[]; status: "ok" | "partial" | "failed" };

export async function downloadAppAssets(
  targetDate: string,
  packageCode: string,
  iconUrl: string,
  screenshotUrls: string[],
): Promise<AssetDownloadResult>;
```

- 落盘目录 `data/competitor/<targetDate>/<package_code>/`，文件名从 URL 末段生成并消毒（`package_code` 同样消毒，模式抄 `scripts/fetch-app-store-details.ts` 的 `cacheFileName`）。
- `localPath` 存相对路径（`<targetDate>/<package_code>/<file>`），静态路由据此拼接。
- 不变式：单图失败不抛错，结果里如实反映 `partial`/`failed`；目录写不进去（磁盘满）才抛。

### 2.5 `server/lib/db.ts` — PostgreSQL 连接与迁移

```ts
import { Pool } from "pg";

export function createPool(databaseUrl: string): Pool;
export async function runMigrations(pool: Pool): Promise<void>;
```

- 迁移文件放 `server/migrations/`，命名 `001-competitor.sql`、`002-competitor-snapshots.sql`…，按文件名序执行。
- 迁移记录表 `schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)`，已应用则跳过，每条迁移在事务内执行。
- 不引入 ORM / 迁移框架，几十行手写 runner 足够。

### 2.6 `server/lib/competitorRepo.ts` — 仓储（DB 适配器）

```ts
export type CompetitorWriteRepo = {
  upsertBatch(batch: BatchRow): Promise<void>;                       // competitor_batches
  upsertPackage(pkg: PackageRow): Promise<void>;                     // 主表 + 同步 upsert 快照行
  upsertCountryHits(packageCode: string, hits: CountryHitRow[]): Promise<void>;
  upsertAssets(packageCode: string, assets: DownloadedAsset[]): Promise<void>;
  upsertVersions(packageCode: string, versions: VersionRow[]): Promise<void>;
};

export type CompetitorQueryRepo = {
  listDays(start: string, end: string): Promise<DaySummary[]>;
  getDay(date: string, dateKind: DateKind): Promise<DayDetail | null>;
  getSummary(date: string, dateKind: DateKind, groupBy: GroupBy): Promise<SummaryGroup[]>;
  getPackage(packageCode: string): Promise<PackageDetail | null>;
  getPackageHistory(packageCode: string, from: string, to: string): Promise<SnapshotEntry[]>;
  getBatch(date: string): Promise<BatchRow | null>;
};

export function createCompetitorRepo(pool: Pool): CompetitorWriteRepo & CompetitorQueryRepo;
```

- 所有写入均为 `INSERT ... ON CONFLICT DO UPDATE`（幂等重跑，PRD Key Result 3）。
- `date_kind` 语义在仓储内收口：`first_ad` → `WHERE first_ad_date = $1`；`listing` → `WHERE listing_date = $1`（命中各自的索引）。API 层不重复实现口径逻辑。
- `group_by` 语义同样收口在仓储：`team` → `team`；`category` → `category`（NULL 归"未知"）；`ios_version` → `COALESCE(minimum_os_version, app_version)`（均空归"未知"）。
- `getPackageHistory` 读 `competitor_snapshots`；区间内缺失的日期由调用方按"当天未入库"解释，仓储只返回存在的行。
- 响应里的图片路径直接返回 `competitor_assets.local_path`，前端拼 `/competitor-assets/` 前缀。

#### `getSummary` 的三层聚合契约（UX 定稿）

主列表按「日期 → 分组（`group_by`）→ 竞品 → 包」三层聚合：

- **竞品行**：命中包按 `apple_id` 聚合（`apple_id` 为空时退回 `app_store_json` 里的真实 `trackName`）。同一 App 多个 `package_code` 聚为一行竞品行，行内携带其包列表摘要。
- **组头计数按包计**：`package_count` / `hit_count` / `miss_count` 统计的是包数量，不是竞品数量；竞品数 `competitor_count` 作为组头次级指标一并返回。
- **未命中包不算竞品行**：`lookup_status = bundle_not_found` 的包进组内 `missed_packages` 子区，不参与竞品行聚合。

```ts
// shared/competitorTypes.ts
export type PackageBrief = {
  packageCode: string;
  displayName: string;     // 源表 display_name
  team: string;
  appVersion: string | null;
  iconLocalPath: string | null;
};

export type SummaryCompetitor = {
  appleId: number | null;
  name: string;            // App Store 真实名称
  packageCount: number;
  packages: PackageBrief[];
};

export type SummaryGroup = {
  groupKey: string;        // team / category / ios_version 的分组值，NULL 归 "未知"
  packageCount: number;   // 组头主计数：按包
  hitCount: number;
  missCount: number;
  competitorCount: number; // 组头次级指标
  competitors: SummaryCompetitor[]; // 竞品行列表
  missedPackages: PackageBrief[];    // 组内未命中子区
};
```

聚合语义收口在仓储（SQL 一次完成分组 + 聚合，或仓储内两步查询后组装），API 层与前端只消费 `SummaryGroup`，不自行二次分组。

### 2.7 `shared/competitorTypes.ts` — 共享类型（不动现有 `shared/types.ts`）

```ts
export type DateKind = "first_ad" | "listing";
export type GroupBy = "team" | "category" | "ios_version";
// 及 DaySummary / SummaryGroup / DayDetail / PackageDetail / SnapshotEntry /
// BatchRow 等第 10 节 6 个 API 的响应类型
```

前后端共用，测试也用它断言。

### 2.8 `server/lib/competitorApi.ts` — Express Router

```ts
export function createCompetitorRouter(
  repo: CompetitorQueryRepo,
): express.Router;
```

挂接第 10 节全部接口：`/api/competitor/days`、`/summary`、`/day/:date`、`/package/:packageCode`、`/package/:packageCode/history`、`/batch/:date`。参数校验风格照抄 `server/app.ts` 现有 handler（`date_kind`/`group_by` 白名单、日期格式校验、非法 400；未配置数据库 503）。

`server/app.ts` 改动：

```ts
type AppDependencies = {
  // ...现有字段不动...
  competitorRepo?: CompetitorQueryRepo;   // 可选，模式同 ipaDownload?
  competitorAssetsDir?: string;           // 默认 path.resolve("data/competitor")
};
```

`createApp` 内：`if (deps.competitorRepo) app.use(createCompetitorRouter(deps.competitorRepo))`；静态路由 `app.use("/competitor-assets", express.static(deps.competitorAssetsDir))`——`express.static` 自带路径穿越防护，`packageCode`/`fileName` 无需再消毒，但要校验段格式（PRD 10.7 的三段路径结构）。

### 2.9 `server/lib/competitorScheduler.ts` — 定时任务

```ts
export function startCompetitorScheduler(deps: CompetitorSyncDeps): void;
// node-cron: cron.schedule("30 9 * * *", run, { timezone: "Asia/Shanghai" })
// run = syncCompetitorDay(computeTargetDate(new Date()), deps)，异常只记日志
```

不放 `server/index.ts` 内联，是为了让"调度触发 → 同步入口"这条链可以单独测试；`computeTargetDate` 是纯函数，单独测。

### 2.10 手动触发与回填：`scripts/competitor-sync.ts`

```text
tsx scripts/competitor-sync.ts [--date 2026-11-18]
```

不新增 API（PRD 10 节已定稿），沿用 `npm run fetch:app-store` 的 script 模式：`package.json` 加 `"sync:competitor": "tsx scripts/competitor-sync.ts"`。缺 `--date` 时取 `computeTargetDate(now)`。用它验收幂等重跑和历史日期回填。

### 2.11 前端：`competitor.html` + `src/competitor/`

- 新增 vite 第二入口 `competitor.html`（`vite.config.ts` 加 `build.rollupOptions.input`），`vite.config.ts` 同时保持现有 `server.proxy`/`test` 配置不动。
- `src/competitor/main.ts`：报告页入口，结构照 `src/main.ts`（模板字符串骨架 + `data-role` 查询 + 事件绑定）。
- `src/lib/competitorApi.ts`：fetch 封装，风格照 `src/lib/api.ts`。
- `src/competitor/renderSummary.ts` / `renderPackageDetail.ts`：渲染函数，风格照 `src/lib/renderResults.ts`。
- 两个页面头部互加导航链接（"搜索" / "竞品"），满足"新增竞品 Tab"的呈现而不重构现有单页。

---

## 3. 启动时序（`server/index.ts`）

```text
读 DATABASE_URL
  ├─ 有：createPool → runMigrations → createCompetitorRepo(pool)
  │       → createApp({ ..., competitorRepo, competitorAssetsDir })
  │       → startCompetitorScheduler({ fetchFirstDeliveryPackages, lookupAppByBundleId,
  │                                    fetchProductPageDetails(带缓存), downloadAppAssets, repo })
  └─ 无：createApp 不传 competitorRepo → 竞品路由 503，其余功能照常
```

商品页抓取复用 `createCachedProductPageFetcher`（`server/lib/productPageCache.ts`），同 `server/index.ts` 现有做法。调度器 timer 不阻塞 `listen`。

新增依赖只有两个：`pg`（node-postgres）和 `node-cron`。`.env.example` 追加 `DATABASE_URL`、`FIRST_DELIVERY_API_URL`、`FIRST_DELIVERY_API_KEY`（占位符，不写真实值）。

---

## 4. 数据流细节：快照表

```sql
-- 002-competitor-snapshots.sql（001 建 PRD 第 9 节全部表）
CREATE TABLE competitor_snapshots (
  package_code TEXT NOT NULL,
  target_date DATE NOT NULL,
  team TEXT NOT NULL,
  lookup_status TEXT NOT NULL,
  enrich_status TEXT NOT NULL,
  asset_status TEXT NOT NULL,
  category TEXT,
  minimum_os_version TEXT,
  app_version TEXT,
  app_store_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (package_code, target_date)
);
-- 索引沿用主表决策：不再额外建索引，history 查询按 package_code 前缀走主键
```

- 写入时机：`upsertPackage` 内部同时写主表和快照行（同一个函数保证两表一致，调用方无法只写其一——这是把"双写不变式"埋进深模块的落点）。
- `/api/competitor/package/:packageCode/history` 返回区间内存在的快照行；前端对缺失日期显示"当天未入库"。

---

## 5. 测试策略（沿用 vitest + supertest）

| 层 | 文件 | 手段 |
|---|---|---|
| 源抓取 | `tests/server/firstDeliverySource.test.ts` | spy `globalThis.fetch`（同 `appleLookup.test.ts`） |
| Bundle ID 补全 | `tests/server/appleLookup.test.ts` 追加用例 | spy `fetch`，校验 bundleId 精确匹配拒绝 |
| 同步编排 | `tests/server/competitorSync.test.ts` | 全部依赖用 vi.fn 假实现，断言过滤/去重/单包失败隔离/双写调用 |
| 仓储 | `tests/server/competitorRepo.test.ts` | 真连本机 PG（`DATABASE_URL` 缺失则 skip），或事务内回滚；至少覆盖 upsert 幂等与 date_kind 口径 |
| API | `tests/server/competitorApi.test.ts` | supertest + `createApp({ competitorRepo: fake })`（同 `searchAppsApi.test.ts` 的假依赖模式） |
| 调度 | `tests/server/competitorScheduler.test.ts` | 直接测 `computeTargetDate`；`node-cron` 本身不测 |
| 前端 | `tests/frontend/competitorPage.test.ts` | jsdom，同 `renderResults.test.ts` 模式 |

---

## 6. 风险

1. **源接口稳定性/口径**（最大风险）：过滤规则（`display_name` 含 `ios`、`team != 灵蜂`）基于假设，若源字段名或过滤语义与 PRD 描述有出入，每天入库的都是脏数据。缓解：T-002 第一张票先用脚本对真实接口跑一次人工核对，再固化进模块。
2. **商品页反爬**：批量抓 `apps.apple.com` 商品页可能被限流，导致 `enrich_status` 大面积失败。缓解：低并发 + 现有缓存 + 失败不阻断并如实记录状态。
3. **每日任务漏跑**：服务器当天没开机就永久缺数。缓解：`scripts/competitor-sync.ts --date` 支持回填，快照表允许补录。
4. **测试数据库依赖**：仓储测试需要本机 5433 实例，CI 无库时会静默 skip，幂等性验收要靠本地跑。
