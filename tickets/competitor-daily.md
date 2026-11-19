# 竞品每日快照 — 垂直切片票据（tracer bullet）

依据：`docs/PRD-competitor-app-store.md`（需求与既定决策）、`docs/ARCH-competitor-daily.md`（模块与文件路径）。
每张票贯穿其所需层次（schema / 后端模块 / API / UI / 测试），可独立验收。已定决策不重开讨论。

## 阻塞关系图

```text
C-01 迁移与仓储基建
  └─> C-02 源数据抓取与入库（含快照行写入、手动脚本）
        ├─> C-03 Bundle ID 补全与 8 国命中
        │     ├─> C-04 图片下载与静态资源
        │     └─> C-05 版本历史快照
        ├─> C-06 基础查询 API（days/day/package/batch + date_kind）
        │     └─> C-07 summary API（group_by + 时间线）<── C-03
        └─> C-11 快照历史查询 API（package history）
C-03 ─> C-04 ─> C-08 报告页基础（<── C-06）
C-08 ─> C-09 口径切换与分组（<── C-07）
C-08 ─> C-10 竞品详情页（<── C-05, C-11）
C-02 ─> C-12 每日定时任务（完整流水线就绪后上线：<── C-05）
```

---

## C-01 数据库迁移与仓储基建

**Why**：所有持久化票的地基。没有表和连接，后续票无处落库。

**范围**（新建：`server/lib/db.ts`、`server/migrations/001-competitor.sql`、`002-competitor-snapshots.sql`、`server/lib/competitorRepo.ts` 骨架、`tests/server/db.test.ts`）：

- `pg` 依赖；`createPool(databaseUrl)`、`runMigrations(pool)`（按文件名序执行、`schema_migrations` 记录、事务、可重复执行幂等）。
- SQL 按 PRD 第 9 节逐字建表：`competitor_batches`、`competitor_packages`（+ 4 个既定索引）、`competitor_country_hits`、`competitor_assets`、`competitor_versions`；`002` 加 `competitor_snapshots`（结构见 ARCH 第 4 节）。
- `createCompetitorRepo(pool)` 先返回可用骨架，本票只验收：连接成功、迁移幂等、重复执行不报错。
- `.env.example` 追加 `DATABASE_URL`（占位符）。

**验收**：本机 5433 有库时 `npm test` 通过 `db.test.ts`（连不上则 skip 并在输出声明）；第二次运行 `runMigrations` 零变更。
**阻塞**：无。

---

## C-02 源数据抓取与批次/主表/快照入库

**Why**：第一颗 tracer bullet——从真实源接口到可查的库表，端到端打通"抓取→过滤→入库"。

**范围**（新建：`server/lib/firstDeliverySource.ts`、`server/lib/competitorSync.ts`、`scripts/competitor-sync.ts`、`tests/server/firstDeliverySource.test.ts`、`tests/server/competitorSync.test.ts`、`tests/server/competitorRepo.test.ts`；扩展 `competitorRepo` 写侧）：

- `fetchFirstDeliveryPackages(targetDate)`：读 `FIRST_DELIVERY_API_URL` / `FIRST_DELIVERY_API_KEY`，过滤 `team != 灵蜂`、`display_name` 含 `ios`（不区分大小写）、按 `package_code` 去重。
- `syncCompetitorDay(targetDate, deps)` 最小版：upsert batch → 逐包 upsert 主表 + 快照行（`lookup_status`/`enrich_status`/`asset_status` 初始态），产出 `SyncReport`。
- `computeTargetDate(now)` 纯函数。
- 仓储写侧 `upsertBatch` / `upsertPackage`（双写主表+快照）实现并覆盖幂等测试。
- `package.json` 加 `sync:competitor` 脚本。

**验收**：
1. `tsx scripts/competitor-sync.ts --date <近期一天>` 真实跑通，人工核对一批入库行与源接口原始数据一致（这是 ARCH 第 6 节风险 1 的第一次实弹验证）。
2. 同一日期连跑两次：`competitor_batches`、`competitor_packages`、`competitor_snapshots` 行数不变。
3. 单测覆盖过滤规则、去重、目标日期计算。
**阻塞**：C-01。

