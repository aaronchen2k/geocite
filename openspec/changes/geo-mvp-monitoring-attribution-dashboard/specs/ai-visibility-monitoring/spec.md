## ADDED Requirements

### Requirement: Project monitoring configuration
系统 MUST 允许用户按项目配置品牌、品牌别名、核心关键词、竞品及可用 AI 平台，并为关键词设置采样频率和语言/地区参数。

#### Scenario: Save a valid monitoring configuration
- **WHEN** 用户提交包含品牌、至少一个关键词和至少一个可用平台的配置
- **THEN** 系统保存配置并创建可执行的周期监测任务

#### Scenario: Reject an incomplete configuration
- **WHEN** 用户未提供品牌或关键词，或选择了不可用平台
- **THEN** 系统拒绝保存并指出具体缺失项或平台状态

### Requirement: Scheduled AI answer collection
系统 MUST 按监测配置向启用的平台发送查询，并为每次执行记录平台、查询文本、参数、执行时间、状态、原始回答（或合规的脱敏摘要）和失败原因。

#### Scenario: Collect a successful answer
- **WHEN** 平台在超时时间内返回回答
- **THEN** 系统保存不可变的回答证据，并将执行标记为 completed

#### Scenario: Handle an unavailable platform
- **WHEN** 平台被限流、不可访问或解析失败
- **THEN** 系统记录对应状态和原因，保留最后成功时间，并允许后续重试

### Requirement: Mention and recommendation classification
系统 MUST 从回答证据中识别品牌是否被提及、提及上下文、推荐层级和语义准确性，并按关键词聚合引用率和趋势。

#### Scenario: Classify a first recommendation
- **WHEN** 品牌在回答中被明确作为首选推荐
- **THEN** 结果标记为 mentioned=true、recommendation_level=first，并保留证据片段

#### Scenario: Classify a non-mention
- **WHEN** 回答未出现品牌或其已配置别名
- **THEN** 结果标记为 mentioned=false，并计入该关键词的有效未引用样本

### Requirement: Competitor comparison
系统 MUST 对同一关键词的品牌和竞品使用相同采样上下文计算引用率、推荐层级和语义准确性，并支持按时间范围对比。

#### Scenario: Compare brand and competitor
- **WHEN** 项目同时配置品牌和竞品且两者都有有效样本
- **THEN** 看板和结果页展示可按品牌/竞品切换的同口径指标

### Requirement: Negative answer alerting
系统 MUST 支持配置错误事实、不利描述或负面情绪的判定规则，并在新结果命中时生成去重的预警事件，包含回答证据、关键词、平台和触发原因。

#### Scenario: Trigger a negative alert
- **WHEN** 新回答命中启用的错误或负面规则
- **THEN** 系统创建可追踪的 alert，并按项目通知设置发送通知

#### Scenario: Deduplicate repeated alerts
- **WHEN** 同一项目、关键词、平台和规则在静默窗口内重复命中
- **THEN** 系统不重复发送通知，但累计命中次数并更新时间
