---
name: App搜索工作台 · 竞品气象台
description: 两页工作台（App Store 搜索 + 竞品日报）共用的气象台世界——平涂空气底、墨色文字、一像素规线、等宽数据层、零阴影零渐变
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
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: 0.9
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "20px"
    fontWeight: 700
  body:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans SC, PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontFeature: "tabular-nums"
rounded:
  xs: "2px"
  sm: "3px"
  seg: "4px"
  md: "8px"
  lg: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "36px"
components:
  date-tag:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.air}"
    rounded: "{rounded.xs}"
    padding: "4px 10px"
    typography: "{typography.label}"
  badge-hit:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.air}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
    typography: "{typography.label}"
  badge-pending:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
    typography: "{typography.label}"
  badge-miss:
    textColor: "{colors.dim}"
    rounded: "{rounded.sm}"
    padding: "4px 12px"
    typography: "{typography.label}"
  badge-exception:
    textColor: "{colors.amber-text}"
    rounded: "{rounded.xs}"
    padding: "3px 9px"
    typography: "{typography.label}"
  stat-numeral:
    textColor: "{colors.blue}"
    typography: "{typography.data}"
  text-action:
    textColor: "{colors.blue-text}"
    typography: "{typography.data}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.air}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "7px 14px"
    typography: "{typography.data}"
  seg-button:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    height: "30px"
    padding: "0 12px"
    typography: "{typography.data}"
  seg-button-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.air}"
    height: "30px"
    padding: "0 12px"
    typography: "{typography.label}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    rounded: "{rounded.xs}"
    padding: "4px 9px"
    typography: "{typography.data}"
  chip-active:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "4px 9px"
    typography: "{typography.data}"
  forecast-bar:
    backgroundColor: "rgba(28, 39, 51, 0.55)"
    width: "26px"
  forecast-bar-main:
    backgroundColor: "{colors.blue}"
    width: "48px"
  forecast-bar-zero:
    width: "30px"
---

# Design System: App搜索工作台 · 竞品气象台

## Overview

**Creative North Star: "竞品气象台"**

两页共用的一个世界：竞品日报是首页（`index.html` + `src/competitor/competitor.css`），App Store 搜索在 `search.html` + `src/styles.css`。`competitor.html` 只跳回首页。整个工作台是一片平涂的空气色底（#E7EDF2），没有浮卡、没有灰上灰：所有分区靠一像素细规线分隔，所有深度靠墨色透明度薄涂表达，阴影和渐变为零。数据是唯一的主角——每一个数字、包码、日期都以 IBM Plex Mono 的 tabular-nums 等宽数字呈现，形成可纵向对齐读的「仪表读数层」；中文正文用 Noto Sans SC 安静铺底；Barlow Condensed 是唯一被放大的显示声部，只用于日期（搜索页甚至不加载它）。

两页同构的顶部导航壳（54px 高、1px 底规线、22×22 墨底预报标——两根空气柱加一根风暴蓝主柱、当前 tab `inset 0 -2px 0` 墨色下划线）把工作台钉成一个产品。favicon 用同一枚标。竞品页只有一条时间线：已有的日期从新到旧，没有包的日子不出现，日期是静态标记不能折叠。每一天里按团队分块，团队名是一行字（名称和包数），不是按钮。异常包留在自己的团队下面。顶上用团队标签过滤，默认「全部」。类目、状态、日期只做筛选。日期是已有日期的下拉，默认「全部日期」，选项带当天包数；不使用系统日期框，也不能选到没有包的日子。页首 h1 仍是「竞品日报」。统计行是 mono 22px（异常 = 未命中 + 待补全）。

**Key Characteristics:**

- 平涂空气底（#E7EDF2）承托两页全部内容；无卡片容器、无灰上灰、无阴影、无渐变
- 两页同构 54px 导航壳；一像素规线（rgba(28,39,51,0.16)，强调 0.3）是唯一的分区语言
- 风暴蓝（#2E6FA3）只给命中与交互；警戒琥珀（#C97F1E）只给异常席位；文字用加深变体
- 等宽数字层（IBM Plex Mono · tabular-nums）承载全部数据；正文下限 12px
- 动效克制：骨架脉冲 1.2s、折叠箭头 120ms、搜索页控件过渡 140ms、灯箱淡入 180ms；`prefers-reduced-motion` 下 CSS 动效全部关闭

