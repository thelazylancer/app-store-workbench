# BE-1 抽取共享源抓取核心 + 新增 offline 源适配器

- 依赖：无
- 角色：backend-developer
- 对应 `docs/tickets/offline-sync/DESIGN.md` §4.1、§4.2、§5

## 背景

`server/lib/firstDeliverySource.ts` 内嵌了 endpoint/env 解析、X-API-Key、30s 超时、5xx 重试、`unwrap`、翻页终止判断。offline 下架包接口（`/api/v1/offline-packages`，事实见 DESIGN §2）需要完全同一套行为，不允许复制第二套抓取逻辑。

## 范围

**做**：
1. 新增 `server/lib/sourceApi.ts`（internal seam，只被两个源适配器 import）：`SourceHttpError`、`sourceEndpointUrl(path)`、`fetchSourcePage(path, params, page, syncId)`、`fetchSourceAllPages(path, params)`、值胁迫助手（`text`/`pick`/`dateOnly`/`timestamp`/`boolean`）。行为 = 现 firstDeliverySource L21–139 的逐条平移：`page_size=200`、30s 超时、3 次重试退避 `1s, 2s`、4xx 即抛、缺 `FIRST_DELIVERY_API_KEY` 抛错。
2. 重构 `server/lib/firstDeliverySource.ts` 改用 sourceApi；保留 `SourcePackageRow`/`SourceBatch`/首投 `normalizeRow`（含 ios 过滤与去重）/`fetchFirstDeliveryPackages`；`FirstDeliveryHttpError` 变为 `SourceHttpError` 的 re-export 别名。
3. 新增 `server/lib/offlineSource.ts`：

```ts
export type OfflinePackageRow = { packageCode: string; offlineDate: string };
export type OfflineSourceBatch = {
  syncId: string; rangeComplete: boolean; stale: boolean;
  rows: OfflinePackageRow[]; invalid: number;
};
export async function fetchOfflinePackages(startDay: string, endDay: string): Promise<OfflineSourceBatch>;
```

   行归一化只要求 `package_code` 非空 + `offline_date` 匹配 `YYYY-MM-DD`；**不得**复用首投的 `normalizeRow`，**不得**做任何 display_name/team 过滤（DESIGN §4.1）。`start_day=end_day=startDay` 之外 query 只带 `page`/`page_size`/`sync_id`，**不带 team**。

**不做**：改 `fetchFirstDeliveryPackages` 的行为；改任何调用方 import；动 offlineSync/repo（BE-2/BE-3 的事）。

## 验收

1. `tests/server/firstDeliverySource.test.ts` **零改动**全绿（含 401 用例经 `FirstDeliveryHttpError` 别名仍过）。
2. 新增 `tests/server/offlineSource.test.ts`（spy `globalThis.fetch`，照 firstDeliverySource.test.ts 形态）覆盖：多页翻页且 `sync_id` 从首响应沿用；`page_size=200`；401 抛 `SourceHttpError`；503 重试后成功；`package_code` 为 null 的行计入 `invalid` 且不出现在 rows；`offline_date` 非 `YYYY-MM-DD` 的行同上；`meta.stale=true`/`range_complete=false` 原样透传；display_name 含 `*` 的行正常保留；请求头含 `X-API-Key` 与 `Accept: application/json`；query 无 `team`。
3. `npx tsc --noEmit` 通过；各文件 ≤500 行。

## 风险

首投测试零改动是本票的行为不变证明，属验收红线；若测试被迫改动，说明平移走样，回炉。
