# Task 2：工单、完成动作与状态流转 API

## 交付内容

- 新增 `optimization-verification.dto.ts`：工单创建、完成动作和状态流转 DTO；仅声明允许写入的字段，并使用 `class-validator` 约束类型、长度、枚举、日期与对象字段。
- 新增 `optimization-verification.service.ts`：提供工单创建/列表、完成动作记录和状态流转。
- 新增 `optimization-verification.controller.ts`：提供以下接口：
  - `POST /brands/:brandId/optimization-work-orders`
  - `GET /brands/:brandId/optimization-work-orders`
  - `PATCH /brands/:brandId/optimization-work-orders/:id`
  - `POST /brands/:brandId/optimization-work-orders/:id/actions`
- 在 `ExecutionDiagnosisModule` 注册控制器和服务。

## 规则与范围

- 每个入口先校验当前品牌；工单、诊断批次、诊断发现和比较记录均以 `brandId` 查询，跨品牌资源返回中文“不存在”错误。
- 只实现工单工作流，不创建或触发内容、发布、知识库功能。
- 允许的状态流转：
  - `pending` → `in_progress` / `cancelled`
  - `in_progress` → `pending_verification` / `cancelled`
  - `pending_verification` → `verified` / `ineffective` / `in_progress` / `cancelled`
  - `verified` → `in_progress`
  - `ineffective` → `in_progress` / `cancelled`
  - `cancelled` → `in_progress`
- 进入 `pending_verification` 前至少需要一条完成动作；进入 `verified` 必须关联当前品牌、可比性为 `comparable` 的比较记录，并提供验收说明；取消必须提供原因。

## TDD 与验证证据

1. 先在 `optimization-verification.service.spec.ts` 写入状态机、完成动作和跨品牌拒绝测试。
2. RED：运行 `pnpm --filter @geocite/server test -- optimization-verification.service.spec.ts`，因 `./optimization-verification.service` 不存在而以 TS2307 失败。
3. 实现最小 DTO、服务、控制器与模块注册后，聚焦测试通过：1 个套件、5 个测试。
4. `pnpm --filter @geocite/server build` 通过。
5. 完整服务端测试通过：19 个套件、46 个测试，0 失败。

## 注意事项

- 工作单实体尚未存储“验收说明/取消原因/比较 ID”字段；当前任务按既有实体模型在状态切换时校验这些输入和当前品牌比较记录。若后续需要展示或审计这些值，应在后续数据模型任务中增加持久化字段或使用归因记录。
- 仓库原有的 UI、诊断洞察和系统文件脏改动均未修改或暂存。
