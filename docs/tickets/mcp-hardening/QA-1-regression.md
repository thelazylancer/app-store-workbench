# QA-1 MCP 加固契约回归与体积验收

- 依赖：BE-1、BE-2、BE-3 全部合入
- 角色：api-tester
- 对应 DESIGN.md §4.7（体积）、§7（兼容性）、§8（测试计划）、§10（验收标准）

## 范围

**做**：

1. 契约矩阵复核（`tests/server/mcpContract.test.ts` + 两个新测试文件全绿）：
   - 三个竞品明细工具 compact 默认/`compact=false` 双分支字段断言齐全；compact 输出守卫词零命中：`appStoreJson`、`screenshotLocalPaths`、`versionHistory`、`descriptionTruncated":false`。
   - `search_apps` 11 条超限（`isError` + 上游零调用）、恰 10 条合法。
   - 兜底四用例（500 体、headersSent 分支、日志哨兵、405 回归）。
2. HTTP 面零改动确认：`git diff --stat` 中 `server/routes/`、`shared/`、`src/` 零文件；现有 `competitorContract`、`httpContract`、`shelfContract`、`searchAppsApi.*` 全绿零改动。
3. 全量门禁：`npm test`、`npx tsc --noEmit`、`npm run build`；`tests/lineLimit.test.ts` 无新豁免，`mcpCompact.ts` ≤200、`mcp.ts` ≤350。
4. **体积实测**（固化 DESIGN §4.7 目标）：
   - fixture 侧：独立 QA 测试用 28 包、每包 5 条 IAP、真实键名 `appStoreJson`（description ≥2000 字符）的 fixture 走一次真实 `tools/call competitor_day`，断言 `content[0].text` 字节数 ≤32800（最坏情形）；另记录 0 IAP 真实日约 23KB 作为参考。
   - 线上旁证（部署后）：`curl -s http://127.0.0.1:7001/api/competitor/day/2026-11-23 | wc -c` 仍约 73KB，证明 HTTP 全量路径未被波及。
5. 真机走查：任一 MCP 客户端 `tools/list` 确认三个工具带 `compact` 参数、`search_apps` 描述含延迟提示；调用 `competitor_day`（有数据日）默认拿紧凑输出，再传 `compact: false` 拿全量。

**不做**：性能压测、鉴权测试、SSE；验证码日志风险（已知、客户端侧、明确不解决）。

## 验收

1. 上述 1–3 全绿；第 4 项实测数字记录进本文件勾选清单（执行时补写）。
2. 体积目标达成（28 包 × 5 IAP 最坏情形 ≤32KB；0 IAP 日约 23KB），降幅 ≥64%。

## 风险

体积阈值断言依赖 fixture 规模（28 包 × 真实键名）；fixture 若偷懒用小 `appStoreJson`，阈值形同虚设——必须按第 4 项的字数下限构造。
