# BE-4 手动回填脚本 scripts/offline-sync.ts

- 依赖：BE-3（`computeBackfillWindow` / `syncOfflinePackages`）
- 角色：backend-developer
- 对应 `docs/tickets/offline-sync/DESIGN.md` §4.6、决策 3

## 背景

冷启动或发现历史缺口时人工回填。只跑 offline，不跑首投；不新增 HTTP 接口、不改前端。

## 范围

**做**：
1. 新增 `scripts/offline-sync.ts`，骨架照抄 `scripts/competitor-sync.ts`：`process.loadEnvFile()`（可失败）→ `DATABASE_URL` 守卫 → `createPool` + `runMigrations` → 组装 `OfflineSyncDeps = { fetchOfflinePackages, repo: createCompetitorRepo(pool) }` → `console.log(JSON.stringify(report, null, 2))` → `finally pool.end()`。
2. 参数：`--days N`（复用 competitor-sync.ts 的 `argValue` 形态；默认 30；非正整数抛错）。窗口 = `computeBackfillWindow(new Date(), N)`，即北京 `[今天-(N-1), 今天]`（决策 3：`--days 30` → `[今天-29, 今天]`）。
3. `package.json` scripts 加 `"sync:offline": "tsx scripts/offline-sync.ts"`。

**不做**：`--team`/`--date` 等额外参数；批量表记录；独立测试文件（脚本只是装配，逻辑都在 BE-3 已测模块；与 `scripts/competitor-sync.ts` 同待遇）。

## 验收

1. `npx tsc --noEmit` 通过。
2. 本地连测试库跑 `npm run sync:offline -- --days 3`：stdout 为一份合法 JSON 报告，六字段齐全且 `fetched = matched + unmatched + failed`；进程退出码 0、连接已关。
3. `npm run sync:offline`（无参）不抛错，等效 `--days 30`。
4. `--days 0` 抛错、退出码非 0。

## 风险

脚本 `catch` 打印错误消息 + `process.exitCode = 1`，别吞掉非零退出码——回填通常由人盯着跑。