**范围说明：** 本文件覆盖全工作台两个页面。两页各自样式自含（`src/competitor/main.ts` 不再 import `src/styles.css`）。已知页面间漂移：灯箱遮罩搜索页 0.94 / 竞品页 0.88。

## Colors

两色职能分立的世界：蓝色管「命中与操作」，琥珀管「异常」，两者都有专用的加深文字变体，线色本身不染正文。

### Primary

- **风暴蓝 Storm Blue** (#2e6fa3)：命中与交互的唯一直彩色。命中徽章底、主格预报柱、范围选中涂染、focus 轮廓、状态点、IPA 下载按钮底。以线、块、点的方式出现；唯一的文字席位是统计行的命中大数字（22px/600 大字号，空气底上 ≈4.5:1，大字号 AA 达标）。
- **风暴蓝文字变体** (#245a87)：一切常规尺寸的蓝色文字（文字操作链接、详情返回、区间内日期、主格包数），在空气底上 6.16:1（AA 达标）。

### Secondary

- **警戒琥珀 Amber** (#c97f1e)：异常专用。批次告警左侧 1px 竖线、异常状态点、待补全徽章底、统计行「异常」小标签底。作为正文文字色会只有 2.72:1（不达标），所以它只出现在线、点和**小徽章底**上——小徽章内承载墨字（#1c2733 on #c97f1e = 4.7:1，AA 达标）。
- **警戒琥珀文字变体** (#824d0e)：异常标题、异常原因、批次告警正文、统计行异常大数字，在空气底上 5.9:1（AA 达标）。

### Neutral

- **空气底 Air** (#e7edf2)：两页唯一背景色，从 html 到 body 平涂到底。
- **墨 Ink** (#1c2733)：全部正文与主按钮底色，在空气底上 12.83:1。一切透明度薄涂（规线 0.16/0.3、悬停 0.06、主格 0.05、柱 0.55、遮罩 0.88–0.94）都由它派生。
- **暗灰 Dim** (#545f69)：次要说明、包码、计数等大量二级文字。空气底上 5.5:1；在蓝薄涂底（rgba(46,111,163,0.09)）上 ≈4.95:1，仍 ≥4.5:1——这正是由旧值 #5c6771（蓝薄涂上仅 4.38:1）加深的原因，两张样式表现均已同步。
- **故障红 Danger** (#a5342b)：搜索失败徽章与错误提示文字（空气底上 5.7:1），只出现在失败/错误语境。
- **淡墨 Faint** (rgba(28,39,51,0.38))：缺数据占位的 1px 虚线图标框、分段控件外框。
- **规线** (rgba(28,39,51,0.16))：默认 1px 分隔线；**强调规线** (rgba(28,39,51,0.3))：幽灵按钮描边、异常区外框、柱底基线。
- **白** (#ffffff)：蓝底徽章文字（5.36:1，AA 达标；搜索页状态徽章用纯白，竞品页徽章用空气色）。

### Named Rules

**The Split-Voice Rule.** 线块点色与正文文字色分立：#2e6fa3 与 #c97f1e 不出现在常规尺寸的文字颜色里，正文蓝/琥珀一律用加深变体 #245a87 / #824d0e。已录例外只有两处——统计行的命中大数字可用风暴蓝本体（22px/600 大字号），琥珀可作小徽章/小标签底色承载墨字。任何新文字席位都先算对比度（正文 ≥4.5:1）。

**The Calm Air Rule.** 琥珀只出现在异常的固定席位上：统计行异常标签、待补全徽章、异常区标题、批次告警竖线。异常区与告警横幅只在非空/异常时渲染；琥珀永远不做大面积填充。

## Typography

**显示字体（日期声部）：** Barlow Condensed（回退 Arial Narrow, Helvetica Neue；仅竞品页加载）
**正文字体：** Noto Sans SC（回退 PingFang SC, Hiragino Sans GB, Microsoft YaHei）
**数据字体：** IBM Plex Mono（回退 ui-monospace 栈），恒开 tabular-nums

三声部各司其职：Barlow Condensed 负责被放大的日期（页面唯一的显示性时刻），Noto Sans SC 负责一切中文叙述，IBM Plex Mono 负责一切可对齐读的数字。字重只用了 400 / 500 / 600 / 700，没有更重的字重。

### Hierarchy

- **Display** (Barlow Condensed 600, 28px, line-height 1, tabular-nums)：时间线每一天的日期。不再使用页首 48px 大日期。
- **Headline** (Noto Sans SC 600, 24px, line-height 1.2)：详情页竞品名。
- **Title** (Noto Sans SC 700, 20px)：竞品页 h1「竞品日报」与搜索页空态标题；空态/错误卡标题为 17px/600，搜索页结果面板头 16px/600。
- **Body** (Noto Sans SC 400, 14px, line-height 1.5)：正文基准。条目名 15px/600，组名 14px/700，小节标题 13px/600。
- **Data** (IBM Plex Mono 400–500, 12px, tabular-nums)：包码、元信息、日期串、版本号、页脚状态——两页占比最大的一个声部。放大的等宽数字：统计行 22px/600、主格包数 24px/600。
- **Label** (Noto Sans SC 600, 12px)：徽章与标签文字。11px 只允许出现在徽章/pill 内部（「昨日」小签、包数小签、状态徽章、候选卡 tag），正文与元信息永不小于 12px。

### Named Rules

**The Data-Mono Rule.** 一切数字、包码、日期串、版本号都必须走 IBM Plex Mono + tabular-nums。sans 声部从不渲染数据，数据声部从不渲染中文叙述。

**The One Display Voice Rule.** Barlow Condensed 是唯一的显示声部，且只用于日期；搜索页连字体都不加载。不要再发明第二个被放大的字族；放大即日期，日期即放大。

## Layout

单列纵向文档流。顶部导航壳两页同构：54px 高、1px 底规线、22×22 三柱蓝 SVG 品牌 + 15px/700 品名、tab 14px（当前项墨色 600 + 2px 下划线）、搜索页右侧多一枚等宽区域码（如 US）。内容壳：搜索页 `min(1600px, 100%)` 内边距 40px（≤1180px 24px、≤840px 16px）；竞品页 1440px 内边距 32px（≤1180px 24px）。密度是数据密：分组纵列平铺，不设多栏瀑布。

- **统计行**（竞品页）：页首下方一行四个统计（包总数 / 竞品数 / 命中 / 异常），项间 1px 规线分隔、内边距 0 26px，异常 = 未命中 + 待补全合并口径。
- **时间线**（竞品页）：统计行之下按日竖轨，新的在上。日期是 Barlow 静态标记加当天包数，团队在日期下面一行字。没有柱状日期轴，日期和团队都不能折叠。
- **竞品条目**（竞品页）：网格 `44px(图标列) + minmax(160px,210px)(名称) + minmax(220px,330px)(包码) + minmax(140px,1fr)(类目/版本) + auto(徽章)`，列距 16px，行高 68px，行间以 1px 规线分隔。≤1180px 收窄列宽；≤860px 塌成 `44px 1fr auto` 三列，包码与类目换行到第二行。
- **搜索工作台**（搜索页）：结果区为 `280px 结果队列 + minmax(0,1fr) 检查器` 双栏，队列以 1px 右规线分隔、sticky；≤959px 塌成单栏、队列转折叠 summary 行。结果行 `40px(图标) + 1fr(名称/副题)`，等宽 meta 12px。
- **详情页**（竞品页）：内容最大宽 1200px，双栏 `1.1fr / 0.9fr`、栏距 36px（≤860px 单栏）；信息表为 `110px 标签列 + 1fr`；截图网格 `auto-fill, minmax(180px, 1fr)`、间距 12px。
- **页脚**（竞品页）：一条 1px 规线之下 44px 高的等宽批次状态细线（8px 墨点 + 一句话）+ 右侧近 7 天合计与口径说明。
- **间距节奏**：小步进为主（4/6/8/10/12/14/16/18/24/32），区块间隔 22–36px；没有大块留白，靠规线而不是空白来换气。

## Elevation & Depth

零阴影、零渐变。深度全部由墨色透明度薄涂表达：悬停墨 0.06、结果行悬停/选中蓝 0.06 / 0.1、主格底 0.05、区间选中蓝 0.09（主格 0.15）、普通柱 0.55、骨架 0.04–0.05、图标占位 0.08、候选卡 tag 蓝 0.13、灯箱遮罩墨 0.88（竞品页）/ 0.94（搜索页）。焦点是唯一的「浮起」时刻：`outline: 2px solid #2e6fa3, offset 2px`。

### Named Rules

**The Flat-Ground Rule.** 任何表面都不许用 box-shadow 或渐变制造高度。全库唯一的 box-shadow 是导航 tab 当前项的下划线（`inset 0 -2px 0 #1c2733`）——那是用阴影语法画的一条规线，不是海拔。

## Shapes

近方形世界：2px 圆角给 tag、pill、chip 与幽灵按钮；3px 给命中/待补全徽章与搜索页按钮、输入框；4px 给两页分段控件；8px 给条目图标与搜索页灯箱滑片；16px 只给详情页大图标（84px）。灯箱滑片竞品页为 12px、截图触发器搜索页 6px，是已录的页面级例外。缺数据一律 1px 虚线（faint）空框，诚实的空位而不是假占位。预报柱顶端 1px 圆角；零包日不是零高柱，而是一段 30px 宽、顶边 4px 虚线（faint）的透明基线。

### Named Rules

**The One-Pixel Rule.** 分隔永远是一根 1px 规线，绝不是卡片边缘、阴影或额外背景块。要分组，先画线。

## Components

### 导航壳（签名组件）

- **形态**：54px 高横条，1px 底规线。品牌 = 22×22 墨底预报标（#1C2733 底板，两根 #E7EDF2 柱，右侧主柱 #2E6FA3）+ 15px/700 品名；两个 tab 14px，dim 底色，悬停转墨。浏览器图标是同一枚标。
- **当前项**：墨色 600 + `inset 0 -2px 0 #1c2733` 下划线 + `aria-current="page"`。两页同一份规格。

### 时间线（签名组件）

- **形态**：左 1px 竖轨，日期前一颗 7px 墨点。日期是 Barlow Condensed 28px，旁边等宽包数。其下每个团队一行：名称 14px/700，包数等宽 12px。行不是按钮，没有箭头。
- **顺序**：已有包的日期从新到旧。没有包的日子不出现，也不补空白天。同一天内团队按包数从多到少。
- **过滤**：顶上团队标签，默认「全部」，选中后时间线只留该团队。类目下拉、状态分段、日期下拉只筛行。日期下拉只列出已有包的日子，从新到旧，默认「全部日期」。异常包留在所属团队下面，不另开底部异常区。

### 统计行

- **形态**：页首之下一行四项（包总数 / 竞品数 / 命中 / 异常），项间 1px 规线分隔；数字为等宽 22px/600 tabular-nums，标签 12px dim。
- **色彩**：包总数、竞品数为墨；命中数字为风暴蓝本体（大字号 AA）；异常数字为琥珀文字变体，标签为琥珀底墨字小签。异常 = 未命中 + 待补全合并口径，由分组数据汇总。

### 分段控件（口径/分组/状态/筛选）

- **形态**：1px 淡墨（faint）外框、4px 圆角、零内距排布。竞品页按钮 13px、padding 6px 14px；搜索页筛选片 30px 高、12px 字、padding 0 12px、首片无左边线。
- **状态**：竞品页悬停只转墨字；搜索页悬停墨 0.06 薄涂。激活项一律墨底反白（`#1c2733` 底 + 空气色文字，字重 600），并同步 `aria-pressed`。状态分段激活项带实时计数（如「命中 12」）。

### 徽章

- **命中**：蓝底空气色字（#2e6fa3 / #e7edf2，12px/600，3px 圆角，4px 12px 内边距）。搜索页状态徽章为蓝底白字、2px 圆角、2px 9px 内边距。
- **待补全**：琥珀底墨字（#c97f1e / #1c2733 = 4.7:1），同命中形制。
- **未命中**：1px 虚线 faint 描边 + dim 文字。
- **详情页异常**（bundle_not_found / 详情不全）：透明底 + 1px 琥珀描边 + 琥珀文字变体。
- **搜索失败**：红薄涂底（rgba(165,52,43,0.1)）+ 故障红文字。

### 竞品条目行

- **形态**：44px 图标列内 36px 圆角 8 图标（缺图标为 1.5px 虚线空框或首字母等宽回退、蓝薄涂底）+ 15px/600 名称（多包附 11px 等宽「N 个包」pill）+ 等宽 13px 包码 + dim 元信息 + 命中蓝徽章。
- **状态**：悬停蓝 0.06 薄涂；整行可点进详情。组头（chevron + 组名 14px/700 + 等宽「N 包」+ 右对齐等宽「命中 n · 异常 n」，箭头旋转 120ms）也遵循同一悬停语言。

### 搜索结果行

- **形态**：40px 圆角 8 图标（占位为墨 0.08 底）+ 15px/600 名称 + 13px dim 副题 + 等宽 12px meta + 11px 状态徽章，行间 1px 规线。
- **状态**：悬停蓝 0.06 薄涂，选中 0.1；行内按钮区在名称下方缩进对齐（margin-left 52px）。

### 主按钮（搜索页）

- **形态**：墨底空气色字、3px 圆角、36px 高、padding 0 14px、13px/600；悬停墨微亮（#2a3847）。IPA 下载为蓝底白字变体（悬停 #3b7fb5）。次级按钮 = 1px 强调规线描边 + 透明底 + 墨字 500，悬停墨 0.06 薄涂。

### 幽灵按钮（竞品页）

- 透明底 + 1px 强调规线描边 + 2px 圆角 + 7px 14px 内边距，12px 墨字；悬停描边转纯墨。重试、空态动作用它。

### 文字操作链接

- 12px 蓝文字变体 + 1px 下划线（offset 3px），悬停转墨。清除筛选、添加应用、详情返回都用它。

### 灯箱

- 深墨遮罩（搜索页 0.94 / 竞品页 0.88），说明文字与计数走等宽声部；关闭为描边小按钮；图片 180ms 淡入，占位 spinner 800ms 线性旋转。竞品页滑片 12px 圆角、搜索页 8px。

### 空态 / 错误 / 加载

- 空态与错误卡无卡底，以 1px 规线开区：17px/600 标题 + dim 13px 说明 + 幽灵按钮动作组。加载骨架为墨色 0.05 条块 1.2s 脉冲（reduced-motion 下静止）。搜索页空态以一枚 22×3 蓝条作墨字之上的唯一色点缀。

### 动效补充（搜索页）

- 搜索页内容入场用 gsap 做轻微上浮/淡入（0.12–0.5s，小错峰）。注意：当前实现未接 `prefers-reduced-motion` 守卫，属待修缺陷；新表面若做入场动效，必须带守卫，勿效仿现状。

## Do's and Don'ts

### Do:

- **Do** 一切数字、包码、日期串走 IBM Plex Mono + tabular-nums（The Data-Mono Rule）。
- **Do** 常规尺寸的蓝/琥珀文字一律用加深变体 #245a87 / #824d0e；大字号数字（22px/600+）可用风暴蓝本体。
- **Do** 用 1px 规线分隔一切区块；悬停用墨色 0.06（或蓝 0.06）薄涂表达。
- **Do** 保持柱高严格由 `Math.round(count / max × 112px)` 推导，主格 1.9 倍宽、48px 蓝柱；统计行异常按「未命中 + 待补全」合并口径。
- **Do** 异常区与批次告警只在非空/异常时渲染（The Calm Air Rule）。
- **Do** 新动效先接 `prefers-reduced-motion` 再谈节奏；已录节奏：柱 260ms、骨架 1.2s、箭头 120ms、控件 140ms、灯箱 180ms。

### Don't:

- **Don't** 使用阴影、渐变、卡片容器或灰上灰——深度只来自墨/蓝透明度薄涂（The Flat-Ground Rule）。
- **Don't** 让 #2e6fa3 或 #c97f1e 出现在常规尺寸文字色里；琥珀永远不做大面积填充。
- **Don't** 让正文或元信息小于 12px；11px 只活在徽章/pill 内部。
- **Don't** 发明第二个显示声部，或用 Barlow Condensed 渲染非日期内容。
- **Don't** 圆角超出已录阶梯（2/3/4/8/16px；灯箱滑片 12px、搜索截图触发器 6px 为已录页面级例外）；不要引入胶囊（999px）或大圆角。
- **Don't** 把 `--dim` 写回 #5c6771——系统值为 #545f69，蓝薄涂底上必须保持 ≥4.5:1。
