# 架构设计：MCP 服务加固（紧凑输出 / search 上限 / 异常兜底）

依据 `server/lib/mcp.ts`（现状 15 工具全部 `app.inject` 复用 HTTP 路由）、`shared/competitorTypes.ts`（`PackageDetail`/`SnapshotEntry`/`DayDetail` 契约）、`docs/tickets/README.md` 全局约定。本文只做模块边界、投影契约与错误语义设计，不含业务实现代码。范围严格锁定为背景中的三项，不做鉴权、SSE、分页、缓存。

---

## 0. 实测基线（2026-11-24，线上 7001 只读测量）

| 测量项 | 数值 |
| --- | --- |
| `GET /api/competitor/day/2026-11-23`（28 包，first_ad） | 73,265 B 原始 JSON |
| 同上经 MCP `result()`（`JSON.stringify(data, null, 2)` 缩进膨胀） | 88,955 B ≈ 90KB |
| 其中 28 包 `appStoreJson` 合计 | 54,233 B（占 61%） |
| 其中 `description` 合计 | 21,813 B |
| 其中 `screenshotUrls` 合计 | 12,590 B |
| 其中 `versionHistory`（json 内）合计 | 4,274 B |
| 顶层 `versions` 合计（单日明细中基本为空数组） | 56 B |
| `GET /api/competitor/summary?date=2026-11-23` | 13,072 B |
| `GET /api/public/shelf/packages`（100 行） | 31,843 B（约 320 B/行） |
| `GET /api/competitor/package/:code` / `.../history`（3 周） | 5,458 B / 4,674 B |
| `search_apps` 单查询耗时 / 服务端并发 | 约 4.75 s / 3（线性外推） |

结论：体积问题集中在「每包完整 `appStoreJson`」+ MCP 序列化缩进；`competitor_day` 是唯一显著超标的工具。

## 1. 模块图（文字）

```text
server/lib/mcp.ts（改）                server/lib/mcpCompact.ts（新，≤200 行）
  工具注册 / inject / result()           深模块：三个纯投影函数
  /mcp 路由 + 兜底 catch                compactDayDetail / compactPackageDetail /
    │                                   compactPackageHistory
    └── 命中三个竞品明细工具时调用 ──────▶  内部 seam：compactStoreJson（私享）
        （compact=false 时跳过投影）        导出 Compact* 类型（供测试断言）
```

依赖方向不变：`mcpCompact.ts` 只 import `shared/competitorTypes` 的**类型**（type-only，无运行时耦合）；HTTP 路由层零改动；`shared/` 不新增任何文件。模块边界的删除测试：删掉 `mcpCompact.ts`，90KB 体积问题在每次 `competitor_day` 调用原样重现，且没有任何别处需要这段投影逻辑——它赚得其存在；反之若做「路由加 `compact` 参数」方案，投影逻辑将扩散进 3 个路由 + 对应契约测试，而 HTTP 前端永远用不到它。

## 2. 关键决策

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 投影落点（seam） | **MCP 层投影**，新建 `server/lib/mcpCompact.ts`；不给路由加 `compact` 参数 | HTTP 契约冻结（全局约定）；投影是 agent 专属关注点，路由/前端永不需要；MCP 层一个调用点/工具，改动面最小 |
| compact 默认值 | **MCP 三个竞品明细工具默认 `compact=true`**，显式传 `compact=false` 取全量 | MCP 消费者是 LLM，90KB 缩进 JSON 纯烧 token 且逼近客户端超时；HTTP 路由与前端零感知；全量路径保留为显式逃生口，无信息永久丢失 |
| 序列化格式 | **`result()` 去掉缩进**：`JSON.stringify(data)`，15 个工具统一生效 | 一行改动，单日明细再省 8KB（89KB 中缩进占 8.4KB）；现有测试全部 `JSON.parse(text)` 断言，不受影响；LLM 解析无缩进 JSON 无障碍。 |
| 需要投影的工具 | `competitor_day`、`competitor_package`、`competitor_package_history` 三个 | 唯一携带逐包 `appStoreJson` 的三个工具（见 §3 取舍） |
| search 上限 | **10**，超出返回可读 tool error | 单查 4.75 s、并发 3 → 10 查约 16 s，低于常见 MCP 客户端 30 s 超时且留余量；20 查约 32 s 会踩线。上限只加在 MCP 工具层，HTTP 路由不动 |
| 延迟提示 | 写进 `search_apps` 的 `description`，不加代码 | agent 读描述即可自行分批，零实现成本 |
| 兜底响应 | 头未发：HTTP 500 + JSON-RPC 2.0 error（code -32603，回显请求 `id`）；头已发：`reply.raw.destroy()` 断开 | hijack 后 Fastify 无法代写响应；回显 `id` 让客户端能对账；头已发时状态码不可改写，断开是最诚实的失败信号 |
| 兜底日志 | `console.error("[mcp]", 错误类型, 堆栈帧)`，**不含 error.message、不含请求体** | `console.error` 是本仓库既定日志模式（`server/index.ts`、`competitorSync.ts`）；SDK 校验错误的 message 可能内嵌请求值（含验证码），整段丢弃 message 行最稳妥 |
| 类型位置 | `Compact*` 类型导出自 `mcpCompact.ts`，**不进 `shared/`** | `shared/` 是前后端 seam，compact 是 MCP 专属形态；前端永不消费 |

