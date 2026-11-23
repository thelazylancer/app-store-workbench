# offline 下架包同步：票据索引

设计文档：`DESIGN.md`（决策已定夺，不可推翻）。产品需求一句话：每日 09:10 竞品同步追加一次 offline 下架包查询，把北京口径的 `offline_date` 回写到已存在的 `competitor_packages` 行；另提供手动回填脚本。

## 实施顺序

| 票 | 标题 | 依赖 |
| --- | --- | --- |
| BE-1 | 抽取共享源抓取核心 + 新增 offline 源适配器（`sourceApi.ts` / `offlineSource.ts`） | 无 |
| BE-2 | 仓储新增 `updateOfflineDates`（只写 `offline_date`，UNNEST 批量） | 无（与 BE-1 并行） |
| BE-3 | `offlineSync.ts` 编排深模块 + 调度接入（首投/offline 错误隔离） | BE-1、BE-2 |
| BE-4 | 手动回填脚本 `scripts/offline-sync.ts` + `npm run sync:offline` | BE-3 |
| QA-1 | 全量回归 + 线上烟囱 | BE-1..BE-4 | 通过（2026-11-23）：`tsc --noEmit` 0 错；`npm test` 369 passed（首轮 `ipaDownloadApi` 并行负载 flake，单跑 3/3 稳定，次轮全绿）；真实上游 `--days 3` exit 0、`--days 30` fetched=382/matched=3/unmatched=379/failed=0，重复跑报告一致，预置 3 个真实 code 的 `offline_date` 与源值一致且其它列/快照未变，数据已清理 |

关键红线：`tests/server/firstDeliverySource.test.ts` 全程零改动；首投同步（`competitorSync.ts`）零改动；无迁移、无 HTTP 路由、无前端、无新依赖。
