# FE-3 /search 搜索页 React 化

- 依赖：FE-2
- 角色：frontend-developer
- 对应 ARCH §2、§5、§8.2；实现规范 = 现 `src/main.ts`（570 行）与 `src/lib/renderResults.ts`（1425 行）的现行为

## 背景

搜索页迁到 `/search`。本票交付：壳内整页可用（composer、筛选、结果队列、inspector 基础信息、空态/错误态），截图灯箱、版本历史、IAP、候选对比留给 FE-4，IPA 控件留给 FE-5。`search.html` 挂载 `<App/>`（迁移期入口，FE-8 后移除）。

## 范围

**做**（新文件均在 `src/search/`，全部 ≤ 目标行数）：

| 文件 | 内容 | 来源（现文件:函数） |
| --- | --- | --- |
| `main.tsx` (~30) | `search.html` 挂载 `<App/>` | `src/main.ts` 头部 |
| `App.tsx` (~200) | 页面状态：queries、selectedCountry、filters、选中行、搜索触发与防抖语义同现状 | `createQueryRow` `syncQueryRows` `updateSummary` `updateResultsView` |
| `Composer.tsx` (~180) | 多行 composer：行增删、名称/BundleId 输入（`TextInput`）、国家 `Selector`、搜索 `Button` | `src/main.ts` L30–170 |
| `FilterBar.tsx` (~120) | 状态 `SegmentedControl`（含「命中 4.99/9.99」仅 US 启用规则）、清除筛选 | `createFilterBar` `bindFilterEvents` `syncFilterUi` |
| `ResultsQueue.tsx` (~150) | 结果队列行：状态 `Badge`（hit/miss/unresolved…同现 status 集合）、缩略图、单行摘要 | `renderResults` 队列段 |
| `Inspector.tsx` (~150) | 选中行详情：`Badge`、identifier（Bundle ID/Apple ID/商店链接）、描述块 | `renderResults` inspector 段（基础部分） |
| `states.tsx` (~80) | `EmptyState`（未搜/被筛空两文案）/ `Banner` 错误 / `Skeleton` | `createEmptyState` |
| `styles/*.css`（2–3 个，各 ≤300） | 页面专属排版；Astryx 组件样式交给 wxTheme | `src/styles.css` 对应区块取用后删除该区块 |

`src/lib/filterResults.ts`（纯函数）直接复用；gsap `initMotion` 在结果渲染 effect 中调用（选择器类名变化时同步 `src/lib/motion.ts` 的查询串，reduced-motion 语义保留）。

**删**（replace，不并排）：`src/main.ts`、`tests/frontend/main.test.ts` 的可平移断言改写到新组件测试 `tests/frontend/searchPage.test.ts`（≤500）。

**不做**：截图灯箱/版本历史/IAP/候选对比（FE-4）、IPA（FE-5）、`renderResults.ts` 中 FE-4 范围内的段（文件整体删除，FE-4 从 `git show` 历史读取参考）。

## 验收

1. `npm test` 全绿；`search.html` 与 dev `/search` 均可整页走通：多行输入 → 搜索 → 队列 → 选中看基础详情 → 筛选 → 清除。
2. 与旧页行为对照清单逐条勾：默认 us、改国家后文案与 IAP 筛选可用性联动、多行校验提示、被筛空时空态文案、状态徽章文案。
3. 无 `<select>`、无原生日期框；国家用 `Selector`。
4. `git grep -l "src/lib/renderResults" src/` 仅剩历史引用 0 处；`src/lib/renderResults.ts`、`src/lib/ipaDownloadButton.ts` 之外旧文件已删，行数豁免清单划掉 `src/main.ts`、`renderResults.test.ts`（`renderResults.ts`、`styles.css` 条目本票后仍未划——见 FE-4/FE-8）。
5. 新文件全部 ≤500 行。

## 风险

composer 的行级校验文案与按钮启停语义最易走样——平移 `clearQueryValidation`/`syncComposerSummary` 的规则而不是重设计；对照旧页逐条验收。
