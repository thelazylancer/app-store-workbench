# BE-3 offlineSync 编排深模块 + 调度接入（首投/offline 错误隔离）

- 依赖：BE-1（`fetchOfflinePackages`）、BE-2（`updateOfflineDates`）
- 角色：backend-developer
- 对应 `docs/tickets/offline-sync/DESIGN.md` §4.3、§4.5、§7

## 背景

每日 09:10 定时任务在首投同步之后追加 offline 同步，各自 try/catch（决策 1/2）。窗口、collapse、报告都是纯函数或纯函数组合，单独成模块便于直测。

## 范围

**做**：
1. 新增 `server/lib/offlineSync.ts`（接口全文见 DESIGN §4.3）：

```ts
export type OfflineSyncReport = {
  start: string; end: string;
  fetched: number; matched: number; updated: number; unmatched: number; failed: number;
};
export type OfflineSyncDeps = {
  fetchOfflinePackages: (startDay: string, endDay: string) => Promise<OfflineSourceBatch>;
  repo: Pick<CompetitorWriteRepo, "updateOfflineDates">;
};
export function beijingToday(now: Date): string;                       // 固定 UTC+8
export function computeOfflineWindow(now: Date): OfflineSyncWindow;   // [昨天-2, 昨天] 北京时间
export function computeBackfillWindow(now: Date, days: number): OfflineSyncWindow; // [今天-(days-1), 今天]
export function collapseOfflineDates(rows: OfflinePackageRow[]): OfflineDateUpdate[];
export async function syncOfflinePackages(
  window: OfflineSyncWindow,
  deps: OfflineSyncDeps,
  log?: (message: string) => void,
): Promise<OfflineSyncReport>;
```

   `syncOfflinePackages` 体内：`stale || !rangeComplete` → `log` warn 后**照常继续**（决策 8）；collapse 后空数组返回零报告不发 SQL；`fetched = rows + invalid`、`failed = invalid`、`matched = RETURNING 数`、`updated = matched`、`unmatched = 有效行 - matched`。
2. 改 `server/lib/competitorScheduler.ts`：`runScheduledCompetitorSync` / `startCompetitorScheduler` 加第二参数 `offlineDeps: OfflineSyncDeps`；`SchedulerOptions` 加 `runOffline?: typeof syncOfflinePackages`。体内首投与 offline 两个**独立** try/catch，先首投后 offline，任一失败只 log 不影响另一个。cron 表达式与 `"Asia/Shanghai"` 不动。
3. 改 `server/index.ts`：`competitorRepo` 就绪时传 `offlineDeps = { fetchOfflinePackages, repo: competitorRepo }`。

**不做**：改 `syncCompetitorDay` / `computeTargetDate`（决策 9：首投仍只查昨天）；脚本（BE-4）。

## 测试要求

- 新增 `tests/server/offlineSync.test.ts`（全依赖 `vi.fn`，照 competitorSync.test.ts 形态）：
  1. 窗口纯函数：`beijingToday(new Date("2026-11-23T15:59:59Z")) === "2026-11-23"`、`beijingToday(new Date("2026-11-23T16:00:00Z")) === "2026-11-24"`；`computeOfflineWindow` 得 `{start:"2026-11-20", end:"2026-11-22"}`（以 11-23 为今天）；`computeBackfillWindow(now, 30)` 得 `[今天-29, 今天]`；`days<1` 抛错。
  2. `collapseOfflineDates`：同 code 两条取较大 `offline_date`，输出保持首见 code 顺序。
  3. `syncOfflinePackages`：正常路径报告六字段符合 `fetched = matched + unmatched + failed`；`fetchOfflinePackages` reject 时向上抛（隔离在调度层）；`stale=true` 时 warn 被调用且仍调 repo；空 rows 不调 repo 且返回零报告。
- 扩 `tests/server/competitorScheduler.test.ts`：注入 `runOffline` 抛错时首投 `run` 仍被调用；`run` 抛错时 `runOffline` 仍被调用；两者都成功时 `runOffline` 收到 `computeOfflineWindow` 的窗口。

## 验收

1. `npm test` 全绿；`npx tsc --noEmit` 通过；各文件 ≤500 行。
2. `git diff` 中 `competitorSync.ts` 零改动。

## 风险

北京/UTC 临界（16:00Z）是窗口正确性的全部难点，测试 1 的两个断言必须落进代码。
