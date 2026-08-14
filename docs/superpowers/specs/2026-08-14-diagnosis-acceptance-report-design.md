# 诊断验收与报告设计

## 目标

补全“诊断执行”的第 6、7 步，使其不再仅写入运行 ID 与时间：

- 第 6 步基于已保存的站点、AI 爬虫、页面体检和问答采样证据，按优化工单的结构化目标完成验收与基线对比。
- 第 7 步将本次验收结果冻结为不可变诊断报告快照，供“诊断报告”页和历史查询使用。

本期仅使用本文定义的七条固定验收规则；规则目录可版本化扩展，但不允许修改历史验收结果。

## 范围与边界

- 新增系统规则目录、优化工单、不可变规则结果和报告快照。
- 工单以结构化指标验收，不使用自由文本或 AI 主观判读作为首期结论来源。
- 运行步骤完成表示计算完成；某些工单未达标或未测，不会使第 6 步本身失败。
- 仅计算当前已有的第 2 至第 5 步证据。未采集或无法计算的数据必须标记为“未测”。
- 取消或失败的运行不生成正式报告，也不能作为后续基线。

## 固定规则目录

| 规则编码 | 名称 | 说明 | 当前值来源 | 指标类型 | 比较方式 | 默认目标 |
| --- | --- | --- | --- | --- | --- | --- |
| `home_http_status` | 首页可访问 | 检查用户和搜索/抓取系统能否正常打开官网首页。首页不可访问时，后续诊断没有可靠基础。 | 第 2 步入口页 HTTP 状态 | 状态码 | `equals` | `200` |
| `ai_crawler_http_status` | AI 爬虫可访问 | 检查 GPTBot、ClaudeBot 等 AI 爬虫访问首页时是否被 robots、CDN 或 WAF 拦截。 | 第 3 步各 AI UA HTTP 状态 | 状态码 | `equals` | `200` |
| `canonical_coverage` | Canonical 覆盖率 | 检查已抓取 HTML 页面中声明正式页面地址（`rel=canonical`）的比例，避免重复地址分散内容信号。 | 第 4 步 HTML 页面体检 | 百分比 | `at_least` | `95` |
| `usable_content_page_coverage` | 可用内容页比例 | 检查已抓取 HTML 页面中同时具备标题和有效正文的比例；这类页面具备被 AI 理解、引用的基础。 | 第 4 步 HTML 页面体检 | 百分比 | `at_least` | `90` |
| `diagnosis_question_count` | 品牌问题数量 | 检查 AI 问答采样问题是否足以覆盖用户需求、服务、可信度与对比等场景。 | 品牌已保存的问题 | 数量 | `at_least` | `8` |
| `sampling_success_rate` | 问答采样成功率 | 检查已配置引擎是否稳定完成全部问题采样，避免接口失败使结果失真。 | 第 5 步成功采样数 / 应采样数 | 百分比 | `at_least` | `90` |
| `generic_question_brand_mention_rate` | 通用问题品牌提及率 | 检查不带品牌词的行业问题中，AI 回答主动提及品牌的比例，衡量自然可见度。 | 第 5 步回答中的品牌名称匹配 | 百分比 | `improve_at_least` | `20` 个百分点 |

### 规则计算口径

- `home_http_status`：取第 2 步入口页的 HTTP 状态；缺少入口页证据则未测。
- `ai_crawler_http_status`：工单可指定一个 AI User-Agent；未指定时要求 GPTBot 与 ClaudeBot 均为 200。任一已采集状态非 200 则未达标；没有任一探测值则未测。
- `canonical_coverage`：`含 canonical 的 HTML 页数 / 已抓取 HTML 页数 × 100`。分母为 0 时未测。
- `usable_content_page_coverage`：`同时具备标题与有效正文的 HTML 页数 / 已抓取 HTML 页数 × 100`。分母为 0 时未测。
- `diagnosis_question_count`：读取品牌当前已保存的问题数量，不依赖本次请求成功与否。
- `sampling_success_rate`：`第 5 步 status=sampled 的样本数 / 已计划采样数 × 100`。不存在已计划样本时未测。
- `generic_question_brand_mention_rate`：通用问题由问题文本不含品牌名称判定；回答不区分大小写包含品牌名称即为提及。`提及样本数 / 成功通用问题样本数 × 100`。没有成功通用问题样本时未测。

## 数据模型

### 规则目录 `diagnosis_rules`

