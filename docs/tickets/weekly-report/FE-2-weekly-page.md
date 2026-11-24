# FE-2 /weekly 页面主体：周头 + 摘要 + 团队卡 + 关注项 + 脚注

- 依赖：FE-1
- 角色：frontend-developer
- 对应 DESIGN.md §5.1/§5.4/§6；REQUIREMENTS §4.1–§4.3、§4.7、§4.8

## 范围

**做**：

1. `src/weekly/states.tsx`：`WeeklyLoading` / `WeeklyError` / `WeeklyEmpty` 薄壳（Astryx Skeleton/Button/EmptyState，`data-role="weekly-*"`），文案按 DESIGN §6。
2. `src/weekly/App.tsx` 完整状态机（替换 FE-1 占位）：
   - **周头**：标题 + `2026-11-16 ~ 2026-11-22`；上一周/下一周按钮，下一周不可超过响应顶层的 `latestCompleteWeek`（服务端按 Asia/Shanghai 给值，前端不自行按 UTC 推算；`weekStart >= latestCompleteWeek` 即禁用）；显式访问未来周时空态 + 按钮禁用；`?week=` replace。
   - **摘要**：固定模板 `2026-11-16 至 11-22：已解析新增 52 个包，来自 6 个团队；环比 +2（+4.0%）。`；`previousResolvedPackages=0` → `环比新增 52 个包`；数字四舍五入整数、百分比 1 位小数；不含未解析数。
   - **值得关注**：渲染 `highlights`，最多 2 条；空 → 「本周无明显变化」。
   - **脚注**：`本周共入库 {ingested} 个包，其中 {unresolved} 个未解析，未计入统计；数据截至 {dataThrough ?? "—"}，批次状态 {batchStatus ?? "—"}。`
   - 空周（`summary.resolvedPackages = 0`）：保留周头/切换/脚注，数据区 `WeeklyEmpty`「该周没有已解析入库包」。
3. `src/weekly/TeamCards.tsx`：卡片网格，排序直接用响应 `teams`；每卡渲染 REQUIREMENTS §4.3 全字段：排名+团队名、已解析入库 N、环比（`+4（+100.0%）` / 负 / `0`；`changePct=null` 且 change>0 → 「新增 N」）、占比 `N / 52`、版本数分布（key 序 1/2/3/4+，无 0 桶时省略）、品类 Top3、IAP `有 6 / 无 0`、iOS 主流版本、隐私主类型。团队已解析包 <3 时比例类字段显示 `—`。
4. `src/weekly/styles/weekly.css`：页面布局 + 团队卡网格；手机宽度单列；颜色 token 全部沿用 `docs/design/shelf-trend.md` §3.1 表，无新色板、无琥珀、无阴影渐变。

**不做**：指标图/趋势柱/结构横条（FE-3）；图表原语改动。

## 验收

1. `tests/frontend/weeklyPage.test.tsx` 全绿（fixture 抄 `tests/frontend/shelfFixtures.ts` 模式构造 WeeklyReportResponse）：
   - 摘要三态（正常环比 / 上周 0 / change=0）。
   - 周切换：点上一周 → `?week=` 更新并重新取数；到达最近完整周后「下一周」禁用。
   - 空周空态：不渲染 `TeamCards`，脚注仍显示。
   - 团队卡：<3 包的卡片比例字段为 `—`；`changePct=null` 时环比文案「新增」。
   - 503/网络错误渲染 `weekly-error` + 重试。
2. 手机宽度（375px 视口）卡片单列、无页面级横向滚动。
3. `npx tsc --noEmit`；新文件 ≤500、weekly.css ≤300 行；`tests/frontend/styles.test.ts` 守卫全绿（零阴影零渐变、琥珀仅异常）。

## 测试点提示

切换周时先清空旧数据再画（不闪烁旧周）：断言 loading 期间不残留上个周的团队名。
