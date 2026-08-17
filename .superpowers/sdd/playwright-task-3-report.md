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
