# Astryx 全壳视觉规范 · wxTheme 0.7.16

- 状态：设计规范稿，供 FE-2 实现，不改业务代码
- 版本基线：`@astryxdesign/core` / `@astryxdesign/cli` 0.7.16
- 依据：`DESIGN.md`、`docs/ARCH-react.md` §4、`docs/tickets/FE-2-shell-theme-routes.md`
- 本文回答四件事：wxTheme 映射、壳结构草案、DESIGN.md 收缩稿、前端验收清单
- 不在本文范围：HTML / CSS / 组件实现；现网路径；业务页面重做

---

## 0. 结论摘要

1. `defineTheme` 能接管颜色、字体、字号、圆角、焦点、动效、阴影与部分组件外观；但 **Badge 的胶囊形、TopNav 的选中填充、Skeleton 的 0.25 透明度、TopNav 的高度** 等几何/状态细节必须走 `components` 组件级覆盖。
2. `AppShell` **没有 footer 插槽**。ARCH 里“页脚用壳自带布局”需要修正为：在 AppShell 的 `children` 内用 `Layout` 的 `footer` 插槽，或页尾放一个带顶规线的 `Section`。页脚会落在 `<main>` 内，不再有页面级 `contentinfo` landmark。
3. Astryx 没有 Timeline 原语，也没有 2 / 3 / 6 / 11 / 13 / 15 / 22 / 28 / 48px 这些散点 token。时间线竖轨用 1px 页面边框 + `Stack` / `List` 组合；散点字号用 `Text` 自定义 type 或显式 token 覆盖。
4. 必须 **钉死 light 模式** 并显式写全 `info / warning / error / success` 的 `-text`、`-on-`、`-muted` token。Astryx 会从 status fill 自动推导缺失的 status 文字色；只改 `--color-warning` 不写 `--color-text-warning`，文字可能被推成别的黄。
5. 颜色、字体、异常色语义以本文 / DESIGN.md 为准；组件几何以 Astryx 为准。需要保留气象台签名的地方只做少量覆盖：导航下划线、3–4px 徽章、5% 骨架、1px 规线、零阴影。

---

## 1. Astryx 0.7.16 主题机制核对

### 1.1 `defineTheme` 可用面

`defineTheme({name, extends?, tokens, localTokens?, components?, typography?, radius?, motion?, adaptations?})`。

- `tokens` 的 key 是 CSS 自定义属性名，值可以是单值或 `[light, dark]` 元组。
- 显式 `tokens` 优先于 `typography` / `radius` / `motion` 的 scale 生成值。
- `components` 的 key 是组件 class 去掉 `astryx-` 前缀；支持 `base`、`variant:value`、状态名（如 `selected`）和 `:hover` / `:focus-visible` / `:disabled`。
- 组件覆盖里写标准 CSS 属性最稳；没有标准属性对应的，用 `astryx component <Name>` 打印的公开 CSS 变量。
- 私有 `--_` 前缀变量禁止直接写；`theme build` 会报错。
- `localTokens` 可登记自定义 token（如 `--wx-faint`），但组件不会自动读取，仍要组件覆盖或页面样式引用。
- `Theme` 的 `mode` 可设为 `system | light | dark`。本项目固定 `light`。

### 1.2 0.7.16 token 家族

| 家族 | 关键 token |
| --- | --- |
| 颜色 | `--color-accent`、`--color-on-accent`、`--color-background-{body,surface,card,popover,muted,inverted}`、`--color-text-{primary,secondary,disabled,accent}`、`--color-icon-*`、`--color-border`、`--color-border-emphasized`、`--color-overlay{-hover,-pressed}`、`--color-{info,success,warning,error}` 及 `-muted` / `on-*` / `text-*` / `icon-*` / `border-*`、`--color-skeleton`、`--color-track`、`--color-shadow`、`--color-tint-hover` |
| 间距 | `--spacing-0` … `--spacing-12`，0.25rem 步进，最大 3rem |
| 控件高度 | `--size-element-sm` 28px、`--size-element-md` 32px、`--size-element-lg` 36px |
| 线宽 | `--border-width` 1px |
| 焦点 | `--focus-outline-width`、`--focus-outline-style`、`--focus-outline-color`、`--focus-outline-offset` |
| 圆角 | `--radius-none` 0、`--radius-inner` 4、`--radius-element` 8、`--radius-container` 12、`--radius-page` 28、`--radius-chat` 28、`--radius-full` 9999 |
| 阴影 | `--shadow-{low,med,high}`、`--shadow-inset-{hover,selected,success,warning,error}` |
| 动效 | `--duration-{fast,medium,slow}{,-min,-max}`、`--duration-exit`、`--ease-{standard,entrance,move,exit}` |
| 字体 | `--font-family-{body,heading,code}` |
| 字号 | `--font-size-{4xs,3xs,2xs,xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}` |
| 字重 | `--font-weight-{normal,medium,semibold,bold}` |
| 语义排版 | `--text-{heading-1…6,body,large,label,code,supporting,display-1…3}-{size,weight,leading}` |

### 1.3 本项目主题策略

1. 只建 `wxTheme`，不引 `@astryxdesign/theme-neutral`，不叠加 Astryx 默认主题。
2. 固定 `mode="light"`；所有颜色 tuple 的 light / dark 都写同一个值，防止系统深色模式把页面翻成 Astryx 默认深色。
3. 所有 status 角色写全，禁止依赖 Astryx 自动推导。
4. 需要精确几何的组件用 `components` 覆盖；能用 token 解决的绝不下沉到页面 CSS。
5. 生产首屏建议跑 `theme build`，避免运行时注入主题导致的首帧闪色；开发期可用运行时主题。
6. 每次升级 Astryx 后重跑 `theme build` 和 `doctor --built .`。

---

## 2. wxTheme 映射表

### 2.1 颜色映射（light = dark）

