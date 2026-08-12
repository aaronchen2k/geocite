import { expect, test } from '@playwright/test';

const reservedRoutes = [
  { path: '/zh/dashboard', title: '仪表盘' },
  { path: '/zh/admin/brands', title: '品牌管理' },
  { path: '/zh/admin/engines', title: '目标引擎 Engine' },
  { path: '/zh/admin/models', title: '模型管理 Model' },
  { path: '/zh/admin/rag-agents', title: 'RAG 智能体' },
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

for (const route of reservedRoutes) {
  test(`${route.path} displays its reserved page`, async ({ page }) => {
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

test('creates a Brand in the modal and refreshes the active list', async ({ page }) => {
  let items: Array<{ id: number; name: string; code: string; enabled: boolean }> = [];
  await page.route('http://127.0.0.1:8001/api/v1/brands**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 20 } });
      return;
    }
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { name: string; code: string; enabled: boolean };
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
