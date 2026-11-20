# BE-4 拆分超限服务端测试文件

- 依赖：建议在 BE-1 合入后做（competitorRepo.test 引用的门面不变，先后无硬约束）
- 角色：api-tester
- 对应 ARCH §7

## 背景

两个服务端测试文件超 500 行，且 describe 边界已经清晰，纯文件整理，断言零改动。

## 范围

1. `tests/server/searchAppsApi.test.ts`（566）→ 按 describe 块（L9 `GET /api/app-details/:appleId`、L89 `POST /api/search-apps`）拆为：
   - `tests/server/searchAppsApi.appDetails.test.ts`
   - `tests/server/searchAppsApi.searchApps.test.ts`
   - 公共 fixture/helper 提到 `tests/server/searchAppsApiTestUtils.ts`（如两个 describe 都依赖的 app 构造）。
2. `tests/server/competitorRepo.test.ts`（552）→ 按 `describeDb` 块拆为：
   - `tests/server/competitorRepo.writes.test.ts`
   - `tests/server/competitorRepo.reads.test.ts`
   - 公共建表/种子逻辑若两半都用，留在 `tests/server/dbTestUtils.ts` 或新增小工具文件。

**不做**：改断言、改用例覆盖面、改请求行；新增用例。

## 验收

1. `npx vitest run tests/server` 全绿；用例总数与拆分前一致（`--reporter=verbose` 前后对比条数）。
2. 四个新文件各自 ≤500 行；豁免清单划掉两个旧文件名。
3. `git diff` 中测试内容只有「移动」。

## 风险

无逻辑风险；唯一坑是拆分时把「setup 共享但断言只属一侧」的用例搬错边——按 describe 边界机械切割即可。
