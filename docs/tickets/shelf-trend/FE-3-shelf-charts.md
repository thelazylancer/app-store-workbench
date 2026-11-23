# FE-3 /shelf 图表：周总量柱 + 维度数量堆叠柱

- 依赖：FE-2
- 角色：frontend-developer
- 对应 DESIGN.md §5（图表数据流）、§6（边界条件）；视觉规范 = `docs/design/shelf-trend.md`

## 背景

不引图表库，CSS/SVG 手绘。两类图：每周总量柱（柱高 = 该周全部入库包数）与每周分布堆叠柱（维度切换类目/最低 iOS/内购，**数量堆叠不是百分比**）。未知段始终存在且用中性色（当前 17/93 未解析）。

## 范围

**做**：

1. `src/shelf/buckets.ts`（纯函数）：`iosBucket(minimumOsVersion)`；`iosBucketLabel`（`lte14→"≤14"`、`26plus→"26+"`、未知→「未知」，顺序用 `SHELF_IOS_BUCKET_ORDER`）；`categoryLabel`（中文映射表 + 缺映射回退英文原值）；`foldTopCategories(totalsGroups, topN=6)` → 段列表 `[{key,label,count}]`：按 totals 降序取 Top 6，其余合并为「其他」，`unknown` 独立成段排末位。
2. `src/shelf/Charts.tsx`：
   - `WeeklyBarChart`：横轴周标签 `YYYY-MM-DD ~ YYYY-MM-DD`（`weekStart ~ weekEnd`），柱高按 `packageCount` 线性比例，柱顶/旁有数值标签；只渲染有数据周，不补零。
   - `StackedBarChart`：同横轴，柱段按折叠后的段顺序堆叠（数量绝对值），图例含每段名称与区间合计数；iOS/内购维度按固定键序，类目按 Top6+其他+未知。
   - 可访问性：每根柱 `aria-label`（如「2026-11-16 ~ 2026-11-22 周，42 包」），图例可读，颜色对比 ≥4.5:1，未知段中性灰。
3. `App.tsx` 接入：替换 FE-2 的临时周列表为两张图；维度切换（`SegmentedControl`）重发 trend 并切换堆叠维度，packages 与明细表不动。
4. 样式入 `src/shelf/styles/shelf.css`（仍 ≤300 行；不够则拆 `charts.css` ≤300）。
5. 测试 `tests/frontend/shelfBuckets.test.ts`：`26.2→26plus`、`16.0→16`、乱码→未知；Top6+其他折叠的边界（恰好 6 个类目、全未知、空 groups）；中文映射缺失回退英文。`tests/frontend/shelfPage.test.tsx` 追加：堆叠段数值之和 = 柱总量（数量非百分比）、未知段存在、周标签格式。

**不做**：下架趋势、环比、tooltip、动画（gsap 不接入本页）。

## 验收

1. `npm test` 全绿；dev 打开 `/shelf`：总量柱与分布柱数值与 FE-2 临时表一致（对拍同一 trend 数据）；三维度切换各段计数正确。
2. 堆叠是数量：某段 count 增大时该段视觉高度同比增大，总和恒等于该周 packageCount。
3. 键盘 Tab 可达图例与切换控件；`prefers-reduced-motion` 下无动效（本页无动效即满足）。
4. `npx tsc --noEmit`、`npm run build` 通过；文件行数达标。

## 风险

初期仅约 2 个有数据周，横轴过短——布局按 1～14 周自适应，柱宽 `min()` 约束，不做滚动假象；「本周未完整」不标注是刻意决策（BRIEF），图表不添加任何角标。
