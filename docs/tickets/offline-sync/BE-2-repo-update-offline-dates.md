# BE-2 仓储新增 updateOfflineDates（只写 offline_date）

- 依赖：无（与 BE-1 并行）
- 角色：backend-developer
- 对应 `docs/tickets/offline-sync/DESIGN.md` §4.4

## 背景

offline 同步的写入面极窄：只更新已存在的 `competitor_packages` 行的 `offline_date` 一列。`competitor_packages.offline_date DATE` 已在 `server/migrations/001-competitor.sql` L23，**不加迁移**。

## 范围

**做**：
1. `server/lib/competitorRepo/writes.ts`：新增类型与方法，挂进 `CompetitorWriteRepo`：

```ts
export type OfflineDateUpdate = { packageCode: string; offlineDate: string };
updateOfflineDates(entries: OfflineDateUpdate[]): Promise<string[]>;
```

SQL 一条批量语句：

```sql
UPDATE competitor_packages AS cp
SET offline_date = u.offline_date
FROM UNNEST($1::text[], $2::date[]) AS u(package_code, offline_date)
WHERE cp.package_code = u.package_code
RETURNING cp.package_code
```

   行为契约：空数组直接返回 `[]` 不发 SQL；不存在即天然忽略；不碰其他任何列；无条件覆盖（同 code 多条的取大由 BE-3 的纯函数保证，SQL 不做 GREATEST）。
2. `server/lib/competitorRepo.ts`：re-export `OfflineDateUpdate`（`CountryHitRow` 先例）。

**不做**：写 `competitor_snapshots`；改 `upsertPackage`；改其他方法。

## 测试要求

`tests/server/competitorRepo.writes.test.ts` 扩用例（真连本机 PG，缺 `DATABASE_URL` skip，沿用 `competitorRepoTestUtils.ts`）：

1. 预置两个包 + 传入三条 update（含一个库里不存在的 code）：断言两包 `offline_date` 已写、未知 code 被忽略、RETURNING 长度为 2。
2. 断言两包的 `display_name`/`team`/`lookup_status`/`fetched_at` 未变。
3. 传入空数组：mock 或断言不产生查询（最简：直接断言返回 `[]` 且不抛）。
4. 重复 code 传入两条不同日期：断言后写覆盖前写（与 BE-3 的 collapse 契约对齐——SQL 就是无条件覆盖）。

## 验收

1. `npm test` 全绿（无 DATABASE_URL 环境 skip 合规）。
2. `git diff` 无迁移文件、无 `competitor_snapshots` 相关改动。
3. `npx tsc --noEmit` 通过。

## 风险

`UNNEST` 参数顺序（text[] 在前、date[] 在后）与 SQL 列序必须一致，测试 1 兜底。
