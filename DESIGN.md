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

# Design System: App搜索工作台 · 竞品气象台

## Overview

**Creative North Star: “竞品气象台”**

竞品日报（`/`）是首页，App Store 搜索（`/search`）是第二页；竞品详情（`/package/:code`）属于竞品侧。三张路由共用同一套 Astryx `AppShell` 与 `wxTheme`：一片平涂的空气色底（#E7EDF2），没有浮卡、没有灰上灰；分区靠一像素规线，深度靠墨色透明度薄涂，阴影和渐变为零。数据是唯一主角：数字、包码、日期串用 IBM Plex Mono + tabular-nums；中文正文用 Noto Sans SC；Barlow Condensed 只用于时间线日期。

组件外观由 Astryx 主题接管。主题实现在 `src/theme/wxTheme.ts`（固定 light），壳内容列与内边距在 `src/app/shell.css`；设计与验收基线见 `docs/design/astryx-theme.md`。本文件只定义颜色、字体、异常色语义、对比度与 Do/Don't；组件几何、圆角、间距、状态外形一律以 Astryx 主题为准。

**Key Characteristics:**

- 平涂空气底（#E7EDF2）承托全部内容；无卡片容器、无灰上灰、无阴影、无渐变
- 一像素规线（rgba(28,39,51,0.16)，强调 0.3）是唯一的分区语言
- 风暴蓝（#2E6FA3）只给命中与交互；警戒琥珀（#C97F1E）只给异常席位；常规文字用加深变体
- 等宽数字层（IBM Plex Mono · tabular-nums）承载全部数据；正文与元信息下限 12px
- 固定 light 模式；主题把未使用的分类色（青/绿/粉/紫/teal）映射为中性，页面不得引入绿色或彩色状态

## Colors

两色职能分立：蓝色管命中与交互，琥珀管异常；两者都有专用加深文字变体，线色本身不染正文。

### Primary

