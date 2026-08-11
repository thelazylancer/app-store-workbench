# Node + TypeScript Apple App Store 开源库替代方案研究

> 研究日期：2026-08-11
> 研究范围：公共 App Store 竞品数据、Apple 官方开发者接口，以及适用于当前 Node + TypeScript 工程的开源客户端。
> 结论类型：资料评估，不构成对 Apple 私有接口稳定性的保证。

## 结论先行

针对当前工程，最值得评估的公共数据 enrichment 库是 [@perttu/app-store-scraper](https://github.com/plahteenlahti/app-store-scraper)：它是 TypeScript 重写版，公开暴露搜索、详情、评分、评论、隐私、相似应用和版本历史等能力，覆盖面明显超过当前工程的基础搜索链路。它仍然依赖 App Store 页面及未公开接口，隐私和版本历史属于页面抓取，不能把它当作 Apple 官方稳定 API。[项目 README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)、[导出 API](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)、[应用详情实现](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/app.ts)

当前工程已经直接调用 Apple 的 iTunes Search API，并通过渲染 App Store 页面补充 IAP、截图和版本历史。因此，node-itunes-search 与 itunes-store-api 对现有搜索能力的增益很小：它们主要只是官方 Search/Lookup API 的薄封装，不能补充评论、隐私、相似应用或 IAP。前者还存在 package.json 的 types 元数据指向 JavaScript 文件的兼容性疑点。[当前搜索实现](../../server/lib/appleLookup.ts)、[当前页面数据实现](../../server/lib/productPage.ts)、[node-itunes-search package.json](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/package.json)、[itunes-store-api package.json](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/package.json)

没有在本次核查的公共开源库中发现能够稳定提供“任意竞品应用 IAP 目录”的方案。Apple 的 App Store Connect API 可以管理 IAP、读取客户评论等，但资源属于经过 JWT 鉴权的开发者账号；Apple 的 App Store Server API 处理的是自己应用用户的购买交易和通知，两者都不是公共竞品目录 API。[App Store Connect API 概览](https://developer.apple.com/app-store-connect/api/)、[Apple 的 Apps 资源说明](https://developer.apple.com/documentation/appstoreconnectapi/apps)、[Apple 的 IAP 文档](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases)、[App Store Server API](https://developer.apple.com/documentation/appstoreserverapi/)

推荐路径是：保留当前官方 Search/Lookup 作为主链路；如果确实需要评分/评论、隐私、相似应用和版本历史，再把 @perttu/app-store-scraper 接到一个可选 enrichment adapter 后面；IAP 继续由当前页面解析器负责，并为页面抓取增加缓存、超时、降级和 fixture 测试。当前研究只新增本文件，没有修改现有代码或依赖。

## 1. 当前工程基线

当前工程是 Node + TypeScript 项目，package.json 已包含从 GitHub master 安装的原始 app-store-scraper，但现有业务链路并不是依赖它完成全部能力。[package.json](../../package.json)

当前代码的职责边界如下：

- [server/lib/appleLookup.ts](../../server/lib/appleLookup.ts) 直接请求 https://itunes.apple.com/search，按关键词和 software 实体搜索，并将 Apple 返回的 trackId 映射为工程内部的 appleId。这与 Apple 官方文档中的 Search API 和 Lookup API 模型一致。[Apple Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html)、[Apple Lookup 示例](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)
- [server/lib/productPage.ts](../../server/lib/productPage.ts) 通过 App Store 页面数据补充截图、IAP 和版本历史。它承担了公共 Search/Lookup API 没有直接提供的页面信息。
- 该工程当前需要的是“任意 App Store 应用的公共竞品信息”，不是只管理开发者自己账号下的 App Store Connect 应用。因此，下面把公共抓取库和账号鉴权 SDK 分开比较。

Apple 官方 Search API 支持搜索 iTunes、App Store、iBooks Store 和 Mac App Store，搜索端点为 https://itunes.apple.com/search；官方还提供按 ID 的 Lookup，文档明确说明 ID 查询更快且误匹配更少。[官方 API 概览](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)、[搜索参数](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html)、[Lookup 示例](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)

## 2. 能力矩阵

符号说明：

- ✓：README、公开源码或官方文档明确暴露该能力。
- △：只能得到底层 API 的部分原始字段，或需要自行拼接/解析。
- —：未发现公开 API、方法或文档承诺该能力；不表示理论上绝对不可实现。
- N/A：接口服务的对象范围与当前“公共竞品搜索”不同。

| 方案 | 搜索 | App 详情 | Apple ID / trackId | 评分 / 评论 | 隐私 | 相似应用 | 版本历史 | IAP | TypeScript 类型 | 维护与依赖风险 |
|---|---|---|---|---|---|---|---|---|---|---|
| 当前工程：官方 Search/Lookup + 页面解析 | ✓ | ✓ | ✓，现有代码映射 trackId | △，当前字段有限 | — | — | ✓，页面解析 | ✓，页面解析 | 工程自身类型 | 官方公开 Search API；页面字段和抓取链路仍会变化。[现有实现](../../server/lib/appleLookup.ts) |
| 原始 [app-store-scraper](https://github.com/facundoolano/app-store-scraper) | ✓ | ✓ | ✓，app 接受 iTunes trackId | ✓，含 ratings/reviews 方法 | ✓ | ✓ | ✓，有 versionHistory | — | —，package.json 没有 types | README 覆盖面广，但 package.json 仍含 request、cheerio 等运行时依赖；发布版为 0.18.0，GitHub master 是移动目标。[README](https://github.com/facundoolano/app-store-scraper)、[package.json](https://raw.githubusercontent.com/facundoolano/app-store-scraper/master/package.json)、[提交记录](https://github.com/facundoolano/app-store-scraper/commits/master) |
| [@perttu/app-store-scraper](https://github.com/plahteenlahti/app-store-scraper) | ✓ | ✓ | ✓，按 trackId 或 bundle ID 查询 | ✓，评分、评分分布、评论 | ✓ | ✓ | ✓ | — | ✓，发布包声明 types 并提供 d.ts | TypeScript 重写、无 request；仍有 Cheerio/页面选择器和未公开接口风险。GitHub main 与 npm latest 的版本号存在差异，应固定已发布版本。[README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)、[package.json](https://raw.githubusercontent.com/plahteenlahti/app-store-scraper/main/package.json)、[npm 包](https://www.npmjs.com/package/@perttu/app-store-scraper) |
| [node-itunes-search](https://github.com/jacob-shuman/node-itunes-search) | ✓ | △，仅 Search/Lookup 原始结果 | ✓，有 trackId 类型 | —，没有评论/评分专用能力 | — | — | — | — | △，有 d.ts 构建，但 package.json 的 types 指向 dist/mod.js | 运行时零依赖、官方端点风险低；npm 最近发布较早，且需核验类型元数据。[README](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/README.md)、[package.json](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/package.json) |
| [itunes-store-api](https://github.com/marcbouchenoire/itunes-store-api) | ✓ | ✓，Search/Lookup 结果类型较完整 | ✓，有 trackId 和 bundle ID | △，类型含评分均值/数量；无评论文本 | — | — | — | — | ✓，发布包声明 dist/index.d.ts | 零运行时依赖、API 简单；但 npm 最新发布为 2022-04-04，维护新鲜度不足。[README](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/README.md)、[types.ts](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/src/types.ts)、[package.json](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/package.json)、[npm 包](https://www.npmjs.com/package/itunes-store-api) |
| [@rage-against-the-pixel/app-store-connect-api](https://github.com/RageAgainstThePixel/app-store-connect-api) | N/A，账号内 App | N/A，账号内资源 | N/A，不是公共 iTunes trackId 查询 | ✓，账号内 Customer Reviews | — | △，账号内版本资源 | ✓，账号内 IAP | ✓ | ✓，Apple OpenAPI 生成的类型 | 适合自有 App Store Connect 账号；需要 issuer ID、私钥和 JWT，jose 是主要运行时依赖。[README](https://raw.githubusercontent.com/RageAgainstThePixel/app-store-connect-api/main/README.md)、[package.json](https://raw.githubusercontent.com/RageAgainstThePixel/app-store-connect-api/main/package.json)、[Apple Apps API](https://developer.apple.com/documentation/appstoreconnectapi/apps) |
| [@apple/app-store-server-library](https://github.com/apple/app-store-server-library-node) | N/A | N/A | N/A | N/A，交易相关，不是公共评论 | N/A | N/A | N/A | △，处理自有用户交易/通知，不是 IAP 目录 | ✓ | Apple 官方维护的 Node 库；需要 App Store Server API 签名密钥，依赖 jsonwebtoken、jsrsasign、node-fetch 等。[README](https://raw.githubusercontent.com/apple/app-store-server-library-node/main/README.md)、[package.json](https://raw.githubusercontent.com/apple/app-store-server-library-node/main/package.json)、[Apple Server API](https://developer.apple.com/documentation/appstoreserverapi/) |

### 维护状态快照（截至 2026-08-11）

- 原始 app-store-scraper 的 npm 发布版为 0.18.0；GitHub master 提交记录页显示最近提交为 2025-07-27。它仍有活动迹象，但发布版、分支安装和类型声明都不够适合当前工程的可复现 TypeScript 依赖。[npm 包](https://www.npmjs.com/package/app-store-scraper)、[master 提交记录](https://github.com/facundoolano/app-store-scraper/commits/master)
- @perttu/app-store-scraper 的 npm latest 为 2.0.0，npm 页面显示 2025-12-05 发布；GitHub main 的 package.json 显示 2.0.1，说明仓库主分支可能领先于 npm 发布版。[npm 包](https://www.npmjs.com/package/@perttu/app-store-scraper)、[npm latest metadata](https://registry.npmjs.org/@perttu/app-store-scraper/latest)、[GitHub package.json](https://raw.githubusercontent.com/plahteenlahti/app-store-scraper/main/package.json)
- node-itunes-search 的 npm latest 为 3.0.0，npm 页面显示 2024-09-24 发布；它的能力范围窄，但版本仍比 itunes-store-api 新。[npm 包](https://www.npmjs.com/package/node-itunes-search)、[package.json](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/package.json)
- itunes-store-api 的 npm latest 为 2.1.0，npm 页面显示 2022-04-04 发布；零运行时依赖不能抵消长期未发布带来的维护风险。[npm 包](https://www.npmjs.com/package/itunes-store-api)、[package.json](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/package.json)
- Apple 官方 Node App Store Server Library 的 npm latest 为 3.1.0，属于持续维护的官方交易 SDK；但它服务的是 App Store Server API，而不是本文的公共竞品目录。[npm 包](https://www.npmjs.com/package/@apple/app-store-server-library)、[GitHub 提交记录](https://github.com/apple/app-store-server-library-node/commits/main)、[Apple Server API](https://developer.apple.com/documentation/appstoreserverapi/)

## 3. 候选方案核查

### 3.1 @perttu/app-store-scraper：公共竞品 enrichment 的首选

该库是原始 app-store-scraper 的 TypeScript 重写版，README 明确列出 app、search、reviews、ratings、privacy、suggest、similar 和 versionHistory 等方法；入口源码也导出了这些方法及其类型。[项目 README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)、[入口导出](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)

能力与当前需求的对应关系：

- app 通过 iTunes Lookup 按数字 ID 或 bundle ID 获取详情，结果把 trackId 作为应用 ID，并保留 bundle ID、评分均值、评分数量、截图等字段。[应用详情源码](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/app.ts)、[公共请求与结果映射](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/common.ts)
- reviews 和 ratings 是独立公开方法，因此它能补充当前工程缺少的评论文本、评分及评分分布。[入口导出](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)、[项目 README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)
- privacy 从 App Store 页面结构读取隐私信息；versionHistory 从页面对话框结构读取版本历史。这两项依赖 HTML 结构和页面数据，不属于 Apple 文档化的公共 JSON 合约。[privacy.ts](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/privacy.ts)、[version-history.ts](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/version-history.ts)
- similar 与 suggest 直接对应相似应用和推荐/联想能力。[项目 README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)、[入口导出](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)
- 公开入口和 README 没有 IAP 方法，也没有 inAppPurchases 结果模型；因此不能替换当前工程的 IAP 页面解析。[入口导出](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)、[项目 README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)

类型、版本和依赖方面，GitHub main 的 package.json 当前显示 2.0.1；npm registry 的 latest 为 2.0.0，npm 包页面显示该发布版在 2025-12-05 发布。这个“源码分支版本高于已发布版本”的差异说明生产环境不应直接依赖 GitHub main，而应在验证后固定 npm 发布版或精确 commit。[GitHub package.json](https://raw.githubusercontent.com/plahteenlahti/app-store-scraper/main/package.json)、[npm package metadata](https://registry.npmjs.org/@perttu/app-store-scraper/latest)、[npm 包页面](https://www.npmjs.com/package/@perttu/app-store-scraper)

该库的运行时依赖是 cheerio、fast-xml-parser 和 zod，没有原始库中的 request；不过隐私、版本历史和部分截图逻辑仍然依赖页面选择器或未公开页面行为，所以依赖风险从“旧 HTTP 客户端”转移为“Apple 页面/接口变更风险”。[发布 package.json](https://registry.npmjs.org/@perttu/app-store-scraper/latest)、[隐私源码](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/privacy.ts)、[版本历史源码](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/version-history.ts)

**判断：**这是当前研究范围内唯一同时覆盖搜索之外多项竞品情报的 TypeScript 候选，适合作为可选 enrichment 层，不适合作为唯一数据源，也不应承诺 IAP 能力。

### 3.2 原始 app-store-scraper：能力完整，但不建议继续作为新集成基础

原始库 README 覆盖 app、search、reviews、ratings、privacy、similar、versionHistory 等能力，app 参数接受 iTunes trackId 或 bundle ID。[README](https://github.com/facundoolano/app-store-scraper)

其 package.json 的发布版本为 0.18.0，运行时依赖包括 cheerio、debug、memoizee、ramda、request、throttled-request 和 xml2js，且没有 types 字段；这会给当前 TypeScript 工程带来额外声明文件和供应链维护成本。[package.json](https://raw.githubusercontent.com/facundoolano/app-store-scraper/master/package.json)

GitHub 提交记录页面显示最近的 master 提交为 2025-07-27，npm 发布版与 GitHub 分支之间存在版本/代码漂移风险；当前工程 package.json 还指向 github:...#master，这是一个随分支变化的安装目标。[提交记录](https://github.com/facundoolano/app-store-scraper/commits/master)、[当前 package.json](../../package.json)

另外，原库版本历史实现依赖从 App Store 页面中提取 token，再请求 amp-api-edge.apps.apple.com 的扩展数据；这种实现对页面 token 和 Apple 内部接口变更敏感。[version-history.js](https://raw.githubusercontent.com/facundoolano/app-store-scraper/master/lib/version-history.js)

**判断：**它仍可作为功能参考或短期验证工具，但不建议把它作为当前工程新的核心依赖；如果要继续使用其功能，应优先评估 TypeScript 重写版，并锁定可复现版本。

### 3.3 node-itunes-search：官方 API 薄封装，当前工程收益有限

该库 README 将自己定位为 iTunes Search API wrapper，导出 searchItunes 和 lookupItunes；源码分别请求 Apple 的 /search 和 /lookup 端点，并将 trackId 纳入结果类型。[README](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/README.md)、[search.ts](https://github.com/jacob-shuman/node-itunes-search/blob/main/src/search.ts)、[lookup.ts](https://github.com/jacob-shuman/node-itunes-search/blob/main/src/lookup.ts)、[results.ts](https://github.com/jacob-shuman/node-itunes-search/blob/main/src/results.ts)

它不提供评论、隐私、相似应用、版本历史或 IAP 的专用方法；这意味着引入后仍需要当前工程自己的映射与页面解析。[入口源码](https://github.com/jacob-shuman/node-itunes-search/blob/main/src/mod.ts)、[README](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/README.md)

package.json 显示版本 3.0.0、Node >=18、无运行时 dependencies，并且构建脚本会生成 d.ts；但其 types 字段写成 dist/mod.js，而不是声明文件路径，实际使用前应验证 TypeScript 解析行为。[package.json](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/package.json)、[npm 包](https://www.npmjs.com/package/node-itunes-search)

**判断：**如果需要一个零运行时依赖的 typed Search/Lookup 客户端，它是可选项；但当前工程已经直接调用同一官方端点，换库不会扩大功能面。

### 3.4 itunes-store-api：类型干净，但维护周期过旧

该库是 TypeScript iTunes Search API client，README 明确支持 search、lookup、App Store URL 解析和多项搜索参数；源码直接请求 https://itunes.apple.com。[README](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/README.md)、[入口源码](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/src/index.ts)

其 ResultSoftware 类型包含 trackId、bundle ID、截图、当前版本发布时间、averageUserRating、userRatingCount 等字段，因此比当前手写映射更完整，但仍没有评论文本、隐私、相似应用、版本历史或 IAP 专用接口。[types.ts](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/src/types.ts)

package.json 声明 types: ./dist/index.d.ts 且没有运行时 dependencies；但 npm 包页面显示最新 2.1.0 发布于 2022-04-04，作为新功能基础依赖的维护风险高于其代码复杂度。[package.json](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/package.json)、[npm 包页面](https://www.npmjs.com/package/itunes-store-api)、[npm latest metadata](https://registry.npmjs.org/itunes-store-api/latest)

**判断：**适合参考类型设计，不建议为了当前需求新增依赖；直接维护工程内的少量字段映射更简单。

### 3.5 App Store Connect 客户端：官方能力边界不同

Apple 的 App Store Connect API 是面向开发者工具的 REST API，调用需要 JWT；API key 来自开发者组织的 App Store Connect 账号，授权的是该账号的数据。[Apple API 概览](https://developer.apple.com/app-store-connect/api/)、[API key 鉴权](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)

Apple 的 Apps 资源表示开发者账号中注册的应用；相关资源可以管理 IAP、读取 Customer Reviews 等，但这不是按任意公共 trackId 查询竞品的接口。[Apps 资源](https://developer.apple.com/documentation/appstoreconnectapi/apps)、[获取 Apps](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps)、[Customer Reviews](https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews)、[管理 IAP](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases)

@rage-against-the-pixel/app-store-connect-api 是一个 TypeScript、由 Apple OpenAPI 生成的社区客户端，package.json 只保留较少运行时依赖，README 要求 issuer ID、key ID 和私钥。[README](https://raw.githubusercontent.com/RageAgainstThePixel/app-store-connect-api/main/README.md)、[package.json](https://raw.githubusercontent.com/RageAgainstThePixel/app-store-connect-api/main/package.json)

Apple 官方的 @apple/app-store-server-library 则面向 App Store Server API、服务器通知和交易/订阅相关流程；它需要 App Store Server API 签名密钥，职责是自有用户交易，不是公共 App Store 搜索或竞品 IAP 目录。[Apple Node 库 README](https://raw.githubusercontent.com/apple/app-store-server-library-node/main/README.md)、[package.json](https://raw.githubusercontent.com/apple/app-store-server-library-node/main/package.json)、[Apple Server API](https://developer.apple.com/documentation/appstoreserverapi/)

**判断：**未来如果工程增加“管理自己账号下的应用、IAP 或评论”的后台功能，应单独评估 App Store Connect API 客户端；这类库不能替代当前的公共竞品搜索链路。

## 4. 依赖、隐私与稳定性风险

### 公共 Search/Lookup API

Apple 文档公开了 Search/Lookup 端点和参数，但同时提示 Search API 有调用频率限制，建议缓存结果；这意味着无论使用原生 fetch 还是薄封装，都应在工程侧实现缓存、超时和限流。[Apple 搜索文档](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html)

### 页面抓取库

@perttu/app-store-scraper 和原始库都把部分能力实现为 App Store HTML/页面数据解析；页面选择器、地区页面、登录/反爬策略和内部接口变化都可能导致单项能力失效，即使 npm 包本身没有类型错误。[perttu 隐私实现](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/privacy.ts)、[perttu 版本历史实现](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/version-history.ts)、[原始库版本历史实现](https://raw.githubusercontent.com/facundoolano/app-store-scraper/master/lib/version-history.js)

因此，隐私、评分/评论、相似应用和版本历史应视为“可降级 enrichment”，不应阻塞基础搜索结果。建议按 trackId 建缓存，并对各 enrichment 方法分别设置超时和失败隔离；这是基于其抓取实现作出的工程推断。

### TypeScript 与供应链

- 原始库没有 types 字段且依赖 request；当前工程还使用 GitHub master 安装目标。两者叠加后，类型声明和版本可复现性都较弱。[原始 package.json](https://raw.githubusercontent.com/facundoolano/app-store-scraper/master/package.json)、[当前 package.json](../../package.json)
- @perttu 发布包声明 ESM/CJS 入口和类型声明，运行时依赖较少；但应使用已发布且固定的版本，不要直接安装 GitHub main。[perttu package.json](https://raw.githubusercontent.com/plahteenlahti/app-store-scraper/main/package.json)、[perttu npm metadata](https://registry.npmjs.org/@perttu/app-store-scraper/latest)
- node-itunes-search 和 itunes-store-api 都是较薄、无运行时依赖的客户端；它们的主要风险是维护停滞或类型元数据，而不是页面抓取。[node-itunes-search package.json](https://raw.githubusercontent.com/jacob-shuman/node-itunes-search/master/package.json)、[itunes-store-api package.json](https://raw.githubusercontent.com/marcbouchenoire/itunes-store-api/main/package.json)

### 隐私边界

本文比较的公共库读取的是 App Store 公共页面或公开 Search/Lookup 返回数据，不等于获得用户个人数据或 App Store Connect 私有数据。App Store Connect API 的 JWT 和组织 key 只应在服务端安全保存；Apple 官方文档将其权限范围描述为开发者账号自己的数据。[Apple API key 文档](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)

## 5. 针对当前工程的推荐

1. **基础链路保留现有实现。** 当前 appleLookup.ts 已经使用 Apple 官方 Search API，并且 trackId 已可展示为 appleId；引入 node-itunes-search 或 itunes-store-api 不会自然增加当前缺少的竞品维度。[当前搜索实现](../../server/lib/appleLookup.ts)、[Apple Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
2. **需要扩大竞品信息时选 @perttu/app-store-scraper。** 只把它用于搜索结果后的可选 enrichment：评分、评论、隐私、相似应用和版本历史；详情主键统一使用已有的 trackId/appleId。这些能力均有公开方法或源码依据。[perttu README](https://github.com/plahteenlahti/app-store-scraper/blob/main/README.md)、[perttu app 实现](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/app.ts)
3. **IAP 保留当前页面解析。** @perttu 没有公开 IAP 方法，Apple 官方账号 API 又只适合自有应用；因此当前 productPage.ts 的 IAP 解析仍是本工程公共竞品场景下的必要补充。[当前页面实现](../../server/lib/productPage.ts)、[perttu 入口](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/index.ts)、[Apple IAP API 文档](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases)
4. **实际接入时固定版本并隔离失败。** 优先使用 npm 已发布版本而不是 github main/master，为 Apple 请求加缓存、超时、限流和单项降级，并用固定 HTML fixture 覆盖 privacy/version-history 解析；这是针对 Apple 官方频率提示和候选库页面抓取实现提出的工程建议。[Apple 搜索文档](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html)、[perttu package.json](https://raw.githubusercontent.com/plahteenlahti/app-store-scraper/main/package.json)、[perttu version history](https://github.com/plahteenlahti/app-store-scraper/blob/main/src/lib/version-history.ts)

## 6. 最终选择

| 目标 | 推荐 |
|---|---|
| 只做公共搜索、详情和 trackId | 继续使用当前直接调用 Apple Search/Lookup API 的实现 |
| 补充评分、评论、隐私、相似应用、版本历史 | 评估并隔离接入 @perttu/app-store-scraper |
| 获取任意竞品的公共 IAP 信息 | 当前没有可靠的公共开源库替代；继续维护页面解析并准备降级 |
| 管理自己账号的 App Store Connect IAP/评论/版本 | 另行评估 App Store Connect API 客户端 |
| 查询自己用户的购买交易、订阅状态和服务器通知 | 使用 Apple 官方 App Store Server API / Node 库 |

本次研究没有安装、升级、删除或修改任何现有依赖，也没有覆盖其他用户改动；仓库内仅新增本 Markdown 文件。