## 3. 不投影的三个工具（取舍理由）

| 工具 | 实测 | 结论 |
| --- | --- | --- |
| `shelf_packages` | 320 B/行，已是 `shelfQueries` 白名单投影（`resolved`/`sourceName` 那套），无长文本 | **不投影**。风险仅在 `limit=500`（约 160KB），由调用方 `limit` 自控，且工具 schema 已带 1..500 上限；再立一套投影属过度设计 |
| `competitor_summary` | 单日 13KB；聚合形态（组计数 + `PackageBrief`）本身就是紧凑投影 | **不投影**。区间模式理论可达 31 天 × 组数，但 `PackageBrief` 每包仅 ~120B 且 `missedPackages/pendingPackages` 天然短；若未来实测超 100KB 再立票，不在本次范围 |
| `competitor_days` | 日历级 `DaySummary` 列表，KB 级 | **不投影**，无收益 |

## 4. compact 精确契约

### 4.1 `competitor_day`（输入 `PackageDetail`，输出 `CompactDayDetail`）

```text
{ date, dateKind, batch: BatchRow 原样, packages: CompactPackage[] }
```

`batch` 整条原样保留（单日仅一条、约 300B，对账 `syncId`/`stale` 有用）。

### 4.2 `CompactPackage`（`competitor_day` 与 `competitor_package` 共用底座）

**原样保留**（值与可空性不变）：

```text
packageCode, targetDate, displayName, team,
firstAdDate, listingDate, offlineDate,          // 首投/上架/下架
category, appVersion, minimumOsVersion,         // 类目/版本/iOS 最低
lookupStatus, enrichStatus, assetStatus,        // 状态
appleId
```

**派生字段**：

| 字段 | 规则 |
| --- | --- |
| `hasIcon` | `iconLocalPath !== null` → boolean |
| `screenshotCount` | `screenshotLocalPaths.length` |
| `versionCount` | `versions.length` |
| `store` | **仅 `lookupStatus === "hit"` 时存在**，否则整个键省略（不是 null）。内容见 4.3 |

**省略**（compact 下永不出现）：`first100Date`、`fetchedAt`、`iconLocalPath`、`screenshotLocalPaths`、`versions`（由计数/派生替代）、`appStoreJson` 整体。

### 4.3 `store`（`appStoreJson` 的白名单子集，仅命中包）

**原样保留**：`name`、`developer`、`formattedPrice`、`currency`、`averageUserRating`、`userRatingCount`、`privacy`（实测约 127B，隐私摘要整体保留）。

**截断**：

| 字段 | 规则 | 截断标记 |
| --- | --- | --- |
| `description` | 按码点取前 160（`[...s].slice(0, 160).join("")`，防劈开代理对） | 截断时追加 `descriptionTruncated: true`；未截断不出现该键 |
| `iapItems` | 数组取前 5 项，项内容原样 | 截断时追加 `iapItemsTruncated: true` |

**省略**：`versionHistory`（-4.3KB）、`screenshotUrls`（-12.6KB）、`iconUrl`、`appStoreUrl`、`bundleId`（= `packageCode` 冗余）、`price`（= `formattedPrice` 冗余）、`fileSizeBytes`、`appleId`/`category`/`minimumOsVersion`/`name`（顶层已有同值）。

### 4.4 `competitor_package` 额外规则（单包场景版本日志仍有价值）

`CompactPackage` 底座之上追加：

```text
latestVersions: 最近 5 条 { version, releasedAt }   // 省略 notes（版本日志属长文本）
versionsTruncated: true   // 仅当 versions.length > 5 时出现
```

实现建议：`compactPackage(p, { withVersions: boolean })` 一个私有参数区分 day / package 两个调用点（内部 seam，不外露）。day 场景 `withVersions: false`，package 场景 `true`。

### 4.5 `competitor_package_history`（输入 `SnapshotEntry`，输出 `CompactHistoryEntry[]`）