---

## C-03 Bundle ID 精确补全与 8 国命中

**Why**：PRD 核心——用 `package_code` 精确匹配，不再用 `display_name` 搜索。

**范围**（扩展：`server/lib/appleLookup.ts` 新增 `lookupAppByBundleId`、`competitorSync` 补全阶段、`competitorRepo.upsertCountryHits`；新建/扩展 `tests/server/appleLookup.test.ts`、`competitorSync.test.ts`）：

- `lookupAppByBundleId(bundleId, country)`：lookup 接口，只接受 `bundleId` 精确匹配的返回，否则 `null`。
- 同步流程扩展：按 `STORE_COUNTRIES` 顺序查 8 国 → `upsertCountryHits` → 首个命中国家取 `LookupCandidate` → upsert 主表/快照的 `lookup_status`（`hit` / `bundle_not_found`）、`apple_id`、`category`、`minimum_os_version`、`app_version`、`app_store_json`。
- 单包 lookup 异常隔离（计入 `failed`，不阻断整批）。

**验收**：
1. 脚本重跑含未命中包的日期：未命中包 `lookup_status = bundle_not_found`，不静默丢弃。
2. spy fetch 单测：返回 `bundleId` 不匹配时拒绝命中；8 国顺序遍历正确。
3. `competitor_country_hits` 每个 (package_code, country) 至多一行。
**阻塞**：C-02。

---

## C-04 本地图片下载与静态资源路由

**Why**：Apple CDN 图片会过期，报告页必须吃本地文件。

**范围**（新建：`server/lib/assetStore.ts`、`tests/server/assetStore.test.ts`、`tests/server/competitorAssetsRoute.test.ts`；扩展 `competitorSync`、`server/app.ts`）：

- `downloadAppAssets(targetDate, packageCode, iconUrl, screenshotUrls)` 落盘到 `data/competitor/<target_date>/<package_code>/`，返回 `localPath` 相对路径与 `ok/partial/failed` 状态。
- `competitorRepo.upsertAssets` 写 `competitor_assets`（source_url + local_path）。
- 同步流程更新 `asset_status`；单图失败不阻断。
- `server/app.ts` 挂 `GET /competitor-assets/:targetDate/:packageCode/:fileName`（`express.static`，PRD 10.7）。

**验收**：
1. 脚本跑一个命中包后，本地目录有 icon + screenshots，`competitor_assets` 行数与文件数一致。
2. supertest：静态路由能取到下载的文件；路径穿越（`..`）被拒绝。
3. 单测：一张截图 404 时 `asset_status = partial` 且其余图入库。
**阻塞**：C-03。

---

## C-05 商品页版本历史快照

**Why**：承诺"当天可见版本历史"，商品页是唯一数据源。

**范围**（扩展 `competitorSync`（复用 `fetchProductPageDetails`，带缓存由 `server/index.ts` 注入）、`competitorRepo.upsertVersions`；新建 `tests/server/competitorVersions.test.ts`）：

- 命中包取首个命中国家的商品页：截图 URL 并入 C-04 下载源、`versionHistory` 全量 upsert `competitor_versions`（version / released_at / notes / captured_at）。
- 快照行 `enrich_status` 更新；商品页抓取失败记为失败态，不阻断。

**验收**：
1. 脚本跑一个命中包：`competitor_versions` 有当天可见版本行。
2. 同日重跑：版本行 upsert 不重复（主键 package_code+version+released_at）。
3. 单测：商品页抛错时该包 `enrich_status` 落失败态、整批继续。
**阻塞**：C-03。

---

## C-06 基础查询 API（含 date_kind 口径）

**Why**：报告页与后续工具的结构化数据入口（PRD 10.1 / 10.3 / 10.4 / 10.6）。

**范围**（新建：`shared/competitorTypes.ts`、`server/lib/competitorApi.ts`、`tests/server/competitorApi.test.ts`；扩展 `competitorRepo` 读侧、`server/app.ts` 挂路由、`server/index.ts` 组装）：

