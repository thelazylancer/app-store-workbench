# BE-1 MCP 紧凑输出投影（server/lib/mcpCompact.ts + 工具接线）

- 依赖：无（独立可开工；与 BE-2/BE-3 都改 `server/lib/mcp.ts`，合并顺序任意但需 rebase）
- 角色：backend-developer
- 对应 DESIGN.md §1（模块图）、§2（决策表前三行）、§4（compact 契约）、§7、§8 前两行

## 背景

`competitor_day`（2026-11-23，28 包）MCP 输出约 90KB，61% 是每包完整 `appStoreJson`，再加 `result()` 的 `indent=2` 缩进膨胀 8.4KB。MCP 消费者是 LLM，纯烧 token 且逼近客户端超时。HTTP 路由契约冻结，投影只能落在 MCP 层。

## 精确改动点

1. **新建 `server/lib/mcpCompact.ts`（≤200 行）**，导出三个纯函数与对应类型（类型不进 `shared/`）：

   ```ts
   export function compactDayDetail(day: DayDetail): CompactDayDetail;
   export function compactPackageDetail(pkg: PackageDetail): CompactPackage;
   export function compactPackageHistory(resp: { packageCode: string; snapshots: SnapshotEntry[] }): CompactHistory;
   ```

   内部实现建议：私有 `compactPackage(p: PackageDetail, opts: { withVersions: boolean })` + 私有 `compactStoreJson(appStoreJson)`，被三个导出函数复用。字段清单严格照 DESIGN.md §4.2–§4.5：

   - 原样保留 14 个白名单字段；派生 `hasIcon` / `screenshotCount` / `versionCount`；`store` 仅 `lookupStatus === "hit"` 时存在。
   - `store.description` 按码点截 160（`[...s].slice(0, 160).join("")`），截断才加 `descriptionTruncated: true`；`store.iapItems` 截前 5，截断才加 `iapItemsTruncated: true`；`privacy` 原样整体保留。
   - `compactPackageDetail` 追加 `latestVersions`（最近 5 条 `{ version, releasedAt }`，省略 notes）+ 条件性 `versionsTruncated: true`。
   - history 条目保留 8 字段 + `store`（同规则），省略 `fetchedAt` 与 `appStoreJson`。
   - `compactDayDetail` 的 `batch`（`BatchRow`）整条原样透传。

2. **改 `server/lib/mcp.ts`**：
   - `competitor_day` / `competitor_package` / `competitor_package_history` 三个工具（`registerTools` 内）的 `inputSchema` 各加 `compact: z.boolean().optional().describe("默认 true：紧凑投影，省略长文本与原始 JSON；传 false 取全量")`。
   - 三个 handler 改为：`const data = await request(...)`，`compact === false` 时原样 `data`，否则套对应投影函数（`run()` 包装不变）。
   - `result()`：`JSON.stringify(data, null, 2)` → `JSON.stringify(data)`。⚠ 该行为面变更需用户先拍板；被否决则此行不动，体积验收目标改为 ≤32KB。

3. 三个工具的 `description` 尾部各补一句：「默认返回紧凑投影，传 `compact: false` 可取全量」。

**不做**：路由层任何改动；`shared/` 任何改动；其余 12 个工具的 handler。

## 验收标准

1. `tests/server/mcpCompact.test.ts` 全绿，覆盖：>160 码点 description（含 emoji 代理对）截断且 `descriptionTruncated` 出现、恰 160 码点时标记不出现、iapItems 6→5、versions 7→latestVersions 5 + `versionsTruncated`、未命中包输出不含 `store` 键、`compactDayDetail` 的 batch 原样、history 条目字段集与 DESIGN §4.5 逐项一致。
2. `tests/server/mcpContract.test.ts` 扩展用例全绿：带真实形状 `appStoreJson` 的 fixture（键名照 DESIGN §0 实测清单）走 `tools/call`，compact 默认输出 `JSON.stringify` 后不含 `"appStoreJson"`/`"screenshotLocalPaths"`/`"versionHistory"`；`compact: false` 输出含全量 `description` 与 `appStoreJson`。
3. 现有全部测试零改动零失败（HTTP 面不变）。
4. `npx tsc --noEmit` 通过；`mcpCompact.ts` ≤200 行、`mcp.ts` ≤350 行、无 `lineLimit` 豁免。

## 测试点速记

代理对截断（" 😀".slice 会劈开，用码点切片）；截断标记的条件性（只在真截断时出现，防 agent 误读）；未命中包 `store` 键整体省略而非 null；`compact=false` 的字节级透传（投影函数不得被调用）。