- **风暴蓝 Storm Blue** (#2E6FA3)：命中与交互的唯一直彩色。用于命中实心徽章、主操作填充、焦点轮廓、选中/悬停薄涂、选中日期与状态点。作为常规文字只有 4.54:1，禁止用于正文；文字蓝一律用加深变体。
- **风暴蓝文字变体** (#245A87)：一切常规尺寸的蓝色文字，空气底上 6.16:1。

### Secondary

- **警戒琥珀 Amber** (#C97F1E)：异常专用。待补全徽章底、异常状态点、批次告警竖线、异常条；作为常规文字只有 2.72:1，禁止用于正文。
- **警戒琥珀文字变体** (#824D0E)：异常标题、异常原因、批次告警正文、统计行异常数字，空气底上 5.90:1。
- 琥珀小徽章承载墨字（#1C2733 on #C97F1E = 4.71:1）。

### Neutral

- **空气底 Air** (#E7EDF2)：唯一背景色。
- **墨 Ink** (#1C2733)：正文与反相表面底色，空气底上 12.83:1。一切透明度薄涂由它派生。
- **暗灰 Dim** (#545F69)：二级说明、包码、计数；空气底上 5.53:1，蓝 9% 薄涂上 4.95:1。
- **故障红 Danger** (#A5342B)：失败徽章与错误提示，空气底上 5.69:1；只出现在失败/错误语境。
- **淡墨 Faint** (rgba(28,39,51,0.38))：缺图虚线框、未命中徽章描边、禁用文字与图标。
- **规线** (rgba(28,39,51,0.16))：默认 1px 分隔线；**强调规线** (rgba(28,39,51,0.3))：需要更强边界的面板/输入描边与强调分隔。
- **白** (#FFFFFF)：只用于故障红底的反相文字（#FFFFFF on #A5342B = 6.72:1）。风暴蓝实心底上的反相文字是空气色 #E7EDF2（4.54:1），不要用白。
- 主题把 `success` 映射为风暴蓝；产品没有成功状态语义，页面不得引入绿色。

### 状态色语义

| 状态 | 颜色 | 形态 |
| --- | --- | --- |
| 命中 | 风暴蓝 #2E6FA3 底 + 空气字 #E7EDF2 | 实心徽章 |
| 未命中 | 透明底 + 淡墨虚线 + 暗灰字 #545F69 | 虚线描边徽章 |
| 待补全 | 琥珀 #C97F1E 底 + 墨字 #1C2733 | 实心徽章 |
| 异常 | 透明底 + 琥珀描边 + 琥珀文字 #824D0E；汇总处只用琥珀文字与竖线 | 描边徽章 / 异常数字 / 告警条 |
| 失败 | 故障红 #A5342B 文字 / 红 10% 底 | 错误徽章 / 文案 |
| 中性计数 | 墨 6% 底 + 墨字 | 只做计数与标签，不做状态 |

### Named Rules

**The Split-Voice Rule.** 线块点色与正文文字色分立：#2E6FA3 与 #C97F1E 不出现在常规尺寸文字里；正文蓝/琥珀一律用加深变体 #245A87 / #824D0E。琥珀小徽章底可承载墨字。蓝色实心底只用空气色文字。

**The Calm Air Rule.** 琥珀只出现在异常席位：待补全徽章、异常标题/原因、批次告警竖线、异常计数。异常区与告警只在非空/异常时渲染；琥珀永远不做大面积填充。

## Typography

**正文：** Noto Sans SC（回退 PingFang SC, Hiragino Sans GB, Microsoft YaHei）
**数据：** IBM Plex Mono（回退 ui-monospace 栈），恒开 tabular-nums
**日期：** Barlow Condensed（回退 Arial Narrow, Helvetica Neue），只用于时间线日期

字重只用 400 / 500 / 600；`index.html` 的字体请求也只加载这三档（Barlow 为 500/600），页面与主题不使用 700。

### Hierarchy

- **Display**：Barlow Condensed 600，28px，line-height 1，letter-spacing 0.01em，tabular-nums；只用于时间线日期。
- **Headline**：Noto Sans SC 600，24px，line-height 1.2；详情页竞品名。
- **Title**：Noto Sans SC 600，20px，line-height 1.2；页首 h1。空态标题 17px/600。
- **Body**：Noto Sans SC 400，14px，line-height 1.5；正文基准。条目名 15px/600，团队名 14px/600。
- **Data**：IBM Plex Mono 400–600，12px，tabular-nums；包码、元信息、日期串、版本号、页脚状态。统计数字 22px/600。
- **Label**：Noto Sans SC 600，12px；徽章与标签。11px 只允许出现在徽章/pill 内部；正文与元信息不小于 12px。

### Named Rules

**The Data-Mono Rule.** 一切数字、包码、日期串、版本号都必须走 IBM Plex Mono + tabular-nums。sans 声部从不渲染数据，数据声部从不渲染中文叙述。

**The One Display Voice Rule.** Barlow Condensed 是唯一的显示声部，且只用于日期。搜索页不使用它（字体文件目前由单入口全局加载，不改变用途限制）。不要再发明第二个被放大的字族。

## Layout

单列纵向文档流，三张路由共用 Astryx `AppShell` 的 1440px 内容列。

- **内容列**：最大 1440px，水平居中；顶部导航与页面内容共用同一列。竞品日报、App Store 搜索、竞品详情都落在这一列内；详情页不再另收窄到 1200px。
- **页内边距**：>1180px 为 32px；≤1180px 为 24px；≤840px 为 16px。详情页在 ≤860px 提前切到 16px。
- **断点**：页面内容使用 1180 / 959 / 860 / 840 / 640 五档；壳的移动导航在 Astryx `md`（768px）折叠。
- **流**：单列，不做多栏瀑布。双栏、行高、图标尺寸、页脚高度等组件几何由 Astryx 主题与页面票据定义，不在本文件重复。

## Elevation & Depth

零阴影、零渐变。深度只由墨色/风暴蓝透明度薄涂表达：悬停、按下、选中、骨架与灯箱遮罩都走主题 token，页面不硬编码新的阴影或透明层。焦点是唯一的“浮起”时刻：2px 风暴蓝轮廓，offset 2px。

**The Flat-Ground Rule.** 任何表面都不许用 box-shadow 或渐变制造高度。唯一例外是导航当前项的下划线：`inset 0 -2px 0 #1C2733`，用阴影语法画的一条 2px 规线，不构成海拔。

## Shapes

圆角角色沿用 Astryx：`inner` 2px、`element` 4px、`container` 8px、`page` 16px；`full`（9999px）只保留给头像与状态点。徽章、标签、缩略图不得是胶囊；页面不另立全局圆角阶梯，组件级例外以 Astryx 覆盖为准。

## Accessibility

| 组合 | 对比度 | 用途 |
| --- | --- | --- |
| 墨 #1C2733 / 空气 #E7EDF2 | 12.83:1 | 正文 |
| 文字蓝 #245A87 / 空气 | 6.16:1 | 常规蓝色文字 |
| 风暴蓝 #2E6FA3 / 空气 | 4.54:1 | 非文本 UI：焦点环、图标、边界、状态点 |
| 琥珀文字 #824D0E / 空气 | 5.90:1 | 异常文字 |
| 暗灰 #545F69 / 空气 | 5.53:1 | 二级文字 |
| 故障红 #A5342B / 空气 | 5.69:1 | 错误文字 |
| 空气 #E7EDF2 / 风暴蓝 #2E6FA3 | 4.54:1 | 命中徽章 |
| 墨 #1C2733 / 琥珀 #C97F1E | 4.71:1 | 待补全徽章 |
| 暗灰 #545F69 / 蓝 9% 薄涂 | 4.95:1 | 选中行上的次级文字 |
| 白 #FFFFFF / 故障红 #A5342B | 6.72:1 | 红底反相文字 |

正文 ≥4.5:1；大字（≥18.66px 粗体或 ≥24px）≥3:1；非文本 UI 边界与焦点 ≥3:1。焦点环落在墨色表面上只有 2.82:1，必须用 offset 让环落在空气底上。主题固定 `mode="light"`，系统深色模式不得翻出 Astryx 深色面板。

## Do's and Don'ts

### Do

- **Do** 一切数字、包码、日期串走 IBM Plex Mono + tabular-nums（The Data-Mono Rule）。
- **Do** 常规尺寸的蓝/琥珀文字用加深变体 #245A87 / #824D0E；风暴蓝本体只做填充、描边、图标与焦点。
- **Do** 用 1px 规线分隔区块；悬停用墨 0.06 薄涂。
- **Do** 琥珀只用于异常；异常区/告警只在非空/异常时渲染。
- **Do** 把“异常”按未命中 + 待补全合并口径统计，并保持批次告警只在异常日出现。
- **Do** 新动效先接 `prefers-reduced-motion`；灯箱、骨架、抽屉都要有静止态。

### Don't

- **Don't** 使用阴影、渐变、卡片容器或灰上灰；深度只来自墨/蓝透明度薄涂。
- **Don't** 让 #2E6FA3 或 #C97F1E 出现在常规尺寸文字色里；琥珀永远不做大面积填充。
- **Don't** 让正文或元信息小于 12px；11px 只活在徽章/pill 内部。
- **Don't** 发明第二个显示声部，或用 Barlow Condensed 渲染非日期内容。
- **Don't** 引入胶囊（999px）或超出角色阶梯的大圆角；`full` 只给头像与状态点。
- **Don't** 在风暴蓝实心底上使用白字；蓝底反相文字用空气色，白只给故障红底。
- **Don't** 使用 `success` 绿色，或引入青/绿/粉/紫等非语义状态色。
- **Don't** 把 `--dim` 写回 #5c6771；系统值为 #545F69，蓝薄涂底上必须保持 ≥4.5:1。

## Ownership

- 本文件拥有：颜色、字体、异常色语义、对比度、零阴影原则与 reduced-motion 原则。
- Astryx 主题拥有：组件几何、圆角、间距、状态外形、焦点环实现；实现见 `src/theme/wxTheme.ts`。
- 页面票据拥有：页面专属栅格、图标与截图尺寸。
- 冲突时：颜色 / 字体 / 异常语义以本文件为准；组件几何以 Astryx 为准。