| 语义 | Astryx token | 值 | 说明 |
| --- | --- | --- | --- |
| 空气底 / 页面 | `--color-background-body` | `#E7EDF2` | 唯一页面底色 |
| 空气底 / 壳表面 | `--color-background-surface` | `#E7EDF2` | AppShell `section` 变体读它 |
| 卡片 / 浮层 | `--color-background-card`、`--color-background-popover` | `#E7EDF2` | 不做灰上灰；边界靠 1px 规线和遮罩 |
| 淡底 | `--color-background-muted` | `rgba(28,39,51,0.04)` | 分区淡涂 |
| 反相底 | `--color-background-inverted` | `#1C2733` | toast / 反相表面 |
| 墨 / 正文 | `--color-text-primary` | `#1C2733` | 12.83:1 |
| 墨 / 图标 | `--color-icon-primary` | `#1C2733` | |
| 次级文字 | `--color-text-secondary` | `#545F69` | 5.53:1 |
| 次级图标 | `--color-icon-secondary` | `#545F69` | |
| 禁用 / 占位 | `--color-text-disabled`、`--color-icon-disabled` | `rgba(28,39,51,0.38)` | 只用于 disabled / placeholder，不用于正文 |
| 风暴蓝 / 交互 | `--color-accent` | `#2E6FA3` | 命中、主操作、focus |
| 蓝底文字 | `--color-on-accent` | `#E7EDF2` | 4.54:1 |
| 蓝薄涂 | `--color-accent-muted` | `rgba(46,111,163,0.09)` | 选中、范围内日期 |
| 文字蓝 | `--color-text-accent` | `#245A87` | 6.16:1 |
| 蓝色图标 | `--color-icon-accent` | `#2E6FA3` | |
| 命中填充 | `--color-info` | `#2E6FA3` | Badge `info` |
| 命中文字 | `--color-on-info` | `#E7EDF2` | 4.54:1；统一搜索页原白字为空气字 |
| 命中淡底 | `--color-info-muted` | `rgba(46,111,163,0.09)` | |
| 命中淡底文字 | `--color-on-info-muted` | `#245A87` | |
| 命中状态文字 | `--color-text-info` | `#245A87` | 必须显式写，防推导 |
| 命中状态图标 | `--color-icon-info` | `#2E6FA3` | |
| 命中状态描边 | `--color-border-info` | `#2E6FA3` | |
| 琥珀 / 异常填充 | `--color-warning` | `#C97F1E` | 只给异常席位 |
| 琥珀底文字 | `--color-on-warning` | `#1C2733` | 4.71:1 |
| 琥珀淡底 | `--color-warning-muted` | `rgba(201,127,30,0.12)` | 只给异常 |
| 琥珀淡底文字 | `--color-on-warning-muted` | `#824D0E` | |
| 琥珀文字 | `--color-text-warning` | `#824D0E` | 5.90:1 |
| 琥珀图标 | `--color-icon-warning` | `#C97F1E` | |
| 琥珀描边 | `--color-border-warning` | `#C97F1E` | |
| 故障红 / 填充 | `--color-error` | `#A5342B` | 失败、错误 |
| 红底文字 | `--color-on-error` | `#FFFFFF` | 6.72:1 |
| 红淡底 | `--color-error-muted` | `rgba(165,52,43,0.10)` | |
| 红淡底文字 | `--color-on-error-muted` | `#A5342B` | |
| 故障红文字 | `--color-text-error` | `#A5342B` | 5.69:1 |
| 故障红图标 | `--color-icon-error` | `#A5342B` | |
| 故障红描边 | `--color-border-error` | `#A5342B` | |
| success（产品无此语义） | `--color-success` | `#2E6FA3` | 映射到风暴蓝，避免绿色进入 |
| success 文字 | `--color-on-success` | `#E7EDF2` | |
| success 淡底 | `--color-success-muted` | `rgba(46,111,163,0.09)` | |
| success 淡底文字 | `--color-on-success-muted` | `#245A87` | |
| success 状态文字 | `--color-text-success` | `#245A87` | |
| success 图标 | `--color-icon-success` | `#2E6FA3` | |
| success 描边 | `--color-border-success` | `#2E6FA3` | |
| 规线 | `--color-border` | `rgba(28,39,51,0.16)` | Divider `subtle` |
| 强调规线 | `--color-border-emphasized` | `rgba(28,39,51,0.30)` | Divider `strong`、幽灵按钮描边 |
| 悬停薄涂 | `--color-overlay-hover` | `rgba(28,39,51,0.06)` | |
| 按下薄涂 | `--color-overlay-pressed` | `rgba(28,39,51,0.10)` | |
| 中性填充 | `--color-neutral` | `rgba(28,39,51,0.06)` | 若导航改回下划线，此项主要给 Badge neutral |
| 骨架 | `--color-skeleton` | `#B7BDC6` | 组件再乘 0.25 透明度，有效约 5% 墨；见 2.6 |
| 轨道 | `--color-track` | `rgba(28,39,51,0.12)` | 进度条 / 滑轨 |
| 遮罩 | `--color-overlay` | `rgba(28,39,51,0.90)` | 统一搜索页 0.94 / 竞品页 0.88 |
| 阴影色 | `--color-shadow` | `transparent` | 零阴影 |
| 悬停混色 | `--color-tint-hover` | `#1C2733` | 组件用 color-mix 时保持墨色薄涂 |
| 反相错误底 | `--color-background-error-inverted` | `#A5342B` | |
| 分类蓝 | `--color-background-blue` / `border-blue` / `icon-blue` / `text-blue` | `rgba(46,111,163,0.09)` / `#2E6FA3` / `#2E6FA3` / `#245A87` | 防 Astryx 默认蓝泄漏 |
| 分类黄 / 橙 | `--color-background-yellow` / `border-yellow` / `icon-yellow` / `text-yellow`（orange 同） | `rgba(201,127,30,0.12)` / `#C97F1E` / `#C97F1E` / `#824D0E` | 防默认黄橙泄漏 |
| 分类红 | `--color-background-red` / `border-red` / `icon-red` / `text-red` | `rgba(165,52,43,0.10)` / `#A5342B` / `#A5342B` / `#A5342B` | |
| 分类灰 | `--color-background-gray` / `border-gray` / `icon-gray` / `text-gray` | `rgba(28,39,51,0.06)` / `rgba(28,39,51,0.30)` / `#545F69` / `#545F69` | |
| 未使用分类 | cyan / green / pink / purple / teal 的 4 个角色 | 统一中性：`rgba(28,39,51,0.04)` / `rgba(28,39,51,0.16)` / `#545F69` / `#545F69` | 防止误用非语义 Badge 时出现青绿紫 |

### 2.2 状态色语义（命中 / 未命中 / 失败）

| 产品状态 | 组件写法 | 填充 | 文字 | 描边 | 规则 |
| --- | --- | --- | --- | --- | --- |
| 命中 | `Badge variant="info"` | `#2E6FA3` | `#E7EDF2` | 无 | 唯一蓝色实心徽章 |
| 未命中 | 自定义 `Badge variant="wx-miss"` | 透明 | `#545F69` | 1px dashed `rgba(28,39,51,0.38)` | 不给琥珀 |
| 待补全 | 自定义 `Badge variant="wx-pending"` 或 `warning` | `#C97F1E` | `#1C2733` | 无 | 琥珀只在这里 |
| 异常（详情） | 自定义 `Badge variant="wx-exception"` | 透明 | `#824D0E` | 1px solid `#C97F1E` | 琥珀只描边，不大面积填充 |
| 失败 | `Badge variant="error"` / 错误文字 | `rgba(165,52,43,0.10)` | `#A5342B` | 无 | 只给失败/错误语境 |
| 中性计数 | `Badge variant="neutral"` | `rgba(28,39,51,0.06)` | `#1C2733` | 无 | 只做计数/标签，不做状态 |

### 2.3 字体映射

| 语义 | Astryx 落点 | 值 |
| --- | --- | --- |
| 正文 | `--font-family-body`、`--text-body-*` | `"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`；14px / 1.5 / 400 |
| 标题 | `--font-family-heading` | 同 Noto Sans SC |
| 数据 | `--font-family-code`、`--text-code-*` | `"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`；12px / 1.5 / 400；所有数字开 `hasTabularNumbers` |
| 标签 | `--text-label-*` | Noto Sans SC 12px / 600 / 1.5 |
| 辅助说明 | `--text-supporting-*` | Noto Sans SC 12px / 400 / 1.5 |
| 日期标记 | 无 display 字体 token；`Text` 自定义 type `wx-date` | Barlow Condensed 28px / 600 / 1.0 / `tabular-nums` |
| 统计数字 | `Text` 自定义 type `wx-stat` | IBM Plex Mono 22px / 600 / 1.1 / `tabular-nums` |
| 条目名 | `Text` 自定义 type `wx-item` | Noto Sans SC 15px / 600 / 1.4 |
| 13px 元信息 | `Text` 自定义 type `wx-meta` | Noto Sans SC 13px / 400 / 1.5 |
| 标题 1 | `--text-heading-1-*` | 24px / 600 / 1.2（详情页竞品名） |
| 标题 2 | `--text-heading-2-*` | 20px / 600 / 1.2（页首 h1） |
| 标题 3 | `--text-heading-3-*` | 17px / 600 / 1.4（空态标题） |
| 标题 4 | `--text-heading-4-*` | 14px / 600 / 1.5（小节标题） |

**字号 token 取值建议：**

