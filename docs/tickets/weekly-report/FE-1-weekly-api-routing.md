# FE-1 weeklyApi + /weekly 路由与导航

- 依赖：BE-1（类型文件）；与 BE-2 可并行（前端用 fixture 类型先行）
- 角色：frontend-developer
- 对应 DESIGN.md §5.3

## 范围

**做**：

1. `src/lib/weeklyApi.ts`：`getWeeklyReport(week?: string)` + `WeeklyApiError`，错误分类文案抄 `src/lib/shelfApi.ts`（503「服务端未配置数据库」、400「week 参数无效」、网络失败），URL `?week=` 仅在非空时携带。
2. `src/app/navItems.ts`：NAV_ITEMS 在 `/shelf` 后插入 `{ to: "/weekly", label: "竞品周览" }`；`isNavActive("/")` 排除 `/weekly`（当前 L14 只排除 `/search`、`/shelf`）。断言：`/weekly` 时仅「竞品周览」高亮，「竞品日报」不高亮。
3. `src/app/routes.tsx`：`WeeklyPage` 路由 + 懒挂（与既有页同法直接 import 即可）；`<Route path="/weekly" ...>`。
4. `src/weekly/App.tsx` 先落最小占位：`useDocumentTitle("竞品周览 · App搜索工作台")` + 取数状态机骨架（loading/error/空数据三态，DESIGN §6），数据到手暂以 `<pre>` 输出 JSON（FE-2 替换）。
5. 周参数走 URL：`?week=`，`replace` 写入（模式抄 `src/shelf/filters.ts`）。

**不做**：页面区块渲染（FE-2/FE-3）。

## 验收

1. `tests/frontend/weeklyApi.test.ts`：URL 拼装（有/无 week）、503/400/网络错误文案。
2. `tests/frontend/routes.test.tsx` 更新并全绿：导航顺序 竞品日报→竞品趋势→竞品周览→App Store 搜索；`/`、`/shelf`、`/search` 高亮互斥不回归；`/weekly` 刷新不 404。
3. `npx tsc --noEmit`；`npm run build` 通过；新文件 ≤500 行。
