# 诊断验收与报告实施计划

> **供执行型智能体使用：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实施；步骤以复选框追踪。

**目标：** 建立固定诊断规则与优化工单，并让诊断执行第 6、7 步计算不可变验收结果、生成可查询的诊断报告。

**架构：** 服务端新增规则目录、工单、规则结果和报告快照实体；纯规则计算器只接收已持久化证据，执行器第 6 步调用它并写入结果，第 7 步冻结报告。前端以工单管理页维护目标，以诊断报告页读取只读快照，不在浏览器重新计算结论。

**技术栈：** NestJS 11、TypeORM、SQLite、Jest、Next.js 15、React 19、next-intl、Tailwind CSS、Zustand。

## 全局约束

- 所有用户可见文案、设计和新文档使用中文；英文界面提供等义翻译。
- 服务端时间以 UTC 保存与返回，浏览器按本地时区格式化。
- 历史规则结果和报告快照不可变；不得通过更新工单或规则改写历史结果。
- 缺少证据、分母为零或缺少提升型规则基线时，结论必须为 `unmeasured`。
- 第 6 步存在 `failed` 或 `unmeasured` 工单时仍为“步骤已完成”；只有计算器异常才使步骤失败。
- 取消或失败的运行不创建正式报告，且不能被选作基线。
- 仅运行服务端单元/集成测试、服务端构建、前端类型检查与生产构建；不默认执行 E2E。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `server/src/modules/diagnosis-rules/*` | 固定规则目录、种子定义和只读查询接口 |
| `server/src/modules/optimization-work-orders/*` | 品牌工单实体、目标校验与 CRUD 接口 |
| `server/src/modules/execution-diagnosis/diagnosis-rule-calculator.ts` | 从持久化证据计算七条规则的纯函数 |
| `server/src/modules/execution-diagnosis/diagnosis-report.service.ts` | 写入不可变验收结果与报告快照、查询报告 |
| `server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts` | 规则结果与报告实体 |
| `server/src/modules/execution-diagnosis/execution-diagnosis.service.ts` | 接入第 6、7 步，发布 `finding` 与 `summary` |
| `server/src/database/data-source.ts` | 注册新增实体 |
| `ui/src/components/workspace-page.tsx` | 增加工单管理入口 |
| `ui/src/components/diagnosis/diagnosis-report-page.tsx` | 用真实报告数据替换示例数据 |
| `ui/src/messages/{zh,en}.json` | 工单与报告国际化文案 |

## 共享接口

```ts
export type RuleComparison = 'equals' | 'at_least' | 'at_most' | 'improve_at_least';
export type RuleOutcome = 'passed' | 'failed' | 'manual' | 'unmeasured';

export type CalculatedRuleValue = {
  currentValue: number | null;
  evidence: Record<string, unknown>;
  unmeasuredReason?: string;
};

export type RuleEvaluation = CalculatedRuleValue & {
  outcome: RuleOutcome;
  baselineValue: number | null;
  deltaValue: number | null;
  recommendation: string;
};
```

### Task 1：规则目录与工单数据模型

**文件：**

- 创建：`server/src/modules/diagnosis-rules/diagnosis-rule.entity.ts`
- 创建：`server/src/modules/diagnosis-rules/diagnosis-rule.catalog.ts`
- 创建：`server/src/modules/diagnosis-rules/diagnosis-rules.service.ts`
- 创建：`server/src/modules/diagnosis-rules/diagnosis-rules.controller.ts`
- 创建：`server/src/modules/diagnosis-rules/diagnosis-rules.module.ts`
- 创建：`server/src/modules/diagnosis-rules/diagnosis-rules.service.spec.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-order.entity.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-orders.dto.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-orders.service.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-orders.controller.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-orders.module.ts`
- 创建：`server/src/modules/optimization-work-orders/optimization-work-orders.service.spec.ts`
- 修改：`server/src/database/data-source.ts`
- 修改：`server/src/app.module.ts`

**消费：** `AuditedEntity`、`BrandEntity`、现有列表筛选与软删除模式。

**产出：** `DiagnosisRuleEntity`、`OptimizationWorkOrderEntity`、`GET /diagnosis-rules`、工单 CRUD。

- [ ] **步骤 1：写规则目录种子失败测试。**

```ts
it('初始化时提供七条启用的固定规则及说明', async () => {
  const items = await service.list();
  expect(items).toHaveLength(7);
  expect(items.find((item) => item.code === 'canonical_coverage')).toMatchObject({
    version: 'v1',
    defaultComparison: 'at_least',
    defaultTarget: 95,
    enabled: true,
  });
});
```

