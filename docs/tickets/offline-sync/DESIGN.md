# 架构设计：每日 offline 下架包同步（回写 offline_date）

上游已提供 `GET {FIRST_DELIVERY_API_BASE_URL}/api/v1/offline-packages`（接口事实见本文 §2，已实测采信）。目标：每日 09:10 竞品定时任务在首投同步之后追加一次 offline 下架包查询，把 `offline_date` 回写到已存在的 `competitor_packages` 行；另提供一个手动回填脚本。所有产品决策已由 BRIEF（对话定稿）拍板，本文不重开。

---

## 1. 模块图（文字）

```text
 server/lib/sourceApi.ts（新，internal seam）
   共享抓取核心：env 解析、X-API-Key、30s 超时、5xx 重试、unwrap、翻页
        ▲                                    ▲
        │                                    │
 server/lib/firstDeliverySource.ts（重构）   server/lib/offlineSource.ts（新）
   只保留 firstDelivery 行归一化              offline 行归一化（只要 code+date）
   （display_name 含 ios 过滤）               （不做任何 display_name 过滤）
        │ fetchFirstDeliveryPackages          │ fetchOfflinePackages(start,end)
        ▼                                    ▼
 server/lib/competitorSync.ts（不动）       server/lib/offlineSync.ts（新，深模块）
   syncCompetitorDay                        beijingToday / computeOfflineWindow /
                                            collapseOfflineDates / syncOfflinePackages
        │                                        │
        └──────────────┬─────────────────────────┘
                       ▼
        server/lib/competitorScheduler.ts（改）
          runScheduledCompetitorSync：首投、offline 各自 try/catch，互不影响
                       │
        server/index.ts（装配 offlineDeps）   scripts/offline-sync.ts（新，手动回填）
                       ▼
        server/lib/competitorRepo/writes.ts（改）
          updateOfflineDates：一条 UPDATE ... FROM UNNEST，只写 offline_date
```

与 `docs/ARCH-competitor-daily.md` 的分层完全同构：source 适配器 → 同步编排 → 仓储适配器 → 装配。offline 是首投同步的姊妹数据流，不是它的分支。

## 2. 上游接口事实（已实测，实现按此写死）

- `GET {base}/api/v1/offline-packages`，头 `Accept: application/json` + `X-API-Key: {FIRST_DELIVERY_API_KEY}`。
- query：`start_day`、`end_day`（北京时间，含端点）、`page`(1..1000000)、`page_size`(1..200)、`sync_id`（翻页沿用首次响应）；`team` 不传（决策 2）。
- 响应 `{code, message, request_id, data: OfflinePackage[], meta}`；`OfflinePackage = {offline_date, team, display_name, package_code, listing_date, first_ad_date, first_delivery_team, has_first_delivery}`，`display_name`/`package_code` 可为 null。
- `meta = {page, page_size, total_count, sync_id, data_updated_at, coverage_start, coverage_end, timezone:"Asia/Shanghai", range_complete, stale}`。
- 错误：400 INVALID_ARGUMENT、401、404 SNAPSHOT_NOT_FOUND（翻页 sync_id 失效）、503 DATABASE_BUSY/DATA_NOT_READY（Retry-After: 5）。
- `offline_date` 是北京时间，比首投接口的 UTC `offline_date` 晚 1 天——因此**首投同步写入的 offline_date 与本同步写入的值天然不同源，后者为准**（见 §7 执行顺序）。
- 灵蜂(LF) 的 `*` 只出现在 `display_name`，`package_code` 不受影响——不按 display_name 匹配、不去 `*`，因此无影响。

## 3. 已定夺决策（不可推翻）

