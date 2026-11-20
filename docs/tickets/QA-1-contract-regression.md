# QA-1 全契约回归验收（发布前闸门）

- 依赖：BE-5、BE-6、FE-3…FE-8 全部合入
- 角色：api-tester（视觉语义部分请 ui-designer 会签）
- 对应 ARCH §3.1、§6（已知差异）、§8（冻结契约）

## 背景

渲染层全量重写 + HTTP 框架替换，发布前做一次全契约回归。本文档不新增用例，只汇总各票的验收命令成一份可执行清单。

## 回归清单

### A. HTTP 契约（对拍 golden）

1. `npx vitest run tests/server` 全绿（含 `httpContract.test.ts` golden 逐字节）。
2. 手工 curl 对拍（本地起 Fastify）：
   - `GET /api/competitor/days|/day/:date|/package/:code|/batch/:date|/summary`：200 JSON 结构；
   - 无 repo 启动时 `/api/competitor/*` → 503 `"Competitor data is unavailable"`；
   - `GET /api/app-details/:appleId`：非法参数 400、未命中 404、上游失败 502 文案；
   - `POST /api/search-apps`：空 body 400 两版文案、正常 200；
   - `POST /api/ipa-download`：非法 bundleId 400、正常 202；auth-code 409/400、DELETE 409/202；`/file` 响应头含 `attachment; filename="<bundleId>.ipa"`；
   - `/competitor-assets/` 图片可取。
3. 唯一允许差异 = ARCH §6 四条，其余任何 diff 记缺陷。

### B. 前端功能

1. `npx vitest run tests/frontend` 全绿，`tests/lineLimit.test.ts` 豁免清单为空。
2. 冒烟走查（dev 与本地 nginx 各一遍）：
   - `/` 竞品日报十四条契约逐条勾验（ARCH §8.1）；
   - `/search`：多行 composer、国家联动（IAP 筛选仅 US）、筛选与清除、候选对比、截图 Lightbox、版本历史格式；
   - `/search` IPA 全流程：启动 → 轮询 → 授权码 Dialog → done → 下载文件；取消；503 不可用文案；
   - `/package/:code` 深链、返回保留筛选、复制按钮、missed panel；
   - `prefers-reduced-motion` 下动效静止（gsap 语义）。
3. 无障碍抽查：键盘走通 TabList/Selector/DateInput/Dialog/Lightbox；蓝文字 `#245A87` 与墨色正文对空气底对比度 ≥4.5:1。

### C. 部署

1. 本地 `docker compose up`：`/`、`/search`、`/package/x` 深链均 200；`/api` 反代正常；真实 404（如 `/assets/none.js`）不回退 SPA。
2. node-cron 08:00 Asia/Shanghai 调度在 Fastify 进程内注册（代码走查 + 现有 `competitorScheduler.test.ts` 绿）。

## 产出

缺陷清单（按 A/B/C 分组，附复现命令）；全部关闭或明确豁免（记入 ARCH §6）后方可发布。

## 风险

低——本票不改代码；发现缺陷回灌对应票据（BE-5 / FE-3…FE-7）修复后重跑对应分组。
