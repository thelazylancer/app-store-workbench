# PRD：每日竞品 App Store 详情快照

## 1. Summary

`app-store-workbench` 新增一个每日任务：从内部“首投包”接口取昨天的 iOS 竞品包，用 `package_code` 作为 Bundle ID 去 App Store 精确补全详情，把图标、截图、版本历史和关键日期一起落到本地，并提供一个可按日期查看的报告页。

用户不再需要在源表和 App Store 之间手工对包，也不再依赖不可靠的内部 `display_name` 去搜索应用。

---

## 2. Background

现状：

- 工作台已有 App Store 搜索、详情补全、IPA 下载能力。
- 没有定时任务，没有业务数据库，没有历史快照。
- 源表里的 `display_name` 不是真实 App 名称，例如 `iOS-BeglaiOS-S` 对应的真实 App 是 `Begla`。
- 源表里的 `package_code` 是可靠 Bundle ID。
- 源表同时有两个关键日期口径：
  - `first_ad_date`：投放日期
  - `listing_date`：上架日期

用户需要能分别按这两个日期维度看数据。

本次改动补上三块缺失能力：

1. 每日定时抓取；
2. 按 Bundle ID 精确补全；
3. 本地持久化与历史查询。

源数据发布时间约为 UTC `00:47`，即北京时间约 `08:47`。任务定在北京时间 `08:00`，可能早于源数据发完。

---

## 3. Objective

让竞品分析同事每天打开一个页面，就能看到前一天新出现的 iOS 竞品包、真实 App Store 信息、图标、截图和版本历史，并且能回看任意历史日期。

### Key Results

1. 每日任务运行后，目标日期的 iOS 竞品包要么入库，要么明确标记为“App Store 未命中”。
2. 报告页能按日期展示图标、截图和版本历史。
3. 同一日期重复执行不会产生重复记录。

---

## 4. Market Segment(s)

### 4.1 竞品分析 / 运营同事

需要每天知道有哪些新 iOS 竞品上架、长什么样、核心信息是什么。现在只能人工查源表，再逐个去 App Store 搜索，容易漏、容易错。

### 4.2 产品 / 数据研发同事

需要可追溯的历史快照：某一天某个竞品的版本、截图、描述是什么。现在没有稳定存储，事后很难还原。

### 4.3 管理与决策同事

需要快速浏览每日竞品概览，而不是等人工整理的口头或表格汇总。

---

## 5. Value Proposition(s)

### 5.1 竞品分析 / 运营同事

- **Who**：每天监控 iOS 竞品新包的人。
- **Why**：要知道“昨天有哪些竞品上架了、长什么样”。
- **What before**：先看内部源表，再手工去 App Store 搜，包名经常对不上。
- **How**：系统每天自动用 `package_code` 作为 Bundle ID 精确补全 App Store 详情，并保存图标和截图。
- **What after**：打开报告页就能看到完整竞品快照，不需要手工对包。
- **Alternatives**：继续用源表加人工搜索，或写一次性脚本。我们的方案稳定、可回看、不用记包名。

**Value Proposition**：把“每天查一批包”变成“每天看一页报告”。

### 5.2 产品 / 数据研发同事

- **Who**：需要回溯某天竞品状态的人。
- **Why**：要证明某天某个 App 的版本、截图、描述是什么。
- **What before**：靠当时手工截图或临时脚本，历史不可复现。
- **How**：每日任务把源数据、App Store 详情、图标、截图、版本历史一起落库。
- **What after**：可以按日期查询历史快照。
- **Alternatives**：继续做一次性抓取。我们的方案提供可查询、可复现的历史记录。

**Value Proposition**：把临时查证变成可追溯的数据资产。

### 5.3 管理与决策同事

- **Who**：想快速了解每日竞品动态的人。
- **Why**：需要及时知道竞品数量和主要包，不想等人工整理。
- **What before**：等人发表格或口头汇总。
- **How**：报告页按日期展示竞品概览、图标和截图缩略图。
- **What after**：打开页面即可浏览，可下钻看单个 App。
- **Alternatives**：人工日报。我们的方案自动生成、可查历史。

**Value Proposition**：把人工整理日报变成自动可查报告。

---

## 6. Solution

### 6.1 关键流程