**原样保留**：`targetDate`、`team`、`lookupStatus`、`enrichStatus`、`assetStatus`、`category`、`appVersion`、`minimumOsVersion`。

**`store`**：同 4.3（仅 `lookupStatus === "hit"` 时存在）。

**省略**：`fetchedAt`、`appStoreJson` 整体。外层 `{ packageCode, snapshots }` 结构不变。

### 4.6 默认值与参数

三个工具的 `inputSchema` 各追加一个可选参数：

```ts
compact: z.boolean().optional().describe("默认 true：紧凑投影，省略长文本与原始 JSON；传 false 取全量")
```

处理规则：`compact === false` 时**原样透传**路由响应（与今天字节级一致）；`undefined` 或 `true` 时走投影。HTTP 路由默认输出**始终不变**（前端依赖）。

### 4.7 体积目标与测量

2026-11-23（28 包，first_ad）：

| 场景 | MCP `content[0].text` 预算 | 实测/降幅 |
| --- | --- | --- |
| compact + 去缩进，每包 0 条 IAP（当日真实数据） | — | 23,215 B |
| compact + 去缩进，每包 5 条 IAP（最坏情形守卫） | **≤32KB** | 28,177 B（-68%） |

> 最初按 25KB 设门槛，但体积对每包 IAP 数量敏感（3 条即 26.2KB）。IAP 是竞品分析的关键字段，不为此下调 5 条上限；改为按「28 包 × 5 条 IAP」的最坏情形设 32KB 硬门槛，0 IAP 日仍约 23KB。该预算是回归守卫，不是产品契约；包数增长时按线性估算。

测量方法（QA 固化，见 QA-1）：

```bash
# 本地起服务后，走一次真实 tools/call，量 text 长度（node 脚本用 app.inject，见 QA-1 第 4 项）
# 快速旁证（HTTP 侧全量基线不变）：
curl -s http://127.0.0.1:7001/api/competitor/day/2026-11-23 | wc -c   # 应仍为 ~73KB
```

契约测试中固化的守卫断言（与 fixture 无关的形状断言，不做绝对字节数断言）：compact 输出 `JSON.stringify` 后不含 `"appStoreJson"`、`"screenshotLocalPaths"`、`"versionHistory"`、`"descriptionTruncated":false`（标记只在该真时出现）。

## 5. `search_apps` 批量上限

- 上限 **10**：单查 4.75 s、服务端并发 3（`SEARCH_CONCURRENCY` 默认）→ 10 查约 16 s；20 查约 32 s，越过常见 MCP 客户端 30 s 超时线。10 留出近一倍余量。
- 实现：工具 handler 在 `request()` **之前**检查 `queries.length > 10` 即 `throw new Error(...)`——`run()` 现有 catch 会转成 `isError: true` 的 tool result，不新增错误通道。
- 错误文案（可读、指路）：`queries 数量超过上限 10（当前 N），请拆分为多次调用，每次不超过 10 条`。
- 超限时**不得发起任何 inject**（上游 `/api/search-apps` 不被触碰）。
- `description` 追加延迟提示：`每次查询约 5 秒、服务端并发 3，10 条约 16 秒，请耐心等待并分批调用`。
- zod schema 侧同步 `.max(10)`（双保险，schema 层报错信息次之，handler 层文案为主）。
- HTTP `POST /api/search-apps` 与前端行为不变：不加任何上限。

## 6. `/mcp` 异常兜底语义

现状：`reply.hijack()` 后 `transport.handleRequest` 一旦抛错，Fastify 已交出响应权，客户端可能只见空 500。目标语义：

```text
POST /mcp，transport.handleRequest 抛错：
  ├─ reply.raw.headersSent === false
  │    → writeHead(500, content-type: application/json)
  │      end({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: <回显> })
  │      id 取 request.body.id（string|number 时原样回显，否则 null）
  └─ reply.raw.headersSent === true
       → reply.raw.destroy()   // 状态码已不可改，断开让客户端感知失败
`handleRequest` 两分支后都走 finally 的 `transport.close()`；若 `mcp.connect` 在 `start` 阶段抛错，则视为未连接、不调用 close（由 SDK 自身清理），但仍走同一兜底响应。
GET/DELETE /mcp 的 405 行为完全不动
```

日志（唯一落点 `console.error`，模式同 `server/index.ts`）：

- 记录：错误类型（`error.constructor.name`）+ 堆栈帧（`error.stack` 去掉首行 message 后的剩余行）。
- **不记录**：`error.message`（SDK 校验错误 message 可能内嵌请求值，含验证码场景）、`request.body`、任何请求参数。

