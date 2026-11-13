# App Store Workbench

一个用于 iOS 竞品调研的本地工作台：批量搜索 App Store 应用，对比候选结果，查看商店详情、内购价格、版本历史，并可通过 `ipatool` 直接下载 IPA。

界面为中文，默认面向局域网/本机使用。

## 功能

- 多应用名称批量搜索，每行可附加可选 Bundle ID
- 支持 8 个 storefront：US、CN、HK、TW、JP、SG、GB、AU
- 保守匹配：精确名称 / 明确前缀或整词；多个近似结果标记为“待确认”
- 候选对比：价格、评分、大小、最低 iOS、截图、Apple ID / Bundle ID（可复制）
- 详情页：商品页截图、内购列表、版本历史、Qimai 外链
- 美国区 4.99 / 9.99 美元内购价格线索
- IPA 下载：队列、进度、2FA 验证码、取消、重试、重启后任务记录恢复
- 独立 CLI：批量读取 CSV 并导出 Apple 商店详情

## 架构

```
浏览器 SPA (src/)
  ├─ POST   /api/search-apps
  ├─ GET    /api/app-details/:appleId
  └─ IPA 下载：创建 / 轮询 / 提交 2FA / 取消 / 下载文件
                       │
                 Express (server/)
                       ├─ itunes.apple.com/search|lookup   appleLookup.ts
                       ├─ apps.apple.com 商品页 JSON        productPage.ts (+ TTL cache)
                       └─ ipatool 子进程                    ipaDownload.ts
```

共享类型在 `shared/types.ts`。

## 本地开发

要求 Node.js 24（Docker 镜像使用 `node:24`）。

```bash
npm ci
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001
- Vite 会把 `/api` 代理到后端。

常用命令：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动 Vite 和 Express |
| `npm run dev:web` / `npm run dev:server` | 单独启动 |
| `npm test` | Vitest 全量测试 |
| `npx tsc --noEmit` | 类型检查 |
| `npm run build` | 构建前端到 `dist/` |
| `npm run build:ipatool` | 构建带 `--auth-code` 补丁的 ipatool 二进制 |
| `npm run fetch:app-store -- --input apps.csv` | 运行批量导出 CLI |

## Docker 部署

### 前置条件

- Docker + Docker Compose
- 外部网络 `network-proxy_default`（可用 `IPATOOL_PROXY_NETWORK` 改名）
- `deploy/vendor/ipatool-authcode-linux-amd64`

vendor 目录被 `.gitignore` 忽略，新克隆的仓库必须先生成二进制：

```bash
npm run build:ipatool
# 或从已有镜像恢复：
mkdir -p deploy/vendor
docker cp app-store-workbench-app-1:/usr/local/bin/ipatool-bin \
  deploy/vendor/ipatool-authcode-linux-amd64
```

构建脚本会从 `majd/ipatool` 拉取 `v2.8.1`、应用 `deploy/ipatool-authcode.patch`，并在 `golang:1.26-bookworm` 容器中编译。

如果 GitHub 或 Go 模块下载受限，可让构建容器走宿主机代理（Linux 下用 host 网络）：

```bash
IPATOOL_BUILD_NETWORK=host \
HTTPS_PROXY=http://127.0.0.1:7890 \
HTTP_PROXY=http://127.0.0.1:7890 \
npm run build:ipatool
```

脚本会把 `HTTP(S)_PROXY`、`NO_PROXY`、`GOPROXY` 等变量传入构建容器，并对 clone 做 3 次重试。

### 配置

```bash
cp .env.example .env
chmod 600 .env
```

至少填写 `IPATOOL_KEYCHAIN_PASSPHRASE`；该值用于解密容器内的 ipatool 文件 keychain，丢失后需要重新登录 Apple ID。

### 启动

```bash
docker compose build
docker compose up -d
docker compose ps
```

默认访问 `http://<主机>:7001`。`web` 容器监听宿主机 `WEB_PORT`，`app` 只在 Compose 内部暴露 3001。

### Apple ID 登录

`ipatool` 使用挂载在 `/home/app/.ipatool` 的加密文件 keychain：