| token | 值 | 用途 |
| --- | --- | --- |
| `--font-size-xs` | 11px | 只允许徽章/pill 内部 |
| `--font-size-sm` | 12px | 元信息、标签、数据下限 |
| `--font-size-base` | 14px | 正文 |
| `--font-size-lg` | 17px | 空态标题、较大正文 |
| `--font-size-xl` | 20px | 页首 h1 |
| `--font-size-2xl` | 24px | 详情名、headline |
| `--font-size-3xl` | 28px | Barlow 日期（若不用自定义 type） |
| `--font-size-4xl` | 35px | 备用，不在两页使用 |
| `--font-size-5xl` | 42px | 备用，不再使用旧 48px 大日期 |

**字重注意：** 现网字体请求只加载 Noto Sans SC 400/500/600、Barlow 500/600、IBM Plex Mono 400/500/600，CSS 又设了 `font-synthesis: none`；因此 DESIGN 里的 700 实际会落回 600。迁移时统一用 400 / 500 / 600 三档，或显式补载 700。Astryx 的 `semibold` 正好是 600。

### 2.4 圆角映射

| Astryx token | 建议值 | 用途 |
| --- | --- | --- |
| `--radius-none` | 0 | 不需要圆角的块 |
| `--radius-inner` | 2px | tag、pill、chip、未命中虚线框、幽灵按钮 |
| `--radius-element` | 4px | 按钮、输入、徽章、分段控件；统一替代旧的 3px |
| `--radius-container` | 8px | 条目图标、面板、灯箱滑片、缩略图 |
| `--radius-page` | 16px | 详情页大图标、较大容器 |
| `--radius-chat` | 16px | 不使用 |
| `--radius-full` | 9999px | 只给头像 / 状态点；Badge、Token、Thumbnail 必须覆盖掉胶囊 |

**Astryx 没有的圆角：**

- 3px（旧按钮/输入/徽章）：用 `--radius-element: 4px` 统一，或组件覆盖到 3px。
- 6px（搜索页截图触发器）：页面级例外，组件覆盖或页面样式。
- 12px（竞品页灯箱滑片）：组件覆盖；若接受与搜索页统一，直接用 8px。
- 2px 与 16px 可落在 `inner` / `page`；3px 不在 token 阶梯上。

### 2.5 尺寸、焦点、阴影、动效

| 项 | 建议 | 说明 |
| --- | --- | --- |
| `--size-element-sm` | 28px | 小控件 |
| `--size-element-md` | 32px | 输入、分段控件、Selector |
| `--size-element-lg` | 36px | 主按钮、IPA 下载 |
| `--border-width` | 1px | 所有规线 |
| `--focus-outline-width` | 2px | |
| `--focus-outline-style` | solid | |
| `--focus-outline-color` | `#2E6FA3` | 对空气底 4.54:1；对墨底只有 2.82:1，focus offset 要保证环落在空气底上 |
| `--focus-outline-offset` | 2px | 旧规格；Astryx 默认 3px |
| `--shadow-low` / `--shadow-med` / `--shadow-high` | `none` | 零阴影 |
| `--shadow-inset-hover` / `selected` / `success` / `warning` / `error` | `none` 或透明 | 不用内阴影制造状态 |
| `motion.fast` | 140ms | 箭头 120ms、控件过渡 140ms 的折中 |
| `motion.medium` | 240ms | 灯箱 180ms 与入场动效的上界 |
| `motion.slow` | 1200ms | 骨架/持续动效 |
| `motion.character` | `crisp` | 无过冲；与零阴影、克制动效一致 |
| `--duration-exit` | `fast` | 退出不拖沓 |

**Astryx 固定动效：** Spinner 与 Skeleton 的循环不受 `tempo` 影响；Skeleton 在 `prefers-reduced-motion: reduce` 下静止。Astryx 的 200ms reduced-motion 上限保留。

### 2.6 Astryx 没有的 token / 需要组件级覆盖

| 缺口 | Astryx 现状 | 处理 |
| --- | --- | --- |
| 38% 淡墨 `faint` | 只有 `--color-border`（16%）和 `--color-text-disabled` | 登记 `--wx-faint: rgba(28,39,51,0.38)`；SegmentedControl 外框、空图标虚线框、未命中徽章用组件覆盖或页面类引用 |
| 2 / 3 / 6 / 12 / 16px 散点圆角 | 只有 none / inner / element / container / page / full | 2、4、8、16 映射到 token；3、6、12 用组件覆盖或接受就近值 |
| Barlow Condensed 显示字体 | 没有 display font token，只有 body / heading / code | `Text` 自定义 type `wx-date`，或页面类直接写 font-family；不得把 Barlow 设为全局 heading |
| 11 / 13 / 15 / 22 / 28 / 48px | 默认 1.2 阶梯是 10 / 12 / 14 / 17 / 20 / 24 / 29 / 35 / 42 | 11 覆盖 `--font-size-xs`；13 / 15 / 22 / 28 用 `Text` 自定义 type；48 不再使用 |
| tabular-nums | 不是 token；`Text` 有 `hasTabularNumbers` 属性 | 所有数据调用点显式开；`Timestamp` 用组件覆盖 `fontVariantNumeric` |
| Badge 是胶囊 | 组件默认 `--radius-full`、20px 高、12/500 | 覆盖 Badge：4px 圆角、24px 高、12px/600、左右 12px |
| 未命中虚线徽章 | Badge 只有实心/淡底，无虚线 | 自定义 `variant:wx-miss`：透明底、1px dashed faint、dim 文字 |
| 异常描边徽章 | 无透明+描边组合 | 自定义 `variant:wx-exception`：透明底、1px solid 琥珀、`#824D0E` 文字 |
| Skeleton 5% 墨 | `--color-skeleton` 会再乘 0.25 opacity | 优先组件覆盖 Skeleton：opacity 1 + `rgba(28,39,51,0.05)` 底；或把 token 调成 `#B7BDC6` 让 25% 合成接近 5% |
| TopNav 选中下划线 | TopNavItem 选中是 `--color-neutral` 填充胶囊 | 组件覆盖 `top-nav-item` 的 `selected`：透明底、墨字、`inset 0 -2px 0` 墨色下划线、0 圆角 |
| TopNav 54px 高 | 高度由内容决定（约 48px） | 组件覆盖 `top-nav` / `top-nav-item` 的 `minHeight: 54px`，item 上下 padding 归零 |
| AppShell 页脚 | 没有 footer 插槽 | 嵌套 `Layout` 的 `footer`，或页尾 `Section` + 顶规线；接受落在 `<main>` 内 |
| Timeline 竖轨 | 没有 Timeline 原语 | `Stack` / `List` / `Divider` 组合；竖轨用页面级 1px 左边框 + 7/8px 圆点 |
| 导航品牌 15/700 | TopNavHeading 用 `--text-large-size` 17/600 | 品牌槽放自定义链接（22×22 SVG + 15/600 文字），或接受 17/600 |
| 分类色泄漏 | 默认青/绿/粉/紫仍是 Astryx 默认值 | 在 theme 里把未使用分类映射为中性；禁止非语义 Badge 变体 |

### 2.7 组件级覆盖清单

