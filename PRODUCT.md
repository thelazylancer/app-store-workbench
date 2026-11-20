# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 竞品分析 / 运营同事：每天要快速知道昨天有哪些新 iOS 竞品包上架、长什么样、核心信息是什么。
- 产品 / 数据研发同事：需要可追溯的每日快照，能回看某一天某个竞品的版本、截图和描述。
- 管理与决策同事：需要一个不用手工整理就能浏览的每日竞品概览。

## Product Purpose

`app-store-workbench` 是一个本地可运行的 App Store 工作台。它把“查竞品包、看 App Store 详情、下载 IPA、保留历史证据”集中在一个网页里，让使用者不用在源表、App Store 和临时脚本之间来回对照。

成功状态是：

- 用户能按日期或日期区间查看竞品快照；
- 能看到真实 App Store 名称、图标、截图和版本历史；
- 同一天重复执行不会产生重复记录;
- 未命中的包会明确显示“App Store 未命中”，而不是被静默丢弃。

## Positioning

它不依赖源表里的 `display_name` 去猜 App Store 应用，而是把 `package_code` 当作可靠 Bundle ID 精确匹配，并把当日可见的 App Store 详情、图标、截图和版本历史一起存成本地快照。相邻的通用 App Store 查询工具无法保证这种“按日期可回溯”的证据链。

## Operating Context

- 使用场景：内网本地工作台，浏览器访问。
- 数据节奏：每日北京时间 09:30 抓取前一天 UTC 数据。
- 数据入口：内部首投包接口 + Apple iTunes Lookup + App Store 商品页。
- 用户流程：选日期或日期区间 → 看竞品列表 → 点开某个包 → 看截图、图标和版本历史。
- 历史回看：按日期或按包查询。
- 数据保留：图片本地保存，版本历史保存当天可见快照。

## Capabilities and Constraints

- 支持 iOS 竞品包，不覆盖 Android / Web。
- 只抓 `first_ad_date` 等于目标日期的记录。
- 排除 `team = 灵蜂`。
- 只保留 `display_name` 包含 `ios` 的记录。
- `package_code` 是可靠 Bundle ID，不把它当应用名搜索。
- 国家范围先支持 `us, cn, hk, tw, jp, sg, gb, au`。
- 版本历史只保存商品页当天可见快照，不承诺全量历史。
- 图片保存到本地，报告页使用本地文件。
- 数据库用本机 PostgreSQL，主键用 `package_code`，一个包一条主记录；`first_ad_date`、`listing_date`、`target_date`、`team` 建索引。
- 支持按投放日期（`first_ad_date`）/ 上架日期（`listing_date`）两种口径查看，并可按团队、类目、iOS 版本分组；支持日期范围查询（区间视图）；页面不提供国家筛选。
- 「异常」是产品口径：未命中（`bundle_not_found`）与待补全（`pending`）合并按异常展示，异常区仅在非空时出现。
- 批次表按 `target_date` 唯一，支持幂等重跑。
- 首版不做登录、鉴权、多语言、自动趋势分析、图片压缩或 Agent/MCP 集成。

## Evidence on Hand

- `docs/PRD-competitor-app-store.md`：已确认的需求、数据表和 API 设计。
- 内部首投包接口：`http://192.168.110.61:8001/api/v1/first-delivery-packages`
- Apple iTunes Lookup：`https://itunes.apple.com/lookup?bundleId=...&country=...&entity=software`
- 当前工程已实现 App Store 搜索、详情补全和 IPA 下载能力。

## Product Principles

1. **Bundle ID 优先**：所有补全都从 `package_code` 出发，不依赖不可靠的展示名。
2. **可回溯**：每天保存一份证据，而不是只保存最新状态。
3. **幂等**：同一个日期重复执行只更新，不产生重复记录。
4. **诚实呈现未命中**：查不到 App Store 就明确标出来，不假装不存在。
5. **本地可控**：图片和数据都落在本机，减少对外部 CDN 的依赖。