- [ ] **步骤 2：运行规则目录测试，确认失败。**

运行：`pnpm --dir server test -- diagnosis-rules.service.spec.ts`

预期：失败，提示规则服务或规则实体不存在。

- [ ] **步骤 3：实现规则实体、七条目录常量与幂等初始化。**

```ts
export const diagnosisRuleCatalog = [
  { code: 'home_http_status', version: 'v1', name: '首页可访问', metricType: 'http_status', allowedComparisons: ['equals'], defaultComparison: 'equals', defaultTarget: 200 },
  { code: 'ai_crawler_http_status', version: 'v1', name: 'AI 爬虫可访问', metricType: 'http_status', allowedComparisons: ['equals'], defaultComparison: 'equals', defaultTarget: 200 },
  { code: 'canonical_coverage', version: 'v1', name: 'Canonical 覆盖率', metricType: 'percentage', allowedComparisons: ['at_least'], defaultComparison: 'at_least', defaultTarget: 95 },
  { code: 'usable_content_page_coverage', version: 'v1', name: '可用内容页比例', metricType: 'percentage', allowedComparisons: ['at_least'], defaultComparison: 'at_least', defaultTarget: 90 },
  { code: 'diagnosis_question_count', version: 'v1', name: '品牌问题数量', metricType: 'count', allowedComparisons: ['at_least'], defaultComparison: 'at_least', defaultTarget: 8 },
  { code: 'sampling_success_rate', version: 'v1', name: '问答采样成功率', metricType: 'percentage', allowedComparisons: ['at_least'], defaultComparison: 'at_least', defaultTarget: 90 },
  { code: 'generic_question_brand_mention_rate', version: 'v1', name: '通用问题品牌提及率', metricType: 'percentage_point', allowedComparisons: ['improve_at_least'], defaultComparison: 'improve_at_least', defaultTarget: 20 },
] as const;
```

实体的 `code + version` 必须唯一；目录服务在 `onModuleInit` 逐条 `upsert`，不会覆盖已有名称、说明或禁用状态。规则控制器只暴露 `GET /diagnosis-rules`。

- [ ] **步骤 4：写工单校验失败测试。**

```ts
it('拒绝不被规则允许的比较方式', async () => {
  await expect(service.create(brandId, {
    title: '首页可访问', ruleCode: 'home_http_status', comparison: 'at_least', targetValue: 200,
  })).rejects.toThrow('不支持');
});

it('拒绝百分比规则超过 100 的目标', async () => {
  await expect(service.create(brandId, {
    title: 'Canonical 覆盖率', ruleCode: 'canonical_coverage', comparison: 'at_least', targetValue: 101,
  })).rejects.toThrow('0 到 100');
});
```

- [ ] **步骤 5：运行工单测试，确认失败。**

运行：`pnpm --dir server test -- optimization-work-orders.service.spec.ts`

预期：失败，提示工单服务不存在。

- [ ] **步骤 6：实现工单实体、DTO、服务与控制器。**

```ts
@Entity('optimization_work_orders')
export class OptimizationWorkOrderEntity extends AuditedEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'brand_id' }) brandId!: number;
  @Column() title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'rule_code' }) ruleCode!: string;
  @Column({ name: 'rule_version' }) ruleVersion!: string;
  @Column() comparison!: RuleComparison;
  @Column({ type: 'float', name: 'target_value' }) targetValue!: number;
  @Column({ name: 'target_url', type: 'text', nullable: true }) targetUrl!: string | null;
  @Column({ name: 'target_user_agent', nullable: true }) targetUserAgent!: string | null;
  @Column({ name: 'baseline_run_id', nullable: true }) baselineRunId!: number | null;
  @Column({ type: 'datetime', name: 'due_at', nullable: true }) dueAt!: Date | null;
  @Column({ default: 'open' }) status!: 'open' | 'in_progress' | 'accepted' | 'closed';
}
```

`create` 读取启用规则、锁定 `ruleVersion`，并在没有显式 `baselineRunId` 时读取品牌最新正式报告的 `runId`。`update` 只允许更新未关闭工单的标题、描述、目标、URL、UA、期限和状态，不允许修改规则编码或版本。控制器提供设计中四个工单端点。

- [ ] **步骤 7：注册模块与实体。**

在 `data-source.ts` 注册两个实体；在根模块导入规则与工单模块；在工单模块 `forFeature` 中注册规则与品牌实体。

