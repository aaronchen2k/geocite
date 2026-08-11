# GEO 工作台基础脚手架设计

## 目标

建立一个参考 xiao2 应用壳的全栈 GEO 工作台。首期交付可运行的 Next.js 前端、NestJS 后端、SQLite/TypeORM 数据层，以及 Brand、Engine、Model、RagAgent 四个系统管理实体的 CRUD。业务导航页面先提供真实路由、Brand 上下文和明确的空状态，为后续诊断、提升和验证能力提供稳定入口。

## 范围

### 包含

- 顶部 Brand 选择器、响应式侧栏、深浅主题和统一页面壳。
- 仪表盘，以及诊断、提升、验证三组业务导航和占位页面。
- Brand、Engine、Model、RagAgent 的列表、搜索、创建、编辑、删除与输入校验。
- 后端分页/搜索 CRUD API、SQLite/TypeORM 实体、DTO、服务、仓储与控制器。
- Brand 默认选择持久化，切换后立即更新前端工作区上下文。
- 后端 API、核心领域规则和前端导航/Brand 选择的自动化验证。

### 不包含

- AI 引擎的真实引用检测、竞品分析、资产抓取、优化执行或效果计算。
- RAG 文档上传、向量化、检索运行与模型调用。
- Brand 对 Engine 的监测配置；该关系由后续诊断配置能力引入。
- 多租户、鉴权、计费、工作流/沙箱执行和 GEO 领域指标。

## 信息架构

```text
GEO 工作台
├── 仪表盘
├── 诊断
│   ├── 引用检测
│   ├── 竞品对比
│   ├── 资产审计
│   ├── 渠道地图
│   └── 综合报告
├── 提升
│   ├── 优化工单
│   ├── 关键矩阵
│   ├── 信源建设
│   ├── 技术适配
│   └── 内容生产
├── 验证
│   ├── 可见趋势
│   ├── 排名追踪
│   ├── 效果归因
│   ├── 对比测试
│   └── 周期复测
└── 系统管理
    ├── Brand
    ├── Engine
    ├── Model
    └── RagAgent
```

前端路由采用 `/dashboard`、`/diagnosis/*`、`/improvement/*`、`/verification/*` 和 `/admin/*`。所有业务页使用相同的页面壳：标题、描述、当前 Brand 上下文和清晰的空状态。系统管理页面不依赖当前 Brand，只有 RagAgent 的创建/编辑需要选择所属 Brand。

## 架构

采用与 xiao2 一致的前后端分离结构：

- `ui/`：Next.js App Router、TypeScript、Tailwind、组件库。`AppShell` 包含顶部栏、响应式侧栏和菜单树；`BrandWorkspaceProvider` 负责加载 Brand、保存选择状态和向业务页提供当前 Brand。
- `server/`：NestJS。每个实体都有 module、entity、DTO、repository、service、controller。控制器位于 `/api/v1` 前缀下。
- `server/data/`：SQLite 数据库及 TypeORM migration。开发环境可自动初始化，但结构演进必须通过 migration。

前端使用统一 API 客户端。管理页面的表格、分页、搜索、表单和删除确认抽成可复用组件，避免四套 CRUD 页面分叉。后端用 class-validator 校验 DTO，服务层负责唯一性、外键存在性和删除约束。

## 领域模型

### Brand

Brand 是需要进行 GEO 优化的品牌主体，且是业务页的工作区边界。

字段：`id`、`name`、`code`、`website`、`industry`、`description`、`isDefault`、`enabled`、创建/更新时间。

规则：`code` 唯一；任何时刻最多一个默认 Brand；删除默认 Brand 前必须先切换默认项；存在 RagAgent 时默认拒绝删除，要求先转移或删除关联智能体。

### Engine

Engine 是全局待评估的外部 AI 引擎目录，例如豆包、千问、DeepSeek、Kimi。它不是项目内部调用模型，也不与 Model 建立外键。

字段：`id`、`name`、`code`、`vendor`、`description`、`enabled`、创建/更新时间。

规则：`code` 唯一；可以被多个 Brand 在后续诊断/优化配置中复用；首期不保存其调用密钥或 Brand 级监测参数。

### Model

Model 是 GeoCite 项目内部调用的大模型 API 配置，用于后续分析、RAG 与内容能力。

字段：`id`、`name`、`modelName`、`provider`、`baseUrl`、`apiKey`、`enabled`、`isDefault`、创建/更新时间。

规则：与 Engine 无关系；API Key 仅保存于服务端，所有返回给 UI 的响应均显示掩码值；最多一个默认且启用的 Model；删除默认 Model 前必须先切换默认项。

### RagAgent

RagAgent 是服务于某个 Brand 的智能体配置，使用一个项目内部 Model。

字段：`id`、`name`、`code`、`description`、`brandId`、`modelId`、`systemPrompt`、`enabled`、创建/更新时间。

规则：`code` 唯一；`brandId` 必填且必须存在；`modelId` 必填且必须指向启用的 Model；不关联 Engine。

## API 契约

`/api/v1/brands`、`/api/v1/engines`、`/api/v1/models`、`/api/v1/rag-agents` 均提供分页列表和创建接口；各自的 `/:id` 子路径均提供详情、更新和删除接口。列表支持 `page`、`pageSize`、`keyword`。

Brand 另有 `PATCH /api/v1/brands/:id/default`；Model 另有 `PATCH /api/v1/models/:id/default`。所有列表响应统一为 `items`、`total`、`page`、`pageSize`。冲突返回 409，缺少关联对象或资源返回 404，违反默认项/关联约束返回 400。

## 关键流程

### Brand 选择

应用启动时，`BrandWorkspaceProvider` 拉取 Brand 列表，并优先采用当前默认 Brand。用户在顶部下拉框切换后调用默认 Brand API；成功后同时更新 Provider 状态和当前页面显示。没有 Brand 时，业务页显示引导空状态；系统管理仍可访问以创建 Brand。

### RagAgent 创建

管理页加载 Brand 和启用的 Model 选项。用户提交表单后，后端校验 Brand 存在、Model 启用以及 code 唯一性，再保存实体。API 响应只返回关联对象的安全摘要，不返回 Model 的 API Key。

### Model 密钥更新

表单允许编辑 API Key。未提供新值时保留现有密钥；提供新值时覆盖保存。列表、详情与日志不返回原始密钥，只返回是否已配置和掩码摘要。

## 错误处理与安全

- 统一将后端校验与冲突错误映射为可操作的表单反馈。
- 删除操作需确认，关联约束错误必须显示阻断原因。
- 密钥字段不记录在浏览器日志、应用日志、错误响应或 API 返回体中。
- 页面处于加载、空数据、加载失败时均显示明确状态和重试入口。

## 测试

- 后端：实体/服务测试覆盖唯一 code、默认项、RagAgent 外键、禁用 Model 选择和 API Key 掩码；控制器测试覆盖 CRUD、分页、搜索及错误码。
- 前端：测试菜单树、当前路由高亮、移动端菜单、Brand 切换和 CRUD 表单错误反馈。
- 端到端：创建 Brand、创建 Model、创建 RagAgent、切换顶部 Brand、进入各导航页面；验证 Engine 与 Model 没有数据关联。

## 交付顺序

1. 初始化前后端工程与共享开发配置。
2. 完成 Brand 与顶部选择器，再建立应用壳和所有路由。
3. 完成 Engine、Model、RagAgent 后端及管理界面。
4. 加入复用 CRUD 组件和端到端验证。
5. 将后续 GEO 诊断、提升与验证功能逐步接入对应页面和 Brand 上下文。
