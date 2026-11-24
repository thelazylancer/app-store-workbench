# 实施票据索引：MCP 服务加固

依据 `DESIGN.md`（本目录，契约唯一规范，章节号引用之）。范围严格锁定：紧凑输出、`search_apps` 上限、`/mcp` 异常兜底；不做鉴权、SSE、分页、缓存。

## 依赖图

```text
BE-1 紧凑投影（mcpCompact.ts + 三工具接线）──┐
BE-2 search_apps 上限 10 ──────────────────────┼─ 三票互相独立（都改 mcp.ts，合并需 rebase，验收互不依赖）
BE-3 /mcp 兜底（JSON-RPC error）──────────────┘
QA-1 契约回归 + 体积实测 ── 依赖 BE-1…BE-3 全部合入
```

## 角色分配

| 票据 | 角色 |
| --- | --- |
| BE-1…BE-3 | backend-developer |
| QA-1 | api-tester |
| 合入前 | code-reviewer 按 DESIGN.md §4/§5/§6 契约与各票验收清单评审 |

## 全局约定

- HTTP 路由、`shared/`、前端零改动；现有契约测试零改动零失败是硬验收条件。
- 不新增依赖；新文件 ≤500 行（`mcpCompact.ts` ≤200，`mcp.ts` 改后 ≤350），豁免清单只减不增。
- 待拍板决策（实现前确认）：① compact 默认 true（建议，备选 false）；② `result()` 序列化去缩进（建议，备选保留 indent=2、体积目标放宽 ≤32KB）；③ search 上限 10（建议，备选 20）。
- 完成前跑 `npm test`、`npx tsc --noEmit`、`npm run build`。