- [ ] **步骤 8：运行测试与构建。**

运行：`pnpm --dir server test -- diagnosis-rules.service.spec.ts optimization-work-orders.service.spec.ts && pnpm --dir server build`

预期：测试通过、TypeScript 构建退出码为 0。

- [ ] **步骤 9：提交任务。**

```bash
git add server/src/modules/diagnosis-rules server/src/modules/optimization-work-orders server/src/database/data-source.ts server/src/app.module.ts
git commit -m "feat: add diagnosis rules and work orders"
```

### Task 2：不可变结果实体与纯规则计算器

**文件：**

- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts`
- 创建：`server/src/modules/execution-diagnosis/diagnosis-rule-calculator.ts`
- 创建：`server/src/modules/execution-diagnosis/diagnosis-rule-calculator.spec.ts`
- 修改：`server/src/database/data-source.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.module.ts`

**消费：** Task 1 的工单与规则类型；现有页面、探测、样本证据实体。

**产出：** `ExecutionDiagnosisRuleResultEntity`、`ExecutionDiagnosisReportEntity`、可单测的 `calculateRuleValue` 与 `evaluateRule`。

- [ ] **步骤 1：写边界规则失败测试。**

```ts
it('将 canonical 19/20 计算为 95 并满足至少 95 的目标', () => {
  const calculated = calculateRuleValue('canonical_coverage', fixture);
  expect(evaluateRule(calculated, { comparison: 'at_least', targetValue: 95 })).toMatchObject({ outcome: 'passed', currentValue: 95 });
});

it('缺少提升型规则基线时返回未测', () => {
  const calculated = { currentValue: 60, evidence: {} };
  expect(evaluateRule(calculated, { comparison: 'improve_at_least', targetValue: 20, baselineValue: null })).toMatchObject({ outcome: 'unmeasured' });
});

