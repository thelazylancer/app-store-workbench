# QA-1 offline 同步全量回归与线上烟囱

- 依赖：BE-1、BE-2、BE-3、BE-4 全部完成
- 角色：api-tester
- 对应 `docs/tickets/offline-sync/DESIGN.md` §6、§7

## 范围

1. `npm test` 全绿、`npx tsc --noEmit` 通过、`tests/lineLimit.test.ts` 无新违规（所有新/改文件 ≤500 行）。
2. 首投行为回归红线：`tests/server/firstDeliverySource.test.ts`、`tests/server/competitorSync.test.ts`、`tests/server/competitorRepo.reads/writes.test.ts` 相对主分支零改动或仅追加 offline 用例，无既有用例删改。
3. 线上烟囱（连真实上游 + 本机 PG）：
   - `npm run sync:offline -- --days 30`：报告合理（对照现网实测基线：近 30 天约 382 条、约 284 条能按 code 命中——`matched+unmatched` 与此量级一致）；抽 3 个 matched 的 code 查库，`offline_date` 等于源值（北京口径）、`display_name`/`team`/`lookup_status` 未变。
   - 重复跑同一窗口：报告与首次一致（幂等覆盖，`fetched` 不变、无重复行副作用）。
   - `stale=true` 或 `range_complete=false` 出现时（可临时把窗口调到当天早上复现）：stderr 有 warn、exit 0、数据照常写入。
4. 调度烟囘：本地把 cron 临时改到近时刻（或直接调 `runScheduledCompetitorSync` 一次），确认日志先出首投报告后出 offline 报告，且人为断开 offline（改错 API key）时首投仍成功。
5. 检查 `git status`：无迁移文件、无前端/路由改动、`package.json` 仅多一行 script。

## 验收

上述各项全部通过后，在 `docs/tickets/offline-sync/README.md` 勾掉本票并附一次真实运行的报告 JSON。

## 风险

烟囱窗口调到「当天」可能触发 503 DATA_NOT_READY——这本身就是验证重试路径的机会，保留日志佐证即可。
