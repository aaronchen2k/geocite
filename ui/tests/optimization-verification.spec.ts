import { expect, test } from '@playwright/test';

test('shows the visibility-trend empty state when fewer than two completed runs exist', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 })));
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: 'Acme', code: 'acme', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/verification/trend', async (route) => {
    await route.fulfill({ json: { runs: [] } });
  });

  await page.goto('/zh/verification/visibility-trend');

  await expect(page.getByText('至少需要两次完成运行')).toBeVisible();
});
