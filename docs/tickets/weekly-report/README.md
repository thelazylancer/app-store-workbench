# 实施票据索引：竞品周动态 /weekly

依据 `REQUIREMENTS.md`（需求与口径唯一来源）与 `DESIGN.md`（本目录，模块/契约/聚合唯一规范，章节号引用之）。

## 依赖图

```text
BE-1 weeklyReportTypes + weeklyReport 查询模块（纯函数 + 真库测试）
  └─ BE-2 weekly-report 路由 + 依赖注入（契约测试）
BE-1 ─（类型先行，可与 BE-2 并行）─ FE-1 weeklyApi + /weekly 路由与导航修正
                                       └─ FE-2 页面主体（周头/摘要/团队卡/关注项/脚注/状态机）
                                            └─ FE-3 图表区（指标/结构横条/趋势柱 + metricScale 提取）
QA-1 契约回归与真库走查 ── 依赖 BE-1…BE-2、FE-1…FE-3 全部合入
```

## 施工顺序

1. BE-1 → BE-2（后端整线先合，FE-1 只需 BE-1 的类型文件即可开工）。
2. FE-1 → FE-2 → FE-3（前端串行；FE-1 与 BE-2 可并行）。
3. QA-1 收口（部署 7001 后走查 2026-11-16 基准数字）。

## 角色分配

| 票据 | 角色 |
| --- | --- |
| BE-1、BE-2 | backend-developer |
| FE-1…FE-3 | frontend-developer |
| QA-1 | api-tester |
| 合入前 | code-reviewer 按 DESIGN.md §3 契约与各票验收清单评审 |

## 全局约定（沿用 docs/tickets/README.md）

- 不改 `/api/competitor/*` 既有端点与 `/api/public/shelf/*` 任何响应；只新增 `GET /api/competitor/weekly-report`。
- 不改表结构、不新增 cron、不新增依赖；历史周按当前包表计算（REQUIREMENTS §8.7）。
- 所有新文件 ≤500 行（css ≤300）；`tests/lineLimit.test.ts` 豁免清单只减不增。
- 百分比契约：API 统一 0..1 小数，展示层乘 100；百分比 1 位小数。
- 密钥与 `.env` 内容不入文档；每票完成前跑 `npm test`、`npx tsc --noEmit`、`npm run build`。