系统初始化七条规则。规则定义用于新工单；规则版本升级会新建记录或提升版本，历史结果只引用验收时的版本。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | 整数 | 主键 |
| `code` | 字符串，唯一 | 固定规则编码 |
| `version` | 字符串 | 如 `v1` |
| `name` | 字符串 | 显示名称 |
| `description` | 文本 | 面向用户的规则说明 |
| `metricType` | 枚举 | `http_status`、`percentage`、`count`、`percentage_point` |
| `allowedComparisons` | JSON 数组 | 此规则允许的比较方式 |
| `defaultComparison` | 枚举 | 默认比较方式 |
| `defaultTarget` | 数字 | 默认目标值 |
| `enabled` | 布尔 | 是否可用于新工单 |
| `createdAt`、`updatedAt` | 时间 | 审计字段 |

### 优化工单 `optimization_work_orders`

一张工单只验收一条规则。工单创建时锁定规则编码与版本；规则目录后续变化不影响既有工单。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`brandId` | 整数 | 主键与品牌归属 |
| `title`、`description` | 文本 | 工单信息 |
| `ruleCode`、`ruleVersion` | 字符串 | 采用的规则版本 |
| `comparison` | 枚举 | `equals`、`at_least`、`at_most`、`improve_at_least` |
| `targetValue` | 数字 | 验收目标 |
| `targetUrl` | 文本，可空 | 页面类规则的目标 URL；为空按品牌首页或全站口径计算 |
| `targetUserAgent` | 字符串，可空 | AI 爬虫规则可指定 UA |
| `baselineRunId` | 整数，可空 | 工单创建时锁定的已完成报告基线 |
| `dueAt` | 时间，可空 | 截止日期 |
| `status` | 枚举 | `open`、`in_progress`、`accepted`、`closed` |
| `createdAt`、`updatedAt` | 时间 | 审计字段 |

创建校验：规则必须启用；比较方式必须在规则的允许列表；百分比范围为 0 至 100；状态码目标为正整数；`improve_at_least` 只能用于需要基线的规则。

### 不可变验收结果 `execution_diagnosis_rule_results`

第 6 步对当前运行中每个 `open` 或 `in_progress` 工单创建一条结果。已写入的结果不能更新或删除；同一 `runId + workOrderId` 唯一。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`runId`、`workOrderId` | 整数 | 标识和关联 |
| `ruleCode`、`ruleVersion` | 字符串 | 本次实际使用的规则版本 |
| `outcome` | 枚举 | `passed`、`failed`、`manual`、`unmeasured` |
| `currentValue`、`baselineValue`、`targetValue` | 数字，可空 | 当前、基线与目标值 |
| `deltaValue` | 数字，可空 | 当前值减基线值；百分点规则以百分点保存 |
| `comparison` | 枚举 | 本次比较方式快照 |
| `evidence` | JSON | 来源步骤、URL、探测、页面、样本 ID 和计算分子分母 |
| `recommendation` | 字符串 | 建议代码，前端按语言映射 |
| `evaluatedAt` | 时间 | 计算时间 |

### 报告快照 `execution_diagnosis_reports`

