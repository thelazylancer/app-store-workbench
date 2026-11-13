# Qimai 8 个 App 基础信息对比

> 采集时间：2026-09-16；地区口径：Qimai 页面 `country/us`。

## 口径说明

- `大小`采用 Qimai 基础信息中的“大小”，单位为 Qimai 展示的 M。
- `首发/上架日期`采用 Qimai 的“发布日期”和版本统计中的最早版本日期；它不等同于 Apple 审核通过时间。
- `发行国家/地区`按 Qimai 返回的国家/地区名称逐项计数，未对 Qimai 的历史名称或拼写做二次标准化。
- Qimai 版本接口返回的 `publish_time`、`push_time` 对以下 8 个包均为空，因此“过审时间”只能标记为未披露，不能用首发日期替代。

## 基础信息

| Apple ID | App | 开发者 | 包大小 | 分类 | 首发/上架日期 | 过审时间 | 发行国家/地区 | 版本历史（旧 → 新） |
| --- | --- | --- | ---: | --- | --- | --- | ---: | --- |
| [6804603217](https://www.qimai.cn/app/baseinfo/appid/6804603217/country/us) | Curlae | Masato Aoyagi | 11.36M | 生活 | 2026-09-01 | 未披露 | 5 | 1.0.0（09-01） → 1.1.0（09-02） |
| [6806965292](https://www.qimai.cn/app/baseinfo/appid/6806965292/country/us) | Festii. | Orven Dulik | 6.59M | 生活 | 2026-09-03 | 未披露 | 113 | 1.0.0（09-03） → 1.1.0（09-11） |
| [6807769266](https://www.qimai.cn/app/baseinfo/appid/6807769266/country/us) | Netdra | KRISTJANE SOKILOV | 5.03M | 体育 | 2026-09-07 | 未披露 | 167 | 1.0.0（09-08） → 1.0.1（09-08） → 1.0.2（09-09） |
| [6806171518](https://www.qimai.cn/app/baseinfo/appid/6806171518/country/us) | Glosra | Haruma Matsumoto | 33.12M | 生活 | 2026-09-01 | 未披露 | 151 | 1.0.0（09-01） → 1.1.0（09-11） |
| [6808584369](https://www.qimai.cn/app/baseinfo/appid/6808584369/country/us) | Moxzie | Brion Caste | 57.97M | 美食佳饮 | 2026-09-09 | 未披露 | 146 | 1.0.0（09-09） → 1.0.1（09-10） → 1.0.2（09-12） |
| [6808543027](https://www.qimai.cn/app/baseinfo/appid/6808543027/country/us) | Bizdra | RICARDO GAZTANBIDE ASTARLOA | 44.46M | 商务 | 2026-09-09 | 未披露 | 86 | 1.0.0（09-09） → 1.1.0（09-10） |
| [6803416197](https://www.qimai.cn/app/baseinfo/appid/6803416197/country/us) | Drawee. | LISE KRUITHOF | 20.05M | 图形和设计 | 2026-08-24 | 未披露 | 137 | 1.0.0（08-24） → 1.1.0（09-03） → 1.1.1（09-09） |
| [6806518854](https://www.qimai.cn/app/baseinfo/appid/6806518854/country/us) | Skinar | Eckert Gordon | 17.21M | 生活 | 2026-09-09 | 未披露 | 142 | 1.0.0（09-09） |

## 版本更新内容摘要

Qimai 版本更新说明主要集中在性能、稳定性和内部资源处理：

- Curlae：视图回收、网络响应流式处理。
- Festii.：错误恢复、动画曲线。
- Netdra：内部 i18n 资源、帮助文档资源分片和调试文本。
- Glosra：临时 buffer 管理、后台网络请求频率。
- Moxzie：崩溃日志脱敏、配方导入解析资源。
- Bizdra：数据解析效率、视觉过渡。
- Drawee.：首屏渲染、手势追踪、后台同步和视图回收池。
- Skinar：暂时没有后续版本更新说明。

## 特征和差异

### 1. 发布国家数存在一个明显的定向发布样本

- 范围为 **5–167 个**，平均约 **118.4 个**。
- 6/8 个包发布到 100 个以上国家/地区；Netdra 最广（167），Curlae 最窄（5）。
- Curlae 的 5 个地区是 Hongkong、Taiwan、United States、Japan、Korea，明显像小范围验证或定向市场策略。
- Bizdra 为 86 个，是除 Curlae 外的第二低值；其余 6 个在 113–167 个之间，接近全球铺开。

### 2. 新包上线后的迭代速度普遍较快

- 7/8 个包已有至少 2 个版本；3/8 个包已有 3 个版本。
- Curlae、Netdra、Moxzie、Bizdra 在首发后约 1–2 天就出现更新。
- Skinar 仍停留在 1.0.0，是唯一没有后续版本的包。
- 版本号上，Curlae、Festii.、Glosra、Bizdra 使用 `1.0.0 → 1.1.0`；Netdra、Moxzie 更偏向 `1.0.x` 修订；Drawee. 连续经历 `1.1.0 → 1.1.1`。

### 3. 产品定位集中在轻量消费/个人效率场景

- 分类中“生活”占 4/8，其余为体育、美食佳饮、商务、图形和设计各 1 个。
- 8 个包均为免费、英文单语言，并且均不支持 Watch 和 Vision Pro。
- 开发者名称 8 个均不重复，且 Qimai 基础信息中的开发者与供应商一致；这更像单包独立主体或独立开发者发布模式，但仅凭公开字段不能判断是否存在共同实际控制人。

### 4. 包大小与发行国家数没有明显的正相关关系

- 大小范围为 **5.03–57.97M**，平均约 **24.47M**。
- 最小的 Netdra 反而覆盖 167 个地区；最大的 Moxzie 覆盖 146 个地区；44.46M 的 Bizdra 只有 86 个地区。
- 因此目前看不到“包越大，发布国家越少/越多”的稳定规律，样本更支持按产品和发行策略分别判断。

### 5. 时间上像同一批次的新应用样本

8 个包的首发日期集中在 2026-08-24 至 2026-09-09；除 Drawee. 外，其余 7 个都在 2026-09-01 或之后首发，其中 3 个在 2026-09-09 首发。结合多款应用在首发后一两天快速更新，整体呈现“新包集中上线—快速修订—部分全球铺开”的共同节奏。

## 过审时间结论

这 8 个页面的公开 Qimai 数据没有给出审核通过时间：版本记录中的 `publish_time` 和 `push_time` 均为空，未登录访问应用状态明细也不能补出该字段。当前能可靠确认的是首发/上架日期；若需要精确的审核通过时间和审核耗时，需要开发者 App Store Connect 记录，或具备相应权限的 Qimai 历史数据。

## 隐私政策与支持网站链接类型

Qimai 基础信息中共有 16 条相关 URL：每个包各有 1 条“隐私政策”和 1 条“支持网站”。16 条全部使用 `https://` 网页链接，没有发现 `mailto:`、`tel:` 或 App Store scheme 链接。

| 链接形态 | 对应包 | 数量 | 类型说明 |
| --- | --- | ---: | --- |
| `docs.google.com/document/d/<ID>/edit?usp=sharing` | Festii.、Netdra、Glosra、Moxzie、Bizdra | 10 | Google Docs 共享/编辑文档链接；每个包的隐私政策和支持网站分别指向不同文档 |
| `curlae.web.id/<随机路径>` | Curlae | 2 | `.web.id` 独立域名；隐私政策和支持网站使用同一域名下的不同路径 |
| `*.workers.dev/<随机路径>` | Drawee. | 2 | Cloudflare Workers 默认子域名；隐私政策和支持网站使用不同路径 |
| `skinar.shop/<随机路径>` | Skinar | 2 | `.shop` 独立域名；隐私政策和支持网站使用同一域名下的不同路径 |

从 URL 形态看，除 Google Docs 文档 ID 外，其余路径大多是无语义的随机字符，并没有采用 `/privacy-policy`、`/support` 这类可读路径。仅凭 URL 不能判断页面是否公开、内容是否完整或页面之间是否存在共同来源。

## 数据来源

- Qimai 基础信息与版本记录：表格中各 Apple ID 对应的 Qimai 页面。
- Apple 官方 Lookup 接口用于校验 Apple ID、开发者、分类、当前包大小和当前版本：<https://itunes.apple.com/lookup?country=us&entity=software&id=6804603217,6806965292,6807769266,6806171518,6808584369,6808543027,6803416197,6806518854>。
