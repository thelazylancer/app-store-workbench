# QA-1 weekly 契约回归与真库走查

- 依赖：BE-1、BE-2、FE-1…FE-3 全部合入
- 角色：api-tester
- 对应 REQUIREMENTS §7（验收基准）、DESIGN.md §6/§7

## 范围

**做**：

1. **真库走查（基准周 2026-11-16，`GET /api/competitor/weekly-report?week=2026-11-16`）**，逐项断言 REQUIREMENTS §7.1：
   - `summary.resolvedPackages=52`、`ingestedPackages=112`、`unresolvedPackages=60`、`teamCount=6`。
   - 顶层 `latestCompleteWeek` 按 Asia/Shanghai 给出最近完整周周一；请求基准周与其它周时该值不变。
   - 团队顺序：LivChat 14、巨风 13、大容 8、灵蜂 8、蓝麟 6、驰猿 3。
   - 版本数整体分布：1=10、2=36、3=6、4+=0；IAP 有 7 / 无 45；品类 Top2 Utilities 14、Lifestyle 10。
   - `投放→下架` 本周 value=0 且 offlineCount=0。
   - 4 周趋势：10-26 dataSufficient=false、11-02=18、11-09=50、11-16=52。
   - highlights：team_change 巨风 18→13（-5，-27.8%）；category_change Productivity 20.0%→9.6%（-10.4pp）。<br>注：2026-11-24 真库回填后，上周巨风为 18（原需求示例的“大容 +4”基于旧数据）；规则不变，仍取绝对变化最大者。
   - 脚注含 112、60、数据截至日期与批次状态。
2. **行为走查（部署 7001 后浏览器）**：导航顺序与高亮互斥；周切换边界（下一周在 `latestCompleteWeek` 处禁用且显示「已是最新完整周」）；`/weekly` 直开刷新不 404；页面无包明细/下架列表/「新团队」文案；未解析包不出现在任何团队卡、结构条、趋势、关注项。
3. **门禁**：`npm test` 全绿、`npx tsc --noEmit`、`npm run build`；`tests/lineLimit.test.ts` 无新增豁免。
4. 偏差记录：数字与 §7.1 不符时，先判 SQL/折叠 bug（回 BE 线），再判基准周数据漂移（包状态变化，属 REQUIREMENTS §8.7 已接受项，记录说明即可）。

## 验收

1. 走查清单逐项勾选并留证（curl 响应 + 截图存票据评论，不放敏感数据）。
2. 发现的缺陷全部修复或挂新票据后本票方可关闭。
