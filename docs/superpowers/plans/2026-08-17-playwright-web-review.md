# Playwright 网页复核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 客户端本地 Chrome 上完成 API 粗扫后的 Playwright 网页复核，并以可复现的抽样和证据校正诊断指标。

**Architecture:** 诊断配置保存问句总数及三类问题比例；运行创建时冻结比例、选样和规则版本。网页复核模块以独立实体保存引擎专属 Profile、受控 Chrome 启动实例和网页证据；执行诊断第 6 步调用本地 Playwright 服务，API 样本保持不可变。引擎管理页仅展示“不可用、待登录、已就绪”，以刷新和重置管理本机 Chrome。

**Tech Stack:** NestJS、TypeORM/SQLite、`playwright-core`、系统 Chrome、Electron 本地后端、Next.js、Jest、Playwright 测试。

## 全局约束

- 所有用户文案、需求、设计正文使用中文。
- 复核单位为“引擎 × 问题”API 样本；30%是最低目标，核心业务问题和 API 命中品牌问题强制优先。
- 网页复核不得保存密码、验证码或短信内容；不得规避验证码、风控或平台限制。
- 每个引擎使用 `{应用数据目录}/playwright-profiles/{engineCode}` 专属 Chrome Profile，绝不使用用户日常 Chrome Profile。
- `profileId` 长期稳定，`launchId` 每次启动新生成；仅在 Chrome 命令行同时匹配 `launchId` 与专属 `profilePath` 时才可关闭遗留进程。
- API 原始样本、已完成运行与历史快照不可回写；网页证据必须独立保存。
- 浏览器运行仅在 Electron 本机后端执行，单引擎串行、低频；出现验证码、风控或未登录即停止该引擎本次复核。

---

### Task 1: 诊断采样范围与分类问句生成

**Files:**
- Modify: `server/src/modules/brands/brand.entity.ts`
- Modify: `server/src/modules/execution-diagnosis/diagnosis-configuration.dto.ts`
- Modify: `server/src/modules/execution-diagnosis/diagnosis-configuration.service.ts`
- Modify: `server/src/modules/execution-diagnosis/brand-question-prompt.ts`
- Modify: `assert/prompts/brand-question-generation.md`
- Modify: `ui/src/components/brand-diagnosis-questions-page.tsx`（按实际当前问题库组件路径调整）
- Test: `server/src/modules/execution-diagnosis/diagnosis-configuration.service.spec.ts`
- Test: `server/src/modules/execution-diagnosis/brand-question-prompt.spec.ts`

**Interfaces:**
- Produces `samplingQuestionCount: number`、`questionCategoryRatio: { brandBasic: number; coreCapability: number; competitorComparison: number }`。
- Produces `allocateQuestionCategories(total, ratio)`，返回三类精确配额；供提示词、生成校验和运行快照使用。
- 所有问题的 `group` 只允许 `品牌基础提问 | 核心业务能力提问 | 竞品对比提问`；已有非这三类的历史问题迁移为 `核心业务能力提问`，不删除问题文本。

- [ ] **Step 1: 写出配额分配失败测试**

```ts
expect(allocateQuestionCategories(10, {brandBasic: 1, coreCapability: 2, competitorComparison: 1}))
  .toEqual({brandBasic: 3, coreCapability: 5, competitorComparison: 2});
expect(() => validateSamplingConfig({samplingQuestionCount: 3, questionCategoryRatio: {brandBasic: 1, coreCapability: 0, competitorComparison: 1}}))
  .toThrow('问题分类比例必须全部大于 0');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir server test -- diagnosis-configuration.service.spec.ts brand-question-prompt.spec.ts`

Expected: FAIL，缺少比例配置和配额分配函数。

- [ ] **Step 3: 实现配置、配额和生成校验**

```ts
export type QuestionCategoryRatio = {brandBasic: number; coreCapability: number; competitorComparison: number};
export function allocateQuestionCategories(total: number, ratio: QuestionCategoryRatio) {
  const sum = ratio.brandBasic + ratio.coreCapability + ratio.competitorComparison;
  const base = {brandBasic: Math.floor(total * ratio.brandBasic / sum), coreCapability: Math.floor(total * ratio.coreCapability / sum), competitorComparison: Math.floor(total * ratio.competitorComparison / sum)};
  for (const key of ['coreCapability', 'brandBasic', 'competitorComparison'] as const) {
    if (base.brandBasic + base.coreCapability + base.competitorComparison < total) base[key]++;
  }
  return base;
}
```