| # | 决策 |
| --- | --- |
| 1 | 新增 `server/lib/offlineSync.ts` 深模块；`competitorScheduler` 在首投同步之后调用；各自 try/catch，互不影响 |
| 2 | 每日窗口 = 北京时间 `[昨天-2, 昨天]` 共 3 个自然日（自愈单次失败）；不传 team |
| 3 | 冷启动/回填：`scripts/offline-sync.ts` + `npm run sync:offline -- --days 30`，窗口 `[今天-(days-1), 今天]`（北京时间），打印 JSON 报告；不加 HTTP 接口、不改前端 |
| 4 | 匹配只用 `package_code` 精确匹配；不看 display_name、不去 `*`、不改展示名 |
| 5 | 只更新已存在的包，只写 `competitor_packages.offline_date`；同 code 多条取最大 `offline_date`；一条批量 `UPDATE ... FROM UNNEST`；不碰 team/display_name/lookup_status 等，不写 `competitor_snapshots`，不加迁移（列已存在） |
| 6 | 未命中库的包：忽略，只计数 |
| 7 | “只考虑 iOS”由“只更新库里已存在的包”实现，不加 display_name 含 ios 过滤 |
| 8 | 报告字段 `{start, end, fetched, matched, updated, unmatched, failed}`；`stale=true` 或 `range_complete=false` 照常写入并 warn |
| 9 | 首投同步保持现状（只查昨天）；手动补数仍用 `npm run sync:competitor -- --date` |
| 10 | 不新增依赖、不做自动冷启动检测 |

## 4. 模块与接口设计

### 4.1 `server/lib/sourceApi.ts`（新）——两个源适配器的共享 internal seam

现状：`firstDeliverySource.ts` 内嵌了 endpoint 解析、env 解析、X-API-Key、30s 超时、3 次 5xx 重试、`unwrap`、翻页终止判断。offline 需要完全同一套行为。复制第二套 = 复杂度翻倍；抽成共享模块后两个适配器各自只剩「行归一化 + 过滤」这一真正不同的部分，符合删除测试（删掉它，两套抓取逻辑在两个适配器里重现）。

**注意：行归一化（`normalizeRow`）不共享。** 首投版要求 `display_name`/`team`/`first_ad_date` 非空并过滤 `display_name` 含 ios；offline 版只要求 `package_code` + `offline_date` 有效，且严禁 display_name 过滤（决策 4/7）。两个 `normalizeRow` 语义相反，强行共享会把首投的 ios 过滤泄漏进 offline。

接口（全部由两个源适配器消费，不对外层暴露）：

```ts
export class SourceHttpError extends Error {
  constructor(readonly status: number);
}

// env 解析 + 三种 base 形态归一，产出 {path} 的完整 URL。
// FIRST_DELIVERY_API_URL / FIRST_DELIVERY_API_BASE_URL / 默认值 都兼容；
// 若 env 值以 /first-delivery-packages 结尾，先剥掉再拼 offline-packages。
export function sourceEndpointUrl(path: string): string;

// 单页抓取：X-API-Key 缺失抛错；4xx 即抛 SourceHttpError；5xx 退避重试 3 次。
export async function fetchSourcePage(
  path: string,
  params: Record<string, string>,
  page: number,
  syncId: string,
): Promise<{ metadata: Record<string, unknown>; rows: Record<string, unknown>[] }>;

// 翻页循环 + sync_id 沿用 + 终止判断（rows < page_size 或达到 total_count）。
export async function fetchSourceAllPages(
  path: string,
  params: Record<string, string>,
): Promise<{ metadata: Record<string, unknown>; rows: Record<string, unknown>[] }>;

// 值胁迫助手，平移自 firstDeliverySource（text/pick/dateOnly/timestamp/boolean）。
```

行为契约 = 现 `firstDeliverySource.ts` L98–139 的逐条平移：30s 超时、`page_size=200`、重试退避 `1s, 2s`。503 的 `Retry-After: 5` 不专门实现（现有首投行为也没实现，沿用退避即可，见 §9 已知限制）。`FirstDeliveryHttpError` 改名 `SourceHttpError`，`firstDeliverySource.ts` 保留 `export { SourceHttpError as FirstDeliveryHttpError }` 别名，`tests/server/firstDeliverySource.test.ts` 零改动。