已知风险照旧（明确不在本次范围）：MCP 客户端日志可能记录 `ipa_download_submit_code` 的验证码，服务端无法消除。

## 7. 前后兼容性

| 面 | 影响 |
| --- | --- |
| HTTP 路由（`/api/competitor/*`、`/api/search-apps`、`/api/public/shelf/*`） | **零改动**。所有现有契约测试（`competitorContract`、`httpContract`、`searchAppsApi.*`）零改动零失败即为本设计的验收条件 |
| 前端（`src/`） | 零改动（不经过 MCP） |
| MCP agent 既有调用 | `competitor_day/package/history` 默认输出变小（字段减少）——这是**有意的行为变更**，靠工具描述里的 compact 说明兜底；`compact=false` 可取回全量。其余 12 个工具仅序列化缩进变化（若 §2 序列化决策通过） |
| `tools/list` | 三个工具多一个 `compact` 参数、`search_apps` 描述变长，其余不变 |

## 8. 测试计划

| 层 | 文件 | 要点 |
| --- | --- | --- |
| 投影纯函数 | `tests/server/mcpCompact.test.ts`（新） | 直测三个投影函数：长 description（>160 码点，含 emoji 代理对）截断与标记、iapItems 6 条截 5、versions 7 条截 5、未命中包无 `store` 键、`withVersions` 两分支、batch 原样透传 |
| MCP 契约 | `tests/server/mcpContract.test.ts`（扩） | ① `competitor_day` 默认 compact：fixture 带真实形状 `appStoreJson`，断言 §4.7 守卫词零命中 + `hasIcon`/`screenshotCount`/`versionCount` 类型；② `compact=false`：`appStoreJson` 与全量 description 回归；③ `competitor_package` / `competitor_package_history` 同两分支；④ `search_apps` 11 条 → `isError` 且文案含「上限 10」，且 `deps.lookupAppStore` 零调用 |
| 兜底 | `tests/server/mcpRouteFallback.test.ts`（新） | `vi.mock` SDK transport：① handleRequest 同步抛错 → 500 + JSON-RPC error 体 + `id` 回显 + `content-type: application/json`；② 抛错前已 `writeHead` → 响应被销毁、无未捕获异常；③ spy `console.error` 断言日志不含 fixture 请求体字符串；④ GET/DELETE 405 不受影响 |
| 行数 | `tests/lineLimit.test.ts` | `mcpCompact.ts` ≤200 行、`mcp.ts` 改后 ≤350 行，无新豁免 |
| 回归 | 现有全部测试 | 零改动零失败（HTTP 面）
| 体积 | QA-1 第 4 项 | 28 包 fixture 的 `content[0].text.length` 折算 + 线上 curl 旁证（§4.7） |

## 9. 风险与备选

1. **投影丢字段影响 agent 判断**：compact 保留周报所需全部结构化字段（§4.2 白名单即用户需求清单的逐项映射）；长文本丢失由 `compact=false` 逃生口兜底。备选方案（已否决）：路由加 `compact` 参数——见 §2 理由。
2. **`appStoreJson` 键名漂移**（同 shelf-trend DESIGN §8.2）：`store` 子集依赖商品页抓取写入的键名；契约测试 fixture 必须用实测键名（§0 已列全）。
3. **`SnapshotEntry` 无 `appleId`/`listingDate`**：history 投影天然比 day 少字段，属类型差异非缺陷，测试各自断言。
4. **兜底测试依赖 `vi.mock` SDK**：transport 是 handler 内构造的，无法依赖注入；mock 模块是唯一无侵入手段，SDK 升级时该测试需同步（注释标注 SDK 版本）。
5. **序列化去缩进影响全部 15 工具**：低风险（测试全 `JSON.parse`），已拍板执行；回滚只需恢复 `indent=2`，体积预算相应上调约 8KB。
6. **search 上限 10 可能不够用**：agent 可分批调用（错误文案已指路）；若实测反馈频繁撞限，调一行常量即可，不预留配置项（反对过度设计）。

## 10. 验收标准（汇总）

1. `npm test`、`npx tsc --noEmit`、`npm run build` 全绿；现有 HTTP 契约测试零改动。
2. `competitor_day`（28 包 × 每包 5 条 IAP 的最坏情形 fixture）compact 输出 ≤32KB，HTTP 侧同日响应字节不变。
3. `search_apps` 11 条 queries 返回可读 tool error 且上游零调用；10 条以内行为不变。
4. 构造 transport 抛错时客户端收到 JSON-RPC 2.0 error（500）而非空响应；日志无请求体。
5. 新文件行数达标，无 `lineLimit` 豁免。