```text
每日 08:00（Asia/Shanghai）
→ 查询源接口 first_ad_date = 昨天（UTC）
→ 排除 team = 灵蜂
→ 保留 display_name 包含 ios
→ 按 package_code 去重
→ 用 package_code 作为 Bundle ID 查 App Store
→ 记录在 us, cn, hk, tw, jp, sg, gb, au 中的命中情况
→ 页面不提供国家筛选；国家只作为后端抓取范围
→ 抓取商品页详情
→ 下载 icon 和 screenshots 到本地
→ 保存版本历史快照
→ 入库
```

### 6.2 Key Features

1. **每日源数据抓取**
   - 按目标 UTC 日期查询源接口。
   - 过滤 `team != 灵蜂` 且 `display_name` 包含 `ios`。
   - 保留 `first_ad_date`、`listing_date`、`first_100_date`、`offline_date`。

2. **Bundle ID 精确补全**
   - 不再用 `display_name` 去 `/api/search-apps` 搜。
   - 新增内部服务：`lookup?bundleId=<package_code>&country=<country>&entity=software`。
   - 严格校验返回的 `bundleId`。
   - 记录多国家命中情况。

3. **维度切换与分组**
   - 支持两种日期口径：
     - `first_ad_date`：投放日期
     - `listing_date`：上架日期
   - 支持按以下维度查看和分组：
     - 团队（`team`）
     - App 类目（`category`）
     - iOS 版本（`minimumOsVersion` / `version`）
   - 页面不提供国家筛选；国家只作为后端抓取范围。

4. **本地图片保存**
   - 下载 `icon` 和 `screenshots` 到本地目录。
   - 数据库记录源 URL 和本地路径。
   - 报告页使用本地文件，不依赖 Apple CDN 是否长期有效。

5. **版本历史快照**
   - 保存当前商品页可见的 `versionHistory`。
   - 不承诺全量历史，只承诺“当天可见快照”。

6. **PostgreSQL 持久化**
   - 连接本机 PostgreSQL，通过 `DATABASE_URL` 配置。
   - `package_code` 作为唯一键，一个包只保存一条主记录。
   - 只给 `first_ad_date`、`listing_date`、`target_date`、`team` 建索引。
   - `category`、`minimum_os_version` 先保留字段，不建索引。
   - 同一天重复执行采用 upsert，不产生重复行。
   - 批次表按 `target_date` 唯一。

7. **历史查询 API**
   - 支持按日期查整批。
   - 支持按包查单条。
   - 支持按包查跨日期历史。

8. **竞品报告页**
   - 新增一个“竞品”Tab。
   - 默认展示昨天的数据。
   - 支持在 `first_ad_date`（投放日期）和 `listing_date`（上架日期）之间切换。
   - 支持按团队、类目、iOS 版本分组查看。
   - 主列表按竞品/团队聚合，展示包数量、命中数、未命中数和时间线。
   - 点击某个竞品后，进入该竞品详情页，展示它的所有包、图标、截图缩略图和版本历史。
   - App Store 未命中的包单独显示状态。

### 6.3 Not in v1

- 不做登录鉴权。
- 不做多语言 UI。
- 不做国家筛选；国家只作为后端抓取范围。
- 不做自动趋势分析。
- 不做图片压缩或格式转换。
- 不做 App Store 全量历史回溯。
- 不做 Agent / MCP 集成。

### 6.4 Assumptions and open questions

- 源接口完整发布时间约北京时间 `08:47`，`08:00` 的任务可能抓到未发完的批次。
- `package_code` 会一直是可靠 Bundle ID。
- `display_name` 包含 `ios` 足以判断 iOS 包。
- 8 个国家范围暂时够用，后续可扩展 `de, fr, kr, ca`。
- 图片本地保存后，是否需要清理策略，暂未定。

---

## 7. Release

### Phase 1

- 每日抓取
- PostgreSQL 入库
- App Store 详情补全
- 图片本地保存
- 版本历史快照
- 竞品报告页
- 按投放日期 / 上架日期切换
- 按团队、类目、iOS 版本分组

### Phase 2

- 更丰富的历史筛选
- 导出
- 图片清理策略（用户已定：按日期清理；当前数据量小，暂不做）
- 更多国家抓取范围

### 明确不做

