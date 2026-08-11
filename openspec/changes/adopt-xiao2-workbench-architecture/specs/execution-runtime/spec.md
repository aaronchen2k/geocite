## ADDED Requirements

### Requirement: Configurable execution provider
系统 MUST 支持 local、docker 和 opensandbox 执行提供者，并记录每个项目当前使用的提供者、sandbox 标识和退出结果。

#### Scenario: Start a local execution
- **WHEN** 项目配置为 local 且模型配置有效
- **THEN** 系统在项目工作目录启动 Speckit 命令，并记录 stdout、stderr 和退出码

#### Scenario: Reject an unavailable provider
- **WHEN** 项目选择的执行提供者不可用
- **THEN** 系统返回可操作错误，不将项目标记为成功

### Requirement: Default model configuration
系统 MUST 支持模型配置的启用、默认选择、基础连接参数和项目执行时解析，并禁止删除当前默认模型。

#### Scenario: Execute with the default model
- **WHEN** 用户启动阶段且未显式指定模型
- **THEN** 系统解析唯一启用的默认模型并将模型标识写入运行记录

#### Scenario: Prevent default model deletion
- **WHEN** 用户尝试删除当前默认模型
- **THEN** 系统拒绝删除并要求先切换默认模型

### Requirement: Command protocol
系统 MUST 将 Speckit 命令、结构化输入、超时/取消信号和结构化结果封装在统一执行协议中，禁止用非结构化模型文本直接推进状态。

#### Scenario: Complete a command
- **WHEN** 执行器返回符合协议的成功结果
- **THEN** 系统校验结果、写入产物并推进工作流状态

#### Scenario: Handle malformed output
- **WHEN** 执行器返回无法解析或缺少必需字段的结果
- **THEN** 系统将运行标记为失败并保留原始错误证据
