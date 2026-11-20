# 架构设计：React 19 + Astryx 全壳 + react-router + Fastify

依据：`docs/ARCH-competitor-daily.md`（数据层，不变）、`PRODUCT.md`。`DESIGN.md` 职责收缩为「颜色、字体、异常色语义」（见 §5.3）。
本文只做模块划分、接口与落点设计，不含业务实现代码。产出票据见 `docs/tickets/`。

已拍板决策（不再讨论替代方案）：

1. 前端 React 19 + `@astryxdesign/core`（0.7.16，beta），交互与壳全部用 Astryx 现成组件；不引入 vercel-labs/ui / @ui-sdk，不引入任何其它 UI 库。外观允许与现版不同，但颜色、字体、异常色语义仍是气象台。
2. 路由用 react-router：`/` 竞品日报、`/search` App Store 搜索、`/package/:code` 竞品详情；筛选走 query（`?date=&team=&category=&status=`）。旧地址 `index.html`、`search.html`、`?view=detail` 不再保证可用。web 容器（nginx）加 SPA fallback。
3. 后端 Express 5 → Fastify，HTTP 契约逐字节不变：路径、方法、状态码、JSON 字段、错误文案、Content-Type、下载文件名。PostgreSQL、node-cron（08:00 Asia/Shanghai）、CLI 脚本行为不变；Express 依赖移除。
4. 服务端超 500 行文件仍按「门面不动、实现内移」拆分。
5. 所有文件（含 CSS 和测试）≤500 行，vitest 守卫强制。
6. `modern-web-guidance` 与 Astryx/路由冲突处可不采用；无障碍、对比度、性能仍要守。
7. 功能严格不变：竞品首页十四条契约（§8.1）、搜索页多行 composer、国家联动、候选对比、截图灯箱、IPA 全流程、详情复制按钮与 missed panel、gsap reduced-motion 语义。

---

## 1. 模块图（文字）

```text
                     ┌──────────── shared/ ─────────────┐
                     │ competitorTypes.ts     types.ts   │  前后端契约（不变）
                     └──────────▲──────────────▲─────────┘
                                │              │
     ┌──────────────────────────┴────┐   ┌─────┴──────────────────────────────┐
     │ server/（Fastify + pg）        │   │ src/（React 19 + Astryx + router）  │
     │ index.ts（listen + cron）      │   │                                    │
     │ app.ts（组装 root，薄）         │   │ main 入口 → <App/>                  │
     │ routes/competitor.ts          │   │   <Theme theme={wxTheme}>          │
     │ routes/search.ts              │   │   <BrowserRouter>                  │
     │ routes/ipaDownload.ts        │   │   AppShell / TopNav / 页脚          │
     │ lib/competitorRepo(+/ 拆分)   │   │ routes: /  /search  /package/:code  │
     │ lib/ipaDownload(+/ 拆分)       │   │                                    │
     │ lib/{appleLookup,assetStore, │   │ src/theme/wxTheme.ts               │
     │      competitorSync, …} 不变   │   │ src/lib/{api,competitorApi,        │
     └─────────▲─────────────────────┘   │   filterResults,motion}.ts 复用   │
               │ HTTP /api/*             │ src/competitor/*  src/search/*     │
               └──────────────────────────┴─▲──────────────────────────────────┘
                                            │ fetch /api/*
              nginx（deploy/nginx.conf）：/api 反代 + SPA fallback（try_files → /index.html）
```

依赖规则（唯一方向）：

- `shared/` 不依赖任何层。
- `server/` 只依赖 `shared/`。
- `src/` 只依赖 `shared/`、`src/lib/`、`src/theme/`、`src/app/`（路由与壳）与外部库（react、react-router、@astryxdesign/core、gsap）；`src/competitor/` 与 `src/search/` 互不 import。
- HTTP `/api/*` 是前后端唯一接缝；React 化与 Fastify 化都不新增、不修改端点。

## 2. 路由表

| 路径 | 页面 | 数据 | query 参数 |
| --- | --- | --- | --- |
| `/` | 竞品日报时间线 | `getCompetitorDays` + `getCompetitorDay`（`date_kind=first_ad` 固定） | `date` `team` `category` `status` |
| `/search` | App Store 搜索（composer + 队列 + inspector） | `searchApps` / `appDetails` | 无（国家等状态在内存，同现状） |
| `/package/:code` | 竞品详情 | `getCompetitorPackage(code)` | 无 |