- Router 提供：`GET /api/competitor/days?start&end`、`GET /api/competitor/day/:date?date_kind`、`GET /api/competitor/package/:packageCode`、`GET /api/competitor/batch/:date`。
- `date_kind` 口径收口在仓储（`first_ad` → `first_ad_date`，`listing` → `listing_date`），默认 `first_ad`；非法值 400。
- `createApp` 新增可选依赖 `competitorRepo`，未配置时竞品路由 503（模式同 `ipaDownload`）。
- 响应中的图片一律返回 `competitor_assets.local_path`。

**验收**（supertest + 假 repo）：
1. `date_kind=listing` 与 `first_ad` 对同一份数据返回不同过滤结果（口径测试是本票核心断言）。
2. 空日期、空结果、部分数据（无批次元数据）均 200 或 404 语义清晰。
3. 非法 `date_kind`、非法日期 400；未配置 repo 503。
4. 响应不含源接口密钥或源 URL 鉴权信息。
**阻塞**：C-02。

---

## C-07 汇总查询 API（group_by 分组与时间线）

**Why**：报告页主列表数据源（PRD 10.2）。

**范围**（扩展 `competitorApi`、`competitorRepo.getSummary`、`shared/competitorTypes.ts`、对应测试）：

- `GET /api/competitor/summary?date&date_kind&group_by=team|category|ios_version`。
- 每组返回：包数量、命中数、未命中数、竞品数（次级指标）、近 7 天时间线（按同口径查询前 7 天各日计数）。
- **三层聚合**（契约见 ARCH 2.6「getSummary 的三层聚合契约」，UX 定稿）：
  - 命中包按 `apple_id`（空则按 `app_store_json` 的真实 `trackName`）聚合成竞品行，行内携带包列表摘要（`SummaryCompetitor`）。
  - 组头计数 `package_count`/`hit_count`/`miss_count` 按包计；`competitor_count` 为次级指标。
  - 未命中包不算竞品行，进组内 `missed_packages` 子区。
  - 聚合语义收口在仓储，API 层不做二次分组。
- `ios_version` 分组键 = `COALESCE(minimum_os_version, app_version)`，空值归"未知"；`category` 同理。
- `group_by` 默认 `team`；非法值 400。

**验收**：
1. 三种 `group_by` 对同一数据分出的组数之和等于包总数（无包被丢进组外）。
2. 时间线 7 天计数与 `days` API 对同区间计数一致。
3. `date_kind` 切换后各组数据口径随之变化（与 C-06 用同一真数据断言）。
4. 同一 `appleId` 的两个包在每组只出现一条竞品行，行内 `packageCount = 2`；组头 `package_count` 按包计为 2。
5. 未命中包出现在 `missed_packages`，不出现在任何竞品行；`hit_count + miss_count = package_count`。
**阻塞**：C-06、C-03（分组依赖补全出的 category/版本字段）。

---

## C-08 竞品报告页基础

**Why**：用户价值的第一屏——"打开页面看昨天"（PRD 6.2-8）。

**范围**（新建：`competitor.html`、`src/competitor/main.ts`、`src/lib/competitorApi.ts`、`tests/frontend/competitorPage.test.ts`；扩展 `vite.config.ts` 第二入口、两页头部互链）：

- "竞品" Tab（独立 vite 入口，与现有搜索页互链）；默认展示昨天（`first_ad` 口径）。
- 主列表按三层渲染「日期 → 分组 → 竞品行 → 包」：组头展示包数量、命中数、未命中数与竞品数（次级）；竞品行按 `appleId` 聚合，行内展示包数量与真实名称；同 App 多包不重复成多行。
- 未命中包渲染在组内未命中子区（`missed_packages`），显式标"App Store 未命中"，不静默隐藏。
- 组展开后调 `day/:date` 列出包行：真实名称（取自 `app_store_json`）、团队、类目、iOS 版本、本地图标（`/competitor-assets/` 前缀拼 `local_path`）。

