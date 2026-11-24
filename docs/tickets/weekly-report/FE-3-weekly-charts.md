# FE-3 /weekly 图表区：版本与投放 + 单周结构 + 近 4 周趋势

- 依赖：FE-2
- 角色：frontend-developer
- 对应 DESIGN.md §5.1/§5.2/§5.4；REQUIREMENTS §4.4–§4.6

## 背景

三个 shelf 图表组件（`WeeklyBarChart`/`DistributionBoard`/`MetricsBoard`）硬耦合 `ShelfSelection` 下钻与团队筛选，周报只读，不复用组件本身；只复用图表原语与几何 CSS。

## 范围

**做**：

1. **提取共享纯函数**（唯一触碰 shelf 的一次）：`metricTicks` 与 `formatMetric` 从 `src/shelf/Metrics.tsx` 移到新文件 `src/lib/metricScale.ts`，Metrics.tsx 改 import；逻辑零改动。`tests/frontend/shelfMetrics.test.tsx` 必须原样全绿。
2. `src/weekly/MetricBars.tsx`（§4.4）：三指标各一行，横轴固定 `trends.weeks` 4 周；每团队一根只读柱（无 onClick、无 chips 筛选）；缺数据槽位画 `—` 不画 0；`投放→下架` 行的 point 追加 `（已下架 n/m）` 上下文（n=offlineCount，m=该周 resolvedPackages）；柱色 `teamClass`；负值柱同 shelf 的 `wx-metric-negative` 语义。
3. `src/weekly/StructureBars.tsx`（§4.5）：品类 / iOS / IAP / 隐私四条 100% 横条 + 版本数分布横条（1/2/3/4+/无记录 固定序）；每段显示包数与百分比（1 位小数），条头写清分母；iOS 段序用 `SHELF_IOS_BUCKET_ORDER`，`unknown` 永远最后；颜色沿用 shelf 蓝阶与 `wx-seg-*` 类。
4. `src/weekly/TrendBars.tsx`（§4.6）：4 根柱 = 每周 `resolvedPackages`，当前所选周最后一根；`dataSufficient=false` 的周画斜纹柱（`--color-track` 底 + repeating-linear-gradient，非琥珀）+ 柱位文案「数据不足」；柱顶标数值；无 hover/点击跳转。斜纹样式放 `src/weekly/styles/weekly-charts.css`（文件名以 `charts.css` 结尾，`styles.test.ts` 天然放行渐变），`weekly.css` 不写渐变。
5. `src/weekly/App.tsx` 按页面顺序（周头→摘要→团队卡→指标→结构→趋势→关注项→脚注）组装；`import "../shelf/styles/charts.css"` 与 `metrics.css` 获取 `wx-chart-*`/`wx-metric-*` 几何。复用 `WeekLabels` 前先把它形参从 `ShelfTrendWeek[]` 放宽为 `readonly { weekStart: string; weekEnd: string }[]`（纯类型改动）。指标图团队色列表用「本周 `teams` 顺序 + 仅在历史 points 出现的团队（locale 序）」拼接，保证跨周颜色稳定。
6. 可访问性：每个区块 `section + aria-labelledby`；图表区 `role="img"` 摘要 + `visually-hidden` 数据表；数值不只用颜色承载（斜纹柱有文字「数据不足」）；周切换按钮可读标签。

**不做**：任何下钻、团队筛选、明细弹窗。

## 验收

1. `tests/frontend/weeklyPage.test.tsx` 扩展全绿：
   - 指标三行渲染顺序与标题；缺数据槽 `—`；`投放→下架` 显示 `0（已下架 0/52）`。
   - 结构五条横条分母与百分比 1 位小数；`unknown` 段最后。
   - 趋势：`dataSufficient=false` 的周渲染斜纹柱与「数据不足」，不画 0 数值柱。
   - `shelfMetrics.test.tsx` 原样全绿（证明提取未改行为）。
2. 手机宽度：指标图容器横向滚动（`useScrollRegion` 同款 tabindex 逻辑）；页面无横向滚动。
3. `npx tsc --noEmit`、`npm run build`；新文件 ≤500、weekly.css 增量后仍 ≤300。

## 测试点提示

斜纹柱的 repeating-linear-gradient 放 `src/weekly/styles/weekly-charts.css`：`styles.test.ts` 只对文件名以 `charts.css`/`metrics.css` 结尾的文件放行渐变，`weekly-charts.css` 命中，无需改测试。
