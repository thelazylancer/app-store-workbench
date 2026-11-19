# Surface brief: 竞品报告页（/competitor.html）

<!-- impeccable:surface-brief 1 -->

## Scope and visitor mode

- Scope: 竞品日报报告页（主列表 + 竞品详情 + 异常区），含 7 天预报栏与日期范围选中。
- Mode: Operate。桌面大屏（≥1440）优先。

## Audience, job, action, proof, constraints

- 受众：竞品分析 / 运营、管理与决策同事。
- 任务：每天一眼确认昨日竞品总量与趋势，再扫新竞品名单，下钻看图标/截图/版本历史。
- 行动：选日期（单日或范围）→ 看总量与趋势 → 按团队/类目/iOS 版本扫分组 → 点竞品进详情。
- 证据：每日快照数据、本地图标与截图、版本历史；未命中与待补全诚实呈现。
- 约束：无国家筛选；口径 = 投放日期 / 上架日期；URL 承载全部状态；未配置数据库时 503 错误态。
- 用户已拍板：lookup 找不到（bundle_not_found）与待补全（pending）统一归入「异常」区，只在非空时出现。

## Direction contract

- THESIS: 竞品上架像天气一样可预报——7 天预报栏是页面脊柱，柱高即包数，昨日是焦点格；拒绝品类默认的"统计卡+表格"灰白仪表盘。
- OWN-WORLD: 空气色平涂底 #E7EDF2（无浮卡、无灰上灰），墨 #1C2733，风暴蓝 #2E6FA3 只给命中与主操作，警戒琥珀 #C97F1E 只给异常；等宽表格数字层（IBM Plex Mono / tabular-nums）；日期声部 Barlow Condensed 放大显示；一像素细规线分隔，零阴影零渐变。
- STORY: 访客先读趋势（哪天有多少），再读名单（谁上了），异常区只在有事时点亮——平时一眼全是平静的空气色。
- FIRST VIEWPORT: 顶部 Tab 与口径/分组/日期控件（标准控件）；其下横贯全宽的 7 天预报栏（每日一格，格内柱高严格编码包数，昨日格放大成主格，支持单日点击与范围选中）；之下按团队分组的竞品条目纵列平铺（图标位 + 真实名称 + 包码 + 类目/版本 + 命中徽章）；底部一条批次状态细线。
- FORM: 掷签分配的 grounded 候选第 6 项（气象预报页），seed:42695d2c3888f772。已吸收落选挑战者的四条纪律：等宽数字密度（ikeda）、块长即数量（labanotation）、平涂底色承诺（zoo-map）、唯一显示声部（emigre）。
- FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Chosen direction and memorable moment

竞品气象台。签名动作：7 天预报栏——柱高即包数，昨日主格，范围选中时区间整体点亮。

## Unresolved decisions

- 日期范围的 UI 手势（点两日 vs 拖选）以实现后实际手感为准。
- 详情页是否随主世界重设计：是，同一世界内重做。
