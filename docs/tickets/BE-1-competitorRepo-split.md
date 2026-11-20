# BE-1 拆分 server/lib/competitorRepo.ts（行为不变）

- 依赖：无
- 角色：backend-developer
- 对应 ARCH §1、§4（「门面不动、实现内移」）

## 背景

`server/lib/competitorRepo.ts`（688 行）超 500 行上限，是竞品读写的唯一 SQL seam。调用方：`server/lib/competitorApi.ts`、`server/lib/competitorSync.ts`、`server/app.ts`、`tests/server/competitorRepo.test.ts` 等。门面接口（`CompetitorWriteRepo`、`CompetitorQueryRepo`、`createCompetitorRepo`）不变，调用方 import 路径不变。

## 范围

**做**：实现体移入 `server/lib/competitorRepo/`，门面只留类型 + 工厂。

**不做**：改任何 SQL、字段映射、错误处理；改任何调用方；拆测试（BE-4 的事）。

## 实现指引

新目录三文件（internal seam，只被门面 import）：

1. `rowMap.ts`（纯函数）：`text` `jsonObject` `appleIdFrom` `groupKeyFor` `shiftDay` `toPackageBase` `batchFromRow` `releaseRange` `packageBrief` `withAssets`（现 L52–228 私有函数，原样平移含注释）。
2. `queries.ts`：读侧 `assetsByPackage` 与 `listDays` `getDay` `getPackage` `getPackageHistory` `getSummary` `getBatch` 的 SQL 体。
3. `writes.ts`：`upsertBatch` `upsertPackage` `upsertCountryHits` `upsertAssets` `upsertVersions` 的 SQL 体。

`competitorRepo.ts` 保留导出类型 + `createCompetitorRepo(pool)`（组合 queries/writes，返回接口不变）。

## 验收

1. `npm test` 全绿，测试文件零改动。
2. `git diff` 仅「移动 + import 调整」，无逻辑行变化。
3. 各文件 ≤500 行；`tests/lineLimit.test.ts` 豁免清单划掉 `server/lib/competitorRepo.ts`。
4. 本地起服务后 `curl /api/competitor/days`、`/api/competitor/day/<近一天>`、`/api/competitor/package/<code>` 响应与拆分前一致。

## 风险

`getSummary` 分组口径（`groupKeyFor`/`releaseRange`）最易被「顺手优化」——禁止改写；`competitorRepo.test.ts` 的 describeDb 用例兜底。
