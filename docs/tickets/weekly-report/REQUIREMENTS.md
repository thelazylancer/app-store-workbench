# 竞品周动态（`/weekly`）需求

状态：已确认（2026-11-24）。实现以本文与 `DESIGN.md` / `UI-DESIGN.md` 为准。

## 1. 目标

给研发团队一个**单周信息页面**：打开最近一个完整 ISO 周，先读到一句结论，再看到团队维度的新增、结构、版本/投放指标和近 4 周变化。

一句话定位：`/weekly` 回答「这一周竞品团队发生了什么」；`/shelf` 回答「拉长时间看数据长什么样」。周报不重复 `/shelf` 的 90 天多周图表，也不放包明细。

### 不做

- 不做包明细列表、不做下架动态列表。
- 不接 agent/LLM；摘要与 API `highlights` 都由固定规则生成。
- 不做不可变周报快照、不新增表、不新增 cron。
- 不改现有 `/api/competitor/*`、`/api/public/shelf/*` 的响应。
- 本期不解决未解析率；未解析包计入「新增包数」与 4 周趋势柱，但不参与结构、占比和三项指标，脚注说明数量。

## 2. 导航与路由

- 顶级导航新增「竞品周动态」，位置在「竞品趋势」右边、同一级。
- 路由：`/weekly`。
- 导航顺序：竞品日报 → 竞品趋势 → 竞品周动态 → App Store 搜索。
- `isNavActive` 需把 `/weekly` 从「竞品日报」的激活范围中排除，避免 `/` 同时高亮。
- 页面标题：`竞品周动态 · App搜索工作台`。

## 3. 数据口径

### 3.1 周与默认值

- ISO 周：周一 00:00 至周日 23:59，日期为 `YYYY-MM-DD`。
- 默认打开「最近一个完整且已有数据的 ISO 周」。
- 支持上一周/下一周切换；不做任意日期选择器。
- 当前未结束的周不默认展示，也不在首版提供「本周进行中」入口。

### 3.2 入库与竞品

- 「本周入库」按 `competitor_packages.first_ad_date` 落在本周计算，与「竞品日报」一致；不使用同步日 `target_date`。
- 「新增包数」统计本周全部入库包，含未解析。
- 结构、比例与三项指标只统计 `lookup_status = 'hit'` 的**已解析包**；`bundle_not_found`、`offline`、`pending` 不进入这些计算，但计入新增包数、趋势与团队卡数量口径。
- 「竞品」按 `team` 理解；本周有新增入库包（含未解析）的团队才出现在页面。
- 不排除灵蜂，不排除任何团队。
- 历史周按当前 `competitor_packages` 计算；包状态后续变化会影响历史周数字。首版接受这一点，不做快照回溯。

### 3.3 版本数分布

- 每个包的版本数 = `competitor_versions` 中该包的 `COUNT(DISTINCT version)`。
- 分桶：`1`、`2`、`3`、`4+`；无版本记录单独为 `0 / 无记录`。
- 同一个分布同时给两层：
  - 全周整体分布（分母 = 本周全部已解析包）；
  - 每个团队卡片内的分布（分母 = 该团队本周已解析包）。
- 百分比保留 1 位小数。

### 3.4 版本/投放指标（整体 / 团队 × 近 4 周）

三个指标都只统计本周已解析包；「近 4 周」= 以所选周为最后一周，向前共 4 个自然周。

- **整体**：该周全部已解析包放进同一组直接求平均，不是「团队均值再平均」。
- **团队**：按团队分别聚合；某团队某周无可用包时该位置留空。
- 两个层级共用同一指标公式。

| 指标 | 公式 | 空值规则 |
| --- | --- | --- |
| 平均版本间隔（天） | 对每个包：`(max(released_at::date) - min(released_at::date)) / (count(distinct released_at::date) - 1)`；只取有 2 个以上发布日期的包；单包间隔 >30 天视为异常值丢弃 | 团队该周没有可用包 → 无数据 |
| 最新版本→投放（天） | `first_ad_date - max(released_at::date)`，按包求平均；负数表示版本晚于投放 | 没有版本记录 → 无数据 |
| 投放→下架（天） | `offline_date - first_ad_date`，按包求平均 | 该团队该周没有已下架包 → **显示 0**；同时显示「已下架 n / m」避免误读 |