- query 参数名沿用现状（`date/team/category/status`）；`?view=detail` 及 `competitor`/`package` 参数废弃，由路由取代。
- 列表 → 详情 → 返回：进入详情用 `navigate(\`/package/${code}\`)`，返回用路由回退（保留原筛选 query）。
- 未知路径 → JSON 404（见 §6 已知差异）。
- vite dev 天然支持 history fallback；生产 nginx 由 BE-6 落 `try_files`。
- 收口节奏：迁移期两个 html 入口（`index.html`、`search.html`）各自挂同一 `<App/>` 路由表；FE-8 合并为单入口并删除旧 html。

## 3. Fastify 迁移设计

原则：**框架替换，契约冻结**。以 `server/app.ts` 现有实现为唯一规范，逐路由平移。

### 3.1 必须保真的语义（验收逐条对照 `server/app.ts`）

| 语义 | 现状（app.ts 行号） | Fastify 落点 |
| --- | --- | --- |
| JSON body 解析 | `express.json()`（L67） | Fastify 内建 body parser（保持默认大小限制差异为已知可接受项，见 §6） |
| 静态 `/competitor-assets` | `express.static`（L69–72） | `@fastify/static`，root 同 `competitorAssetsDir ?? data/competitor` |
| `/api/competitor` 503 守卫 | 无 repo 时 `503 {message:"Competitor data is unavailable"}`（L74–79） | 路由前 `onRequest` hook |
| 状态码/文案 | 400/402/404/409/502/503/202 各路由手写文案（L116–256） | 原样平移，禁止改用 JSON Schema 校验（会改变错误格式） |
| 错误正文格式 | Express 默认处理（未定义路径为 HTML `Cannot GET /path`；异常为 HTML `<pre>`；仅路由手写错误为 `{message}`） | `fastifyErrors.ts` 逐字节复刻 Express 形状（HTML 错误页、`x-powered-by: Express`、弱 ETag/304），见 §6 |
| 下载流 | `res.download(filePath, \`${bundleId}.ipa\`)`（L255） | `reply.header("content-disposition", 'attachment; filename="<bundleId>.ipa"').send(stream)`；`Content-Type` 与 Express `res.download` 对齐（`application/octet-stream`） |
| 并发 | `mapWithConcurrency(…, SEARCH_CONCURRENCY=3)`（L141） | 原样平移 |
| bundleId 校验 | `BUNDLE_ID_PATTERN`（L33） | 原样平移 |
| `createApp(deps)` 依赖注入接口 | L22–31 | 不变——这是测试 seam |

### 3.2 目标文件结构（全部 ≤500 行）

```
server/app.ts            组装 root：注册 fastify 插件 + routes，导出 createApp(deps)（~80 行）
server/lib/fastifyErrors.ts   setErrorHandler：{message} 形状 + 404 JSON（~40 行）
server/routes/competitor.ts   /api/competitor/*（含 503 守卫注册）（~230 行，主体自 competitorApi.ts 平移）
server/routes/search.ts       /api/app-details/*、/api/search-apps（含 enrichApp）（~260 行，自 app.ts 拆出）
server/routes/ipaDownload.ts  /api/ipa-download/*（含下载流）（~180 行，自 app.ts 拆出）
```

### 3.3 测试策略

- 现有 supertest 测试**请求行零改动**：`createApp(deps)` 返回 Fastify 实例后，`await app.ready()` 再 `request(app.server)`；只允许改测试的 server 启动样板（`beforeAll` 里两三行）。
- 新增 `tests/server/httpContract.test.ts`：对每个端点断言 状态码 + 响应正文 JSON 逐字节（golden 字符串），迁移前用 Express 版生成 golden，迁移后必须逐字节通过。
- Express / @types/express 从 `package.json` 移除。

## 4. Astryx 落点

### 4.1 组件映射（壳 + 交互全 Astryx）

| 用途 | Astryx 组件 |
| --- | --- |
| 应用壳、顶部导航、页脚 | `AppShell` / `TopNav`（+ `Link`/`Button` 做导航项）；页脚用壳自带布局 |
| 按钮系 | `Button` / `IconButton` / `ButtonGroup` |
| 下拉单选（国家、类目） | `Selector` |
| 日期筛选 | `DateInput`（Astryx 自带 Calendar；不自己画日历，不用系统日期框） |
| 团队标签 | `TabList` |
| 状态筛选组 | `SegmentedControl` |
| 竞品徽章（hit/pending/miss/exception） | `Badge`（配 wxTheme 色语义，琥珀仅异常） |
| 截图灯箱 | `Lightbox` |
| IPA 授权码弹层 | `Dialog` + `Field` + `TextInput` |
| 错误横幅 / 空态 / 加载 | `Banner` / `EmptyState` / `Skeleton` / `Spinner` |
| 时间线竖轨、日块、团队块排版 | `Stack` / `HStack` / `VStack` / `Grid` / `Section` / `Divider` / `List` / `Item` / `MetadataList`（Astryx 无 Timeline 原语，用布局基元组合；外观允许不同） |
| 文字层级 | `Text` / `Kbd` / `Token` / `Timestamp` |

