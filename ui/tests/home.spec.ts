import { expect, test } from '@playwright/test';

const reservedRoutes = [
  { path: '/dashboard', title: '仪表盘' },
  { path: '/admin/brands', title: '品牌管理' },
  { path: '/admin/engines', title: '引擎管理' },
  { path: '/admin/models', title: '模型管理' },
  { path: '/admin/rag-agents', title: 'RAG 智能体管理' },
];

test('redirects the landing route to an available dashboard', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
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
