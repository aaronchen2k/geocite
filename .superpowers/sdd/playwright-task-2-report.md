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

## 审查修复（Task 2 Important / minor）

### TDD 红绿记录

1. RED：新增精确命令行参数匹配用例，首次运行因尚未导出 `hasExactControlledChromeArguments` 而编译失败；实现 token 解析与精确比较后转绿。
2. RED：新增 `profilePath` 唯一索引元数据用例，失败信息为 `Expected: true, Received: undefined`；添加唯一索引后转绿。
3. 其余新增回归用例覆盖：复用前台 context 仍访问该引擎目标登录页、`a/b` 与 `a?b` 的 profile 路径隔离、受控失败码和脱敏中文文案、关闭未确认时保持 `running`，以及拒绝 launchId/profile 路径的前缀碰撞。

### 修复结果

- 复用的前台 context 现携带 engine 进行目标页轻量检查，不会在不导航的情况下直接就绪。
- Profile 目录包含 engine id 与 UUID，且 `profile_path` 具有数据库唯一索引。
- 新增持久化的 `failureCode`；接口与数据库只保存受控失败码和中文脱敏文案，原始异常仅通过服务日志记录。
- Unix 和 Windows 均将进程命令行解析为参数后精确比较 `--geocite-review-launch-id` 与 `--user-data-dir`。
- 未确认关闭时不再把启动记录写为 `closed`。

### 验证与提交

- `pnpm --filter @geocite/server test -- local-chrome.service.spec.ts`：11/11 通过。
- `pnpm --filter @geocite/server test`：20 个测试套件、87 个测试通过。
- `pnpm --filter @geocite/server build` 与 `git diff --check`：通过。
- 实现提交：`76a739c fix: harden local Chrome review lifecycle`。
