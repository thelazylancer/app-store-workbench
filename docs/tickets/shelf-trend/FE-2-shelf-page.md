# FE-2 /shelf 页面：取数、团队筛选、核对明细表

- 依赖：FE-1
- 角色：frontend-developer
- 对应 DESIGN.md §5（前端模块）、§6（边界条件）；视觉规范 = `docs/design/shelf-trend.md`（ui-designer 产出）

## 背景

页面主体：时间窗固定（`from = addDays(todayUtc(), -90)`、`to = todayUtc()`，内存态，复用 `src/lib/reportDate.ts` 助手），团队走 URL `?team=`，维度切换本票先不画图（FE-3），明细表与全部状态本票完成。

## 范围

**做**（`src/shelf/` 下，行数目标见 DESIGN.md §5）：

1. `filters.ts`：`useShelfFilters` —— `?team=` 唯一读写口（模式照抄 `useQueryFilters`：`readShelfFilters`、`applyShelfFilters`、`update({team})` replace、`clear`）。非法/超长值直接忽略（后端也会 400，前端不透传）。
2. `App.tsx`：并行取 `getShelfTrend` + `getShelfPackages`；团队 `Selector`（选项 = `trend.teams`，默认「全部」）；维度 `SegmentedControl`（类目/最低 iOS/内购，内存态，切换只重发 trend）；`useDocumentTitle("竞品趋势 · App搜索工作台")`。加载 `Skeleton`、错误 `Banner`+重试、空态 `EmptyState`（区分「区间内无数据」与「该团队无数据」）。数据持有在本票以周列表 + totals 简表呈现（FE-3 替换为图表）。
3. `PackageTable.tsx`：平铺 table，标题行「核对明细（临时）」并注明后续删除；列：App 名称（未解析显示「未知」，不回退源展示名）、Bundle ID、团队、类目（null→未知）、最低 iOS（显示原始值）、当前版本、内购（有/无/未知）、上架日期、下架日期、入库日期、入库周（`weekStart`）。**无投放日期列**；`total > limit` 时表尾显示「共 N 条，显示前 M 条」。
4. `states.tsx`：本地加载/错误/空态包装（不 import `src/competitor/states.tsx`，跨 feature 禁依赖）。
5. `styles/shelf.css`（≤300 行）：`wx-` 类名、零阴影零渐变、颜色只用 wxTheme token，未知用中性色。
6. 测试 `tests/frontend/shelfPage.test.tsx`：加载/错误/空态、team 变更同时作用于（当前呈现的）周列表与明细表、未解析行渲染 Bundle ID + 未知、刷新后 `?team=` 还原、清除回「全部」。

**不做**：图表与 buckets 纯函数（FE-3）；鉴权、导出、环比。

## 验收

1. `npm test` 全绿；dev 打开 `/shelf?team=某团队`：筛选状态还原，两处数据与明细表同过滤。
2. 明细表可人工对照 DB：`SELECT count(*) FROM competitor_packages WHERE target_date BETWEEN ...` 与页面 total 一致；未解析包行无名称无投放日期。
3. `npx tsc --noEmit`、`npm run build` 通过；各文件 ≤500（css ≤300）。

## 风险

团队 Selector 选项来自 trend 响应，取数失败时下拉只剩「全部」——错误 Banner 必须覆盖此场景；`packages` 与 `trend` 并行请求其一失败时整页进错误态（v1 不做部分成功，避免两处状态机）。
