## Why

当前 GeoCite 只有 GEO 监测、归因和报告的业务规格，缺少承载这些能力的项目工作台、迭代执行、产物管理和可恢复运行基础。`../xiao2` 已验证了一套以项目/迭代目录为边界、由 Speckit 阶段驱动、支持沙箱执行、实时日志和失败恢复的工程方案；现在需要将其提炼为 GeoCite 的平台级技术需求，并明确与 GEO 领域能力的集成边界。

## What Changes

- 建立项目、迭代、执行环境和产物的统一工作台模型。
- 引入六阶段 Speckit 工作流：kickoff、constitution、specify、plan、tasks、implement。
- 以文件系统产物和结构化状态快照作为迭代工作流的可追溯事实源。
- 支持本地、Docker 和 OpenSandbox 等执行提供者，以及可配置的默认模型。
- 增加阶段级状态、并发保护、回退、重做、检查问题恢复和断点续跑能力。
- 通过 WebSocket 推送执行状态，通过 SSE 推送阶段日志，并保留项目级、迭代级和阶段级日志。
- 建立项目级收尾能力：汇总已完成迭代、校验代码技术栈、生成 quickstart 和环境安装文档。
- 规定后端 API、前端工作台、SQLite/TypeORM 数据模型和自动化测试的基础边界。
- 将现有 GEO 监测、归因和报告能力作为业务模块接入项目/迭代工作台；不复制 `xiao2` 的毕业设计业务内容。

## Capabilities

### New Capabilities

- `project-workbench`: 项目生命周期、迭代目录、产物访问和工作台导航。
- `spec-workflow`: 六阶段 Speckit 工作流、阶段状态和产物契约。
- `execution-runtime`: 模型配置、执行提供者、沙箱运行和命令编排。
- `observability-recovery`: 阶段状态推送、日志流、回退、重做、恢复和错误证据。
- `project-finalization`: 项目级技术栈汇总、交付物生成和原子发布。

### Modified Capabilities

无。现有 GEO 能力的业务需求不在本变更中修改，仅规定其接入平台基础设施的方式。

## Impact

- 后端新增或适配 projects、iterations、workflow、execution、models、logs 和 project-finalization 模块。
- 前端新增项目工作台、迭代详情、阶段执行、产物浏览、日志查看和项目收尾页面。
- 新增 SQLite/TypeORM 实体、迁移、结构化 JSON 状态文件、阶段日志和项目交付文档。
- 新增 HTTP API、WebSocket 命令/状态通道和 SSE 日志通道。
- 需要接入 Codex/Speckit 执行器、模型配置和本地/Docker/OpenSandbox 运行时；外部平台调用仍由 GEO 领域适配器独立负责。
- 需要覆盖后端 smoke/unit 测试、前端交互测试和关键 Playwright E2E 流程。