> `投放→下架` 与「不做下架列表」不冲突：这里只是一个团队周指标，不列下架包。

### 3.5 环比与结构变化

- 团队环比：本周新增入库包数 − 上周新增入库包数；上周为 0 时百分比显示「新增」，不显示无穷大。
- 品类变化：每个品类在「本周已解析包」与「上周已解析包」中的占比之差，单位百分点（pp）。
- IAP：`app_store_json.iapItems` 为非空数组 → 有；空数组 → 无。
- iOS：复用现有 `iosBucket` 分桶（lte14 / 15 / 16 / 17 / 18 / 26plus / unknown）。
- 隐私：复用 `privacyHostKind` / `privacyHostLabel`。

### 3.6 数据质量

- `已解析` = `lookup_status = 'hit'`。
- `未解析` = 本周全部包 − 已解析包。
- `数据截至` = 最近一条 `competitor_batches.target_date`；`批次状态` = 该批次 `status`，没有批次则为空。
- 脚注固定写：`本周共入库 {总数} 个包，其中 {未解析数} 个未解析，未计入统计；数据截至 {日期}，批次状态 {状态}。`

## 4. 页面结构

自上而下三个一级区块：

1. **整体情况**：一句话摘要（§4.2）→ 本周结构（§4.5）→ 版本与投放（本周）（§4.4）。
2. **团队情况**：团队卡片（§4.3，卡内含本周版本/投放数值与近 4 周迷你柱）。
3. **过去 4 周趋势**：新增与结构（新增包数 / 内购比例 / 包版本数）→ 版本与投放（整体）→ 品类与隐私变化（Top10）。

### 4.1 周头

- 标题「竞品周动态」。
- 周范围：`2026-11-16 ~ 2026-11-22`。
- 上一周 / 下一周按钮；下一周不可超过最近完整周。

### 4.2 一句话摘要

固定模板，不接 LLM：

```text
2026-11-16 至 11-22：新增 112 个包，来自 6 个团队；环比 -7（-5.9%）。
```

- 「新增包」= 本周全部入库包，**包含未解析**；环比也按同口径（本周入库 − 上周入库）。
- 上周入库为 0：`环比新增 112 个包`。
- 数字四舍五入到整数；百分比 1 位小数。
- 「来自 N 个团队」指本周有新增入库包（含未解析）的团队数，与团队卡数量一致。
- 团队卡的新增包数、排名、环比与占比按新增包口径；卡内结构（版本、内购、品类、隐私、iOS、三项指标）仍只按已解析包计算，未解析只出现在新增包数与脚注。

### 4.3 团队卡片（主角）

不用数据表，用卡片网格；排序按本周新增入库包数（含未解析）降序，同数按团队名升序。每张卡：

- 排名 + 团队名。
- 本周新增入库：N（含未解析）。
- 环比：`+4（+100.0%）` / `-5（-27.8%）` / `0`，按新增入库包数计算。
- 本周占比：`N / 112`，分母为本周全部新增包。
- 版本数迷你竖柱：`1 个 / 2 个 / 3+`（`3` 与 `4+` 合并），柱顶标百分比（团队内分母）；`无记录` 仅在 >0 时出现。
- 内购迷你竖柱：`有 / 无` 两根，柱顶标百分比。
- 品类 Top3 迷你横条：名称 + `包数 · 百分比`；不足 3 个按实际。
- 隐私 Top3 迷你横条：`privacyHostLabel` + `包数 · 百分比`。
- 归因 Top3 迷你横条：渠道品牌名 + `包数 · 百分比`；未知归因包（尚未分析）不计入。
- iOS 主流版本文字事实：如 `16.0 · 6 包`。
- 版本与投放（本周）：平均版本间隔 / 最新版本→投放 / 投放→下架三项，显示本周数值；每项右侧 4 格迷你柱（最后一格为本周，点击 / 聚焦显示周值）；`投放→下架` 的 0 仍带 `已下架 n/m`。
- 所有柱 / 条可 hover、focus、点击查看完整数值；柱上 / 条上直接标数值，不只藏在 tooltip。
- 团队已解析包少于 3 个时，比例类字段显示 `—`，柱高按组内计数归一化。

