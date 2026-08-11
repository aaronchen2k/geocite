## ADDED Requirements

### Requirement: Project-level finalization input
系统 MUST 在项目级收尾时扫描迭代状态，只纳入实现完成且未回退的迭代，并明确列出被排除迭代及原因。

#### Scenario: Collect completed iterations
- **WHEN** 项目包含多个迭代且其中部分实现已完成
- **THEN** 系统返回纳入列表和未完成/缺少证据的排除列表

#### Scenario: No eligible iteration
- **WHEN** 没有迭代满足收尾条件
- **THEN** 系统禁用或拒绝收尾执行，并显示可操作原因

### Requirement: Evidence-based technology snapshot
系统 MUST 合并迭代声明的技术能力与项目代码、依赖、锁文件、部署配置、ORM/schema/migration 和数据库配置证据，并记录来源、冲突和最终能力。

#### Scenario: Detect a technology conflict
- **WHEN** 迭代声明与代码观测到的运行时或数据库不一致
- **THEN** 系统阻止交付文档发布并展示冲突证据

#### Scenario: Build a consistent snapshot
- **WHEN** 声明与实现证据一致
- **THEN** 系统原子写入 `.specify/project-tech-stack.json`，并保留能力来源追踪

### Requirement: Atomic project deliverables
系统 MUST 基于最终技术栈生成并校验项目根 `quickstart.md` 和环境安装文档，所有目标通过校验后再整体原子发布。

#### Scenario: Publish finalization documents
- **WHEN** 技术栈快照、quickstart 和安装文档均校验通过
- **THEN** 系统一次性发布项目根交付物并写入成功状态

#### Scenario: Preserve previous documents on failure
- **WHEN** 任一文档生成、校验或替换失败
- **THEN** 系统保留旧版交付物，记录项目级错误和恢复建议
