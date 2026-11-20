# BE-3 拆分 scripts/fetch-app-store-details.ts（CLI 行为不变）

- 依赖：无
- 角色：backend-developer
- 对应 ARCH §1、§4

## 背景

`scripts/fetch-app-store-details.ts`（777 行）超上限。它是独立 CLI（`npm run fetch:app-store`），与 server 进程无 import 关系。

## 范围

**做**：纯函数移入 `scripts/lib/appStoreFetch/`，CLI 只留 `main()`。

**不做**：改参数（`--input` `--out` `--delay` `--refresh`）、请求时延、缓存 raw 文件名规则、输出 CSV 的列与字节格式。

## 实现指引

| 新文件 | 平移函数（现行号见源文件） |
| --- | --- |
| `csv.ts` | `parseCsv` `csvCell` `readInputRows` `cacheFileName` |
| `itunes.ts` | `requestJson` `USER_AGENT` |
| `nameMatch.ts` | `normalizeName` `levenshtein` `namesMatch` `candidatesFromSearch` `hasProductDetail` `lookupFoundFor` |
| `media.ts` | `materializeMediaUrl` `collectMediaByType` `flattenMediaByPrefix` |
| `extract.ts` | `extractAppDetails` |

`scripts/fetch-app-store-details.ts` 保留 `argValue` `sleep` `main()`。

## 验收

1. `npm test` 全绿。
2. 用小 CSV（3 行）跑 `npm run fetch:app-store -- --input <小样例>`，输出目录结构与 CSV 字段与拆分前一致（可用同一 raw 缓存目录对比字节）。
3. 各文件 ≤500 行；豁免清单划掉该脚本。

## 风险

`extractAppDetails` 的字段抽取最复杂，必须整体搬移不得重写；对拍以旧实现输出的 raw JSON 为准。