在 `BrandEntity` 新增上述两项持久化字段；DTO 限制问句数 `4..150`、比例每项 `1..100`。`normalize` 将已有非标准分类映射为 `核心业务能力提问`，新建/编辑 DTO 用 `@IsIn` 拒绝非标准分类。提示词要求返回 `{questions:[{text,category}]}`，类别只能为 `品牌基础提问`、`核心业务能力提问`、`竞品对比提问`；生成服务按冻结配额校验，不足或类别失衡返回明确 400，不进行第二次模型请求。

- [ ] **Step 4: 在基础配置页面接入“诊断采样范围”**

在现有“最多抓取 URL 数”附近增加问句总数和三个比例输入，实时显示“本次将生成：基础 X、核心 X、竞品 X”。问题编辑的分类控件改为三个固定选项。保存失败时保持用户输入并显示后端消息；问题库已有手工问题不被自动删除。

- [ ] **Step 5: 运行测试并提交**

Run: `pnpm --dir server test -- diagnosis-configuration.service.spec.ts brand-question-prompt.spec.ts && pnpm --dir ui exec tsc --noEmit`

Expected: PASS。

```bash
git add server/src/modules/brands/brand.entity.ts server/src/modules/execution-diagnosis/diagnosis-configuration.dto.ts server/src/modules/execution-diagnosis/diagnosis-configuration.service.ts server/src/modules/execution-diagnosis/brand-question-prompt.ts assert/prompts/brand-question-generation.md ui/src/components/brand-diagnosis-questions-page.tsx server/src/modules/execution-diagnosis/diagnosis-configuration.service.spec.ts server/src/modules/execution-diagnosis/brand-question-prompt.spec.ts
git commit -m "feat: configure diagnostic question categories"
```

### Task 2: 本地 Chrome 生命周期与网页登录状态

**Files:**
- Modify: `server/package.json`
- Create: `server/src/modules/execution-diagnosis/web-review.entity.ts`
- Create: `server/src/modules/execution-diagnosis/local-chrome.service.ts`
- Create: `server/src/modules/execution-diagnosis/local-chrome.service.spec.ts`
- Modify: `server/src/database/data-source.ts`
- Modify: `server/src/modules/execution-diagnosis/execution-diagnosis.module.ts`
- Modify: `server/src/modules/engines/engines.controller.ts`
- Modify: `server/src/modules/engines/engines.service.ts`

**Interfaces:**
- Produces `EngineWebReviewProfileEntity` 与 `EngineBrowserLaunchEntity`。
- Produces `LocalChromeService.refresh(engineId): Promise<WebReviewAvailability>` 与 `reset(engineId): Promise<WebReviewAvailability>`。
- `WebReviewAvailability = 'unavailable' | 'pending_login' | 'ready'`。

- [ ] **Step 1: 写浏览器标识和安全关闭失败测试**

```ts
it('仅关闭同 launchId 且同 profilePath 的受控 Chrome', async () => {
  await service.reset(engine);
  await expect(service.closePreviousLaunch(engine.id)).resolves.toEqual({closed: true});
  expect(processInspector.kill).toHaveBeenCalledWith(expect.objectContaining({launchId: expect.any(String), profilePath: expect.stringContaining('/playwright-profiles/')}));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir server test -- local-chrome.service.spec.ts`

Expected: FAIL，缺少本地 Chrome 服务和实体。

- [ ] **Step 3: 实现 Profile、launchId 与三态健康检查**

安装 `playwright-core`，创建每引擎一个 Profile 及每次启动一个 `launchId`。启动参数必须含：

```ts
args: [`--geocite-review-launch-id=${launchId}`]
// userDataDir 由 launchPersistentContext 的第一个参数传入
```

`refresh` 只执行轻量登录/问答页检查并关闭临时上下文；`reset` 先安全关闭旧 launch，再以前台窗口启动。未登录时保持窗口开放并返回 `pending_login`；检测到登录后更新 `ready`。Chrome 未发现、验证码/风控、检查异常统一返回 `unavailable`，但持久化 `lastFailureReason`。服务不得读取密码、验证码。

- [ ] **Step 4: 暴露引擎网页复核接口**

```ts
GET  /engines/:id/web-review-status
POST /engines/:id/web-review/refresh
POST /engines/:id/web-review/reset
DELETE /engines/:id/web-review-profile
```

删除 Profile 是二级危险接口，必须明确删除专属路径，不能接受客户端传入任意文件路径。

- [ ] **Step 5: 运行测试、构建并提交**

Run: `pnpm --dir server test -- local-chrome.service.spec.ts && pnpm --dir server build`

Expected: PASS。

