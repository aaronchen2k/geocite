## ADDED Requirements

### Requirement: Project lifecycle and workspace boundary
系统 MUST 以项目作为数据、文件、执行和权限的基本边界，并保存项目名称、编码、根目录、执行提供者、状态、默认标记和软删除信息。

#### Scenario: Select a project workspace
- **WHEN** 用户打开工作台
- **THEN** 系统加载默认项目或用户选择的项目，并将后续迭代、产物和执行请求绑定到该项目根目录

#### Scenario: Archive a project
- **WHEN** 用户归档项目
- **THEN** 项目状态变为 `archived`，历史产物可读，新的执行请求被拒绝

### Requirement: Iteration directory contract
系统 MUST 将每个迭代存放在 `<projectRoot>/specs/<iterationDir>/`，并拒绝包含路径分隔符、`.` 或 `..` 的迭代目录名。

#### Scenario: Create an iteration
- **WHEN** 用户以合法名称创建迭代
- **THEN** 系统创建迭代目录并返回项目关联的迭代摘要

#### Scenario: Reject path traversal
- **WHEN** 请求中的迭代目录包含 `/`、`\\`、`.` 或 `..`
- **THEN** 系统返回参数错误且不访问项目根目录之外的文件

### Requirement: Artifact and file access
系统 MUST 提供迭代摘要、设计资产、阶段产物、输出文件、任意相对文件读取和下载能力，并以迭代根目录为路径校验边界。

#### Scenario: Read a workflow artifact
- **WHEN** 用户请求当前迭代的 proposal、design、tasks 或实现输出
- **THEN** 系统返回文件内容、存在状态和可展示的元信息

#### Scenario: Download a file
- **WHEN** 用户下载迭代内的合法相对路径
- **THEN** 系统以附件形式返回文件，并拒绝越界路径
