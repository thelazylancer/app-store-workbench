---
name: App搜索工作台 · 竞品气象台
description: 竞品上架像天气一样可预报——平涂空气底、墨色文字、一像素规线、等宽数据层、零阴影零渐变的日报世界
colors:
  air: "#e7edf2"
  ink: "#1c2733"
  blue: "#2e6fa3"
  blue-text: "#245a87"
  amber: "#c97f1e"
  amber-text: "#824d0e"
  dim: "#5c6771"
  faint: "rgba(28, 39, 51, 0.38)"
  line: "rgba(28, 39, 51, 0.16)"
  line-strong: "rgba(28, 39, 51, 0.3)"
  white: "#ffffff"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, Helvetica Neue, sans-serif"
    fontSize: "46px"
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
    fontWeight: 600
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
  md: "8px"
  lg: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "36px"
components:
  badge-hit:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.xs}"
    padding: "3px 9px"
    typography: "{typography.label}"
  badge-exception:
    textColor: "{colors.amber-text}"
    rounded: "{rounded.xs}"
    padding: "3px 9px"
    typography: "{typography.label}"
  badge-neutral:
    textColor: "{colors.dim}"
    rounded: "{rounded.xs}"
    padding: "3px 9px"
    typography: "{typography.label}"
  text-action:
    textColor: "{colors.blue-text}"
    typography: "{typography.data}"
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
    width: "46px"
---

# Design System: App搜索工作台 · 竞品气象台

## Overview

**Creative North Star: "竞品气象台"**

竞品上架像天气一样可预报。整个界面是一片平涂的空气色底（#E7EDF2），没有浮卡、没有灰上灰：所有分区靠一像素细规线分隔，所有深度靠墨色透明度薄涂表达，阴影和渐变为零。数据是这间气象台里唯一的主角——每一个数字、包码、日期都以 IBM Plex Mono 的 tabular-nums 等宽数字呈现，形成可纵向对齐读的「仪表读数层」；中文正文用 Noto Sans SC 安静铺底；Barlow Condensed 是唯一被放大的显示声部，只用于日期。

页面的脊柱是横贯全宽的 7 天预报栏：每日一格，柱高严格编码包数（`Math.round(count / max × 112px)`），昨日格放大成主格（flex 1.9），支持单日点击与两点式范围选中，选中区间整体染上蓝色薄涂。异常（未命中 bundle_not_found 与待补全 pending）统一归入页面底部的异常区，只在非空时渲染；警戒琥珀只在这类时刻出现。平时一眼望去，全是平静的空气色。

**Key Characteristics:**

- 平涂空气底（#E7EDF2）承托一切内容；无卡片容器、无灰上灰、无阴影、无渐变
- 一像素规线（rgba(28,39,51,0.16)，强调 0.3）是唯一的分区语言
- 风暴蓝（#2E6FA3）只给命中与交互状态；警戒琥珀（#C97F1E）只给异常，且从不承载文字
- 等宽数字层（IBM Plex Mono · tabular-nums）承载全部数据；正文下限 12px
- 柱高即数量：预报柱高度严格由包数推导，不做装饰性起伏
- 动效只有三种：柱入场 scaleY 260ms、骨架脉冲 1.2s、折叠箭头 120ms；`prefers-reduced-motion` 下全部关闭

**范围说明：** 本文件记录的是竞品报告页（`competitor.html` + `src/competitor/competitor.css`）已落地的「气象台」世界。App 搜索页（`index.html` + `src/styles.css`）属于更早的旧样式（Outfit 字体、卡片、阴影、#2563eb 蓝accent），不在本系统内；该页经 `src/competitor/main.ts` 的 import 仍会加载到本页，但渲染被 competitor.css 完全覆盖。旧页样式属既存漂移，未在本世界内修复，也不应被新表面继承。

## Colors

两色职能分立的世界：蓝色管「命中与操作」，琥珀管「异常」，两者都有专用的加深文字变体，线色本身从不染指文字。

### Primary

