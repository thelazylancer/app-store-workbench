# FE-4 搜索页 inspector 完整对齐

- 依赖：FE-3
- 角色：frontend-developer
- 对应 ARCH §8.2；实现规范 = `git show <FE-3 前提交>:src/lib/renderResults.ts`（1425 行）的 inspector 各段

## 背景

FE-3 交付了 inspector 基础信息；本票补齐与旧版对等的全部区块，然后删除 `src/lib/renderResults.ts` 与 `tests/frontend/renderResults.test.ts`（1553 行——重写为按组件的新测试）。

## 范围

**做**（新文件均在 `src/search/inspector/`，各 ≤250 行）：

| 文件 | 内容 | 旧实现参考 |
| --- | --- | --- |
| `Screenshots.tsx` | 截图墙 + Astryx `Lightbox`（键盘关灯、焦点行为由组件自带） | `createScreenshot` `createScreenshotLightbox`、高清图 URL 规则 `getHighResolutionScreenshotUrl` |
| `VersionHistory.tsx` | 版本历史列表（日期/版本号格式沿用 `formatReleaseDate`） | `createVersionHistory` |
| `IapSection.tsx` | IAP 条目行与 hint 文案（`formatIapHint`/`formatIapItemCount` 语义） | `createIapRow` |
| `Candidates.tsx` | 候选对比区：候选行 + 缩略图触发同款 lightbox | `src/styles.css` L1463 起的 candidate 区块逻辑 |
| `Identifiers.tsx` | 标识区收口（若 FE-3 已含基础部分则仅补差） | `createIdentifier` `createInfoRow` |
| `FactsPills.tsx` | 事实 pill 集（IAP/大小/评分等 label 集） | `createFactPill` `createStatusBadge` |

**删**：`src/lib/renderResults.ts`、`tests/frontend/renderResults.test.ts`（其 1553 行断言按组件拆写为 `tests/frontend/inspector/*.test.ts`，各 ≤500 行）。

**不做**：IPA 控件（FE-5）；改 `src/lib/api.ts` 请求。

## 验收

1. `npm test` 全绿；`git grep -l "renderResults" src/ tests/` 零命中。
2. 行为对照清单逐条勾：截图点开 Lightbox 可键盘关闭、高清 URL 替换生效、版本历史格式与旧版一致、IAP hint 三态文案、候选区点缩略图进同一 Lightbox。
3. 行数豁免清单划掉 `src/lib/renderResults.ts`、`tests/frontend/renderResults.test.ts`。
4. 新文件全部 ≤500 行。

## 风险

1553 行旧测试是行为规范库，拆写时允许换断言风格但**不允许丢覆盖**：FE-4 前后 `npx vitest run tests/frontend --reporter=verbose` 的用例主题清单人工对齐后再合入。
