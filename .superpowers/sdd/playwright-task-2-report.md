# Task 2：本地 Chrome 生命周期与网页登录状态

## 交付内容

- 新增 `EngineWebReviewProfileEntity`，保存每个引擎独立的 Profile 标识、专属路径、三态可用性和最近检查信息。
- 新增 `EngineBrowserLaunchEntity`，审计每次浏览器启动的 `launchId`、Profile、进程 PID、启动状态和心跳时间。
- 新增 `LocalChromeService`：
  - 通过 `playwright-core` 启动客户本机 Chrome，不下载 Playwright Chromium；
  - 使用 `{应用数据目录}/playwright-profiles/{engineCode}`；
  - 每次真实启动生成并持久化 UUID，且启动参数包含 `--geocite-review-launch-id=<UUID>`；
  - `refresh` 进行轻量检查，并在新建临时上下文时关闭它；`reset` 先安全关闭旧受控窗口再以前台窗口启动，绝不清理 Cookie；
  - 将未登录、就绪和 Chrome/验证码/风控/检查异常分别映射为 `pending_login`、`ready`、`unavailable`；不读取密码、验证码或短信内容；
  - 关闭遗留进程前同时核验 `launchId` 和受控 Profile 的绝对路径，不能仅使用 PID。
- 注册实体和服务；在引擎 API 中增加：
  - `GET /engines/:id/web-review-status`
  - `POST /engines/:id/web-review/refresh`
  - `POST /engines/:id/web-review/reset`
  - `DELETE /engines/:id/web-review-profile`
- 删除操作只从数据库中已保存、且直接位于专属 `playwright-profiles` 根目录下的路径删除；接口没有客户端路径参数。

## TDD 记录

1. 先创建 `local-chrome.service.spec.ts`。
2. 初次执行 `pnpm --dir server test -- local-chrome.service.spec.ts` 如预期失败：`Cannot find module './local-chrome.service'`。
3. 最小实现后，增加并通过以下 mock 驱动行为：
   - 仅关闭 launchId 与 profilePath 都匹配的受控 Chrome；
   - 标识不匹配时不终止进程；
   - 每次启动传入新 launchId；
   - 登录页为 `pending_login`；
   - 验证码/风控为 `unavailable` 且持久化失败原因。

## 验证结果

- `pnpm --dir server test -- local-chrome.service.spec.ts`：5/5 通过。
- `pnpm --dir server test`：20 个测试套件、79 个测试全部通过。
- `pnpm --dir server build`：通过。
- `git diff --check`：通过。

## 说明与风险

- Chrome 路径自动探测 macOS、Windows 和 Linux 的常见安装位置，也接受已存在的 `GEOCITE_CHROME_PATH`；未找到 Chrome 时安全返回 `unavailable`，不回退到 Playwright 自带浏览器。
- 生命周期与进程枚举均通过注入依赖 mock 测试；本任务未在开发机启动真实 Chrome 或执行真实网站登录。
- `engines.module.ts` 是任务清单外的必要配套修改：它导入并接收 `LocalChromeService`，否则 Nest 无法解析引擎控制器所需的跨模块服务。
- 添加依赖导致 `pnpm-lock.yaml` 更新，应与 `server/package.json` 一并提交以保证可复现安装。