- 不做鉴权
- 不做全量 App Store 历史回溯
- 不做自动竞品趋势报告

---

## 8. WWA / Work Items

### WWA-001：源数据抓取与批次入库

- **Why**：需要先拿到可靠的每日竞品包列表。
- **What**：
  - 每天北京时间 `08:00` 调源接口。
  - 按 `first_ad_date = target_date` 查询。
  - 过滤 `team != 灵蜂`。
  - 过滤 `display_name` 包含 `ios`。
  - 按 `package_code` 去重。
  - 保存源表字段和批次元数据。
- **Acceptance**：
  - `competitor_batches` 按 `target_date` 只有一条。
  - `competitor_packages` 按 `package_code` 唯一。
  - 同一天重跑是 upsert，不产生重复行。
  - `first_ad_date`、`listing_date`、`target_date`、`team` 建好索引。
  - `category`、`minimum_os_version` 只保留字段，不建索引。
  - 批次记录 `sync_id`、`snapshot_id`、`range_complete`、`stale`、`data_updated_at`、`published_at`。

### WWA-002：Bundle ID 精确补全

- **Why**：源表 `display_name` 不可信，必须用 Bundle ID。
- **What**：
  - 新增 `lookupAppByBundleId(bundleId, country)`。
  - 依次查询 `us, cn, hk, tw, jp, sg, gb, au`。
  - 只接受返回 `bundleId` 与源 `package_code` 精确匹配的结果。
  - 保存命中国家、`appleId`、真实名称、描述、分类、价格、评分、版本、图标、截图、App Store URL。
- **Acceptance**：
  - 不走 `display_name` 搜索。
  - 未命中时记录 `lookup_status = bundle_not_found`。
  - 命中国家记录在 `competitor_country_hits`。
  - 单包查询失败不影响整批任务。

### WWA-003：本地图片保存

- **Why**：Apple CDN 图片可能过期或下架后失效。
- **What**：
  - 下载 `icon` 和 `screenshots` 到本地。
  - 保存到 `data/competitor/<target_date>/<package_code>/`。
  - 数据库记录 `source_url` 和 `local_path`。
- **Acceptance**：
  - 报告页使用本地图片路径。
  - 图片下载失败不阻断整批任务，记录 `asset_status = failed` 或 `partial`。
  - 本地路径可通过静态路由访问。

### WWA-004：版本历史快照

- **Why**：需要知道某天 App Store 上可见的版本状态。
- **What**：
  - 从商品页提取 `versionHistory`。
  - 保存版本号、发布时间、更新说明、抓取时间。
- **Acceptance**：
  - 每个命中包都有版本历史记录。
  - 重复执行同一天是 upsert。
  - 不承诺完整历史，只保存当天可见快照。

### WWA-005：历史查询 API

- **Why**：报告页和后续工具需要结构化访问。
- **What**：
  - 提供按日期、按包、按历史区间的查询接口。
  - 支持切换日期口径：`first_ad_date` / `listing_date`。
  - 支持按 `team`、`category`、`minimumOsVersion` / `version` 分组统计。
- **Acceptance**：
  - 空日期、空结果、部分数据都可正常返回。
  - 不暴露源接口密钥。
  - 返回本地图片路径。
  - 同一日期、同一包、同一口径下不会重复返回。

### WWA-006：竞品报告页

- **Why**：用户需要一个不用手工查库的每日视图。
- **What**：
  - 新增“竞品”Tab。
  - 默认展示昨天的数据。
  - 支持按投放日期 / 上架日期切换。
  - 主列表按团队/竞品聚合，展示包数量、命中数、未命中数和近 7 天时间线。
  - 点击某个竞品后进入详情页，展示该竞品的全部包、图标、截图缩略图和版本历史。
  - 支持按类目、iOS 版本分组查看。
- **Acceptance**：
  - 未命中的包能明确看到 `bundle_not_found`。
  - 页面不重复展示同一天同包。
  - 图片从本地加载。
  - 切换日期口径后，列表和详情的数据口径保持一致。

---

## 9. 数据表结构

```sql
CREATE TABLE competitor_batches (
  target_date DATE PRIMARY KEY,
  sync_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  data_updated_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  range_complete BOOLEAN NOT NULL,
  stale BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
```

