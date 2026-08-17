import { expect, test } from '@playwright/test';

test('engine management exposes web-review status and the diagnosis report does not claim correction without successful web review', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/engines?*', async (route) => {
    await route.fulfill({ json: { items: [{ id: 12, name: '示例引擎', code: 'example', vendor: 'Example', disabled: false, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z', webReview: { availability: 'pending_login', lastCheckedAt: null, lastFailureReason: null, lastReadyAt: null } }], total: 1 } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/diagnosis-insights/latest', async (route) => {
    await route.fulfill({ json: {
      run: { id: 7, createdAt: '2026-08-17T00:00:00.000Z', finishedAt: '2026-08-17T00:00:00.000Z' },
      metrics: { sampleCount: 10, questionCount: 4, brandMentionRate: 0.4, citedEngines: 1, successfulSampleRate: 1, reviewedSampleCount: 0, sourceCount: 0 },
      evidenceBasis: 'api-reference-only',
      questions: [], competitors: [], competitorMatrix: [], findings: [],
      report: { engines: [], groups: [], priorityActions: [], competitorDominatedCount: 0, absentCount: 0, normalCount: 0 },
      webReviewSummary: { apiTotal: 10, candidateTotal: 7, minimumTarget: 3, mandatoryCore: 1, mandatoryMentioned: 1, randomUnmentioned: 1, minimumFill: 0, succeeded: 0, excludedByReason: { 'pending-login': 1 } },
      samples: [],
    } });
  });

  await page.goto('/zh/admin/engines');
  await expect(page.getByRole('columnheader', { name: '网页复核可用状态' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重置' })).toBeVisible();

  await page.goto('/zh/diagnosis/diagnosis-report');
  await expect(page.getByRole('heading', { name: '网页端真实用户环境复核' })).toBeVisible();
  await expect(page.getByText('仅 API 参考，未经过网页复核校正，不输出校正结论')).toBeVisible();
  await expect(page.getByText('可复核候选')).toBeVisible();
  await expect(page.getByText('最终指标以复核样本校正得出')).toHaveCount(0);
});

test('shows the visibility-trend empty state when fewer than two completed runs exist', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/verification/trend', async (route) => {
    await route.fulfill({ json: { runs: [] } });
  });

  await page.goto('/zh/verification/visibility-trend');

  await expect(page.getByText('至少需要两次完成运行')).toBeVisible();
});

test('content production creates a planning work order without article generation or publishing controls', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/optimization-work-orders', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: { id: 17, title: 'Explain sustainability evidence', status: 'pending', sourceRunId: 42, sourceFindingId: null } });
  });

  await page.goto('/zh/improvement/content-production?source=diagnosis-report&sourceRunId=42');

  await expect(page.getByRole('heading', { name: '内容计划' })).toBeVisible();
  await expect(page.getByText('不自动生成或发布文章', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选题')).toBeVisible();
  await expect(page.getByLabel('关联事实或问题')).toBeVisible();
  await expect(page.getByLabel('审核计划')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建计划工单' })).toBeVisible();
  await expect(page.getByRole('button', { name: /生成文章|发布/ })).toHaveCount(0);

  await page.getByLabel('选题').fill('Explain sustainability evidence');
  await page.getByLabel('关联事实或问题').fill('Question gap: sustainability proof');
  await page.getByLabel('审核计划').fill('Brand and legal review before drafting');
  await page.getByRole('button', { name: '创建计划工单' }).click();

  await expect(page.getByText('计划工单 #17 已创建')).toBeVisible();
});

test('planning routes preserve their discovery context and funnel planning into work orders', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/optimization-work-orders', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto('/zh/improvement/keyword-matrix?source=competitor-comparison&sourceRunId=42');
  await expect(page.getByRole('heading', { name: '破局计划' })).toBeVisible();
  await expect(page.getByText('来源：竞品对比')).toBeVisible();
  await expect(page.getByText('诊断批次：#42')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建计划工单' })).toBeVisible();

  await page.goto('/zh/improvement/source-building');
  await expect(page.getByRole('heading', { name: '候选信源' })).toBeVisible();
  await expect(page.getByLabel('候选信源')).toBeVisible();
  await expect(page.getByLabel('工作状态')).toBeVisible();

  await page.goto('/zh/improvement/technical-adaptation?source=site-discovery');
  await expect(page.getByRole('heading', { name: '网站优化计划' })).toBeVisible();
  await expect(page.getByText('来源：站点发现')).toBeVisible();

  await page.goto('/zh/improvement/optimization-work-orders?source=diagnosis-report&sourceRunId=42');
  await expect(page.getByRole('heading', { name: '创建优化工单' })).toBeVisible();
  await expect(page.getByText('来源：诊断报告')).toBeVisible();
  await expect(page.getByText('发起复测')).toHaveCount(0);
});

test('work orders retain persisted actions and guide the valid retest workflow', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/optimization-work-orders', async (route) => {
    await route.fulfill({ json: [{ id: 17, title: '修复结构化数据', description: '补齐 Product JSON-LD', acceptanceCriteria: '通过校验', status: 'in_progress', sourceRunId: 42, sourceFindingId: 8, ownerName: null, dueAt: null, actions: [{ id: 19, brandId: 5, workOrderId: 17, description: '已发布并验证 JSON-LD', completedAt: '2026-08-16T12:00:00.000Z' }] }] });
  });

  await page.goto('/zh/improvement/optimization-work-orders');

  await expect(page.getByText('已发布并验证 JSON-LD')).toBeVisible();
  await expect(page.getByRole('button', { name: '发起复测' })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消工单' })).toBeVisible();
});

test('periodic retests use the fixed full configuration scope and require a manual trigger', async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.setItem('geocite.locale', 'zh'); window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })); });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/verification/periodic-retests', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.goto('/zh/verification/periodic-retest');

  await expect(page.getByRole('heading', { name: '周期复测' })).toBeVisible();
  await expect(page.getByText('复测始终覆盖当前品牌的全部已启用问题和诊断引擎，不会在后台自动执行；每次仍需人工明确发起。', { exact: true })).toBeVisible();
  await expect(page.getByText('复测范围：全部当前已启用的问题和诊断引擎（固定）。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('复测范围')).toHaveCount(0);
  await expect(page.getByLabel('通知方式')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建复测计划' })).toBeVisible();
});
