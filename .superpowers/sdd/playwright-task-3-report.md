# Task 3：冻结选样、网页证据与第六步执行

## 完成内容

- 运行初始化为八步；快照冻结网页复核开关、规则版本、最低比例、随机种子和最终入选清单。
- 第 5 步在 API 样本持久化后按核心能力、品牌命中、随机未命中和最低比例补齐的优先级选样。
- 新增独立网页复核证据实体；保存 API 样本关联、选中原因、网页回答、品牌提及、截图路径、状态、排除原因和起止时间，未改写 API 原始回答。
- 第 6 步按引擎串行调用复核执行器。未就绪、未登录、验证码/风控、网页异常和 API 失败均以独立排除记录表达；仅影响该引擎复核。关闭开关时第 6 步为 `skipped`，原因是 `playwright-web-review-disabled`。
- 第 7 步仅在存在成功网页复核时使用网页结果作为校正来源；否则明确为 API 参考。

## TDD 与排错记录

1. 先新增 selector 和 runner 测试，初次运行因模块不存在而失败；实现后两组测试通过。
2. 先新增八步快照测试，初次编译失败于缺少 `webReview` 快照字段；接线后通过。
3. 模拟运行稳定复现 `SQLITE_CONSTRAINT: NOT NULL constraint failed: execution_diagnosis_events.run_id`。证据显示第 5 步的 `freezeWebReviewSelection` 对 `getRun(... relations: { steps: true, events: true })` 得到的运行实体调用 `runs.save(run)`，触发 TypeORM cascade 重存事件。
4. 新增最小回归测试，要求冻结选样只 `update` 快照字段；红灯为 `this.runs.save is not a function`。单一修复改为 `runs.update(run.id, { configurationSnapshot })`，测试与模拟均通过。
5. 模拟随后暴露终态保存后仍执行日志查询、而测试脚本已关闭 SQLite 的竞态。将最终日志查询移到终态保存前，模拟稳定通过。

## 验证

```text
pnpm --dir server test -- web-review-selector.spec.ts web-review-runner.service.spec.ts execution-diagnosis.service.spec.ts
# 3 suites, 11 tests passed

pnpm --dir server build
# passed

pnpm --dir server run simulate:diagnosis
# 模拟执行诊断完成：页面 4 条，UA 探测 4 条，AI 采样 1 条。
```

## 注意事项

- `WebReviewRunnerService` 的浏览器回答器为可注入边界：未提供具体厂商网页操作器时，会诚实写入 `web-review-browser-not-configured` 排除记录，不伪造网页回答或品牌失败。模拟使用显式测试回答器验证成功证据流。
- 持久化新网页证据实体需要同时更新 TypeORM 的 module 与 data source 注册；这两项和模拟脚本是 Task 3 的必要接线文件。

## 审查修复：可复核候选集、真实网页适配器与校正结论

### 修复内容

- 第 5 步现在冻结 `candidateSampleIds`：它只包含 API 调用成功、问题和回答均非空的样本，按 `sample.id` 升序保存。最低比例以该集合为唯一分母；selector 也在随机前按相同顺序规范化输入，所以同一快照随机种子能完全复现结果。
- API 失败样本不会再被第 6 步临时加入。没有可复核候选时，步骤结论为未测，证据明确列出 `no-reviewable-api-samples` 和不可复核 API 样本；网页配置缺失则持久化为 `web-review-engine-config-excluded`。
- 关闭网页复核开关时，第 6 步精确返回 `skipped`，固定原因仍为 `playwright-web-review-disabled`，且不会创建网页排除记录。
- 第 7 步输出每条成功网页证据的真实 `answer`、`brandMentioned`、校正后的提及计数和提及率。最终发现项优先使用这些成功网页证据：网页结论可覆盖 API 文本中的相反品牌提及，不会只报告“成功数量”。
- `EngineEntity.webReviewConfig` 支持可编辑的网页 URL、输入 selector、回答 selector 和可选提交 selector。ChatGPT、Claude、Gemini、DeepSeek、Qwen 提供官方网页默认配置；未知或不完整配置明确排除。
- 新增生产 `PlaywrightBrowserReviewer`。它用 `LocalChromeService.useReadyProfile` 启动/复用 Task 2 的专属持久 Profile，导航、填入问题、提交、等待答案并提取文本；登录、验证码与风控 URL 均以排除原因保存，绝不伪造网页答案。真实适配器使用 mock browser/Profile 边界测试。

### TDD 与排错记录

1. RED：候选分母、倒序输入的确定性、第 7 步实际指标、关闭开关和生产适配器测试先失败，分别暴露“总 API 样本作分母”“数据库返回顺序影响随机”“只计数”“缺少真实适配器”。
2. GREEN：冻结候选 ID、稳定排序、成功网页证据校正与持久 Profile 浏览器适配后，聚焦套件 19 项通过；另加回归证明网页 `brandMentioned=false` 能覆盖 API 中的 `true` 并生成 `brand_absent` 发现。
3. 全量 e2e 首次失败于 Nest 无法注入两个以 `Pick<LocalChromeService, ...>` 标注的构造参数。根因是 TypeScript 接口型运行时元数据不是注入 token；以显式 `@Inject(LocalChromeService)` 修复。健康 e2e 先转绿，之后全量通过。
4. CLI 模拟首次在打印成功后销毁 SQLite，而后台运行仍在写最终事件。为本地工具增加 `waitForCompletion`，模拟脚本在释放数据库前等待后台 Promise；模拟现已稳定退出。

### 验证

```text
pnpm --dir server test
# 22 suites, 102 tests passed

pnpm --dir server build
# passed

pnpm --dir server run simulate:diagnosis
# 模拟执行诊断完成：页面 4 条，UA 探测 4 条，AI 采样 1 条。

git diff --check
# passed
```
