# GeoCite.net

> 面向 AI 搜索引擎的生成式引擎优化（GEO）平台，帮助品牌衡量、理解、优化并汇报其在 AI 生成回答中的表现。

[English README](README.md)

## MVP 范围

首期聚焦“**监测 → 归因 → 汇报**”的可见度闭环。

### AI 引用监测

- 监测品牌是否出现在已选 AI 平台的回答中，并保留回答证据。
- 追踪引用率、推荐层级、上下文语义准确性和关键词趋势。
- 对相同查询比较品牌与已配置竞品的表现。
- 对错误或不利的 AI 回答发出预警。

### 归因分析

- 通过语义相似度匹配内容资产与搜索意图。
- 分析信源类型及其相对权重。
- 从 E-E-A-T 维度评估内容，并给出可执行的发现项。
- 检查已授权官网的 Schema.org/JSON-LD 和 AI 爬虫可访问性。

### 看板与汇报

- 展示引用趋势、关键词变化、竞品表现、内容健康度和监测覆盖率。
- 以可解释的组成指标计算带版本的数字资产指数。
- 基于固定指标快照生成周报和月报。

## 暂不纳入 MVP 的能力

以下能力计划在后续版本推出，不属于当前 MVP：

- AI 内容生成与内容优化建议
- 知识库录入、检索和素材复用
- 多平台发布与收录追踪
- 多租户、套餐/计费和开放 API

## 产品原则

- **证据优先：** 保留回答证据与采集元数据，便于复核。
- **指标可解释：** 展示规则/模型版本、分项得分、覆盖率和样本量。
- **负责任采集：** 尊重平台访问限制、频率限制和适用条款。
- **不制造确定性：** 数据不可用或样本不足时明确标注，而不是伪造评分。

## 规划文档

- [MVP 提案](openspec/changes/geo-mvp-monitoring-attribution-dashboard/proposal.md)
- [技术设计](openspec/changes/geo-mvp-monitoring-attribution-dashboard/design.md)
- [需求规格](openspec/changes/geo-mvp-monitoring-attribution-dashboard/specs/)
- [实施任务](openspec/changes/geo-mvp-monitoring-attribution-dashboard/tasks.md)

## 许可证

GeoCite 使用 [GeoCite.net License v1.1](LICENSE.md)。该许可证基于 Apache 2.0，并附加商业使用限制，属于源码可用许可证。

商业许可请联系：[license@geocite.net](mailto:license@geocite.net)。
