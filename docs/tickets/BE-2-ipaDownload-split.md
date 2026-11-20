# BE-2 拆分 server/lib/ipaDownload.ts（行为不变）

- 依赖：无（建议在 BE-5 前合入，Fastify 迁移时该文件已小于 500 行）
- 角色：backend-developer
- 对应 ARCH §1、§4

## 背景

`server/lib/ipaDownload.ts`（730 行）超上限。调用方：`server/app.ts` 与 `tests/server/ipaDownload.test.ts`、`tests/server/ipaDownloadApi.test.ts`，import 的是 `createIpaDownloadManager`、`parseOwnedAppsOutput` 与 `DownloadRunner` / `AuthRefresher` / `OwnershipResolver` / `IpaDownloadManager` 等类型。门面把这些再导出即可，调用方零改动。

## 范围

**做**：实现体移入 `server/lib/ipaDownload/`。

**不做**：改 runner/authRefresher/ownership 解析逻辑、任务状态机、持久化格式、清理规则；改任何调用方。

## 实现指引

1. `process.ts`：`proxyEnv` `runCommand` `createDefaultRunner` `createDefaultAuthRefresher` `createDefaultOwnershipResolver` `isTransientStoreFailure` `parseProgress` `classifyOutput` `errorMessage` `fileSize`（子进程与命令行解析）。
2. `jobStore.ts`：jobs Map / queue / controllers 的增删查、`pruneJobs`、`.jobs.json` 持久化与 `cleanupExpired`。
3. `manager.ts`：`createIpaDownloadManager`（状态机编排：createJob / submitAuthCode / cancelJob / getFilePath）。
4. `server/lib/ipaDownload.ts` 变门面：`export type {CommandResult, DownloadRunner, AuthRefresher, OwnershipResolver, IpaDownloadManager, IpaDownloadManagerOptions}` + `export {createIpaDownloadManager, parseOwnedAppsOutput}`。

## 验收

1. `npm test` 全绿（`ipaDownload.test.ts` 435 行零改动）。
2. `git diff` 仅「移动 + import + 再导出」。
3. 各文件 ≤500 行；豁免清单划掉 `server/lib/ipaDownload.ts`。
4. 冒烟：`POST /api/ipa-download` 建任务 → `GET /api/ipa-download/:id` 轮询 → 状态与文案与拆分前一致。

## 风险

状态机时序（`awaiting_auth_code` → `submitAuthCode` 的 409 边界）不许动；`tests/server/ipaDownloadApi.test.ts` 是行为兜底。
