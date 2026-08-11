## ADDED Requirements

### Requirement: Ordered Speckit workflow
系统 MUST 支持按 kickoff、constitution、specify、plan、tasks、implement 的顺序执行迭代工作流，并为每个阶段关联命令、输入和产物。

#### Scenario: Run the next stage
- **WHEN** 当前阶段完成且用户启动下一阶段
- **THEN** 系统校验前置产物和状态，执行对应 Speckit 命令并更新当前阶段

#### Scenario: Block a stage with missing prerequisites
- **WHEN** 前置阶段未完成或所需产物不存在
- **THEN** 系统拒绝执行并返回缺失项，不伪造完成状态

### Requirement: Durable workflow snapshot
系统 MUST 保存运行 ID、状态、当前阶段、命令、开始时间、更新时间、结束时间、回退次数和错误信息，并允许刷新页面后恢复展示。

#### Scenario: Restore an active run
- **WHEN** 用户刷新正在执行阶段的页面
- **THEN** 系统返回同一运行 ID 和当前状态，并继续提供状态/日志订阅

#### Scenario: Persist a failed run
- **WHEN** 阶段执行失败
- **THEN** 系统将失败状态、错误摘要和结束时间持久化，并保留已生成的可审计产物

### Requirement: Atomic workflow artifacts
系统 MUST 对关键 JSON、YAML 和 Markdown 状态/产物采用临时文件写入后原子替换，失败时保留上一份有效文件。

#### Scenario: Recover from write failure
- **WHEN** 产物校验或文件替换失败
- **THEN** 系统报告失败并保留旧文件内容，不留下半写入的目标文件