实现时 `npx @astryxdesign/cli component <Name>` 查 props/variants；`npx @astryxdesign/cli doctor --built .` 自检（走代理）。

### 4.2 黑名单

- `@astryxdesign/theme-neutral` 与 Astryx 默认主题：视觉只来自 wxTheme。
- 与需求无关的组件（`Chat` / `Markdown` / `CommandPalette` / `PowerSearch` / `TreeList` / `Carousel` 等）不引入。
- `createAnimator` / `createReorderable` 等行为 API 不用：动效沿用 gsap（`src/lib/motion.ts`，reduced-motion 语义不变；DOM 类名变化时同步调整其选择器）。
- `@astryxdesign/cli init` 会向 `CLAUDE.md`/`AGENTS.md` 写指南，是否执行与提交由仓库所有者决定，票据不作为必做步骤。

### 4.3 wxTheme 与 DESIGN.md 职责收缩

`src/theme/wxTheme.ts` 接口只有一行：

```ts
export const wxTheme: DefinedTheme;   // 两页根节点 <Theme theme={wxTheme}>
```

token 映射（实现时以 `npx @astryxdesign/cli docs tokens` 的实际 token 名为准）：

| 语义（唯一契约） | 值 |
| --- | --- |
| 空气底（surface/background） | `#E7EDF2` |
| 墨（text/foreground） | `#1C2733` |
| 风暴蓝（primary/interactive） | `#2E6FA3`，文字态 `#245A87` |
| 琥珀——仅异常（warning） | `#C97F1E`，文字态 `#824D0E`；组件层只允许出现在异常徽章/异常行 |
| 次级文字/规线 | `#545F69` / `rgba(28,39,51,.38)` / `rgba(28,39,51,.16)` |
| 正文 | Noto Sans SC 14/1.5 |
| 数字 | IBM Plex Mono 12，tabular-nums |
| 日期标记 | Barlow Condensed 600（组件样式覆盖，不做全局 display token） |

`DESIGN.md` 由 FE-2 收缩为上述语义表（颜色、字体、异常色），删去组件外观细节；组件外观以 Astryx 为准。颜色无障碍对比度仍须达标（蓝 `#245A87` 对空气底 ≥4.5:1，墨色正文 ≥4.5:1）。

### 4.4 CSS 策略

Astryx 组件样式由 wxTheme 接管，现有 `src/styles.css`（2129）与 `src/competitor/competitor.css`（1763）的大部分将**删除而非拆分**：每页票据只保留页面专属排版到 `src/<page>/styles/*.css`（每文件 ≤300 行，`wx-` 类名沿用），`tests/frontend/styles.test.ts` 随迁继续守「零阴影零渐变、琥珀只出现在异常类名」。

## 5. 前端模块设计

状态管理：不加状态库。竞品页筛选状态 = URL query（`useQueryFilters` hook，唯一读写口）；搜索页内存状态 `useState`（同现状）；详情页 `useParams` + fetch。

```
src/
  app/                        路由与壳（两页共用）
    routes.tsx                <App/>：Theme + BrowserRouter + AppShell/TopNav + 路由表
    useQueryFilters.ts        ?date&team&category&status 读写（唯一 query seam）
    navItems.ts               TopNav 导航项（/、/search）
  theme/wxTheme.ts            见 §4.3
  competitor/
    main.tsx                  index.html 挂载 <App/>
    Timeline.tsx / Controls.tsx / TeamBlock.tsx / states.tsx / StatsBar.tsx
    Detail.tsx + detail/*.tsx（identity/metricBar/iap/description/versionHistory/screenshots/copyValue/missed）
    selectors.ts              纯筛选分组（自 main.ts 平移）
    format.ts                 原样复用
    styles/*.css
  search/
    main.tsx                  search.html 挂载 <App/>（迁移期，FE-8 后移除）
    App.tsx / Composer.tsx / FilterBar.tsx / ResultsQueue.tsx / Inspector.tsx
    inspector/*.tsx（screenshots+Lightbox/versionHistory/iap/candidates/identifier）
    IpaDownload.tsx + useIpaDownload.ts
    states.tsx
    styles/*.css
  lib/api.ts competitorApi.ts filterResults.ts motion.ts   原样复用
```