| `components` key | 覆盖要点 | 原因 |
| --- | --- | --- |
| `app-shell` | `base` 背景 = 空气底；`variant:section` 背景 = 空气底；无圆角/阴影 | 平涂到底 |
| `app-shell-header` | 背景 = 空气底；`minHeight: 54px` | 壳高与现版一致 |
| `top-nav` | `maxWidth: 1440px`、`marginInline: auto`、`paddingInline: 32px`、`paddingBlock: 0`、`minHeight: 54px`、背景透明 | 内容对齐 1440 列；避免 8px 上下内边距把 54px 撑成 70px |
| `top-nav-item` | `minHeight: 54px`、`paddingBlock: 0`、`paddingInline: 0`（或 8px）、`borderRadius: 0`、14px/400；`selected` 透明底 + 墨字 600 + 2px 墨色下划线 | 保留现版导航签名 |
| `top-nav-heading` | 若目标可用：15px/600；否则用自定义品牌链接 | 22×22 标 + 品名 |
| `badge` | 4px 圆角、24px 高、12px/600、左右 12px；`info` = 蓝底空气字；`warning` = 琥珀底墨字；自定义 `wx-miss` / `wx-pending` / `wx-exception` | 去掉胶囊与默认字重 |
| `skeleton` | `opacity: 1`、背景 `rgba(28,39,51,0.05)` | 5% 墨骨架 |
| `empty-state` | 透明底、无卡片边；标题 17/600、说明 13/dim；动作间距 16 | 平涂空态 |
| `text` | 自定义 type：`wx-date`、`wx-stat`、`wx-item`、`wx-meta`；`type:code` 开 tabular | 散点字号与数据层 |
| `timestamp` | 等宽、12px、tabular | 页脚/详情时间 |
| `tab-list` / `tab` / `tab-indicator` | 高度 32、4px 圆角、选中墨底空气字；计数等宽 12 | 团队过滤 |
| `segmented-control` / `segmented-control-item` | 高度 32（或 30）、4px 圆角、外框 1px faint；选中墨底空气字 | 状态过滤 |
| `button` | `primary` = 墨底空气字、4px 圆角、36px 高、13px/600；`secondary` = 透明底 + 1px 强调规线 + 墨字；`ghost` = 透明底 + 墨字；自定义 `wx-accent` = 风暴蓝底空气字（IPA 下载）；悬停墨 6% | 按钮语义；Astryx 默认 primary 是 accent 蓝，必须改回墨色 |
| `link` | `--color-text-accent`、1px 下划线、offset 3px；悬停转墨 | 文字操作 |
| `dialog` | 空气底、1px 规线、8/16px 圆角、无阴影 | 平涂弹层 |
| `lightbox` | 遮罩 0.90、滑片 8/12px、无阴影 | 灯箱 |
| `thumbnail` | 8px 圆角、无阴影；只用于方形图标 | 图标预览 |
| `status-dot` | 8px 固定；neutral = 墨、warning = 琥珀、error = 故障红 | 批次状态点 |
| `layout-footer` | 顶部 1px 规线、最小高 44px、上下 8px | 页脚细线 |

> 目标 key 以 `npx @astryxdesign/cli@0.7.16 theme targets <Name>` 和 `component <Name>` 的实际输出为准；上表是 0.7.16 已核对的目标。

---

## 3. 壳结构与组件选型

### 3.1 AppShell / TopNav / 页脚

```text
AppShell (variant="section", height="auto", contentPadding=0, mobileNav.breakpoint="md")
├─ skip link（Astryx 自带，不要再加第二个）
├─ banner 插槽（系统级公告；日常为空）
├─ TopNav (label="主导航", maxWidth 1440, 居中)
│  ├─ heading：品牌链接
│  │    [22×22 墨底三柱标] + 竞品气象台（15/600）
│  ├─ startContent：
│  │    [竞品日报]  [App Store 搜索]
│  │    TopNavItem + Router Link；isSelected → aria-current="page"
│  └─ endContent：
│       搜索页区域码（如 US；IBM Plex Mono 12）
├─ main
│  ├─ 页面内容（页面自己的 Section / Stack / Grid，最大 1440）
│  └─ 页脚细线（Section + 顶规线；批次状态 + 近 7 天合计）
└─ 移动端抽屉（Astryx 自带；焦点陷阱与关闭后回焦）
```

页脚 ASCII：

```text
──────────────────────────────────────────────────────────────  1px line
● 批次状态：昨日 08:00 完成          近 7 天合计 812 包 · 口径说明   44px
```

- `AppShell` 的 `height="auto"` 会让顶部导航变成 sticky；现版是随页面滚走。若必须与现版一致，在 `app-shell-header` 覆盖 `position: static`；否则接受 sticky（更利于长页面）。
- `contentPadding=0`，页内自己控制 32 / 24 / 16 内边距，避免与页面容器双重内边距。
- `AppShell` 已包含 skip link 和 `<main>`；迁移时删除旧页面自己的 skip link / main，避免重复 landmark。
- 页脚只挂在竞品日报页，不是全壳全局；搜索页没有页脚。现版靠 flex + `margin-top: auto` 把页脚压到视口底部；Astryx `height="auto"` 下内容短时页脚会紧跟内容。若必须保持底部锚定，用页面级 `min-height` 包裹或改用 `height="fill"`，不要给 AppShell 额外加 footer landmark。

### 3.2 时间线竖轨

Astryx 没有 Timeline。用布局基元组合，竖轨本身用页面级 1px 边框，不用 `Divider` 拉满高度（`Divider` 的 100% 高度依赖父容器，跨日块容易断）。

```text
│
●  11.19 周三        128 包
│  ├ 团队甲            42 包      命中 38 · 异常 4
│  │   [36] App 名称        com.foo.bar       类目 · v1.2   [命中]
│  │   [36] App 名称        com.foo.baz       类目 · v1.1   [待补全]
│  └ 团队乙            31 包
│      [36] App 名称        com.foo.qux       类目 · v1.0   [未命中]
●  11.18 周二         96 包
│  ...
```

| 部位 | 选型 | 规格 |
| --- | --- | --- |
| 日块 | `Stack` / `VStack` | 左 1px 竖轨；`margin-inline-start: 7px`；`padding-inline-start: 18px`；日块间距 8px |
| 日期点 | 页面级 7px 圆点（或 `StatusDot` 8px） | 墨色；绝对定位 `left: -4px`；不要用状态色 |
| 日期 | `Text` 自定义 `wx-date` | Barlow Condensed 28/600/1.0，tabular |
| 包数 | `Text type="code"` | 12px，dim，tabular |
| 团队行 | `Stack` + `Text weight="semibold"` | 名称 14/600；包数等宽 12；不是按钮，不可折叠 |
| 条目行 | `List` / `Item`（`density="balanced"`） | 68px 行高；图标 36px；名称 15/600；包码等宽 13；末位 Badge |
| 行间 | `Divider` subtle 或 `List hasDividers` | 1px 规线 |
| 统计行 | `Grid` / `Stack` + `Divider orientation="vertical"` | 四项；数字 `wx-stat` 22/600；标签 12/dim |

### 3.3 组件选型表

| 用途 | Astryx 组件 | 备注 |
| --- | --- | --- |
| 应用壳 | `AppShell` | `variant="section"`、`height="auto"`、`contentPadding=0` |
| 顶部导航 | `TopNav` + `TopNavItem` | 品牌用 `heading` 槽；导航项用 `startContent` |
| 品牌 | 自定义链接或 `TopNavHeading` | 22×22 标 + 15/600 品名；`TopNavHeading` 默认 17/600 |
| 页脚 | `Layout` 的 `footer` 插槽，或 `Section` | AppShell 没有 footer 槽 |
| 按钮 | `Button` / `IconButton` / `ButtonGroup` | 主/次/幽灵三种 |
| 下拉 | `Selector` | 国家、类目 |
| 日期 | `DateInput` | 不自绘日历，不用系统日期框 |
| 团队过滤 | `TabList` + `Tab` | 只做筛选，不折叠日块 |
| 状态过滤 | `SegmentedControl` | 命中 / 待补全 / 未命中 / 异常计数 |
| 徽章 | `Badge` + 自定义变体 | 命中/未命中/待补全/异常/失败 |
| 条目 | `List` / `Item` | 行高 68；图标 36 |
| 元信息 | `MetadataList` / `Text` / `Timestamp` | 详情信息表 |
| 空态 | `EmptyState` | 标题 + 说明 + 动作 |
| 加载 | `Skeleton` / `Spinner` | 骨架 5% 墨；reduced-motion 静止 |
| 错误 | `Banner` / `EmptyState` | 故障红，不用琥珀 |
| 灯箱 | `Lightbox` | 图片/视频全屏；Esc/方向键 |
| 授权码弹层 | `Dialog` + `Field` + `TextInput` | 焦点陷阱与回焦 |
| 图标 | 页面级 `img` / `Thumbnail` | `Thumbnail` 只用于方形；截图用普通图片触发器 + Lightbox |

