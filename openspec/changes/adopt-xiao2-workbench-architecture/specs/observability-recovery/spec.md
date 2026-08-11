## ADDED Requirements

### Requirement: Realtime execution status
系统 MUST 通过 WebSocket 推送项目/迭代执行状态，并通过 SSE 推送阶段日志快照和增量日志行。

#### Scenario: Subscribe to stage logs
- **WHEN** 客户端连接某迭代阶段日志流
- **THEN** 系统先发送 snapshot，再发送匹配阶段的 line 事件，并以 keep-alive 保持连接

#### Scenario: Disconnect a subscriber
- **WHEN** 客户端关闭日志连接
- **THEN** 系统停止心跳、取消订阅并释放连接资源

### Requirement: Hierarchical and redacted logging
系统 MUST 同时保留项目级、迭代级和阶段级日志，并对 authorization、cookie、token 等敏感字段脱敏。

#### Scenario: Record an execution error
- **WHEN** 阶段执行产生错误
- **THEN** 系统将带时间、级别、阶段和元数据的记录写入对应日志，并可从日志 API 读取

#### Scenario: Redact sensitive data
- **WHEN** 请求或模型调用日志包含敏感请求头
- **THEN** 日志中以脱敏占位符替代原值

### Requirement: Recovery and redo controls
系统 MUST 支持将迭代回退到 specify 或 plan，以及从指定阶段重做，并按依赖关系清理过期状态和产物引用。

#### Scenario: Roll back to plan
- **WHEN** 用户确认回退到 plan
- **THEN** 系统清理 plan 之后的任务/实现状态，写入回退记录并允许重新执行

#### Scenario: Answer a blocking check
- **WHEN** specify 或 tasks 检查返回问题且用户提交答案
- **THEN** 系统将答案绑定到原检查运行并重新执行对应阶段，不创建重复的无关页面步骤

### Requirement: Concurrent run protection
系统 MUST 防止同一项目/迭代/阶段存在相互覆盖的并发执行，并允许当前运行被取消或识别为过期。

#### Scenario: Start a duplicate run
- **WHEN** 同一迭代已有当前运行且用户再次启动相同阶段
- **THEN** 系统拒绝重复运行并返回当前运行状态
