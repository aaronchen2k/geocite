import { expect, test } from '@playwright/test';

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