it('将 40 到 60 的提升保存为 20 个百分点', () => {
  expect(evaluateRule({ currentValue: 60, evidence: {} }, { comparison: 'improve_at_least', targetValue: 20, baselineValue: 40 })).toMatchObject({ outcome: 'passed', deltaValue: 20 });
});
```

- [ ] **步骤 2：运行计算器测试，确认失败。**

运行：`pnpm --dir server test -- diagnosis-rule-calculator.spec.ts`

预期：失败，提示计算器模块不存在。

- [ ] **步骤 3：实现结果和报告实体。**

```ts
@Entity('execution_diagnosis_rule_results')
@Unique(['runId', 'workOrderId'])
export class ExecutionDiagnosisRuleResultEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'run_id' }) runId!: number;
  @Column({ name: 'work_order_id' }) workOrderId!: number;
  @Column({ name: 'rule_code' }) ruleCode!: string;
  @Column({ name: 'rule_version' }) ruleVersion!: string;
  @Column() outcome!: RuleOutcome;
  @Column({ name: 'current_value', type: 'float', nullable: true }) currentValue!: number | null;
  @Column({ name: 'baseline_value', type: 'float', nullable: true }) baselineValue!: number | null;
  @Column({ name: 'target_value', type: 'float' }) targetValue!: number;
  @Column({ name: 'delta_value', type: 'float', nullable: true }) deltaValue!: number | null;
  @Column() comparison!: RuleComparison;
  @Column({ type: 'simple-json' }) evidence!: Record<string, unknown>;
  @Column() recommendation!: string;
  @CreateDateColumn({ name: 'evaluated_at', type: 'datetime' }) evaluatedAt!: Date;
}
```

报告实体包含唯一 `runId`、`brandId`、可空 `baselineRunId`、`rulesVersion`、`summary` JSON、`snapshot` JSON 与 `createdAt`。

- [ ] **步骤 4：实现纯计算器。**

计算器输入为 `{ brandName, questions, pages, probes, samples, targetUrl, targetUserAgent }`，不访问数据库。它使用来源实体 ID 和分子/分母写入 `evidence`。`evaluateRule` 统一实现四种比较方式，输出 `unmeasured`、`passed` 或 `failed`；首期不产生 `manual`，但类型必须支持它。

- [ ] **步骤 5：补齐其余五条规则测试。**

为首页状态、AI UA 默认双探测、可用内容比例、问题数量、采样成功率、通用问题品牌提及率分别添加成功与无证据测试。采样成功率使用全部保存样本作为分母，`error === null` 且状态码 2xx 为成功。

- [ ] **步骤 6：运行测试与构建。**

运行：`pnpm --dir server test -- diagnosis-rule-calculator.spec.ts && pnpm --dir server build`

预期：所有规则测试通过，构建退出码为 0。

- [ ] **步骤 7：提交任务。**

```bash
git add server/src/modules/execution-diagnosis server/src/database/data-source.ts
git commit -m "feat: add diagnosis rule calculator"
```

### Task 3：第 6 步持久化验收结果

**文件：**

- 创建：`server/src/modules/execution-diagnosis/diagnosis-acceptance.service.ts`
- 创建：`server/src/modules/execution-diagnosis/diagnosis-acceptance.service.spec.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.module.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.service.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts`

**消费：** Task 1 工单仓储、Task 2 计算器和规则结果实体。

**产出：** `evaluateRun(runId, brand)`，第 6 步真实明细和 `finding` 事件。

- [ ] **步骤 1：写“未达标不使第 6 步失败”的失败测试。**

```ts
it('保存未达标工单后仍返回已完成的步骤结果', async () => {
  results.save.mockResolvedValue({ id: 91 });
  const result = await service.evaluateRun(7, brand);
  expect(result.conclusion).toBe('passed');
  expect(result.evidence).toMatchObject({ failed: 1, resultIds: [91] });
});
```

- [ ] **步骤 2：运行测试，确认失败。**

运行：`pnpm --dir server test -- diagnosis-acceptance.service.spec.ts`

预期：失败，提示验收服务不存在。

- [ ] **步骤 3：实现验收服务。**

```ts
async evaluateRun(runId: number, brand: BrandEntity): Promise<StepResult> {
  const workOrders = await this.workOrders.find({ where: { brandId: brand.id, status: In(['open', 'in_progress']) } });
  if (!workOrders.length) return { conclusion: 'passed', severity: 'info', evidence: { noOpenWorkOrders: true, resultIds: [] }, recommendation: 'review-diagnosis-summary' };
  const evidence = await this.loadEvidence(runId, brand);
  const resultIds: number[] = [];
  for (const order of workOrders) {
    const evaluation = await this.evaluateWorkOrder(order, evidence);
    const saved = await this.results.save(this.results.create({ runId, workOrderId: order.id, ...evaluation }));
    resultIds.push(saved.id);
    await this.publishFinding(runId, saved);
  }
  return this.toStepResult(await this.results.findBy({ runId }), resultIds);
}
```

`loadEvidence` 必须从页面、探测、样本仓储与品牌问题读取，不能使用 `RunContext`。`evaluateWorkOrder` 对提升型规则先读取 `order.baselineRunId` 对应的同工单结果；为空时查询同品牌最新正式报告的同工单结果。缺基线返回未测。

- [ ] **步骤 4：将第 6 步接入服务。**

在 `performStep` 用 `return this.acceptanceService.evaluateRun(runId, context.brand)` 替换当前占位分支。为 `ExecutionDiagnosisService` 注入服务，并在验收服务通过已有 `publish` 回调发布：

```ts
await publish(runId, 'finding', {
  workOrderId: saved.workOrderId,
  ruleCode: saved.ruleCode,
  outcome: saved.outcome,
  currentValue: saved.currentValue,
  targetValue: saved.targetValue,
  deltaValue: saved.deltaValue,
});
```

- [ ] **步骤 5：写并运行服务集成测试。**

测试：无开放工单、目标恰好达成、缺证据未测、缺基线提升规则未测、未达标仍返回步骤通过、`finding` 一工单一事件、同一运行重复调用违反唯一性且不重写历史。

运行：`pnpm --dir server test -- diagnosis-acceptance.service.spec.ts execution-diagnosis.service.spec.ts`

预期：通过。

- [ ] **步骤 6：提交任务。**

```bash
git add server/src/modules/execution-diagnosis
git commit -m "feat: evaluate work orders in diagnosis runs"
```

### Task 4：第 7 步报告快照与查询接口

**文件：**

- 创建：`server/src/modules/execution-diagnosis/diagnosis-report.service.ts`
- 创建：`server/src/modules/execution-diagnosis/diagnosis-report.service.spec.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.controller.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.service.ts`
- 修改：`server/src/modules/execution-diagnosis/execution-diagnosis.module.ts`

**消费：** Task 2 报告实体与规则结果，Task 3 的第 6 步结果。

**产出：** 报告快照生成、三条报告查询接口和真实运行摘要。

- [ ] **步骤 1：写报告汇总失败测试。**

```ts
it('按不可变规则结果生成计数一致的报告快照', async () => {
  const report = await service.createSnapshot(run);
  expect(report.summary).toMatchObject({ passed: 1, failed: 1, manual: 0, unmeasured: 1 });
  expect(report.snapshot).toMatchObject({ ruleResultIds: [11, 12, 13] });
});

