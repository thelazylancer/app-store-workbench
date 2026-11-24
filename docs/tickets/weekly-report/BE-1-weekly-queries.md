# BE-1 weeklyReport 查询模块（类型 + 周纯函数 + SQL 聚合）

- 依赖：无
- 角色：backend-developer
- 对应 DESIGN.md §2–§4

## 背景

`/weekly` 需要与 competitorRepo（内部契约冻结）、shelfQueries（公开趋势命名空间、口径是 `target_date` + 全量包）都隔离的第三个查询 seam。口径：resolved-only + `first_ad_date` + ISO 周规范化 + 近 4 周窗口。

## 范围

**做**：

1. 新建 `shared/weeklyReportTypes.ts`：DESIGN.md §3.2 的全部类型（WeeklyBucket / WeeklyTeam / WeeklyTrendWeek / WeeklyMetricPoint / WeeklyMetricSeries / WeeklyHighlight / WeeklyReportResponse），types only，注释写明 share 语义、排序契约与 `投放→下架` 的 0 例外。`WeeklyReportResponse` 顶层包含 `latestCompleteWeek`（Asia/Shanghai 的最近完整 ISO 周周一，与请求周无关），由 `getWeeklyReport` 一并填充。
2. 新建 `server/lib/weeklyReport.ts`，导出：
   - `WeeklyReportRepo` 接口：`latestCompleteDataWeek(today: string): Promise<string | null>`、`getWeeklyReport(weekStart: string): Promise<WeeklyReportResponse>`；工厂 `createWeeklyReport(pool: Pool)`。
   - 纯函数 `isoWeekStart` / `addWeeks`（DESIGN §4.1，UTC 字符串运算）与 `buildHighlights`（§4.5）。
   - 四条 SQL 与 TS 折叠（DESIGN §4.3/§4.4）：WEEK_MAIN_SQL（4 周窗口聚合）、VERSION_COUNTS_SQL（本周 0/1/2/3/4+ 两层分布）、METRICS_SQL（4 周 hit-only，含 offline_count）、BATCH_SQL（最近一条批次）。`Promise.all` 并行。
3. 排序与空值规则逐条实现（REQUIREMENTS §5.3 + DESIGN §4.4 表）：metrics points 缺数据不生成；`投放→下架` offline_count=0 时生成 value=0；`dataSufficient = resolvedPackages > 0`；`changePct` 上周为 0 时为 null。

**不做**：路由、`app.ts` 注入（BE-2）；任何前端改动。

## 验收

1. `tests/server/weeklyReport.test.ts` 全绿：
   - 纯函数直测：`isoWeekStart`（2026-11-22 周日 → 2026-11-16；2026-11-23 周一起新周；跨年 2024-12-30）；`buildHighlights`（Δ=3 边界含入、Δ=2 排除、负数 direction=down、品类 Δpp=5 边界、双不满足 → []、排序团队在前）。
   - 真库用例（`DATABASE_URL` 缺失 skip，模式抄 `tests/server/competitorRepo.reads.test.ts`）：resolved-only（`bundle_not_found/offline/pending` 包只进 ingested 不进任何指标）、版本分桶（0/1/2/3/4+ 与无记录包）、三指标公式（含 gap>30 丢弃、offline_count=0 → value 0、无版本记录 → 无 point）、4 周趋势含补齐的空周（dataSufficient=false）、空周返回完整结构。
2. 响应形状逐字段符合 `shared/weeklyReportTypes.ts`；空周（resolved=0）时 `teams=[]`、`highlights=[]`、`trends.weeks` 仍为 4 项。
3. `npx tsc --noEmit` 通过；两个新文件 ≤500 行。

## 测试点提示

fixture 必须含：非数组 `iapItems` 守卫用例、`first_ad_date` 落周日归上周的包、上周 0 团队（changePct=null）、品类 `null` 的 hit 包进 unknown 桶。