```sql
CREATE TABLE competitor_packages (
  package_code TEXT PRIMARY KEY,

  target_date DATE NOT NULL,
  display_name TEXT NOT NULL,
  team TEXT NOT NULL,

  first_ad_date DATE NOT NULL,
  listing_date DATE,
  first_100_date DATE,
  offline_date DATE,

  category TEXT,
  minimum_os_version TEXT,
  app_version TEXT,

  lookup_status TEXT NOT NULL,
  enrich_status TEXT NOT NULL,
  asset_status TEXT NOT NULL,

  app_store_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
```

```sql
CREATE INDEX idx_competitor_packages_first_ad_date
  ON competitor_packages (first_ad_date);

CREATE INDEX idx_competitor_packages_listing_date
  ON competitor_packages (listing_date);

CREATE INDEX idx_competitor_packages_target_date
  ON competitor_packages (target_date);

CREATE INDEX idx_competitor_packages_team
  ON competitor_packages (team);
```

```sql
CREATE TABLE competitor_country_hits (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  country TEXT NOT NULL,
  status TEXT NOT NULL,
  apple_id BIGINT,
  fetched_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, country)
);
```

```sql
CREATE TABLE competitor_assets (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  type TEXT NOT NULL,
  source_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, type, source_url)
);
```

```sql
CREATE TABLE competitor_versions (
  package_code TEXT NOT NULL
    REFERENCES competitor_packages (package_code),
  version TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  captured_at TIMESTAMPTZ NOT NULL,

  PRIMARY KEY (package_code, version, released_at)
);
```

说明：

- `package_code` 是唯一键，一个包只保存一条主记录。
- `target_date`、`first_ad_date`、`listing_date`、`team` 都建索引，方便按日期、团队和投放/上架口径查询。
- `category`、`minimum_os_version` 也单独建列，便于按类目和 iOS 版本分组；当前版本不建索引，数据量大了再说。
- 如果以后需要“同一个包跨多天的状态变化”，再加一张独立的快照表；当前版本先不做。

---

## 10. API 列表

所有接口不提供国家筛选参数；国家只作为后端抓取范围。

### 10.1 `GET /api/competitor/days`

```text
GET /api/competitor/days?start=YYYY-MM-DD&end=YYYY-MM-DD
```

返回日期列表及每天的包数量、命中数量、批次状态。

### 10.2 `GET /api/competitor/summary`

```text
GET /api/competitor/summary?date=YYYY-MM-DD&date_kind=first_ad|listing&group_by=team|category|ios_version
```

返回按维度聚合的竞品报告数据：

- `date_kind`：日期口径，`first_ad`（投放日期）或 `listing`（上架日期），默认 `first_ad`。
- `group_by`：分组维度，`team`（团队，默认）、`category`（类目）、`ios_version`（iOS 版本）。
- 每组返回：包数量、命中数、未命中数、近 7 天时间线、包列表摘要。

主报告页的数据来源。

### 10.3 `GET /api/competitor/day/:date`

```text
GET /api/competitor/day/:date?date_kind=first_ad|listing
```

返回某一天按所选口径的完整竞品快照，包括：

- 批次元数据
- 包列表（含团队、类目、iOS 版本、状态）
- App Store 详情
- 本地图标路径
- 本地截图路径

### 10.4 `GET /api/competitor/package/:packageCode`

```text
GET /api/competitor/package/:packageCode
```

返回某个包的完整详情，包括图标、截图和版本历史。

### 10.5 `GET /api/competitor/package/:packageCode/history`

```text
GET /api/competitor/package/:packageCode/history?from=YYYY-MM-DD&to=YYYY-MM-DD
```

返回同一个包在日期区间内的快照变化。

### 10.6 `GET /api/competitor/batch/:date`

```text
GET /api/competitor/batch/:date
```

返回某一天任务的运行状态和源接口元数据。

### 10.7 静态资源路由

```text
GET /competitor-assets/:targetDate/:packageCode/:fileName
```

用于访问本地保存的图标和截图。

---

## 11. Open Questions

1. 报告页是否需要登录？
2. 图片保留多久？
3. 是否需要导出 CSV / Excel？
4. 后续是否扩展到 `de, fr, kr, ca`？
5. 同一个包跨多天的状态变化是否需要独立快照表？（当前 `package_code` 唯一，主记录只保留最新状态）