### 4.4 版本与投放（本周 / 近 4 周）

同一套三项指标（平均版本间隔、最新版本→投放、投放→下架）按颗粒度出现在三处，公式与空值规则完全一致（§3.4）：

- **整体情况「版本与投放（本周）」**：三项各一个本周数值，全体已解析包直接聚合；`投放→下架` 附 `已下架 n/m`。
- **团队卡片**：每张卡显示该团队本周三项数值，并带该团队近 4 周迷你柱（缺失周留空，不补 0）。
- **过去 4 周趋势「版本与投放」**：只做整体，三个指标、横轴为最近 4 个自然周：

1. 平均版本间隔（天）
2. 最新版本→投放（天）
3. 投放→下架（天）

- **整体**：每周一根柱，标注数值；柱按全体包精确加权/直接聚合。
- 只读，不做团队分层与筛选。
- 没有数据的周/团队留空，不画 0。
- `投放→下架` 的 0 要带上下文：`0（已下架 0/52）`。
- 复用 `/shelf` 的指标图视觉语言，但只展示 4 周，避免另起一套图表。

### 4.5 本周结构

六个图，均只含本周已解析包：

- 版本数（竖向百分比柱）：1 个 / 2 个 / 3+（3 与 4+ 合并）；无记录桶仅在计数 > 0 时显示。
- 内购（竖向百分比柱）：有 / 无，都显示。
- 品类 Top5（横向条）：已知品类前 5。
- 隐私域名 Top5（横向条）：已知隐私域名前 5。
- 归因 Top5（横向条）：已知归因渠道前 5，尚未分析的包另列一条灰色「未知」。
- iOS（横向条）：保留全部分布，只显示计数 > 0 的档位。

每个图都直接标数值：竖柱顶标 `包数 · 百分比`，横条右侧标 `包数 · 百分比`；每条柱 / 横条可 hover、聚焦或点击显示 `名称：N 包 · X%` 详情。分母写清楚，只含已解析包。

### 4.6 近 4 周趋势（整体）

区块只做整体，不分组团队；横轴固定为最近 4 个自然周，末位为当前所选周。分三组：

**新增与结构**

1. **新增包数**：每周「新增入库包数」，**包含未解析**。某周入库包为 0 时画「数据不足」斜纹柱，不画 0 柱；有未解析但无已解析的周照常画柱。
2. **内购比例**：每周内购包数 ÷ 该周已解析包数；`iapItems` 为非空数组才算内购。无已解析包的周留空，不补 0。
3. **包版本数（平均版本数）**：该周有版本记录的包的总版本数 ÷ 有版本记录的包数；无版本记录的包**分子分母都不计**。没有版本记录的周留空。

**版本与投放**：见 §4.4，只做整体。

**品类与隐私变化**：两栏，品类 Top10 与隐私域名 Top10。

- 行集合：本周已知桶（排除 `unknown`）按本周占比降序取前 10。
- 每行：名称、本周占比、4 周迷你柱（缺失周留空）、Δpp。
- Δpp = 本周占比 − 基准周占比；基准周 = 4 周窗口内最早有已解析包的一周（往往是 11-02，而不是更早的空周）；列头写明实际基准 `较 MM-DD`。
- 窗口内只有一周有数据（基准 = 本周）→ Δ 显示 `—`。
- 基准周不存在的桶按 0 计；hover / 聚焦 / 点击迷你柱显示该周该项占比。

柱上标数值；hover / 聚焦 / 点击显示同样数值，不跳转。

### 4.7 本周值得关注（已移除）

页面不再展示该区块。API 仍按原规则返回 `highlights`（兼容既有契约），前端不渲染。

### 4.8 脚注

固定数据质量说明（见 3.6），末尾可附「未解析率后续优化」一句。

## 5. API

### 5.1 端点

```text
GET /api/competitor/weekly-report?week=2026-11-16
```

