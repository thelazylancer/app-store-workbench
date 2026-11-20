# FE-2 wxTheme + Astryx 壳 + 路由骨架 + DESIGN.md 收缩

- 依赖：FE-1
- 角色：frontend-developer（DESIGN.md 收缩稿请 ui-designer 复核）
- 对应 ARCH §2（路由表）、§4（Astryx 落点、wxTheme、CSS 策略）

## 背景

Astryx beta 小步验证票：先把主题、壳、路由做成可用骨架，再铺开两页。本票完成前不接管任何现网路径，旧页面照常。

## 范围

**做**：

1. `src/theme/wxTheme.ts`（≤120 行）：`defineTheme` 映射 ARCH §4.3 的语义表（空气底 `#E7EDF2`、墨 `#1C2733`、风暴蓝 `#2E6FA3`/文字 `#245A87`、琥珀仅异常 `#C97F1E`/`#824D0E`、次级文字与规线、Noto Sans SC 正文、IBM Plex Mono 数字、Barlow Condensed 仅日期标记）。实现时以 `npx @astryxdesign/cli docs tokens`（走代理）查实际 token 名；不装 `@astryxdesign/theme-neutral`。
2. `src/app/routes.tsx`（≤200 行）——`<App/>`：
   - `<Theme theme={wxTheme}>` 包裹；
   - `<BrowserRouter>` + 完整路由表：`/` ` /search` `/package/:code`（页面组件先导出占位 `<EmptyState>` 文案占位）；
   - 壳用 `AppShell` + `TopNav`（导航项：`/` 竞品日报、`/search` App Store 搜索），页脚用壳自带布局；
   - 未匹配路由渲染 JSON 语义外的页面级 404（`EmptyState`）。
3. `src/app/useQueryFilters.ts`（≤80 行）：`?date=&team=&category=&status=` 的唯一读写 hook（读用 `useSearchParams`，写用 `setSearchParams` 替换模式，同现状 push/replace 语义）。参数校验规则平移 `src/competitor/main.ts` 的 `parseStatus`/`parseDate`（日期 ≤ 昨天）。
4. `src/app/navItems.ts`：导航定义。
5. `DESIGN.md` 收缩为「颜色、字体、异常色语义」表（内容即 ARCH §4.3 + 对比度要求：蓝文字态与墨色正文对空气底 ≥4.5:1），删去组件外观细节；组件外观以 Astryx 为准。此改动属文档票内允许项。
6. 单测：`tests/frontend/wxTheme.test.ts`（token 值断言）、`tests/frontend/useQueryFilters.test.ts`（query 编解码与非法值回退）。

**不做**：两页业务组件；挂载到现网 html；删旧文件。

## 验收

1. `npm test` 全绿，新增测试文件 ≤500 行。
2. 本地 dev 起临时挂载（如 `vite` 临时入口或 vitest render）目检：AppShell/TopNav 渲染、导航可点、三路由可达（占位页）、主题色为气象台四色、无 Astryx 默认蓝紫。
3. `npx @astryxdesign/cli doctor --built .` 无阻断项（走代理）。
4. DESIGN.md 收缩后无组件级样式条目残留。

## 风险

Astryx 主题覆盖能力在本票首次实战——若 `defineTheme` 无法把某组件盖到目标色，先在该组件处用组件样式覆盖兜底并记录，不得换默认主题。