it('同一运行不能创建第二份报告', async () => {
  await service.createSnapshot(run);
  await expect(service.createSnapshot(run)).rejects.toThrow('报告已存在');
});
```

- [ ] **步骤 2：运行测试，确认失败。**

运行：`pnpm --dir server test -- diagnosis-report.service.spec.ts`

预期：失败，提示报告服务不存在。

- [ ] **步骤 3：实现报告服务与接口。**

```ts
async createSnapshot(run: ExecutionDiagnosisRunEntity) {
  if (run.status === 'cancelled' || run.status === 'failed') throw new BadRequestException('不能为未完成运行生成报告');
  if (await this.reports.exist({ where: { runId: run.id } })) throw new ConflictException('报告已存在');
  const results = await this.results.find({ where: { runId: run.id }, order: { id: 'ASC' } });
  const summary = summarizeResults(results);
  return this.reports.save(this.reports.create({ runId: run.id, brandId: run.brandId, baselineRunId: baselineRunId(results), rulesVersion: run.rulesVersion, summary, snapshot: { steps: run.steps, eventCount: run.events.length, ruleResultIds: results.map((item) => item.id) } }));
}
```

控制器增加：`GET /execution-checks/:runId/rule-results`、`GET /brands/:brandId/diagnosis-reports` 和 `GET /diagnosis-reports/:runId`。详情返回报告、结果、关联工单与规则说明；历史列表只返回报告摘要。

- [ ] **步骤 4：将第 7 步接入执行器。**

在 `performStep` 的第 7 步调用 `createSnapshot`。仅当此前步骤未让运行取消或失败才调用。把报告 ID 和汇总写入步骤证据；`finish` 优先使用规则结果汇总更新 `run.summary`，而不是按步骤数量计算。报告写入异常需抛出，让既有异常路径将第 7 步和运行标为失败。

- [ ] **步骤 5：运行报告与执行器测试。**

运行：`pnpm --dir server test -- diagnosis-report.service.spec.ts diagnosis-acceptance.service.spec.ts execution-diagnosis.service.spec.ts && pnpm --dir server build`

预期：通过，构建退出码为 0。

- [ ] **步骤 6：提交任务。**

```bash
git add server/src/modules/execution-diagnosis
git commit -m "feat: persist diagnosis report snapshots"
```

### Task 5：优化工单管理界面

**文件：**

- 修改：`ui/src/lib/navigation.ts`
- 修改：`ui/src/app/[locale]/(workspace)/[...segments]/page.tsx`
- 修改：`ui/src/components/workspace-page.tsx`
- 创建：`ui/src/components/diagnosis/optimization-work-orders-page.tsx`
- 修改：`ui/src/messages/zh.json`
- 修改：`ui/src/messages/en.json`

**消费：** Task 1 工单与规则接口。

**产出：** 可选择规则、查看说明、设定目标的品牌工单管理页。

- [ ] **步骤 1：写页面数据转换失败测试或提取纯函数测试。**

创建 `ui/src/components/diagnosis/optimization-work-orders.ts` 与测试，先定义：

```ts
export function defaultWorkOrderValues(rule: DiagnosisRule): WorkOrderFormValues {
  return { comparison: rule.defaultComparison, targetValue: String(rule.defaultTarget), targetUrl: '', targetUserAgent: '', dueAt: '' };
}
```

测试断言 `canonical_coverage` 默认目标为 `95`，`generic_question_brand_mention_rate` 默认比较方式为 `improve_at_least`。

- [ ] **步骤 2：运行测试，确认失败。**

运行：`pnpm --dir ui exec tsc --noEmit`

预期：失败，提示新模块不存在；若 UI 没有单元测试运行器，类型检查作为此纯函数的首个编译验证。

- [ ] **步骤 3：实现工单页面。**

页面从 Zustand 当前品牌读取 `brandId`，并并行请求规则目录和品牌工单。表格列为：工单、验收规则、规则说明、目标、比较方式、截止日期、状态、操作。新增/编辑弹窗中规则选择后显示说明、比较方式和默认目标；规则编码、版本在编辑时只读。没有当前品牌时显示明确空状态。

API 调用继续使用 `requestJson`，自动保留 `>>>>>>` / `<<<<<<` 控制台前缀。所有可见标签使用 `OptimizationWorkOrders` 翻译命名空间。

- [ ] **步骤 4：加入导航入口与路由。**

“提升”下的“优化工单”路由保持 `/improvement/optimization-work-orders`，但动态路由改为返回新页面而非 `WorkspacePage` 占位。不要调整其它提升菜单。

- [ ] **步骤 5：运行前端验证。**

运行：`pnpm --dir ui exec tsc --noEmit && pnpm --dir ui build`

预期：类型检查和生产构建均成功。

- [ ] **步骤 6：提交任务。**

```bash
git add ui/src/lib/navigation.ts 'ui/src/app/[locale]/(workspace)/[...segments]/page.tsx' ui/src/components/diagnosis ui/src/components/workspace-page.tsx ui/src/messages
git commit -m "feat: manage optimization work orders"
```

### Task 6：真实诊断报告页面

**文件：**

- 修改：`ui/src/components/diagnosis/diagnosis-report-page.tsx`
- 修改：`ui/src/messages/zh.json`
- 修改：`ui/src/messages/en.json`
- 可选创建：`ui/src/components/diagnosis/diagnosis-report.ts`

**消费：** Task 4 历史报告与详情接口、Task 5 当前品牌状态。

**产出：** 只读诊断报告、历史选择与证据展开。

- [ ] **步骤 1：写报告格式化函数失败测试或 TypeScript 断言。**

```ts
export function formatMetric(value: number | null, metricType: string): string {
  if (value === null) return '—';
  return metricType === 'percentage' || metricType === 'percentage_point' ? `${value}%` : String(value);
}
```

断言 `20` 的百分点展示为 `+20 个百分点` 时，通过独立参数 `deltaValue` 格式化，避免显示成 `20%`。

- [ ] **步骤 2：运行类型检查，确认新接口尚未接入。**

运行：`pnpm --dir ui exec tsc --noEmit`

预期：在引用尚未实现的报告数据函数前失败，或在新增类型后继续至下一步。

- [ ] **步骤 3：替换示例页面。**

移除硬编码评分卡、趋势、渠道和样例优先级。加载 `GET /brands/:brandId/diagnosis-reports`，默认选取最新报告；再加载 `GET /diagnosis-reports/:runId`。页面展示：

```tsx
<ReportSummary summary={report.summary} baselineRunId={report.baselineRunId} />
<WorkOrderResultsTable results={detail.results} onLoadRun={loadExecutionRun} />
```

结果表完整显示工单、规则名称、规则说明、当前值、基线值、目标、变化、结论与建议。使用原生 `details/summary` 或现有 Dialog 展开结构化证据；不引入新 UI 依赖。没有品牌、没有报告、加载失败分别显示清晰状态。时间使用 `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium' })`。