第 7 步在运行成功或部分完成时创建一条报告快照。`runId` 唯一，快照只读。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id`、`runId`、`brandId` | 整数 | 标识与关联 |
| `baselineRunId` | 整数，可空 | 本次报告使用的基线 |
| `rulesVersion` | 字符串 | 执行器规则版本 |
| `summary` | JSON | `passed`、`failed`、`manual`、`unmeasured`、关键问题与变化摘要 |
| `snapshot` | JSON | 七步状态、事件摘要和规则结果 ID 列表 |
| `createdAt` | 时间 | 报告生成时间 |

## 第 6 步：规则验收与前后对比

1. 读取当前品牌状态为 `open`、`in_progress` 的工单；没有工单时返回已完成，证据中标明 `noOpenWorkOrders=true`。
2. 从数据库读取当前运行的页面、探测、问答样本和品牌问题，而不是依赖内存上下文，确保重放与后续重算可追溯。
3. 根据 `ruleCode` 调用纯计算器，计算当前值、计算依据及结构化证据。
4. 读取工单的 `baselineRunId`；若为空，读取品牌最近一份正式报告对应的同规则、同工单结果。比较方式为 `improve_at_least` 而缺少基线时结果为未测；其他比较方式不需要基线。
5. 比较结论：
   - `equals`：`currentValue === targetValue`。
   - `at_least`：`currentValue >= targetValue`。
   - `at_most`：`currentValue <= targetValue`。
   - `improve_at_least`：`currentValue - baselineValue >= targetValue`。
6. 缺失来源证据、分母为 0 或缺少必需基线时，写入 `unmeasured`；不使用失败代替未测。
7. 对每张工单写入一条不可变结果，发布 `finding` SSE 事件；事件包含工单 ID、规则、结论、当前值、目标值与差异。
8. 返回步骤汇总与结果 ID。存在未达标或未测工单时，第 6 步状态仍为已完成；仅计算器抛出未恢复异常时步骤失败。

## 第 7 步：生成检测结果

1. 读取当前运行的七个步骤、持久化事件和第 6 步规则结果。
2. 聚合验收结论，生成通过、未达标、待人工、未测计数，并挑选未达标与未测项目作为关键问题。
3. 生成只读 `execution_diagnosis_reports` 快照，保存基线引用、规则版本、结果摘要和结果 ID。
4. 本次运行状态为 `succeeded` 或 `partial` 时，报告可作为未来工单的基线候选；`cancelled`、`failed` 运行不创建正式报告。
5. 报告持久化失败时，第 7 步与整个运行标为失败；第 2 至第 6 步的原始证据、事件与结果保留，便于排查和重试。
6. 发布 `summary` SSE 事件；前端可立即刷新“诊断报告”页或继续加载本次原始运行。

## 接口

| 方法与路径 | 用途 |
| --- | --- |
| `GET /diagnosis-rules` | 返回可用规则、说明、默认目标与比较方式 |
| `GET /brands/:brandId/optimization-work-orders` | 查询品牌工单 |
| `POST /brands/:brandId/optimization-work-orders` | 创建工单，并锁定规则版本 |
| `PATCH /optimization-work-orders/:id` | 修改未关闭工单的目标、URL、期限与状态 |
| `GET /execution-checks/:runId/rule-results` | 查询某次运行的验收结果明细 |
| `GET /brands/:brandId/diagnosis-reports` | 查询品牌历史诊断报告 |
| `GET /diagnosis-reports/:runId` | 查询一份不可变报告快照与验收结果 |

所有时间由服务端以 UTC 保存和返回，浏览器按本地时区展示。

## 诊断报告页面

- 顶部：运行时间、使用的基线运行、整体结论与“加载该次执行”入口。
- 摘要：通过、未达标、待人工、未测计数；首测明确显示“已建立基线”，不展示虚构变化。
- 工单验收表：工单、规则、规则说明、当前值、基线值、目标、差异、结论、建议。
- 展开行：显示 URL、AI UA 状态、页面统计、问答样本或计算分子/分母等结构化证据。
- 空状态：没有报告时提示先执行诊断；报告历史只读，不会触发重新计算。

## SSE 与状态约束

- 第 6 步为每条结果发布 `finding`；第 7 步完成时发布 `summary`。
- 步骤“已完成”与规则“通过”是不同概念：第 6 步可完成，同时包含未达标与未测工单。
- 当前“加载上次执行”继续读取原始运行快照，不触发任何规则或报告重算。
- 报告与规则结果均不可变；工单、规则的后续修改不改写历史快照。

## 测试边界

- 七条规则各自覆盖：正常值、缺少证据、边界值、恰好满足目标。
- 百分点变化：`40%` 至 `60%` 的 `deltaValue` 为 `20`，满足“至少提升 20 个百分点”。
- 工单创建拒绝不兼容比较方式、非法百分比和无效状态码目标。
- 第 6 步：未达标或未测工单不会使步骤失败；计算器异常才会失败。
- 第 7 步：报告摘要的四类计数必须等于规则结果汇总；重复运行不得为同一运行创建两份报告。
- 基线：取消、失败运行不可作为基线；首份成功或部分完成报告的提升型规则为未测。
- 本期执行服务端单元测试、服务端构建、前端类型检查与生产构建；不默认执行 E2E。

## 实施顺序

1. 建立规则目录、工单和结果/报告实体，写入七条规则种子数据。
2. 实现规则计算器与单元测试。
3. 实现工单 CRUD、校验与工单管理页面。
4. 将第 6 步接入计算器、结果持久化和 SSE `finding` 事件。
5. 将第 7 步接入报告快照、汇总和查询接口。
6. 实现诊断报告页与历史报告读取。