```bash
git add server/package.json server/src/modules/execution-diagnosis/web-review.entity.ts server/src/modules/execution-diagnosis/local-chrome.service.ts server/src/modules/execution-diagnosis/local-chrome.service.spec.ts server/src/database/data-source.ts server/src/modules/execution-diagnosis/execution-diagnosis.module.ts server/src/modules/engines/engines.controller.ts server/src/modules/engines/engines.service.ts
git commit -m "feat: manage local chrome review profiles"
```

### Task 3: 冻结选样、网页证据与第六步执行

**Files:**
- Modify: `server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts`
- Modify: `server/src/modules/execution-diagnosis/execution-diagnosis.service.ts`
- Create: `server/src/modules/execution-diagnosis/web-review-selector.ts`
- Create: `server/src/modules/execution-diagnosis/web-review-selector.spec.ts`
- Create: `server/src/modules/execution-diagnosis/web-review-runner.service.ts`
- Create: `server/src/modules/execution-diagnosis/web-review-runner.service.spec.ts`
- Modify: `server/src/modules/execution-diagnosis/evidence-records.ts`
- Modify: `server/src/modules/execution-diagnosis/execution-diagnosis.service.spec.ts`
- Modify: `xdoc/execution-diagnosis-steps.md`

**Interfaces:**
- Produces `selectWebReviewSamples(samples, questions, seed, minimumRate = 0.3)`。
- 选中结果为 `{sampleId, reasons: Array<'core_capability'|'api_brand_mentioned'|'random_unmentioned'|'minimum_fill'>}`。
- 运行快照新增 `webReview: {rulesVersion, minimumRate, randomSeed, selected}`；诊断共 8 步。

- [ ] **Step 1: 写抽样优先级与冻结失败测试**

```ts
expect(selectWebReviewSamples(samples, questions, 'fixed-seed')).toEqual(expect.arrayContaining([
  expect.objectContaining({sampleId: coreSample.id, reasons: ['core_capability']}),
  expect.objectContaining({sampleId: mentionedSample.id, reasons: ['api_brand_mentioned']}),
]));
expect(result.length / samples.length).toBeGreaterThanOrEqual(0.3);
expect(selectWebReviewSamples(samples, questions, 'fixed-seed')).toEqual(result);
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --dir server test -- web-review-selector.spec.ts execution-diagnosis.service.spec.ts`

Expected: FAIL，现有运行只有七步且无网页复核选样。

- [ ] **Step 3: 实现确定性选样与复核记录**

先完成 API 第 5 步并持久化样本，再按“核心全部、品牌命中全部、其余未命中非核心随机 25%、不足 30% 补齐”选择。用确定性 PRNG 和快照中的随机种子，去重并合并 reasons。新增网页证据字段/实体保存 API 样本关联、回答文本、截图路径、状态、排除原因、开始和结束时间；不得更新 `ExecutionDiagnosisSampleEntity.answer`。

- [ ] **Step 4: 实现第六步与部分完成语义**

将运行初始化改为 8 步；第 6 步按引擎串行调用 `WebReviewRunnerService`。引擎状态非 `ready`、未登录、验证码、风控或网页异常只影响该引擎复核记录，步骤结论为 `partial`/`unmeasured`，不能把运行或 API 样本伪造为失败。第 7 步读取成功复核结果作为校正来源；更新中文步骤文档。

- [ ] **Step 5: 运行测试、模拟并提交**

Run: `pnpm --dir server test -- web-review-selector.spec.ts web-review-runner.service.spec.ts execution-diagnosis.service.spec.ts && pnpm --dir server build && pnpm --dir server run simulate:diagnosis`

Expected: PASS；模拟日志显示第 5 步 API 采样、第 6 步网页复核及排除原因。

```bash
git add server/src/modules/execution-diagnosis/execution-diagnosis.entity.ts server/src/modules/execution-diagnosis/execution-diagnosis.service.ts server/src/modules/execution-diagnosis/web-review-selector.ts server/src/modules/execution-diagnosis/web-review-selector.spec.ts server/src/modules/execution-diagnosis/web-review-runner.service.ts server/src/modules/execution-diagnosis/web-review-runner.service.spec.ts server/src/modules/execution-diagnosis/evidence-records.ts server/src/modules/execution-diagnosis/execution-diagnosis.service.spec.ts xdoc/execution-diagnosis-steps.md
git commit -m "feat: add playwright web review step"
```

### Task 4: 引擎管理操作与诊断报告口径