“加载该次执行”跳转到 `/[locale]/diagnosis/diagnosis-execution?runId=<runId>`；同时在诊断执行页读取此参数并请求 `GET /execution-checks/:id`，复用已有 `applyRun`，不触发重新执行。

- [ ] **步骤 4：补全翻译与可访问性。**

新增报告状态、表头、无报告、加载失败、证据、加载该次执行等中英文翻译。状态使用文本与颜色共同表达；展开证据控件必须有可读标签。

- [ ] **步骤 5：运行完整验证。**

运行：

```bash
pnpm --dir server test -- diagnosis-rules.service.spec.ts optimization-work-orders.service.spec.ts diagnosis-rule-calculator.spec.ts diagnosis-acceptance.service.spec.ts diagnosis-report.service.spec.ts execution-diagnosis.service.spec.ts
pnpm --dir server build
pnpm --dir ui exec tsc --noEmit
pnpm --dir ui build
git diff --check
```

预期：全部命令退出码为 0；不运行 E2E。

- [ ] **步骤 6：提交任务。**

```bash
git add ui/src/components/diagnosis/diagnosis-report-page.tsx ui/src/components/diagnosis/diagnosis-execution-page.tsx ui/src/messages
git commit -m "feat: show persisted diagnosis reports"
```

## 计划自检

- 规则目录、工单、不可变结果、报告快照分别对应设计的数据模型。
- 七条规则、目标校验、基线差异、未测语义均由 Task 2 与 Task 3 覆盖。
- 第 6 步 `finding`、第 7 步快照与查询接口由 Task 3、Task 4 覆盖。
- 工单管理和诊断报告两处用户界面由 Task 5、Task 6 覆盖。
- 每个任务均先写失败测试，再实现、验证和提交；未把 E2E 作为默认验证。
