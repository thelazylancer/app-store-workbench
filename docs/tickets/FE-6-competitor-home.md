# FE-6 / 竞品日报 React 化（时间线十四条契约）

- 依赖：FE-2
- 角色：frontend-developer
- 对应 ARCH §2（路由与 query）、§8.1（十四条）；实现规范 = 现 `src/competitor/main.ts`（970 行）+ `src/competitor/renderSummary.ts`（258 行）

## 背景

竞品日报迁到 `/`。数据：`getCompetitorDays(HISTORY_START, 昨天)` 装载窗口，`date_kind` 固定 `first_ad`。筛选状态走 URL query（`?date=&team=&category=&status=`，`useQueryFilters` 为唯一读写口）。`index.html` 挂载 `<App/>`。

## 范围

**做**（`src/competitor/` 下，各 ≤ 目标行数）：

| 文件 | 内容 | 来源（现 main.ts:函数） |
| --- | --- | --- |
| `main.tsx` (~30) | `index.html` 挂载 | 头部 |
| `App.tsx` (~180) | 窗口装载与重取、列表态 | `fetchWindow` `load` `dateIsReady` |
| `selectors.ts` (~180) | 纯函数：`inScope` `inCategory` `matches` `scopeDays` `dedupedPackages` `groupsFrom` `totals` `uniqueSorted` `briefFrom` `storeName`（`appStoreJson.name` → `trackName` → `displayName`）`categoryOf` `visibleOnDay` | main.ts 中部，原样平移 |
| `Timeline.tsx` (~150) | 按日时间线：竖轨与日块用 Astryx `Stack`/`HStack`/`Grid`/`Section`/`Divider` 组合；日期标记 Barlow Condensed；天数统计行 | `renderTimeline` `renderListContent` |
| `TeamBlock.tsx` (~220) | 团队块：团队名一行字（名称+N 包，非按钮）+ 命中行 + 异常行（留在本块内） | `renderSummary.ts` `createTeamBlock`（整文件并入后删） |
| `Controls.tsx` (~200) | 团队 `TabList`（默认「全部」）、类目 `Selector`、日期 `DateInput`、状态 `SegmentedControl`、统计条、清除筛选（清空含日期） | `renderTeamTabs` `fillSelect` `fillDateSelect` `syncControls` |
| `states.tsx` (~80) | `Skeleton`/`Banner`/`EmptyState` | `renderSkeleton` `renderError` `createEmptyCard` |
| `styles/*.css`（2–3 个，各 ≤300） | 时间线竖轨、日块、团队块、行排版 | `competitor.css` 对应区块 |

**删**：`src/competitor/main.ts`、`src/competitor/renderSummary.ts`；`tests/frontend/competitorPage.test.ts`（757 行）中列表侧断言迁移为 `tests/frontend/competitorHome.test.ts`（≤500）。

**不做**：详情（FE-7）；`renderPackageDetail.ts` 暂留待 FE-7 删；十四条规定外的版面。

## 验收

1. `npm test` 全绿；dev 打开 `/`：
   - 十四条契约逐条勾验（ARCH §8.1）：只有时间线、日期新→旧、无包日不出现、日期标记不可折叠、日内按团队分块、团队名一行字非按钮、异常包留团队块、团队 Tab 默认「全部」、类目/状态/日期只做筛选、日期为 `DateInput`（无系统日期框、无「全部日期」select）、名称取 `appStoreJson.name`、`date_kind=first_ad`、无柱状日期轴、无上架日期切换。
   - query 同步：改筛选 URL 变化、刷新后状态还原、清除筛选回到「全部」。
2. `git grep -lE "renderSummary|competitor/main.ts" src/ tests/` 零命中。
3. 行数豁免清单划掉 `src/competitor/main.ts`、`tests/frontend/competitorPage.test.ts`；新文件全 ≤500 行。

## 风险

「日期只做筛选」与 `DateInput` 的组合：选中某日后时间线仍完整渲染（只是筛掉其它日的包）——对拍旧实现 `inScope`；「无包日期不出现」在筛选后的计数文案与旧版一致。