**Files:**
- Modify: `ui/src/components/workspace-page.tsx`
- Create: `ui/src/components/engines/web-review-status-cell.tsx`
- Modify: `ui/src/components/diagnosis/diagnosis-insights-page.tsx`
- Modify: `ui/src/messages/zh.json`
- Modify: `ui/src/messages/en.json`
- Modify: `server/src/modules/execution-diagnosis/diagnosis-insights.service.ts`
- Modify: `server/src/modules/execution-diagnosis/diagnosis-insights.service.spec.ts`
- Test: `ui/tests/optimization-verification.spec.ts`

**Interfaces:**
- 引擎列表响应包含 `webReview: {availability, lastCheckedAt, lastFailureReason, lastReadyAt}`。
- 诊断报告响应包含 `webReviewSummary: {apiTotal, minimumTarget, mandatoryCore, mandatoryMentioned, randomUnmentioned, minimumFill, succeeded, excludedByReason}`。

- [ ] **Step 1: 写 UI 失败测试**

```ts
await page.goto('/zh/system/engines');
await expect(page.getByRole('columnheader', {name: '网页复核可用状态'})).toBeVisible();
await expect(page.getByRole('button', {name: '刷新'})).toBeVisible();
await expect(page.getByRole('button', {name: '重置'})).toBeVisible();
await page.goto('/zh/diagnosis/diagnosis-report');
await expect(page.getByText('网页端真实用户环境复核')).toBeVisible();
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm --dir ui exec playwright test tests/optimization-verification.spec.ts`

Expected: FAIL，当前引擎表无复核状态和操作，报告无网页复核口径。

- [ ] **Step 3: 实现引擎三态与操作**

在表格“操作”列前增加网页复核状态；只显示不可用、待登录、已就绪。刷新和重置调用对应 API，按钮运行中禁用；不可用显示最近失败原因。重置前弹出说明“将关闭本应用启动的该引擎 Chrome 窗口；不会清除登录态”，清除网页登录数据放入二级确认操作。

- [ ] **Step 4: 实现报告校正口径和证据展示**

报告显示 API 采样、最低目标、强制/随机/补足来源、成功复核和排除原因。成功网页复核存在时，指标卡明确“以网页复核校正”；没有成功复核时显示“仅 API 参考，不作为校正结论”。在报告底部渲染固定说明：

```text
本次共采集 XX 条目标问句，全部通过官方 API 批量预扫描；其中 XX 条关键样本经过网页端真实用户环境复核，最终指标以复核样本校正得出；其余 API 扫描结果仅供参考。
```

- [ ] **Step 5: 运行测试、构建并提交**

Run: `pnpm --dir server test -- diagnosis-insights.service.spec.ts && pnpm --dir ui exec tsc --noEmit && pnpm --dir ui exec playwright test tests/optimization-verification.spec.ts && pnpm --dir ui build`

Expected: PASS。

```bash
git add ui/src/components/workspace-page.tsx ui/src/components/engines/web-review-status-cell.tsx ui/src/components/diagnosis/diagnosis-insights-page.tsx ui/src/messages/zh.json ui/src/messages/en.json server/src/modules/execution-diagnosis/diagnosis-insights.service.ts server/src/modules/execution-diagnosis/diagnosis-insights.service.spec.ts ui/tests/optimization-verification.spec.ts
git commit -m "feat: show web review status and evidence"
```

### Task 5: 全量验证与交付说明

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-playwright-web-review-design.md`
- Modify: `xdoc/execution-diagnosis-steps.md`

- [ ] **Step 1: 运行完整验证**

Run: `pnpm --dir server test && pnpm --dir server build && pnpm --dir ui exec tsc --noEmit && pnpm --dir ui exec playwright test && pnpm --dir ui build`

Expected: 所有检查通过。若本机无 Chrome，Chrome 集成测试必须使用模拟启动器，不能静默跳过选样、状态或安全关闭测试。

- [ ] **Step 2: 手工 Electron 验收**

1. 在客户电脑安装 Chrome 后打开引擎管理。
2. 点击“重置”，确认只关闭带当前 `launchId` 与专属 profile 的 Chrome。
3. 在官方站点手工登录，点击“刷新”后状态为已就绪。
4. 执行一次诊断，确认第 6 步出现、API 样本不变、网页证据独立保存。
5. 触发未登录或验证码场景，确认状态为待登录/不可用，报告显示排除原因而非失败结论。

- [ ] **Step 3: 更新实现状态并提交**

在设计文档追加“已实现能力”和“已知平台限制”，仅写已实际验证的内容。

```bash
git add docs/superpowers/specs/2026-08-17-playwright-web-review-design.md xdoc/execution-diagnosis-steps.md
git commit -m "docs: verify playwright web review delivery"
```
