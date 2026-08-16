## Task 1：数据模型、运行快照与发现 — 实施报告

状态：已完成。

### 变更文件

- 新建 `server/src/modules/execution-diagnosis/optimization-verification.entity.ts`：新增诊断发现、优化工单、优化动作、诊断比较、归因记录、周期复测计划和对比实验实体及状态类型。
- 修改 `server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts`：为运行增加不可变的 `configurationSnapshot`，包含问题、市场、已选/跳过引擎、API 采样方式和规则版本。
- 修改 `server/src/modules/execution-diagnosis/execution-diagnosis.service.ts`：创建运行时冻结快照；采样使用冻结的问题；终态前生成并持久化品牌缺席、竞品主导、采样失败和站点失败发现。
- 修改 `server/src/modules/execution-diagnosis/execution-diagnosis.module.ts` 与 `server/src/database/data-source.ts`：注册全部新实体及服务依赖。
- 新建 `server/src/modules/execution-diagnosis/optimization-verification.service.spec.ts`：覆盖 API 配置快照和竞品主导发现。
- 修改 `server/src/modules/execution-diagnosis/execution-diagnosis.service.spec.ts`：补足新增快照读取所需的运行仓储夹具。
- 修改 `server/src/scripts/simulate-execution-diagnosis.ts`：为新增发现生成依赖提供真实仓储，以保持模拟脚本可编译、可运行。

### TDD 与验证

1. RED：`pnpm --filter @geocite/server test -- optimization-verification.service.spec.ts`
   - 预期失败，报告缺少 `optimization-verification.entity`、`configurationSnapshot` 和新增服务构造参数。
2. GREEN：`pnpm --filter @geocite/server test -- optimization-verification.service.spec.ts execution-diagnosis.service.spec.ts`
   - 4/4 测试通过。
3. 完整服务端验证：
   - `pnpm --filter @geocite/server build` — 通过。
   - `pnpm --filter @geocite/server test -- src/modules/execution-diagnosis` — 11 个套件、25 个测试全部通过。
   - `pnpm --filter @geocite/server simulate:diagnosis` — 通过；确认 SQLite 实体注册、诊断完成以及页面 4、UA 探测 4、AI 样本 1。
   - `git diff --check` — 通过。

### 发现的并修复的问题

真实模拟暴露了一个完成时序竞态：运行状态先标记为成功，发现仍在异步写入，调用方可能在看到终态后关闭数据库连接。现在发现生成在保存终态状态前完成，因此终态仅在所有发现已持久化后可见。

### 范围与关注点

- 未修改知识库、行业本体或自动内容生成/发布功能。
- 数据源启用 TypeORM `synchronize`，因此本任务沿用项目现有模式注册新表，未单独新增迁移。
