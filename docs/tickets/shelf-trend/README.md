# 实施票据索引：竞品入库趋势页 /shelf

依据 `docs/tickets/shelf-trend/BRIEF.md`（需求）与 `DESIGN.md`（本目录，契约唯一规范，章节号引用之）。共享类型 `shared/shelfTypes.ts` 已随设计交付。

## 依赖图

```text
BE-1 shelfQueries 查询模块 ──┬─ BE-2 shelf 路由 + 组装
（纯函数 + 真库测试）        │
                            └─ FE-1 shelfApi + /shelf 路由与导航修正
                                 └─ FE-2 /shelf 页面（取数、筛选、明细表）
                                      └─ FE-3 图表（总量柱 + 数量堆叠柱）
QA-1 契约回归与泄露断言 ── 依赖 BE-2、FE-1…FE-3 全部合入
```

UI 视觉规范 `docs/design/shelf-trend.md` 由 ui-designer 产出，FE-2/FE-3 实现前须存在（不阻塞 BE 线）。

## 角色分配

| 票据 | 角色 |
| --- | --- |
| BE-1、BE-2 | backend-developer |
| FE-1…FE-3 | frontend-developer |
| QA-1 | api-tester |
| 合入前 | code-reviewer 按 DESIGN.md §3 契约与各票验收清单评审 |

## 全局约定

- 只新增 `/api/public/shelf/*`，不改 `/api/competitor/*` 任何行为；不改表结构、不加依赖。
- 所有新文件 ≤500 行（css ≤300），豁免清单只减不增。
- 类型和响应形状以 `shared/shelfTypes.ts` + DESIGN.md §3 为准，偏差即回归。
- 完成前跑 `npm test`、`npx tsc --noEmit`、`npm run build`。