- **风暴蓝 Storm Blue** (#2e6fa3)：命中与交互的唯一直彩色。命中徽章底色、主格预报柱、范围选中涂染、focus 轮廓、选中高亮、状态点。以线、块、点的方式出现，从不作为文字颜色。
- **风暴蓝文字变体** (#245a87)：一切蓝色文字（文字操作链接、详情返回链接、命中计数、区间内日期）都用这个加深变体，在空气底上对比度 6.16:1（AA 达标）。

### Secondary

- **警戒琥珀 Amber** (#c97f1e)：异常专用。批次告警左侧 1px 竖线、异常状态徽章描边、异常状态点。作为文字会只有 2.72:1（不达标），所以它永远只出现在线和点的位置上。
- **警戒琥珀文字变体** (#824d0e)：异常标题、异常原因、批次告警正文，在空气底上 5.9:1（AA 达标）。

### Neutral

- **空气底 Air** (#e7edf2)：整页唯一背景色，从 html 到 body 平涂到底。
- **墨 Ink** (#1c2733)：全部正文与主格主色，在空气底上 12.83:1。一切透明度薄涂（规线 0.16/0.3、悬停 0.06、主格 0.05、柱 0.55、遮罩 0.86）都由它派生。
- **暗灰 Dim** (#5c6771)：次要说明、包码、计数等大量二级文字，4.9:1（AA 达标）。
- **淡墨 Faint** (rgba(28,39,51,0.38))：缺数据占位的 1px 虚线图标框。
- **规线** (rgba(28,39,51,0.16))：默认 1px 分隔线；**强调规线** (rgba(28,39,51,0.3))：控件描边、柱底基线、异常区顶线。
- **白** (#ffffff)：命中徽章与「当前版本」pill 在蓝底上的文字（5.36:1，AA 达标）。

### Named Rules

**The Split-Voice Rule.** 线色与文字色永不互换：#2e6fa3 与 #c97f1e 只出现在线、块、点上；文字必须用加深变体 #245a87 / #824d0e。任何新文字色都先算对比度（正文 ≥4.5:1）。

**The Calm Air Rule.** 琥珀只在有事时点亮：异常区仅在非空时渲染，批次告警横幅仅在批次异常（过期/失败/范围不完整）时出现。平静的日子整个页面没有一点琥珀。

## Typography

**显示字体（日期声部）：** Barlow Condensed（回退 Arial Narrow, Helvetica Neue）
**正文字体：** Noto Sans SC（回退 PingFang SC, Hiragino Sans GB, Microsoft YaHei）
**数据字体：** IBM Plex Mono（回退 ui-monospace 栈），恒开 tabular-nums

三声部各司其职：Barlow Condensed 负责被放大的日期（页面唯一的显示性时刻），Noto Sans SC 负责一切中文叙述，IBM Plex Mono 负责一切可对齐读的数字。字重只用了 400 / 500 / 600，没有更重的字重。

### Hierarchy

- **Display** (Barlow Condensed 600, 46px, line-height 0.9, tabular-nums)：页首大日期。主格内日期为同声部缩小版（星期 20px、月日 30px）。
- **Headline** (Noto Sans SC 600, 24px, line-height 1.2)：详情页竞品名。
- **Title** (Noto Sans SC 600, 20px)：页首 h1「竞品日报」。空态/错误卡标题为 17px。
- **Body** (Noto Sans SC 400, 14px, line-height 1.5)：正文基准。条目名 15px/600，组名 14px/700，小节标题 13px/600。
- **Data** (IBM Plex Mono 400–500, 12px, tabular-nums)：包数、包码、计数、日期串、版本号、页脚批次状态——页面占比最大的一个声部。主格包数放大为 22px/600。
- **Label** (Noto Sans SC 600, 12px)：徽章与标签文字。11px 只允许出现在徽章/pill 内部（「昨日」小签、包数小签、「当前版本」pill），正文与元信息永不小于 12px。

### Named Rules

**The Data-Mono Rule.** 一切数字、包码、日期串、版本号都必须走 IBM Plex Mono + tabular-nums。sans 声部从不渲染数据，数据声部从不渲染中文叙述。

**The One Display Voice Rule.** Barlow Condensed 是唯一的显示声部，且只用于日期。不要再发明第二个被放大的字族；放大即日期，日期即放大。

## Layout

单列纵向文档流，内容壳最大宽 1600px、左右内边距 40px（≤1180px 收窄到 24px），顶部 56px 品牌与 Tab 栏以 1px 规线收底。密度是数据密：分组纵列平铺，不设多栏瀑布。

- **预报栏**：横贯全宽，7 个等宽 flex 格（`flex: 1 1 0`），主格 `flex: 1.9 1 0`；整栏最小高 220px，格内绘图区最小高 150px（≤860px 降到 110px、主格日期缩到 20px）。
- **竞品条目**：网格 `46px(图标列) + minmax(180px,1.45fr)(名称) + minmax(180px,1.2fr)(包码) + minmax(150px,1fr)(类目/版本) + auto(徽章)`，列距 16px，行最小高 64px，行间以 1px 规线分隔。≤1180px 收窄列宽、隐藏最右组名列；≤860px 塌成 `46px 1fr auto` 三列，包码与类目换行到第二行。
- **详情页**：内容最大宽 1200px，双栏 `1.1fr / 0.9fr`、栏距 36px（≤860px 单栏）；信息表为 `110px 标签列 + 1fr`；截图网格 `auto-fill, minmax(180px, 1fr)`、间距 12px。
- **页脚**：一条 1px 规线之下的一行等宽批次状态细线（正常态为 7px 墨点 + 一句话），加两行数据口径说明。
- **间距节奏**：小步进为主（6/8/10/12/14/16/18），区块间隔 22–36px；没有大块留白，靠规线而不是空白来换气。

## Elevation & Depth

零阴影、零渐变。深度全部由墨色透明度薄涂表达：悬停 0.06（预报格 0.035）、主格底 0.05、区间选中 0.09（主格 0.15）、普通柱 0.55、骨架 0.04–0.05、截图灯箱遮罩 0.86。焦点是唯一的「浮起」时刻：`outline: 2px solid #2e6fa3, offset 2px`。

### Named Rules

**The Flat-Ground Rule.** 任何表面都不许用 box-shadow 或渐变制造高度。全库唯一的 box-shadow 是 Tab 当前项的下划线（`inset 0 -2px 0 #1c2733`）——那是用阴影语法画的一条规线，不是海拔。

## Shapes

近方形世界：2px 圆角给徽章、标签、pill 与幽灵按钮；3px 给步进器与分段控件；8px 给条目图标；16px 只给详情页大图标。缺数据一律 1px 虚线（faint）空框，诚实的空位而不是假占位。预报柱顶端 1px 圆角、以一条 62% 宽的强调规线作柱底基线。

### Named Rules

**The One-Pixel Rule.** 分隔永远是一根 1px 规线，绝不是卡片边缘、阴影或额外背景块。要分组，先画线。

## Components

### 预报格（签名组件）

- **形态**：等宽按钮格，日期（等宽 12px，区间内转蓝文字）+ 包数 + 底部对齐的柱。柱宽 26px（主格 46px），柱高 = `Math.max(1, Math.round(packageCount / max × 112px))`，零包日为 0，普通柱墨色 0.55 薄涂、主格与区间柱为风暴蓝。
- **状态**：悬停墨色 0.035 薄涂；主格底 0.05；区间内蓝 0.09（主格 0.15）且上下边线转蓝。
- **动效**：入场 `scaleY(0→1)` 260ms cubic-bezier(0.22, 0.61, 0.36, 1)，自柱底生长；`prefers-reduced-motion: reduce` 下关闭。柱高本身永远来自数据，不做缓动补偿。

### 分段控件（口径/分组/状态）

- **形态**：30px 高、3px 圆角、1px 强调规线外框，内部按钮以 1px 规线分隔。
- **状态**：悬停墨色 0.06 薄涂；激活项墨底反白（`#1c2733` 底 + 空气色文字，字重 600），并同步 `aria-pressed`。状态分段激活项带实时计数（如「命中 12」）。

### 日期步进器

- **形态**：30px 高、26px 宽的双箭头按钮夹一个 128px 等宽日期输入，内部以 1px 规线分隔。
- **状态**：悬停墨色 0.06；越界（>昨日）禁用转 dim；「回到昨天」为旁挂的文字操作链接，仅离开昨日时出现。

### 徽章

- **命中**：蓝底白字（#2e6fa3 / #ffffff，12px/600，2px 圆角，3px 9px 内边距）。
- **异常**（bundle_not_found / 待补全）：透明底 + 1px 琥珀描边 + 琥珀文字变体。
- **中性**：1px 强调规线描边 + dim 文字。

### 竞品条目行

- **形态**：36px 图标（缺图标为 1px 虚线空框或首字母等宽回退）+ 15px/600 名称 + 等宽包码 + dim 元信息 + 命中蓝徽章。
- **状态**：悬停蓝 0.06 薄涂；整行可点进详情。分组头（组名 14px/700 + 等宽计数 + 折叠箭头，箭头旋转 120ms）也遵循同一悬停语言。

### 异常区

- **形态**：列表底部以 1px 强调规线开区，标题琥珀文字变体 13px/700；异常行比普通行矮（54px），原因列琥珀文字变体 12px/600。
- **行为**：非空才渲染，空则整区不出现。

### 批次状态

- **正常**：页脚一行等宽细线 + 7px 墨点。
- **异常**：预报栏下方一条批次告警横幅：左侧 1px 琥珀竖线 + 琥珀文字变体 12px，多原因以「；」串联。

### 文字操作链接

- 12px 蓝文字变体 + 1px 下划线（offset 3px），悬停转墨。清除筛选、回到单日、详情返回都用它。

### 幽灵按钮

- 透明底 + 1px 强调规线描边 + 2px 圆角 + 7px 14px 内边距，12px 墨字；悬停描边转纯墨。重试、空态动作用它。

### 截图网格与灯箱

- 缩略图触发器：1px 规线框、零圆角、零悬停变换（描边加深到 0.3 即止）；灯箱遮罩墨色 0.86，说明文字走等宽声部。

### 空态 / 错误 / 加载

- 空态与错误卡无卡底，以 1px 规线开区：17px/600 标题 + dim 13px 说明 + 幽灵按钮动作组。加载骨架为墨色 0.05 条块 1.2s 脉冲（reduced-motion 下静止）。

## Do's and Don'ts

### Do:

- **Do** 一切数字、包码、日期串走 IBM Plex Mono + tabular-nums（The Data-Mono Rule）。
- **Do** 蓝色与琥珀色的文字一律用加深变体 #245a87 / #824d0e（对比度 6.16:1 / 5.9:1）。
- **Do** 用 1px 规线分隔一切区块；悬停用墨色 0.06（或蓝 0.06）薄涂表达。
- **Do** 保持柱高严格由 `Math.round(count / max × 112px)` 推导，主格 1.9 倍宽、蓝柱。
- **Do** 异常区与批次告警只在非空/异常时渲染（The Calm Air Rule）。
- **Do** 动效只用三种已录节奏：柱入场 260ms、骨架脉冲 1.2s、箭头 120ms，并在 `prefers-reduced-motion` 下全部关闭。

### Don't:

- **Don't** 使用阴影、渐变、卡片容器或灰上灰——深度只来自墨色透明度薄涂（The Flat-Ground Rule）。
- **Don't** 让 #2e6fa3 或 #c97f1e 出现在文字颜色里；也永远不要用琥珀作大面积填充。
- **Don't** 让正文或元信息小于 12px；11px 只活在徽章/pill 内部。
- **Don't** 在预报栏之外再发明第二个显示声部，或用 Barlow Condensed 渲染非日期内容。
- **Don't** 在预报栏上方加统计卡行：预报脊柱本身就是趋势概览（本页已删除统计条，属确认否决）。
- **Don't** 圆角超出已录阶梯（2/3/8/16px）；不要引入胶囊（999px）或大圆角。
- **Don't** 在本表面引入 `src/styles.css` 的旧世界 token（Outfit 字体、#2563eb accent、--shadow-control、radius-pill）——那是 App 搜索页的既存样式，不是本系统的一部分。