### 3.4 与现版的差异点

| 区域 | 现版 | Astryx 壳 | 处理 |
| --- | --- | --- | --- |
| 顶部导航选中 | 墨色 2px 下划线 | 选中项填充 `--color-neutral` 胶囊 | 组件覆盖回下划线，保留签名 |
| 导航高度 | 固定 54px | 内容决定，约 48px | 覆盖 `minHeight: 54px` |
| 品牌 | 22×22 标 + 15/700 | `TopNavHeading` 17/600 | 自定义品牌链接，或接受 17/600 |
| 导航间距 | 品牌与 tab 36px，tab 间 36px | heading / startContent 之间 16px，item 间 4px | 用 `Stack` 或包裹层补到 32/36；接受近似 |
| 导航 sticky | 随页面滚走 | `height="auto"` 下 sticky | 接受或覆盖 static |
| 页脚 | 页面级 1px 顶线 + 44px | AppShell 无 footer 槽 | `Layout footer` / `Section`；落在 main 内 |
| 徽章 | 3px 圆角，24px 高 | 胶囊，20px 高，12/500 | 组件覆盖到 4px / 24px / 12/600 |
| 团队过滤 | 自绘 tab 按钮 | `TabList` 指示条/下划线 | 外观变化，语义不变 |
| 状态过滤 | 自绘分段控件 | `SegmentedControl` 滑动选中 | 外观变化，语义不变 |
| 日期选择 | 自绘日期下拉，含“全部日期” | `DateInput` 自带日历，清空走“清除筛选” | 按 ARCH §8.1 第 10 条执行 |
| 时间线 | 自绘竖轨 | 无 Timeline 原语 | `Stack` + `List` + 1px 页面边框 |
| 空态/加载 | 自绘骨架与空态 | `EmptyState` / `Skeleton` | 平涂主题覆盖 |
| 断点 | 1180 / 959 / 860 / 840 / 640 | sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536 | 壳移动导航用 `md`；页面栅格保留页面断点 |

### 3.5 布局栅格

- **壳内容列**：两页统一 1440px；顶部导航与页面内容共用同一条 1440 列。DESIGN.md 旧稿写搜索页 1600，但现网 `src/styles.css` 的 `.workspace-frame` 实际是 1440，本文以 1440 为准。
- **内边距**：≥1180px 为 32px；≤1180px 为 24px；≤840px 为 16px。搜索页若需要更宽的工作区，可在页面内部放宽，但不改变壳列。
- **文档流**：单列纵向；不做多栏瀑布。只有以下显式网格：
  - 竞品条目行：`44px 图标 + minmax(160,210) 名称 + minmax(220,330) 包码 + minmax(140,1fr) 类目/版本 + auto 徽章`，列距 16px，行高 68px。
  - 搜索工作台：`280px 结果队列 + minmax(0,1fr) 检查器`，1px 右规线，队列 sticky；≤959px 单栏。
  - 详情：随壳 1440px，主/侧栏 `2fr / 1fr`；≤840px 单栏；信息表 `110px 标签 + 1fr`。
- **间距节奏**：4 / 6 / 8 / 12 / 16 / 24 / 32；Astryx gap 只接受 0 / 2 / 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40，26 / 36 等值用 spacing token 或就近取 24 / 40。
- **断点**：壳移动导航用 `md`（768px）；页面内容沿用 1180 / 959 / 860 / 840。注意 768–860 区间会出现“导航已折叠、内容仍双栏”的过渡，需目检。

### 3.6 图标与截图缩略图规格

| 资产 | 尺寸 | 圆角 | 规则 |
| --- | --- | --- | --- |
| 品牌标 | 22×22（源 SVG 32×32 / viewBox 16） | 2px | 墨底、两根空气柱、一根风暴蓝主柱；favicon 同源 |
| 竞品条目图标 | 36×36 | 8px | 44px 图标列内居中；缺图用 36×36 1.5px dashed faint 空框，或首字母 IBM Plex Mono 14/600 + 蓝 9% 底 |
| 搜索结果图标 | 40×40 | 8px | 行首；占位墨 8% 底 |
| 详情大图标 | 84×84 | 16px | 详情页身份区 |
| 截图缩略图 | 自适应，最小 180px 宽 | 8px | `auto-fill, minmax(180px, 1fr)`，间距 12px；自然竖屏比例；1px 规线；悬停墨 6%；必须有 alt |
| 灯箱图片 | 最大 90vw / 90vh | 8px（搜索）/ 12px（竞品） | `object-fit: contain`；说明与计数等宽 12 |
| 骨架块 | 文案行高 | 2 / 4px | 墨 5%；1.2s 脉冲；reduced-motion 静止 |

- Astryx `Thumbnail` 是正方形组件，适合 36/40/84 方形图标；截图是竖屏，不要强行塞进 `Thumbnail`，用普通图片触发器 + `Lightbox`。
- 所有图标必须有可访问名称；装饰性图标 `aria-hidden`。状态不能只靠颜色，徽章文字必须存在。

### 3.7 空态 / 错误 / 加载

| 状态 | 表现 | 规则 |
| --- | --- | --- |
| 空态 | `EmptyState`：17/600 标题 + 13/dim 说明 + 幽灵按钮动作 | 无卡底；以 1px 规线开区；空态必须有下一步 |
| 搜索空态 | 22×3 蓝条作为唯一色点缀 | 蓝条不是状态，不承载文字 |
| 加载 | `Skeleton` 5% 墨条块；长任务用 `Spinner` | 不叠加两种加载形态；reduced-motion 静止 |
| 页面级 404 | `EmptyState` + 返回首页 | 不用琥珀；不用错误红铺底 |
| 服务 503 | `Banner` / `EmptyState` + 故障红文字 | 只给失败语境 |
| 无包日期 | 不渲染该日 | 不补空白天，不出现空态 |
| 未命中包 | 留在所属团队块内，虚线徽章 | 不另开底部异常区 |
| 待补全 / 异常 | 留在团队块内，琥珀实心 / 琥珀描边 | 琥珀只出现在异常席位 |

---

## 4. DESIGN.md 收缩稿（可直接替换）

> 位置：`docs/design/astryx-theme.md` 本节。不要直接改 `DESIGN.md`；FE-2 复核后由文档票替换。  
> 原则：保留颜色、字体、异常色语义、对比度与无障碍；删除 `components:` 与全部组件外观规格。组件几何以 Astryx 主题为准。

```yaml
---
name: App搜索工作台 · 竞品气象台
description: 两页工作台共用的气象台世界——平涂空气底、墨色文字、一像素规线、等宽数据层、零阴影零渐变；组件外观由 Astryx 主题接管
colors:
  air: "#e7edf2"
  ink: "#1c2733"
  blue: "#2e6fa3"
  blue-text: "#245a87"
  amber: "#c97f1e"
  amber-text: "#824d0e"
  dim: "#545f69"
  danger: "#a5342b"
  faint: "rgba(28, 39, 51, 0.38)"
  line: "rgba(28, 39, 51, 0.16)"
  line-strong: "rgba(28, 39, 51, 0.3)"
  white: "#ffffff"
typography:
  body:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontFeature: "tabular-nums"
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
---
```