- `week`：可选，`YYYY-MM-DD`；服务端规范化为该日期所在 ISO 周的周一。
- 缺省：最近一个完整且已有数据的 ISO 周。
- 非法日期 → `400 { message: "A valid week is required" }`。
- `competitorRepo` 不可用 → `503 { message: "Competitor data is unavailable" }`，与现有竞品路由一致。
- 查询失败 → `500 { message: "Competitor query failed" }`。

### 5.2 响应契约（建议放 `shared/weeklyReportTypes.ts`）

```ts
type WeeklyBucket = {
  key: string;
  label: string;
  count: number;
  share: number; // 0..1
};

type WeeklyTeam = {
  team: string;
  rank: number;
  ingestedPackages: number; // 本周全部新增入库包（含未解析）；排名、环比、占比按此计算
  previousIngestedPackages: number;
  change: number; // ingestedPackages − previousIngestedPackages
  changePct: number | null; // 上周为 0 时为 null（显示「新增」）
  share: number; // 本周全部新增包中的占比
  resolvedPackages: number; // 已解析包；卡内所有结构 / 比例字段的分母
  versionCounts: WeeklyBucket[];
  topCategories: WeeklyBucket[];
  iap: { yes: number; no: number; yesShare: number };
  topIos: WeeklyBucket | null;
  topPrivacies: WeeklyBucket[]; // Top3 known hosts, count desc
};

type WeeklyTrendWeek = {
  weekStart: string;
  weekEnd: string;
  resolvedPackages: number;
  ingestedPackages: number;
  dataSufficient: boolean; // ingestedPackages > 0
};

type WeeklyMetricPoint = {
  weekStart: string;
  team: string;
  value: number;
  packageCount: number;
  offlineCount: number;
};

type WeeklyMetricOverallPoint = {
  weekStart: string;
  value: number;
  packageCount: number;
  offlineCount: number;
};

type WeeklyMetricSeries = {
  key: "avgVersionGapDays" | "avgLatestVersionToAdDays" | "avgAdToOfflineDays";
  title: string;
  points: WeeklyMetricPoint[];
  overall: WeeklyMetricOverallPoint[]; // 全体包直接聚合
};

type WeeklyIapPoint = {
  weekStart: string;
  iapPackages: number;
  resolvedPackages: number;
  share: number; // 0..1
};

type WeeklyVersionAveragePoint = {
  weekStart: string;
  versionedPackages: number; // 有版本记录的包，分母
  totalVersions: number;
  value: number; // totalVersions / versionedPackages
};

type WeeklyDistributionWeek = {
  weekStart: string;
  resolvedPackages: number;
  buckets: WeeklyBucket[];
};

type WeeklyHighlight =
  | {
      kind: "team_change";
      team: string;
      direction: "up" | "down";
      change: number;
      changePct: number | null;
      current: number;
      previous: number;
    }
  | {
      kind: "category_change";
      category: string;
      direction: "up" | "down";
      currentShare: number;
      previousShare: number;
      deltaPp: number;
    };

type WeeklyReportResponse = {
  weekStart: string;
  weekEnd: string;
  latestCompleteWeek: string; // 最近完整 ISO 周周一，Asia/Shanghai；不受请求周影响
  generatedAt: string;
  summary: {
    resolvedPackages: number;
    ingestedPackages: number;
    unresolvedPackages: number;
    teamCount: number;
    previousResolvedPackages: number;
    previousIngestedPackages: number;
    change: number; // 已解析口径，供已解析分析使用
    changePct: number | null;
    ingestedChange: number; // 新增包口径，摘要句使用
    ingestedChangePct: number | null;
    resolvedRate: number;
    batchStatus: "ok" | "partial" | "failed" | null;
    dataThrough: string | null;
  };
  teams: WeeklyTeam[];
  versionCounts: WeeklyBucket[];
  distributions: Record<"category" | "ios" | "iap" | "privacy", WeeklyBucket[]>;
  trends: {
    weeks: WeeklyTrendWeek[];
    metrics: WeeklyMetricSeries[];
    iapShare: WeeklyIapPoint[]; // 仅有已解析包的周
    avgVersions: WeeklyVersionAveragePoint[]; // 仅有版本记录的周
    categoryWeeks: WeeklyDistributionWeek[];
    privacyWeeks: WeeklyDistributionWeek[];
  };
  highlights: WeeklyHighlight[];
};
```

