# 竞品每日快照 — 测试诊断记录

测试基线：`npx vitest run` 两遍均 25 文件 / 316 用例通过（含真实 PostgreSQL :5433），`npx tsc --noEmit` 与 `npm run build` 通过。

## D-1（已修复）listing 口径时间线把"有包、无批次"的日期当成"无快照"

**复现**：插入一个 `listing_date = 2033-02-01`、`target_date = 2033-03-15` 的包，调用
`getSummary("2033-02-01", "listing", "team")`。返回的时间线点：

```json
{ "date": "2033-02-01", "packageCount": 1, "batchStatus": null }
```

页面上该时间线格子显示"无快照"且不可点击，尽管当天有包。

**根因**：`src/competitor/renderSummary.ts` 用 `batchStatus !== null` 判断该日是否有数据。
`competitor_batches` 只按 `target_date` 记录，而 listing 口径的时间线按 `listing_date` 计数，
两者天然不重合，于是所有 listing 时间线格子都被判为空。

**修复**：数据存在性改为 `batchStatus !== null || packageCount > 0`。
回归测试：`tests/frontend/competitorPage.test.ts` — "keeps listing-kind timeline points with packages clickable when no batch exists for that date"。

## D-2（未修复，设计决策）部分失败的包在 summary 中"计数存在、行不存在"

**复现**：以 `lookup_status = "pending"` 写入一个包（单包 8 国 lookup 抛错的同步结果会停留在此状态），
`getSummary(date, "first_ad", "team")` 返回的组为：

```
packageCount: 1, hitCount: 0, missCount: 0
competitors: [], missedPackages: []   // 渲染行数 0
```

**根因**：`server/lib/competitorRepo.ts` 的 `getSummary` 只把 `hit` 计入命中性、只把
`bundle_not_found` 计入未命中与 `missedPackages`；`pending` 只进入 `packageCount`。
`competitorSync` 在单包 lookup 失败时保留首次写入的 `pending` 行，因此这是可达状态。

**影响**：违反票据 C-07 验收 "hit_count + miss_count = package_count"；卡片总数与可见行数不一致，
该包在报告页完全不可见（只体现为批次 `partial`）。

**建议（需产品/设计定调）**：把非 `hit` 状态统一归入"未完成/未命中"子区并显示真实状态；
或给 `PackageBrief` 增加 `lookupStatus`，在 UI 区分"未命中"与"未完成"。不要简单把 `pending`
计成 miss，否则会误标为"App Store 未命中"。

## D-3（未修复，部署配置）compose 未透传竞品变量、图片目录未持久化

**复现**：`grep -n "DATABASE_URL\|FIRST_DELIVERY\|COMPETITOR_DATA_DIR" docker-compose.yml` 无结果。

**根因**：`61a6efc`/`fb72bb0` 只新增了应用代码，`docker-compose.yml` 未加
`DATABASE_URL`、`FIRST_DELIVERY_API_BASE_URL`、`FIRST_DELIVERY_API_KEY`、`COMPETITOR_DATA_DIR`，
也没有为 `data/competitor` 挂载持久卷。

**影响**：按当前 compose 部署，`competitorRepoFromEnv()` 拿到空 `DATABASE_URL` → 竞品 API 全部 503、
调度器不启动；即使补上数据库，图标/截图落在容器层，重建即丢失。

**建议**：compose 增加上述环境变量并复用 `${IPA_DATA_DIR}` 挂载 `/app/data`，同时同步更新 README。
（本工作树的 compose 有其他人未提交的改动，未直接修改。）

## D-4（未修复，规格歧义）`days` 按 `target_date`，时间线按 `date_kind`，listing 下不一致

**复现**：同一个包（`target_date = 2033-03-15`、`listing_date = 2033-02-01`）：
`listDays("2033-02-01", "2033-02-01")` 返回 `[]`，而 `getSummary("2033-02-01","listing","team")`
时间线该点为 1 包。

**根因**：`GET /days` 没有 `date_kind` 参数，仓储固定按 `target_date` 计数；summary 时间线按
所选口径的日期列计数。

**影响**：票据 C-07 验收 "时间线 7 天计数与 days API 对同区间计数一致" 只在 `first_ad` 且
`target_date = first_ad_date` 时成立；前端的"查看最近有数据的日期"在 listing 口径下可能跳到
没有 listing 数据的日期。

**建议**：明确 `days` 的口径（文档写明 target_date 语义），或给它加 `date_kind` 参数。
