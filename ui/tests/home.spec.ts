import { expect, test } from '@playwright/test';

const reservedRoutes = [
  { path: '/zh/dashboard', title: '仪表盘' },
  { path: '/zh/diagnosis/diagnosis-execution', title: '诊断执行' },
  { path: '/zh/admin/brands', title: '品牌管理' },
  { path: '/zh/admin/engines', title: '目标引擎' },
  { path: '/zh/admin/models', title: '模型管理' },
  { path: '/zh/admin/rag-agents', title: 'RAG智能体' },
];

test('redirects the landing route to an available dashboard', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/zh\/dashboard$/);
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
});

test('serves the English dashboard through a locale route', async ({ page }) => {
  const response = await page.goto('/en/dashboard');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
});

test('switches the active locale from the workspace header', async ({ page }) => {
  await page.goto('/zh/dashboard');

  await page.getByRole('combobox', { name: '语言' }).selectOption('en');
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('hides only the AppShell vertical scrollbars', async ({ page }) => {
  await page.goto('/zh/dashboard');

  for (const locator of [page.locator('aside'), page.locator('main')]) {
    await expect(locator).toHaveClass(/scrollbar-hide/);
    await expect(locator).toHaveCSS('scrollbar-width', 'none');
  }
});

test('separates configuration from the diagnosis room', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
  await page.goto('/zh/dashboard');

  await expect(page.getByRole('button', { name: '配置' })).toBeVisible();
  await page.getByRole('link', { name: '基础配置' }).click();

  await expect(page).toHaveURL(/\/configuration\/basic$/);
  await expect(page.getByRole('heading', { name: /基础配置|Basic configuration/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /诊断室|Diagnosis room/ })).toBeVisible();
});

test('keeps the sitemap crawl limit out of brand questions', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
  await page.goto('/zh/configuration/questions');

  await expect(page.getByText(/最多抓取URL数|Maximum sitemap\.xml URLs to crawl/)).toHaveCount(0);
});

test('saves basic configuration without question record ids', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('geocite.locale', 'zh');
    window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 }));
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: '测试品牌', code: 'test-brand', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ json: { id: 5, name: '测试品牌', code: 'test-brand', website: null, industry: null, description: null } });
      return;
    }
    await route.fulfill({ json: { id: 5, name: '测试品牌', code: 'test-brand', website: null, industry: null, description: null } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/diagnosis-questions', async (route) => {
    const configuration = {
      questions: [{ id: 101, text: '已有诊断问题', group: '核心业务能力提问', market: 'cn', brandProbe: false }],
      prompt: '', sitemapUrlLimit: 10, samplingQuestionCount: 10,
      questionCategoryRatio: { brandBasic: 1, coreCapability: 2, competitorComparison: 1 },
    };
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toMatchObject({
        questions: [{ text: '已有诊断问题', group: '核心业务能力提问', market: 'cn', brandProbe: false }],
      });
      expect(route.request().postDataJSON().questions[0]).not.toHaveProperty('id');
    }
    await route.fulfill({ json: configuration });
  });

  await page.goto('/zh/configuration/basic');
  await expect(page.getByRole('heading', { name: '基础配置' })).toBeVisible();
  await page.getByRole('button', { name: '保存配置' }).click();

  await expect(page.getByText('配置已保存。')).toBeVisible();
});

test('opens AI question suggestions from the brand-question modal', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{id: 91, name: '测试品牌', code: 'test-brand', isDefault: true}] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/91/diagnosis-questions**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({json: {questions: [{text: '适合哪些团队使用？', group: '适用场景'}]}});
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as {questions: Array<Record<string, unknown>>};
      expect(payload.questions[0]).not.toHaveProperty('id');
      await route.fulfill({json: {questions: [{id: 101, text: '适合哪些团队使用？', group: '适用场景', market: 'cn', brandProbe: false}], prompt: ''}});
      return;
    }
    await route.fulfill({ json: {questions: [], prompt: ''} });
  });
  await page.goto('/zh/configuration/questions');

  await expect(page.getByRole('heading', {name: '问题分类'})).toBeVisible();
  await expect(page.getByRole('heading', {name: '问题列表'})).toBeVisible();
  await expect(page.getByLabel('补充提示词')).toHaveCount(0);
  await page.getByRole('button', {name: 'AI补充问题'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('补充提示词')).toBeVisible();
  await page.getByLabel('补充提示词').fill('补充真实用户问题');
  await page.getByRole('button', {name: '生成候选题'}).click();
  await expect(page.getByRole('link', {name: '全选'})).toBeVisible();
  await expect(page.getByLabel('适合哪些团队使用？')).toBeVisible();
  await page.getByLabel('适合哪些团队使用？').check();
  await page.getByRole('button', {name: '关闭'}).click();
  await page.getByRole('button', {name: '保存问题库'}).click();
  await expect(page.getByText('问题库已保存。')).toBeVisible();
});

for (const route of reservedRoutes) {
  test(`${route.path} displays its reserved page`, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
    const response = await page.goto(route.path);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: route.title })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '选择 Brand' })).toBeVisible();
    await expect(page.getByText('系统管理')).toBeVisible();
  });
}

test('opens a compact Brand editor dialog from the management toolbar', async ({ page }) => {
  await page.goto('/zh/admin/brands');

  const createButton = page.getByRole('button', { name: '新建 Brand' });
  await expect(createButton).toHaveCSS('height', '32px');
  await createButton.click();
  await expect(page.getByRole('dialog', { name: '新建 Brand' })).toBeVisible();
});

test('creates a non-disabled Brand in the modal and refreshes the active list', async ({ page }) => {
  let items: Array<{ id: number; name: string; code: string; disabled: boolean }> = [];
  await page.route('http://127.0.0.1:8001/api/v1/brands**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 20 } });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { name: string; code: string; disabled: boolean };
      expect(payload.disabled).toBe(false);
      items = [{ id: 1, ...payload }];
      await route.fulfill({ status: 201, json: items[0] });
      return;
    }
    await route.fallback();
  });

  await page.goto('/zh/admin/brands');
  await page.getByRole('button', { name: '新建 Brand' }).click();
  await page.getByLabel('名称').fill('测试 Brand');
  await page.getByLabel('编码').fill('e2e-brand');
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('cell', { name: '测试 Brand', exact: true })).toBeVisible();
});
