# FE-5 IPA 下载控件 React 化

- 依赖：FE-4（控件挂在 inspector 内）
- 角色：frontend-developer
- 对应 ARCH §8.2；实现规范 = 现 `src/lib/ipaDownloadButton.ts`（311 行）

## 背景

IPA 下载是搜索页 inspector 内的控件流程：创建任务 → 轮询 → 授权码弹层 → 下载/取消/错误分类文案。后端 `/api/ipa-download*` 五端点不变（BE-5 已保真）。

## 范围

**做**（`src/search/` 下，各 ≤ 目标行数）：

1. `useIpaDownload.ts`（~150）：状态机轮询 hook——`createJob` → `getIpaDownload` 轮询间隔/停驻条件、`submitAuthCode`、`cancelIpaDownload`、终态清理。轮询与文案语义平移 `ipaDownloadButton.ts` 现实现（错误分类文案表在其头部，逐条平移）。
2. `IpaDownload.tsx`（~180）：下载 `Button`（按状态切 启动/取消/下载/重试）；`awaiting_auth_code` 时开 Astryx `Dialog`：`Field` + `TextInput`（`inputMode=numeric`、6 位、`autocomplete="one-time-code"` 语义保留）+ 提交 `Button`；失败/过期用 `Banner` 显示分类文案。
3. 完成态下载链接：`GET /api/ipa-download/:id/file`（`<a href>` 或按钮跳转，同现状触发方式）。
4. `tests/frontend/ipaDownloadControl.test.ts`（≤500）：覆盖文案表、轮询推进、409 分支（非等待验证码提交）、取消。旧 `tests/frontend/ipaDownloadButton.test.ts`（288 行）的断言主题迁移后删除。

**删**：`src/lib/ipaDownloadButton.ts`、`tests/frontend/ipaDownloadButton.test.ts`；行数清单无该文件（<500），但需从任何 import 清理。

**不做**：改后端；改轮询频率/文案。

## 验收

1. `npm test` 全绿；`git grep -l "ipaDownloadButton" src/ tests/` 零命中。
2. 手工全流程（对本地 dev server）：启动下载 → 轮询可见进度 → 触发授权码 → Dialog 输入 6 位 → 任务恢复 → done 后下载文件；中途取消生效；无 IPA 后端（503）时显示不可用文案。
3. 无 `window.prompt`、无原生 `alert`；键盘可在 Dialog 内提交与关闭。

## 风险

轮询停驻条件（任务终态、页面卸载、组件卸载）与旧实现逐条对齐；`AbortController` 清理写进 useEffect 返回值。