**验收**：
1. jsdom 测试：mock fetch 渲染主列表，未命中包可见、本地图片路径正确拼前缀；同一 `appleId` 多包只渲染一行竞品行且行内包计数正确。
2. 本机 `npm run dev` 真实页面肉眼验收：昨天数据可见、图片从本地加载。
3. 同一天同包在页面只出现一次。
**阻塞**：C-04（图片）、C-06（数据 API）。

---

## C-09 报告页口径切换与分组

**Why**：投放日期和上架日期是两套业务口径，用户要分别看（PRD 6.2-3）。

**范围**（扩展 `src/competitor/main.ts`、`competitorApi.ts` 客户端、前端测试）：

- 页头切换 `first_ad` / `listing`；切换后主列表、组数据、时间线口径一致刷新。
- 分组切换 `team` / `category` / `ios_version`。

**验收**：
1. 切换口径后，请求参数携带正确 `date_kind`，列表数据与口径一致（jsdom 断言 URL 与渲染内容）。
2. 详情视图与列表口径不串（ARCH：口径只在前端传参，语义在 C-06/C-07 已收口）。
**阻塞**：C-07、C-08。

---

## C-10 竞品详情页

**Why**：下钻单个竞品：全部包、图标、截图缩略图、版本历史（PRD 6.2-8 后半）。

**范围**（新建：`src/competitor/renderPackageDetail.ts`、扩展页面路由（hash 或子视图）、前端测试）：

- 点击包行进入详情：调 `package/:packageCode`，展示图标、截图缩略图（本地路径）、版本历史（`competitor_versions`）、`bundle_not_found` 状态包的明确提示。
- 提供该包"跨日历史"入口，调 C-11 的 history API，缺失日期显示"当天未入库"。

**验收**：
1. jsdom：命中包详情含截图缩略图与版本列表；未命中包显示未命中状态。
2. 历史区间含缺失日期时，缺失日期有占位提示而非报错或空白。
**阻塞**：C-05（版本数据）、C-08（页面骨架）、C-11（历史 API）。

---

## C-11 快照历史查询 API

**Why**："同一包跨天历史变化"的查询入口（PRD 10.5），快照表的读侧。

**范围**（扩展 `competitorApi`、`competitorRepo.getPackageHistory`、`shared/competitorTypes.ts`、API 测试）：

- `GET /api/competitor/package/:packageCode/history?from&to`：读 `competitor_snapshots` 区间行，返回每天的 `lookup_status`/版本/类目等状态。
- 前端不在此票（消费方在 C-10）。

**验收**：
1. 用脚本对同一包跑两个不同日期后，history 返回两条快照且按日期有序。
2. 区间内无快照的日期不返回行（"当天未入库"由调用方解释——API 测试断言空缺语义明确：只返回存在行）。
3. 非法区间（from > to）、非法日期 400。
**阻塞**：C-02（快照行已写入）。

---

## C-12 每日定时任务

**Why**：从"手动跑脚本"到"每天自动出报告"（PRD 6.1 关键流程）。

**范围**（新建：`server/lib/competitorScheduler.ts`、`tests/server/competitorScheduler.test.ts`；扩展 `server/index.ts`、`.env.example`；依赖 `node-cron`）：

- `startCompetitorScheduler(deps)`：`cron.schedule("30 9 * * *", run, { timezone: "Asia/Shanghai" })`；`run` = `syncCompetitorDay(computeTargetDate(now), deps)`。
- `server/index.ts`：`DATABASE_URL` 存在时启动迁移 + 调度器；任务异常记日志不上抛、不重启进程。
- 服务器当天未运行导致的缺数由 `scripts/competitor-sync.ts --date` 回填（ARCH 风险 3），不在调度器内做补跑。

**验收**：
1. `computeTargetDate` 单测：固定时钟下返回昨天 UTC。
2. 假 deps 下手动触发调度回调：同步入口被以正确 targetDate 调用一次。
3. 任务抛错时进程存活、次日仍会触发（单测断言异常被吞并记录）。
4. `DATABASE_URL` 缺失时服务照常启动、竞品路由 503、无调度器。
**阻塞**：C-05（完整流水线就绪后才值得定时跑）。
