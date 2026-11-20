# FE-7 /package/:code 竞品详情路由化

- 依赖：FE-6
- 角色：frontend-developer
- 对应 ARCH §2、§8.2；实现规范 = 现 `src/competitor/renderPackageDetail.ts`（606 行）与 `main.ts` 的 detail 段（`renderDetailView`/`loadDetail`/`findDetailContext`/`openDetail`/`backToList`）

## 背景

竞品详情从页内视图（`?view=detail&competitor=&package=`）迁到路由 `/package/:code`。数据 `getCompetitorPackage(code)`；返回列表用路由回退（保留原筛选 query）。深链依赖 BE-6 的 nginx fallback。

## 范围

**做**（`src/competitor/detail/` + `src/competitor/`，各 ≤200 行）：

| 文件 | 内容 | 旧实现参考 |
| --- | --- | --- |
| `Detail.tsx`（壳，~150） | `useParams` 取 code、装载、返回导航（`navigate(-1)` 或回 `/` 保留 query）、头部团队/名称 | `renderDetailView` `loadDetail` `findDetailContext` `buildDetailHref` |
| `detail/Identity.tsx` | 图标、名称（App Store 名称语义同 FE-6 `storeName`）、团队、`Badge` 状态 | `createIdentity` |
| `detail/Metrics.tsx` | 指标条（大小/版本等） | `createMetricBar` `formatSize` |
| `detail/IapSection.tsx` | IAP 条目 | `createIapSection` `iapEntries` |
| `detail/Description.tsx` | 描述区（安全截断规则同旧） | `createDescriptionSection` |
| `detail/VersionHistory.tsx` | 版本历史（日期格式同旧 `dateOnly`） | `createVersionHistory` |
| `detail/Screenshots.tsx` | 截图区 + Astryx `Lightbox`；外链安全规则 `safeExternalUrl` 平移 | `createScreenshotSection` |
| `detail/CopyValue.tsx` | 复制按钮（Bundle ID/Apple ID/URL 等，成功反馈同旧） | `createCopyValue` |
| `detail/MissedPanel.tsx` | 未命中面板文案 | `createMissedPanel` |
| `detail/InfoRows.tsx` | 通用信息行（`assetStatusLabel` 等文案表平移） | `createInfoRow` `createInfoList` `assetStatusLabel` `jsonString` |

**删**：`src/competitor/renderPackageDetail.ts`（606 行）与 `competitorPage.test.ts` 残余 detail 断言（已由 FE-6 大部分迁走，本票清零）；新测试 `tests/frontend/competitorDetail.test.ts`（≤500）。

**不做**：改 API；详情内加类目筛选等新功能。

## 验收

1. `npm test` 全绿；dev 与（BE-6 合入后的）本地 nginx 均可：列表点包 → `/package/<code>` → 浏览器返回回到原筛选状态；直接深链打开详情可用。
2. 行为对照清单逐条勾：复制按钮反馈、missed panel 文案、版本历史日期格式、截图 Lightbox、外链仅 https 安全白名单、未找到包的错误 `Banner`。
3. `git grep -l "renderPackageDetail" src/ tests/` 零命中；行数豁免清单划掉 `src/competitor/renderPackageDetail.ts`。
4. 新文件全 ≤500 行。

## 风险

返回列表丢筛选：`navigate(-1)` 在深链进入（无历史）时需兜底跳 `/`；验收第 1 条两种进入方式都查。