### 5.3 排序

- `teams`：新增入库包数（含未解析）降序，然后团队名升序；仅有未解析包的团队也出现在列表中。
- `topCategories`：包数降序，然后品类名升序。
- `versionCounts`：`1`、`2`、`3`、`4+`、`0 / 无记录`。
- `distributions`：包数降序；`unknown` 最后。
- `highlights`：团队变化在前，品类变化在后。
- 百分比统一为 0..1 的小数，展示层再乘 100。

## 6. 状态与异常

- 加载中：周头 + 骨架屏；不闪烁旧周数据。
- 接口失败：错误卡片 + 重试按钮。
- 该周无已解析包：显示空状态「该周没有已解析入库包」，保留周切换和脚注；不显示团队卡/指标/趋势空图。
- 部分数据不足：某周/某团队指标为空时显示「—」，不补 0。
- 手机宽度：团队卡片单列；结构条横向可读；指标图可横向滚动。
- 可访问性：周切换按钮有可读标签；图表数值有文本替代；颜色不是唯一信息载体。

## 7. 验收标准（以 2026-11-16 周为基准）

### 7.1 数据

- `summary.resolvedPackages = 52`。
- `summary.ingestedPackages = 112`，`summary.unresolvedPackages = 60`。
- `summary.previousIngestedPackages = 119`，`ingestedChange = -7`，`ingestedChangePct ≈ -0.059`；摘要句为 `新增 112 个包 … 环比 -7（-5.9%）`。
- `summary.teamCount = 7`。
- 团队顺序（新增入库，含未解析）：巨风 43、LivChat 26、大容 14、蓝麟 13、灵蜂 11、驰猿 3、JODO 2；JODO 已解析 0，卡内比例类字段为 `—`。
- 版本数整体分布：1 个 = 10，2 个 = 36，3 个 = 6，4+ = 0。
- IAP：有 7，无 45。
- 品类 Top2：Utilities 14、Lifestyle 10。
- `投放→下架` 本周：0，且 `offlineCount = 0`。
- 4 周趋势（新增入库，含未解析）：10-26 = 2、11-02 = 108、11-09 = 119、11-16 = 112；首周不再是「数据不足」。
- `highlights`（API 仍返回，页面不展示）：团队变化 = 巨风 54 → 43（-11，-20.4%）；品类变化 = Productivity 20.0% → 9.6%（-10.4pp）。
- 脚注包含 112、60、数据截至日期和批次状态。

### 7.2 行为

- `/weekly` 可直接访问，刷新不 404（SPA fallback 已有）。
- 导航顺序正确；进入 `/weekly` 时只有「竞品周动态」高亮。
- 上一周/下一周切换正确；不能切到未来周。
- 页面无包明细列表、无下架列表、无「新团队」文案。
- 未解析包不出现在团队卡内的结构、比例与三项指标中；仅计入新增包数、团队卡主数字 / 排序 / 占比（摘要、趋势柱与脚注）。

### 7.3 工程门禁

- `npx tsc --noEmit` 通过。
- `npm test` 全绿；新增至少覆盖：周规范化、resolved-only、版本分桶、三个指标公式、关注项阈值、空周、非法 week、503。
- `npm run build` 通过。
- 部署到 7001 后，用真实 2026-11-16 周走查上述数字。

## 8. 默认口径（确认项）

以下数值未在上一轮逐项拍板，先按默认实现；如需调整请直接改这里：

1. 团队变化阈值 `|Δ| >= 3` 个包；品类变化阈值 `|Δpp| >= 5`。
2. 团队变化允许负数，负数显示「降幅」；不单独做「降幅榜」。
3. 品类 Top3；版本分桶 `1 / 2 / 3 / 4+ / 无记录`。
4. 平均版本间隔丢弃 >30 天的单包异常值，与 `/shelf` 一致。
5. `投放→下架` 无已下架包时显示 0，并附「已下架 n/m」。
6. 近 4 周固定为 4 个自然周；无数据周画「数据不足」斜纹。
7. 历史周按当前包表计算，不做不可变快照。