`firstDeliverySource.ts` 重构后只保留：`SourcePackageRow`、`SourceBatch`、首投 `normalizeRow`、ios 过滤去重、`fetchFirstDeliveryPackages`。对外接口零变化，首投测试零改动即证明行为不变（先例：BE-1 competitorRepo 拆分）。

### 4.2 `server/lib/offlineSource.ts`（新）——offline 源适配器

```ts
export type OfflinePackageRow = {
  packageCode: string;   // 必有，trim 后非空
  offlineDate: string;  // YYYY-MM-DD，北京时间
};

export type OfflineSourceBatch = {
  syncId: string;
  rangeComplete: boolean;
  stale: boolean;
  rows: OfflinePackageRow[];  // 仅有效行
  invalid: number;            // package_code/offline_date 为空或日期格式错的行数
};

export async function fetchOfflinePackages(
  startDay: string,   // YYYY-MM-DD 北京时间，含端点
  endDay: string,
): Promise<OfflineSourceBatch>;
```

接口说明（调用方必须知道的）：日期格式错直接 throw（和 `fetchFirstDeliveryPackages` 同款守卫）；rejecting = 源不可达/未授权/翻页 sync_id 失效（404）；resolved = 已按 code+date 有效性过滤。`meta.stale`/`range_complete` 原样透传，由编排层 warn（决策 8）。不做 display_name 处理。

### 4.3 `server/lib/offlineSync.ts`（新）——编排深模块

小接口、大实现：调用方只需给「抓哪天」和两个依赖，拿回一份报告。

```ts
export type OfflineDateUpdate = { packageCode: string; offlineDate: string };
export type OfflineSyncWindow = { start: string; end: string };
export type OfflineSyncReport = {
  start: string; end: string;
  fetched: number;   // 去重后的有效包数 + invalid 行数（= matched + unmatched + failed）
  matched: number;   // 库里已有的 code 数（UPDATE RETURNING 数）
  updated: number;   // 实际写入数；当前实现与 matched 恒等
  unmatched: number; // 有效行中 code 不在库里的数量（决策 6：忽略只计数）
  failed: number;    // 无效行数（code/offline_date 缺失或格式错）
};

export type OfflineSyncDeps = {
  fetchOfflinePackages: (startDay: string, endDay: string) => Promise<OfflineSourceBatch>;
  repo: Pick<CompetitorWriteRepo, "updateOfflineDates">;
};

// 北京时间今天（YYYY-MM-DD）。北京无夏令时，固定 UTC+8：
export function beijingToday(now: Date): string;

// 每日窗口：end = 北京昨天，start = end - 2 天（决策 2）。
export function computeOfflineWindow(now: Date): OfflineSyncWindow;

// 回填窗口：end = 北京今天，start = 今天 - (days-1)（决策 3；days>=1）。
export function computeBackfillWindow(now: Date, days: number): OfflineSyncWindow;

// 纯函数：同 code 取最大 offline_date；输出顺序稳定（首见序）。
export function collapseOfflineDates(rows: OfflinePackageRow[]): OfflineDateUpdate[];

export async function syncOfflinePackages(
  window: OfflineSyncWindow,
  deps: OfflineSyncDeps,
  log?: (message: string) => void,
): Promise<OfflineSyncReport>;
```

时间窗口是纯函数（吃 `now: Date`），与 `computeTargetDate` 同款可测性；日期算术用 `new Date(dateStr + "T00:00:00Z").getTime() ± 86400000`，不引时区库（决策 10）。`syncOfflinePackages` 内部：抓取 → `stale || !rangeComplete` 时 `log` warn（照常继续）→ collapse → 空数组直接返回零报告（不触发 SQL）→ `repo.updateOfflineDates` → 用 RETURNING 的 codes 计算 matched/unmatched。

### 4.4 仓储：`server/lib/competitorRepo/writes.ts`（改，只加一个方法）

```ts
export type OfflineDateUpdate = { packageCode: string; offlineDate: string };
// 类型放 writes.ts（CountryHitRow 先例），competitorRepo.ts 门面 re-export。

// CompetitorWriteRepo 追加：
updateOfflineDates(entries: OfflineDateUpdate[]): Promise<string[]>;  // RETURNING 已更新的 package_code
```

