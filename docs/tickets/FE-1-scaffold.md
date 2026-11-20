# FE-1 React 脚手架 + 500 行守卫

- 依赖：无
- 角色：frontend-developer
- 对应 ARCH §1、§5、§7

## 背景

前端换 React 19 + Astryx + react-router。本票只搭骨架与守卫，不碰任何页面，旧页面（index.html / search.html / competitor.html）继续可构建可访问。

## 范围

**做**：

1. 依赖（走代理，精确锁版本）：`npm i react react-dom react-router`（react/react-dom ≥19）、`npm i -E @astryxdesign/core@0.7.16 @stylexjs/stylex`；`npm i -D @vitejs/plugin-react @testing-library/react`。gsap 保留。
2. `vite.config.ts`：加 `@vitejs/plugin-react`；多入口 rollupOptions 保持不变（FE-8 才收单入口）。
3. `tsconfig.json`：开 `"jsx": "react-jsx"`；vitest 环境仍是 jsdom。
4. 建 `src/app/`、`src/theme/`、`src/competitor/`、`src/search/` 目录骨架（空文件不建，只建本票需要的）。
5. 新增 `tests/lineLimit.test.ts`：git 跟踪的 `*.ts *.tsx *.css` 全部断言 ≤500 行；带「遗留豁免清单」数组（现存超限文件全列：`src/styles.css`、`src/competitor/competitor.css`、`tests/frontend/renderResults.test.ts`、`src/lib/renderResults.ts`、`src/competitor/main.ts`、`scripts/fetch-app-store-details.ts`、`tests/frontend/competitorPage.test.ts`、`server/lib/ipaDownload.ts`、`server/lib/competitorRepo.ts`、`src/competitor/renderPackageDetail.ts`、`src/main.ts`、`tests/server/searchAppsApi.test.ts`、`tests/server/competitorRepo.test.ts`），断言清单内条目只会减少：测试比较清单与 git 现状，若出现「清单外文件超限」即红。允许 BE-* 票先划走其中服务端条目（互相改同一数组，后合并的一方解决冲突即可）。

**不做**：页面组件、路由、主题；删任何旧文件。

## 验收

1. `npm run build` 与 `npm test` 全绿；旧两页 dev 下照常打开。
2. `tests/lineLimit.test.ts` 绿且能拦人：临时把任一文件加行到 >500 的本地试验后恢复（不提交）。
3. 新增文件全部 ≤500 行。

## 风险

无功能风险。注意 react-router 版本选 v7（与 React 19 兼容），锁精确版本。
