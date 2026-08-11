## ADDED Requirements

### Requirement: Semantic intent matching
系统 MUST 将关键词/用户意图与品牌内容资产向量化，计算并保存余弦相似度、使用的模型和阈值，并标记低效内容资产。

#### Scenario: Identify a low-match asset
- **WHEN** 内容资产与关键词意图的相似度低于项目阈值
- **THEN** 系统标记该资产为低效并展示相似度及对应关键词

### Requirement: Source weight analysis
系统 MUST 为回答中的引用信源归类并按可配置的来源层级计算权重，至少支持央媒、行业媒体、自媒体和普通站点四类。

#### Scenario: Rank source classes
- **WHEN** 监测回答包含多个已识别信源
- **THEN** 系统展示每个信源的类别、权重、出现次数和对品牌引用表现的关联

### Requirement: E-E-A-T content scoring
系统 MUST 从经验、专业性、权威性和可信度四个维度对可分析的品牌内容资产评分，并为低分维度给出可解释建议。

#### Scenario: Explain a content score
- **WHEN** 内容资产完成 E-E-A-T 分析
- **THEN** 系统保存四项分数、总分、规则版本和至少一条可执行建议（如存在低分维度）

### Requirement: Structured data and crawler accessibility checks
系统 MUST 扫描用户授权的官网 URL，检测 Schema.org/JSON-LD 等结构化数据、robots/crawler 可访问性及扫描时间，并区分未部署、无权限、超时和扫描成功状态。

#### Scenario: Detect valid structured data
- **WHEN** 官网 URL 可访问且包含有效 Schema.org 或 JSON-LD
- **THEN** 系统标记结构化数据为 detected，并保存类型和关键字段摘要

#### Scenario: Report crawler blocking
- **WHEN** robots 或网络策略阻止目标 AI 爬虫访问
- **THEN** 系统标记 crawler_accessibility 为 blocked 并展示阻断依据

### Requirement: Explain attribution findings
系统 MUST 将引用结果与可用归因分析关联，展示分析覆盖率、分项结果、证据来源和规则/模型版本；缺少数据时不得伪造分数。

#### Scenario: Show an incomplete analysis
- **WHEN** 某关键词缺少可访问内容资产或信源信息
- **THEN** 系统展示缺失项和 coverage 状态，并将受影响分项标记为 unavailable