SQL（一条批量语句，决策 5）：

```sql
UPDATE competitor_packages AS cp
SET offline_date = u.offline_date
FROM UNNEST($1::text[], $2::date[]) AS u(package_code, offline_date)
WHERE cp.package_code = u.package_code
RETURNING cp.package_code
```

行为契约：只更新已存在的行（不存在即天然忽略）；只碰 `offline_date` 一列；空数组直接返回 `[]` 不发 SQL；同 code 的最大值由 TS 侧 `collapseOfflineDates` 保证，SQL 是无脑覆盖。`competitor_packages` 主键就是 `package_code`，不存在同 code 多行问题。不加迁移——`offline_date DATE` 已在 `server/migrations/001-competitor.sql` L23。

### 4.5 调度：`server/lib/competitorScheduler.ts`（改）

```ts
export type SchedulerOptions = {
  now?: () => Date;
  run?: typeof syncCompetitorDay;
  runOffline?: typeof syncOfflinePackages;   // 新增，测试 seam
  log?: (message: string) => void;
};

export async function runScheduledCompetitorSync(
  deps: CompetitorSyncDeps,
  offlineDeps: OfflineSyncDeps,              // 新增第二参数
  options?: SchedulerOptions,
): Promise<void>;

export function startCompetitorScheduler(
  deps: CompetitorSyncDeps,
  offlineDeps: OfflineSyncDeps,
  options?: SchedulerOptions,
);
```

`runScheduledCompetitorSync` 体内两个独立 try/catch（决策 1 的错误隔离落点）：

```text
try { await run(computeTargetDate(now()), deps) } catch e { log("Competitor sync failed: ...") }
try { await runOffline(computeOfflineWindow(now()), offlineDeps, log) } catch e { log("Offline sync failed: ...") }
```

首投失败后 offline 照跑，反之亦然。cron 表达式、时区、09:10 时刻全部不动。

### 4.6 装配：`server/index.ts`（改）+ `scripts/offline-sync.ts`（新）

`index.ts`：`competitorRepo` 装配成功后，`startCompetitorScheduler(deps, { fetchOfflinePackages, repo: competitorRepo }, {})`。同一个 repo 实例喂两边（`Pick` 兼容）。无 DATABASE_URL 时两者都不调度，行为与现状一致。

`scripts/offline-sync.ts` 照抄 `scripts/competitor-sync.ts` 的骨架（loadEnvFile → DATABASE_URL 守卫 → pool + 迁移 → 只跑 offline → `console.log(JSON.stringify(report, null, 2))` → pool.end）。`--days N`（默认 30）→ `computeBackfillWindow(new Date(), N)`。脚本不做参数持久化、不写 batch 表。`package.json` 加一行 `"sync:offline": "tsx scripts/offline-sync.ts"`。

## 5. seam 放置总结

| Seam | 位置 | 谁跨过它 |
| --- | --- | --- |
| 源 HTTP（external） | `fetchOfflinePackages` / `fetchFirstDeliveryPackages` 函数签名 | 同步编排、测试（spy `globalThis.fetch`） |
| 源抓取核心（internal） | `sourceApi.ts` | 仅两个源适配器；不对外暴露 |
| 同步编排（external） | `syncOfflinePackages(window, deps)` | 调度器、脚本、测试（全依赖 `vi.fn`） |
| 仓储写入（external） | `CompetitorWriteRepo.updateOfflineDates` | offlineSync、repo 测试（真连 PG） |
| 时钟（external） | `now: () => Date` / `now: Date` 参数 | 调度器与窗口纯函数的测试 |

## 6. 测试策略（vitest，沿用现有三种形态）