# Design System: App搜索工作台 · 竞品气象台

## Overview

**Creative North Star: “竞品气象台”**

两页共用的一个世界：竞品日报是首页，App Store 搜索是第二页。整个工作台是一片平涂的空气色底（#E7EDF2），没有浮卡、没有灰上灰：分区靠一像素规线，深度靠墨色透明度薄涂，阴影和渐变为零。数据是唯一主角，所有数字、包码、日期串以 IBM Plex Mono + tabular-nums 呈现；中文正文用 Noto Sans SC；Barlow Condensed 只用于日期标记。

组件外观由 Astryx 主题接管。本文件只负责颜色、字体、异常色语义与无障碍对比度；任何组件几何、圆角、间距、状态外形以 `docs/design/astryx-theme.md` 和 Astryx 为准。

## Colors

两色职能分立：蓝色管命中与交互，琥珀管异常；两者都有专用加深文字变体，线色本身不染正文。

### Primary

- **风暴蓝 Storm Blue** (#2E6FA3)：命中与交互的唯一直彩色。命中填充、主操作、focus 轮廓、状态点。常规文字不使用它。
- **风暴蓝文字变体** (#245A87)：一切常规尺寸的蓝色文字。空气底上 6.16:1。
- 风暴蓝本体在空气底上 4.54:1，只允许 22px/600 以上的大字号数字使用。

### Secondary

- **警戒琥珀 Amber** (#C97F1E)：异常专用。异常状态点、待补全徽章底、批次告警竖线。作为常规文字只有 2.72:1，禁止用于正文。
- **警戒琥珀文字变体** (#824D0E)：异常标题、异常原因、批次告警正文、统计行异常数字。空气底上 5.90:1。
- 琥珀小徽章内承载墨字（#1C2733 on #C97F1E = 4.71:1）。

### Neutral

- **空气底 Air** (#E7EDF2)：唯一背景色。
- **墨 Ink** (#1C2733)：正文与主按钮底色，空气底上 12.83:1。一切透明度薄涂由它派生。
- **暗灰 Dim** (#545F69)：二级说明、包码、计数；空气底上 5.53:1，蓝 9% 薄涂上 4.95:1。
- **故障红 Danger** (#A5342B)：失败徽章与错误提示；空气底上 5.69:1。
- **淡墨 Faint** (rgba(28,39,51,0.38))：缺数据虚线框、分段控件外框。
- **规线** (rgba(28,39,51,0.16))：默认 1px 分隔线；**强调规线** (rgba(28,39,51,0.3))：幽灵按钮描边、异常区外框。
- **白** (#FFFFFF)：仅用于红底或蓝底的反相文字；蓝底白字 5.36:1。

### 状态色语义

| 状态 | 颜色 | 形态 |
| --- | --- | --- |
| 命中 | 风暴蓝 #2E6FA3 底 + 空气字 #E7EDF2 | 实心徽章 |
| 未命中 | 透明底 + 淡墨虚线 + 暗灰字 #545F69 | 虚线描边徽章 |
| 待补全 | 琥珀 #C97F1E 底 + 墨字 #1C2733 | 实心徽章 |
| 异常 | 透明底 + 琥珀描边 + 琥珀文字 #824D0E | 描边徽章/行 |
| 失败 | 故障红 #A5342B 文字 / 红 10% 底 | 错误徽章 / 文案 |

### Named Rules

**The Split-Voice Rule.** 线块点色与正文文字色分立：#2E6FA3 与 #C97F1E 不出现在常规尺寸文字里；正文蓝/琥珀一律用加深变体 #245A87 / #824D0E。唯一例外是 22px/600 以上的统计数字可用风暴蓝本体，以及琥珀小徽章底承载墨字。

**The Calm Air Rule.** 琥珀只出现在异常席位：待补全徽章、异常标题、批次告警竖线、异常计数。异常区与告警只在非空/异常时渲染；琥珀永远不做大面积填充。

## Typography

**正文：** Noto Sans SC（回退 PingFang SC, Hiragino Sans GB, Microsoft YaHei）
**数据：** IBM Plex Mono（回退 ui-monospace 栈），恒开 tabular-nums
**日期：** Barlow Condensed（回退 Arial Narrow, Helvetica Neue），只用于日期标记

字重只用 400 / 500 / 600。现网字体请求未加载 700，且 `font-synthesis: none`；不要依赖 700。

### Hierarchy

- **Display**：Barlow Condensed 600，28px，line-height 1，tabular-nums；只用于时间线日期。
- **Headline**：Noto Sans SC 600，24px，line-height 1.2；详情页竞品名。
- **Title**：Noto Sans SC 600，20px；页首 h1。空态标题 17px/600。
- **Body**：Noto Sans SC 400，14px，line-height 1.5；正文基准。条目名 15px/600。
- **Data**：IBM Plex Mono 400–600，12px，tabular-nums；包码、元信息、日期串、版本号、页脚状态。统计数字 22px/600。
- **Label**：Noto Sans SC 600，12px；徽章与标签。11px 只允许徽章/pill 内部；正文与元信息不小于 12px。

### Named Rules

**The Data-Mono Rule.** 一切数字、包码、日期串、版本号都必须走 IBM Plex Mono + tabular-nums。sans 声部从不渲染数据，数据声部从不渲染中文叙述。

**The One Display Voice Rule.** Barlow Condensed 是唯一的显示声部，且只用于日期。单入口后字体随首屏全局加载，但不得用于非日期内容。不要再发明第二个被放大的字族。

## Layout

单列纵向文档流，壳内容列 1440px。

- 竞品页：最大 1440px，内边距 32px（≤1180px 24px）。
- 搜索页：壳列同为 1440px；页面内部可放宽，但不改变壳列。内边距 32px（≤1180px 24px，≤840px 16px）。
- 详情页：主/侧栏 `2fr / 1fr`；≤840px 单栏。
- 时间线：已有日期从新到旧；没有包的日子不出现；日期是静态标记，不可折叠；同一天内按团队分块。
- 密度是数据密：分组纵列平铺，不设多栏瀑布；靠规线而不是空白换气。

## Elevation & Depth

零阴影、零渐变。深度全部由墨色透明度薄涂表达：悬停墨 0.06、按下墨 0.10、选中蓝 0.09、普通柱 0.55、骨架墨 0.05、灯箱遮罩墨 0.90。焦点是唯一的“浮起”时刻：2px 风暴蓝轮廓，offset 2px。

**The Flat-Ground Rule.** 任何表面都不许用 box-shadow 或渐变制造高度。唯一例外是导航当前项的下划线（用 inset 阴影语法画的一条 2px 规线）。

## Shapes

Astryx 圆角角色：`inner` 2px（tag / chip / 未命中虚线框）、`element` 4px（按钮 / 输入 / 徽章 / 分段控件）、`container` 8px（条目图标 / 面板 / 灯箱滑片）、`page` 16px（详情大图标）。不使用胶囊；`full` 只给头像与状态点。3px / 6px / 12px 是已录的页面级例外，需要时组件覆盖。

## Accessibility

| 组合 | 对比度 | 用途 |
| --- | --- | --- |
| 墨 #1C2733 / 空气 #E7EDF2 | 12.83:1 | 正文 |
| 文字蓝 #245A87 / 空气 | 6.16:1 | 蓝色文字 |
| 风暴蓝 #2E6FA3 / 空气 | 4.54:1 | 仅 22px/600+ 大数字 |
| 琥珀文字 #824D0E / 空气 | 5.90:1 | 异常文字 |
| 暗灰 #545F69 / 空气 | 5.53:1 | 二级文字 |
| 故障红 #A5342B / 空气 | 5.69:1 | 错误文字 |
| 空气 #E7EDF2 / 风暴蓝 #2E6FA3 | 4.54:1 | 命中徽章 |
| 墨 #1C2733 / 琥珀 #C97F1E | 4.71:1 | 待补全徽章 |
| 暗灰 #545F69 / 蓝 9% 薄涂 | 4.95:1 | 选中行上的次级文字 |

正文 ≥4.5:1；大字（≥18.66px 粗体或 ≥24px）≥3:1；非文本 UI 边界与焦点 ≥3:1。焦点环在墨色按钮上只有 2.82:1，必须靠 offset 让环落在空气底上。

## Do's and Don'ts

### Do

- **Do** 一切数字、包码、日期串走 IBM Plex Mono + tabular-nums。
- **Do** 常规尺寸的蓝/琥珀文字用加深变体 #245A87 / #824D0E；22px/600+ 数字可用风暴蓝本体。
- **Do** 用 1px 规线分隔区块；悬停用墨 0.06 薄涂。
- **Do** 琥珀只用于异常；异常区/告警只在非空/异常时渲染。
- **Do** 新动效先接 `prefers-reduced-motion`；灯箱/骨架/抽屉都要有静止态。

### Don't

- **Don't** 使用阴影、渐变、卡片容器或灰上灰；深度只来自墨/蓝透明度薄涂。
- **Don't** 让 #2E6FA3 或 #C97F1E 出现在常规尺寸文字色里；琥珀永远不做大面积填充。
- **Don't** 让正文或元信息小于 12px；11px 只活在徽章/pill 内部。
- **Don't** 发明第二个显示声部，或用 Barlow Condensed 渲染非日期内容。
- **Don't** 引入胶囊（999px）或大圆角；圆角只用 inner / element / container / page。
- **Don't** 把 `--dim` 写回 #5c6771；系统值为 #545F69，蓝薄涂底上必须保持 ≥4.5:1。

## Ownership

- 本文件拥有：颜色、字体、异常色语义、对比度、动效与 reduced-motion 原则。
- Astryx 主题拥有：组件几何、圆角、间距、状态外形、焦点环实现。
- 页面票据拥有：页面专属栅格（条目行、搜索双栏、详情双栏）与截图/图标尺寸。
- 冲突时：颜色 / 字体 / 异常语义以本文件为准；组件几何以 Astryx 为准。

---

## 5. 前端验收清单

### 5.1 对比度

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| C1 | 正文 / 空气底 | ≥4.5:1（墨 12.83，暗灰 5.53） |
| C2 | 蓝色文字 / 空气底 | ≥4.5:1（#245A87 = 6.16） |
| C3 | 琥珀文字 / 空气底 | ≥4.5:1（#824D0E = 5.90） |
| C4 | 故障红 / 空气底 | ≥4.5:1（#A5342B = 5.69） |
| C5 | 蓝底文字 | ≥4.5:1（空气 #E7EDF2 = 4.54；白 = 5.36） |
| C6 | 琥珀底文字 | ≥4.5:1（墨 = 4.71） |
| C7 | 大字 | 22px/600 风暴蓝可用；其余大字号 ≥3:1 |
| C8 | 非文本 UI | 焦点环、选中边界、输入边框 ≥3:1；禁用态豁免 |
| C9 | 蓝 9% 选中底 | 暗灰 ≥4.5:1（4.95） |
| C10 | 深色模式 | 固定 light；系统深色下不出现 Astryx 深色面板 |

### 5.2 焦点可见

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| F1 | 所有可交互元素 | `:focus-visible` 有 2px 风暴蓝轮廓，offset 2px |
| F2 | 墨色按钮 / 导航 | 焦点环落在空气底上，不在墨底内部；环与相邻色 ≥3:1 |
| F3 | 跳过链接 | Tab 第一下可见，激活后焦点进入 main |
| F4 | 行/卡片 | 整行可点时有唯一焦点目标；不要嵌套两个 tab stop |
| F5 | 灯箱 / Dialog | 打开后焦点进入；Esc 关闭；关闭后回到触发元素 |
| F6 | 移动抽屉 | 焦点陷阱；关闭后回到汉堡按钮 |
| F7 | 不允许 | `outline: none` 且无替代焦点样式 |

### 5.3 键盘可达

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| K1 | 顶部导航 | Tab 可达；Enter 激活；当前项 `aria-current="page"` |
| K2 | 团队 TabList | 左右箭头切换；Home/End；选中态明确 |
| K3 | 状态 SegmentedControl | 方向键切换；单选语义；标签可读 |
| K4 | Selector / DateInput | 打开、选择、清空均可用键盘完成 |
| K5 | 时间线 | 日期/团队是静态文本，不伪造按钮；条目链接可 Tab |
| K6 | 条目行 | 整行链接有可访问名称；行内按钮不吞掉行激活 |
| K7 | 灯箱 | 左右箭头切换；Esc 关闭；缩放有键盘路径 |
| K8 | 授权码 Dialog | 焦点陷阱、提交、取消、错误提示可读 |
| K9 | 页脚 | 状态点有文字标签；不靠颜色单独传意 |

### 5.4 reduced-motion

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| M1 | `prefers-reduced-motion: reduce` | 所有入场/位移/缩放动效关闭或降为 ≤200ms 淡入 |
| M2 | 骨架 | 静止；不脉冲 |
| M3 | Spinner | 静止或降级；不影响理解 |
| M4 | 分段控件 | 选中不滑动，直接切换 |
| M5 | 灯箱 | 无淡入/缩放；直接显示 |
| M6 | 折叠箭头 | 不旋转；状态仍可读 |
| M7 | gsap | `src/lib/motion.ts` 守卫仍生效；DOM 类名变化后选择器同步 |
| M8 | 信息完整性 | 关闭动效后不丢失任何状态或提示 |

### 5.5 琥珀只用于异常

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| A1 | 琥珀出现位置 | 只在待补全徽章、异常标题/原因、批次告警、异常计数 |
| A2 | 琥珀文字 | 常规尺寸只用 #824D0E；不用 #C97F1E 做正文 |
| A3 | 琥珀填充 | 只做小徽章/小标签底，承载墨字；不大面积铺底 |
| A4 | 非异常 | 悬停、焦点、主按钮、普通链接、普通标签不得出现琥珀 |
| A5 | 异常为空 | 异常区/告警不渲染，不留空琥珀框 |
| A6 | 自动化 | `tests/frontend/styles.test.ts` 继续守「琥珀只出现在异常类名」 |

### 5.6 Astryx 泄漏与主题

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| T1 | 默认蓝紫 | 页面无 Astryx 默认 #0064E0 / 紫色；focus、Badge、导航选中均来自 wxTheme |
| T2 | 默认主题 | 未引 `@astryxdesign/theme-neutral`；未叠加默认主题 |
| T3 | 状态推导 | 已显式写全 info/warning/error/success 的 text/on/muted；不出现推导出的陌生黄/蓝 |
| T4 | token 断言 | `tests/frontend/wxTheme.test.ts` 断言核心色值、字体、圆角、focus |
| T5 | doctor | `npx @astryxdesign/cli@0.7.16 doctor --built .` 无阻断项 |
| T6 | theme build | 生产构建使用 `theme build` 产物；升级后重跑 |
| T7 | 分类色 | 未使用 Badge 的 cyan/green/pink/purple/teal 变体；如出现，已被映射为中性 |
| T8 | 胶囊 | Badge / Token / Thumbnail 不是 999px 胶囊（头像/状态点除外） |
| T9 | 阴影/渐变 | 计算样式无 box-shadow / gradient；导航下划线除外 |

### 5.7 布局、状态与资产

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| L1 | 内容列 | 1440px；≥1180 内边距 32；≤1180 24；≤840 16 |
| L2 | 横向滚动 | 360 / 768 / 1024 / 1440 无横向滚动 |
| L3 | 导航折叠 | `md` 以下抽屉可用；768–860 过渡目检 |
| L4 | 条目行 | 68px 行高；≤860 塌成三列，包码/类目换行 |
| L5 | 搜索双栏 | ≤959 单栏；队列 sticky 在桌面可用 |
| L6 | 详情 | ≤860 单栏；截图 12px 间距；信息表 110px 标签列 |
| L7 | 空态 | 标题 + 说明 + 动作；无卡底；不是空白屏 |
| L8 | 加载 | 骨架形状匹配内容；不无限骨架；超时转错误 |
| L9 | 错误 | 404 / 503 / 接口错误有明确文案与恢复动作 |
| L10 | 图标 | 缺图有虚线空框/首字母回退；不出现破图 |
| L11 | 截图 | 有 alt；有宽高/比例防 CLS；灯箱可 Esc |
| L12 | 页脚 | 1px 顶线；44px 高；状态点有文字；近 7 天合计可读 |

### 5.8 建议的自动化断言

- `tests/frontend/wxTheme.test.ts`：核心 token 值、字体栈、圆角、focus、status 三角色。
- 组件渲染快照：Badge 五种状态、TopNav 选中、SegmentedControl 选中、Skeleton、EmptyState。
- 计算样式检查：`box-shadow === 'none'`、`background-image === 'none'`、无 999px 胶囊（允许头像/状态点）。
- 键盘脚本：Tab 到跳过链接、导航、TabList、DateInput、Lightbox、Dialog。
- reduced-motion 脚本：模拟 `prefers-reduced-motion: reduce`，断言动画名为 `none` 或时长为 0。
- 对比度脚本：解析 wxTheme token，跑本文 5.1 的组合。

---

## 6. 冲突与风险

| 级别 | 冲突 / 风险 | 说明 | 建议 |
| --- | --- | --- | --- |
| 高 | AppShell 没有 footer 插槽 | ARCH §4.1 写“页脚用壳自带布局”，但 0.7.16 AppShell 只有 banner/topNav/sideNav/mobileNav/children；`Layout` 才有 footer | FE-2 用 `Layout` footer 或页尾 `Section`；接受页脚在 `<main>` 内，或另开票据讨论页面级 contentinfo |
| 高 | 状态角色自动推导 | 只改 `--color-warning` 不写 `--color-text-warning`，Astryx 会从 fill 推导文字色，可能不是 #824D0E | 写全 4 个状态 × 7 个角色；用 `wxTheme.test.ts` 断言 |
| 高 | 固定 light 模式 | DESIGN 无深色方案；Astryx 默认 `light-dark()` | `<Theme mode="light">` + 所有颜色 tuple 双值相同；未来做深色再开 |
| 高 | TopNav 选中是填充胶囊 | 与现版 2px 下划线签名冲突 | 组件覆盖 `top-nav-item` 的 `selected` 为透明底 + 下划线；升级时重点回归 |
| 中 | TopNav 高度/间距不可完全 token 化 | TopNav 高度由 item padding + 内容决定；leftSection gap 16 不在公开 token 里 | 覆盖 `top-nav` / `top-nav-item` 的 minHeight/padding；间距用 `Stack` 包裹；接受少量偏差 |
| 中 | Badge 默认胶囊 | 20px 高、999px 圆角、12/500 | 覆盖到 4px / 24px / 12/600；自定义 miss/exception 变体 |
| 中 | Skeleton 0.25 透明度 | 直接设 `--color-skeleton` 为 5% 墨会变成 1.25% | 组件覆盖 opacity 1 + 5% 墨底；或 token 取 #B7BDC6 近似 |
| 中 | AppShell sticky 头 | `height="auto"` 下头部 sticky，现版随页面滚走 | 接受（长页面更实用）或覆盖 `position: static`；在 FE-2 目检确认 |
| 中 | 页脚底部锚定 | 现版竞品页用 flex + `margin-top: auto` 把 44px 页脚压到视口底；Astryx `height="auto"` 下内容短时页脚紧跟内容 | 页面级 `min-height` 包裹，或竞品页改用 `height="fill"`；搜索页本来无页脚 |
| 中 | 断点不一致 | Astryx 640/768/1024/1280/1536；页面 1180/959/860/840 | 壳用 `md`，页面保留旧断点；768–860 过渡必须目检 |
| 中 | 字体未加载 700 | 现网只请求 400/500/600，且 `font-synthesis: none` | 统一 600；或补载 700 并更新字体链接 |
| 中 | Barlow 只在竞品页加载 | 单入口后容易变成全站加载；搜索页本不该加载 | FE-8 收口时按路由懒加载，或接受小成本全站加载 |
| 中 | 分类色泄漏 | Astryx 默认青/绿/粉/紫仍在 token 里 | 未使用分类映射为中性；禁止非语义 Badge 变体；T7 验收 |
| 中 | 搜索页 1600 vs 实际 1440 | DESIGN 旧稿写 1600，现网 `.workspace-frame` 是 1440 | 统一 1440；DESIGN 收缩稿已改 1440 |
| 低 | 3px / 6px / 12px 圆角 | 不在 Astryx token 阶梯 | 接受 4 / 8，或组件覆盖；不要为散点值改全局阶梯 |
| 低 | 灯箱遮罩 0.88 / 0.94 | 两页漂移，Astryx 只有一个 `--color-overlay` | 统一 0.90；记录为已接受的漂移 |
| 低 | 团队过滤用 TabList | TabList 默认是导航语义，团队过滤更像输入 | 按 ARCH 用 TabList；若语义评审要求，改 SegmentedControl（需同步 ARCH） |
| 低 | `TopNavHeading` 17/600 | 品牌现版 15/700 | 自定义品牌链接，或接受 17/600 |
| 低 | 运行时主题首帧闪色 | 未 build 的 defineTheme 在 hydration 注入样式 | 生产用 `theme build`；开发期接受 |
| 低 | `Thumbnail` 只支持方形 | 截图是竖屏 | 图标用 `Thumbnail`；截图用普通图片 + `Lightbox` |

---

## 7. 核对来源

- `npx @astryxdesign/cli@0.7.16 docs tokens`、`docs tokens/tokens-color`、`docs tokens/tokens-typography`、`docs tokens/tokens-radius`、`docs tokens/tokens-type-scale`、`docs tokens/tokens-focus`、`docs tokens/tokens-shadow`、`docs tokens/tokens-spacing`、`docs tokens/tokens-size`、`docs tokens/tokens-duration`
- `npx @astryxdesign/cli@0.7.16 docs author-a-theme --full`、`docs use-a-theme --full`、`docs shape --full`、`docs color --full`、`docs typography/font-setup`
- `npx @astryxdesign/cli@0.7.16 theme targets`
- `npx @astryxdesign/cli@0.7.16 component AppShell|TopNav|TopNavItem|TopNavHeading|Badge|Divider|Text|Timestamp|Skeleton|EmptyState|StatusDot|TabList|SegmentedControl|Thumbnail|Lightbox|Dialog`
- `@astryxdesign/core@0.7.16` 源码核对：AppShell / TopNav / TopNavItem / Badge / Divider / Skeleton / Theme / tokens
- 现网样式核对：`src/styles.css`、`src/competitor/competitor.css`、`index.html`、`search.html`
