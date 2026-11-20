# FE-8 单入口收口 + 遗留清零

- 依赖：FE-3、FE-4、FE-5、FE-6、FE-7 全部合入
- 角色：frontend-developer
- 对应 ARCH §2 收口节奏、§4.4、§7

## 背景

两页都已 React 化，收口成单 SPA 入口，废弃旧地址与死代码。

## 范围

**做**：

1. `vite.config.ts`：rollupOptions 收为单入口 `index.html`（构建产物 `dist/` 根一个 html）；`competitor.html`、`search.html` 删除；`src/search/main.tsx` 删除（挂载统一走 `src/main.tsx` 或 `src/app/` 入口）。
2. `competitor.html` 现在的「跳转 index.html」职责消失；旧地址 `index.html`/`search.html` 不再保证可用（ARCH §6 已知差异第 3 条）。同步把 `deploy/nginx.conf` 的迁移期双入口回退规则简化为单一 `try_files … /index.html`（与 BE-6 打招呼，冲突先合并的一方为准）。
3. CSS 收口：`src/styles.css`（2129）与 `src/competitor/competitor.css`（1763）此时应已无引用——确认后删除，残余引用改指各页 `styles/*.css`；`tests/frontend/styles.test.ts` 改扫 `src/**/styles/*.css`，断言零阴影零渐变、琥珀仅异常类名。
4. `src/lib/motion.ts` 选择器与最终 DOM 类名对齐复核（reduced-motion 语义保留）。
5. `tests/lineLimit.test.ts` 豁免清单清空断言启用：清单必须为空数组（此刻 13 个遗留条目应全部被 BE-*、FE-3…FE-7 划掉）。
6. `npx @astryxdesign/cli doctor --built .`（走代理）无阻断项。

**不做**：新功能；改后端。

## 验收

1. `npm run build` 产出单入口 `dist/`；`npm test` 全绿且 `lineLimit` 豁免清单为空。
2. dev 冒烟三路由：`/`（十四条契约抽查 5 条）、`/search`（搜索 + IPA 全流程）、`/package/<code>` 深链。
3. `git grep -lE "styles.css\"|competitor.css\"" src/` 零命中（若 html 里无残留 link）；`git status` 干净。
4. 旧文件删除后 `git log --diff-filter=D --name-only` 列表与 ARCH §5「旧文件去向」一致。

## 风险

清理误删仍被引用的 CSS 区块——按 grep 引用逐块确认再删；styles.test.ts 是兜底。
