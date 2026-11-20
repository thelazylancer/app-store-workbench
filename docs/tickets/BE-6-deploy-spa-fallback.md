# BE-6 nginx SPA fallback 与部署适配

- 依赖：无（独立）；必须在 FE-7 对外部署前合入
- 角色：backend-developer
- 对应 ARCH §2（路由表）、§6 已知差异第 3 条

## 背景

路由改为 `/`、`/search`、`/package/:code` 后，深链（如直接打开 `https://<host>/package/com.foo.bar`）需要 web 容器把未知路径回退到 SPA 入口。`deploy/nginx.conf` 现在只服务静态文件与 `/api` 反代。

## 范围

**做**：

1. `deploy/nginx.conf`：`location /` 增加 SPA fallback——先找文件，找不到回退到入口 html（`try_files $uri $uri/ /index.html;`）。迁移期（FE-3…FE-7 之间）入口有 `index.html` 与 `search.html` 两个：`/search` 回退到 `/search.html`、其余回退 `/index.html`（两行 location 规则）；FE-8 合入后简化为单一 `/index.html`。
2. `/api` 与 `/competitor-assets` 反代规则不变。
3. `Dockerfile` 构建产物仍为 `dist/`，确认 nginx 挂载路径无需变更（只验证，预计零改动）。

**不做**：动现网；改后端；改 docker-compose 拓扑。

## 验收

1. 本地 `docker compose up`（或本机 nginx -t 起同配置）后 `curl` 验证：
   - `/` 200、`/search` 200、`/package/anything` 200（返回 SPA 入口 html）；
   - `/api/competitor/days` 反代正常；
   - 静态资源 404 时不再回退入口（`try_files` 顺序保证 `/assets/*` 真实 404）。
2. vite dev 不受影响（dev server 自带 history fallback，无需改动）。
3. `deploy/nginx.conf` ≤500 行（预计 <100）。

## 风险

回退规则别吞掉真实 404：`/api`、`/competitor-assets` 必须在 `location /` 之前精确匹配，验收第 1 条最后一项专查这一点。
