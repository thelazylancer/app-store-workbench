# 实施票据索引：React 19 + Astryx + react-router + Fastify

依据 `docs/ARCH-react.md`（下称 ARCH，章节号引用之）。每张票据可独立验收。

## 依赖图

```text
BE-1 competitorRepo 拆分 ──┐
BE-2 ipaDownload 拆分 ──────┤ 互相独立（后端拆分线，随时可开工）
BE-3 抓取脚本拆分 ──────────┤
BE-4 服务端测试拆分 ────────┤
BE-5 Fastify 迁移 ───────────┤ 依赖：BE-1、BE-2 先合入更稳（非硬阻塞）
BE-6 nginx SPA fallback ────┘ 独立；在 FE-7 部署前必须合入

FE-1 脚手架 + 行数守卫
  └─ FE-2 wxTheme + Astryx 壳 + 路由骨架（含 DESIGN.md 收缩）
       ├─ FE-3 /search 搜索页 React 化
       │    └─ FE-4 搜索页 inspector 完整对齐
       │         └─ FE-5 IPA 下载控件（Dialog 授权码）
       ├─ FE-6 / 竞品日报（时间线十四条契约）
       │    └─ FE-7 /package/:code 竞品详情
       └─（FE-3…FE-7 全部完成后）FE-8 单入口收口：删旧 html、行数清单清零
QA-1 契约回归验收 ── 依赖 BE-5、BE-6、FE-3…FE-8 全部合入
```

## 施工顺序

1. BE-1 → BE-2 → BE-3 → BE-4（后端先瘦身）。
2. BE-5（Fastify，golden 契约测试先行）→ BE-6（nginx）。
3. FE-1 → FE-2（Astryx beta 小步验证）。
4. 两条页面线可并行开发、按序合并：FE-3 → FE-4 → FE-5；FE-6 → FE-7。
5. FE-8 收口，最后 QA-1。

## 角色分配

| 票据 | 角色 |
| --- | --- |
| BE-1…BE-3、BE-5、BE-6 | backend-developer |
| BE-4、QA-1 | api-tester |
| FE-1、FE-3…FE-8 | frontend-developer |
| FE-2 | frontend-developer 主责；视觉语义与 DESIGN.md 收缩请 ui-designer 过一遍 |
| 所有票据合入前 | code-reviewer 按票据验收清单评审 |

## 全局约定

- 不新增 API 端点、不改表结构、不改 cron；HTTP 契约冻结（ARCH §3.1、§6 已知差异清单除外）。
- 所有文件 ≤500 行（`tests/lineLimit.test.ts` 守卫，豁免清单只减不增）。
- 交互与壳只用 `@astryxdesign/core` 白名单（ARCH §4.1–4.2）；琥珀色只给异常。
- GitHub / npm 走代理：`HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890`。
- 密钥与 `.env` 内容不入文档与代码；不动现网（生产部署另行安排）。