```bash
docker exec -it app-store-workbench-app-1 ipatool auth info
docker exec -it app-store-workbench-app-1 ipatool auth login
```

登录后账号态会持久化到宿主机数据目录。需要下载未拥有的应用时，前端会提示输入 6 位 2FA 验证码。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `80` | 宿主机映射到 web 容器的端口；本机当前使用 `7001` |
| `IPA_DATA_DIR` | `/srv/data/app-store-workbench` | ipatool 账号态与 IPA 文件的宿主机根目录 |
| `IPA_RETENTION_DAYS` | `7` | IPA 与任务记录的保留天数 |
| `IPA_DOWNLOAD_TIMEOUT_MINUTES` | `60` | 单次下载超时 |
| `IPATOOL_KEYCHAIN_PASSPHRASE` | 空 | 文件 keychain 密码；headless 部署必填 |
| `IPATOOL_PROXY` | 空 | ipatool 使用的 HTTP(S) 代理 |
| `IPATOOL_PROXY_NETWORK` | `network-proxy_default` | Compose 外部网络名 |
| `SEARCH_CONCURRENCY` | `3` | 批量查询的并发上限 |
| `PRODUCT_PAGE_CACHE_TTL_SECONDS` | `600` | 商品页解析结果缓存时间 |
| `PRODUCT_PAGE_CACHE_MAX_ENTRIES` | `200` | 商品页缓存条目上限 |

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/search-apps` | `{ queries: [{ name, bundleId? }], country }` |
| `GET` | `/api/app-details/:appleId?country=us` | 按 Apple ID 获取详情 |
| `POST` | `/api/ipa-download` | `{ bundleId }`，创建下载任务 |
| `GET` | `/api/ipa-download/:id` | 轮询任务状态 |
| `POST` | `/api/ipa-download/:id/auth-code` | 提交 6 位 2FA 验证码 |
| `DELETE` | `/api/ipa-download/:id` | 取消排队或运行中的任务 |
| `GET` | `/api/ipa-download/:id/file` | 下载已完成的 IPA |

## IPA 任务行为

- 单并发队列；同一时间只运行一个 `ipatool` 进程。
- 成功条件：退出码为 0、输出不含 `success=false`、目标文件存在且非空。
- 需要购买未拥有应用时，任务进入 `awaiting_auth_code`，不会直接失败；提交新验证码后重新入队。
- 取消会中止子进程并删除未完成的临时文件。
- 任务记录默认持久化在 `<IPA_DATA_DIR>/ipa/.jobs.json`；重启时已完成任务保留，运行中任务会标记为失败。
- 完成任务的内存记录最多保留 200 条，并按 `IPA_RETENTION_DAYS` 清理。
- 文件与任务记录由服务启动时及每小时一次的清理任务处理。

## 测试

```bash
npm test
npx tsc --noEmit
npm run build
```

测试覆盖 Apple 字段归一化、匹配策略、商品页安全校验、搜索并发、商品页缓存、IPA 队列/2FA/取消/持久化，以及前端筛选、分页、焦点保持和下载控件。

## 安全说明

服务本身**没有鉴权**，且容器内保持着一个已登录的 Apple ID。请仅在可信局域网中暴露 `WEB_PORT`；不要直接发布到公网。若要公网访问，至少在 Nginx 前增加 Basic Auth、IP 白名单或 VPN。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| `not_authenticated` | `docker exec -it ... ipatool auth info` 检查登录态；确认 keychain passphrase 正确 |
| `terms_required` | 在 iPhone/iPad 的 App Store 登录服务器账号并接受条款 |
| `storefront_unavailable` | 通常是 Apple 商店解析临时失败，重试即可（服务会自动重试一次） |
| `docker compose build` 报 `deploy/vendor/... not found` | 运行 `npm run build:ipatool` 或从已有镜像恢复二进制 |
| 端口冲突 | 检查 `.env` 中的 `WEB_PORT`；当前部署使用 `7001` |
| 下载文件 404 | 任务可能已被保留期清理；重新下载即可 |
