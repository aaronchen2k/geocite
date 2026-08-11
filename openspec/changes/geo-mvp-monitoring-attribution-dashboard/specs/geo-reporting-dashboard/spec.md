## ADDED Requirements

### Requirement: GEO metrics dashboard
系统 MUST 提供按项目和时间范围查看 AI 引用率趋势、推荐层级、关键词变化、竞品对比、内容资产健康度和监测覆盖率的看板。

#### Scenario: View a populated dashboard
- **WHEN** 项目选择有效时间范围并存在已完成样本
- **THEN** 系统展示指标卡、趋势、竞品对比和可下钻到证据的明细

#### Scenario: Show data quality on dashboard
- **WHEN** 时间范围内存在失败任务或有效样本不足
- **THEN** 系统展示失败率/样本量和数据质量提示，不把缺失数据当作零值

### Requirement: Digital asset index
系统 MUST 基于收录量、推荐率、语义覆盖度及其配置权重计算数字资产指数，并展示分项、权重、样本量和计算版本。

#### Scenario: Calculate an index
- **WHEN** 项目在周期内有足够的有效指标
- **THEN** 系统输出综合指数及各分项贡献，并可追溯到周期快照

#### Scenario: Handle insufficient samples
- **WHEN** 有效样本不足以计算可靠指数
- **THEN** 系统显示 insufficient_data 和缺失指标，而不是输出误导性的综合分数

### Requirement: Periodic report generation
系统 MUST 支持按周/月基于指标快照生成报告，报告至少包含数据变化、竞品对比、负面事件、已记录优化动作、数据质量和下一步建议。

#### Scenario: Generate a monthly report
- **WHEN** 用户选择项目和完整月份并请求生成报告
- **THEN** 系统生成可查看和下载的报告，并固定引用该周期快照

#### Scenario: Report with no data
- **WHEN** 周期内没有完成的有效监测样本
- **THEN** 系统生成明确标注无数据原因的报告，不生成虚假的趋势或指数

### Requirement: Dashboard and report access boundaries
系统 MUST 对看板、证据和报告执行项目级访问校验，并在报告中显示生成时间、数据周期和规则版本。

#### Scenario: Prevent cross-project access
- **WHEN** 用户请求不属于其项目的数据或报告
- **THEN** 系统拒绝请求且不泄露目标项目是否存在