| 模块 | 测试文件 | 形态 |
| --- | --- | --- |
| sourceApi 重构 | `tests/server/firstDeliverySource.test.ts` **零改动**全绿 | spy `globalThis.fetch`（行为不变的证明） |
| offlineSource | `tests/server/offlineSource.test.ts`（新） | spy `globalThis.fetch`：多页翻页、sync_id 沿用、401 抛错、503 重试、null code 计入 invalid、stale/range_complete 透传、`*` display_name 不影响行保留 |
| offlineSync | `tests/server/offlineSync.test.ts`（新） | 全依赖 `vi.fn`：窗口纯函数（含北京/UTC 临界，如 `now = 2026-11-23T16:10Z` → 北京 11-24 → 窗口 11-21..11-23）、collapse 取最大、unmatched 计数、空批次不发 SQL、stale warn |
| scheduler | `tests/server/competitorScheduler.test.ts`（扩） | spy node-cron：offline 注入失败不影响首投、首投失败不影响 offline、cron 不变 |
| repo | `tests/server/competitorRepo.writes.test.ts`（扩） | 真连本机 PG（缺 DATABASE_URL skip）：两存量包 + 一个库里没有的 code，断言只写 offline_date、其余列不动、RETURNING 正确、空数组不发 SQL |

`scripts/offline-sync.ts` 无独立测试（与 `scripts/competitor-sync.ts` 同待遇：脚本只是装配，逻辑都在已测模块里）。

## 7. 执行顺序与数据一致性

定时任务内先首投后 offline：首投的 `upsertPackage` 也会写 `offline_date`（UTC 口径，比 offline 口径早 1 天），offline 随后覆盖为北京口径的权威值。首投按天查询、包不重复出现，所以历史包不会被后续首投 upsert 回写——offline 值不会被首投冲掉。每日 3 天窗口 + 同值幂等覆盖 = 单日失败次日自愈，无需重试状态机。

## 8. 决策与代码事实的冲突检查

逐条核对无硬冲突。两处需确认口径（属规格细化而非冲突，见「剩余风险」）：

1. **覆盖 vs GREATEST**：决策 5 只说「同 code 多条取最大」，未说与库内现值的关系。本设计选**无条件覆盖**（幂等、自愈、实现最简）。若上游会「往前修正」offline_date，覆盖也能生效——GREATEST 反而会拒绝回拨。维持覆盖。
2. **failed 的语义**：决策 8 未定义。本设计定义为「无效行数」（code 或 offline_date 缺失/格式错），使 `fetched = matched + unmatched + failed` 恒成立。

## 9. 已知限制

- 503 的 `Retry-After: 5` 不专门读取（沿用现有首投的 1s/2s 退避；首投三年如此，一致性优先）。
- 翻页中途 404（sync_id 失效）整窗失败，等次日 3 天窗口自愈；不做中途重取。
- 不做冷启动自动检测；空库由人工跑一次 `npm run sync:offline -- --days 30` 补齐。
- 回填窗口只覆盖源「当前版本约近 30 天」，更早的历史拿不到（上游限制，决策 10 接受）。
- `updated` 与 `matched` 当前恒等；保留两个字段是决策 8 的日志契约，不为分歧留逻辑。

## 10. 涉及文件清单

| 文件 | 动作 |
| --- | --- |
| `server/lib/sourceApi.ts` | 新增（自 firstDeliverySource 平移） |
| `server/lib/firstDeliverySource.ts` | 重构（对外接口不变） |
| `server/lib/offlineSource.ts` | 新增 |
| `server/lib/offlineSync.ts` | 新增 |
| `server/lib/competitorRepo/writes.ts` | 加 `updateOfflineDates` + `OfflineDateUpdate` |
| `server/lib/competitorRepo.ts` | re-export `OfflineDateUpdate` |
| `server/lib/competitorScheduler.ts` | 加第二 deps + `runOffline` |
| `server/index.ts` | 装配 offlineDeps |
| `scripts/offline-sync.ts` | 新增 |
| `package.json` | 加 `sync:offline` script |
| `tests/server/offlineSource.test.ts` | 新增 |
| `tests/server/offlineSync.test.ts` | 新增 |
| `tests/server/competitorScheduler.test.ts` | 扩用例 |
| `tests/server/competitorRepo.writes.test.ts` | 扩用例 |

不新增：迁移、HTTP 路由、前端文件、依赖、配置项。