行数目标见各票据；每张前端票据迁移完即删除被替代的旧文件与旧测试（replace，不并排），后续票据从 git 历史读旧实现。

## 6. 已知差异（唯一允许的偏差清单）

1. 未定义路径的 404 与运行时异常沿用 Express 的 HTML 错误页（`Cannot GET /path`、`<pre>` 正文），而非 JSON `{message}`；非生产环境的堆栈文本、响应头顺序、动态 `Date` 不做逐字节对齐。
2. 外观：壳、导航、时间线竖轨等采用 Astryx 组件外观，允许与现版不同；颜色/字体/琥珀语义不变。
3. 旧地址 `index.html`、`search.html`、`?view=detail` 在 FE-8 后失效（此前的过渡期可用）。
4. 未实现 Express 的自动 `OPTIONS` 响应（Express 返回 200 + `Allow`）；前端不发送跨域预检，实际无影响。尾斜杠、大小写、静态目录 301、gzip/deflate 请求体已对齐。
5. 大于 100KB 的非 JSON 请求体：Express 忽略后交给路由，Fastify 以流式排空同样忽略；两种实现的连接关闭时序可能不同。
6. 交互层细节以 React 版本为准：取消按钮的常显、失败文案透传后端 `message`、非美区价格线索 pill、候选序号跨页连续、清除筛选后焦点不回到输入框、非法 `category` 下选择器标签留空，均不改变数据与主流程。

除以上四条与「移动不改逻辑」外，任何 diff 都算回归。

## 7. 500 行纪律

`tests/lineLimit.test.ts` 对 git 跟踪的 `*.ts *.tsx *.css` 断言 ≤500 行，FE-1 上线时携带「遗留豁免清单」（现存 13 个超限文件 + 迁移期临时超限者），每张票据消化一个划掉一个、只减不增，FE-8 收口清零。

## 8. 冻结的功能契约（票据验收直接引用）

### 8.1 竞品首页（十四条）

1. 只有时间线；2. 已有日期从新到旧；3. 无包的日期不出现；4. 日期标记不可折叠；5. 每天内按团队分块；6. 团队名一行字（名称+包数），非按钮；7. 异常包留在该团队块内；8. 顶部团队标签默认「全部」；9. 类目、状态、日期只做筛选；10. 日期用 Astryx `DateInput`（无系统日期框、无「全部日期」原生 select，清空日期走「清除筛选」）；11. App Store 名称取 `appStoreJson.name`（回退 `trackName`，再回退 `displayName`）；12. `date_kind` 固定 `first_ad`；13. 不恢复柱状日期轴；14. 不恢复上架日期切换。

### 8.2 其它冻结点

搜索页多行 composer、国家联动（IAP 筛选仅 US）、候选对比、截图灯箱、IPA 全流程（授权码 Dialog、取消、轮询、错误分类文案）、详情复制按钮与 missed panel、版本历史格式、gsap 动效与 reduced-motion 静止、API 响应 JSON 逐字节。

## 9. 风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| Astryx 0.7.x beta | 组件 API 与主题能力可能随版本漂移 | 版本精确锁定（`-E`）；FE-2 先以壳+主题小步验证再铺开；`doctor` 自检 |
| Fastify 契约保真 | 错误正文/状态码/下载头最易走样 | golden 逐字节契约测试先行（迁移前生成），supertest 请求行零改动 |
| react-router + 旧地址过渡 | 深链 `/package/:code` 依赖 nginx fallback | BE-6 独立先行；FE-8 才废弃旧地址 |
| 功能回归 | 渲染层全量重写 + 框架替换 | 纯逻辑函数原样平移；每票带对照验收；QA-1 全契约回归 |
| 500 行上限 | Fastify 化后 app.ts 若不拆 routes 会膨胀 | §3.2 文件结构上限先行写入票据 |
| 视觉验收主观性 | 外观允许不同但语义要守住 | 验收只对色值/字体/琥珀语义与十四条契约，不对像素 |

## 10. 票据索引

`docs/tickets/README.md`：依赖图、施工顺序、角色分配。BE-1…BE-4（拆分）、BE-5（Fastify）、BE-6（部署）；FE-1（脚手架）→ FE-2（壳+主题+路由）→ FE-3/4/5（搜索线）、FE-6/7（竞品线）→ FE-8（收口）；QA-1（回归验收）。
