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

test('keeps business groups expanded and system management collapsed by default', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
  await page.goto('/zh/dashboard');

  await expect(page.getByRole('button', {name: '配置'})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', {name: /诊断室|诊断/})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', {name: '优化'})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', {name: '验证'})).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', {name: '系统管理'})).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', {name: '问题追踪'})).toBeVisible();
});

test('explains how each verification page is activated', async ({page}) => {
  await page.goto('/zh/verification/visibility-trend');

  await expect(page.getByText('根据历次完成的诊断，绘制品牌可见性及其变化趋势。')).toBeVisible();
  await expect(page.getByRole('heading', {name: '重新执行诊断后自动更新'})).toBeVisible();
  await expect(page.getByText('至少需要两次完成的诊断运行。')).toBeVisible();
  await expect(page.getByRole('heading', {name: '需要在页面单独操作'})).toBeVisible();
  await expect(page.getByText('本页仅用于选择周期和查看趋势，无需单独运行。')).toBeVisible();

  await page.goto('/zh/verification/attribution');
  await expect(page.getByText('对比优化动作前后的诊断结果，帮助判断哪些变化可能与已执行的优化有关。')).toBeVisible();
  await expect(page.getByText('重新诊断只能呈现前后相关变化，不能自动得出因果归因。')).toBeVisible();
  await expect(page.getByText('关联优化动作或工单，必要时补充人工归因说明。')).toBeVisible();

  await page.goto('/zh/verification/comparison-test');
  await expect(page.getByText('比较预先定义的对照组与实验组的诊断结果，验证某一优化策略是否更有效。')).toBeVisible();
  await expect(page.getByText('创建对照组和实验组，定义比较范围与成功指标，再分别运行。')).toBeVisible();
});

test('explains the target and concrete work of each improvement page', async ({page}) => {
  await page.goto('/zh/improvement/optimization-work-orders');
  await expect(page.getByRole('heading', {name: '针对什么'})).toBeVisible();
  await expect(page.getByText('针对诊断报告、问答汇总、竞品对比和站点体检中已确认的发现项。')).toBeVisible();
  await expect(page.getByRole('heading', {name: '具体优化'})).toBeVisible();
  await expect(page.getByText('将发现项拆分为负责人、截止时间和验收条件明确的优化工单。')).toBeVisible();

  await page.goto('/zh/improvement/technical-adaptation');
  await expect(page.getByText('针对影响 AI 抓取、访问、理解与引用网站内容的技术和页面问题。')).toBeVisible();
  await expect(page.getByText('修复 robots.txt、站点地图、结构化数据、页面可访问性和可引用段落。')).toBeVisible();

  await page.goto('/zh/improvement/content-production');
  await expect(page.getByText('围绕已审核的品牌事实和诊断发现的问题缺口，规划需要补充的内容。')).toBeVisible();
  await expect(page.getByText('当前仅管理内容选题、事实依据和审核计划；不自动生成或发布文章。')).toBeVisible();
});

test('keeps the sitemap crawl limit out of brand questions', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('geocite.locale', 'zh'));
  await page.goto('/zh/configuration/questions');

  await expect(page.getByText(/最多抓取URL数|Maximum sitemap\.xml URLs to crawl/)).toHaveCount(0);
});

test('groups fixed category weights by primary category in basic configuration', async ({ page }) => {
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
      questions: [{ id: 101, text: '已有诊断问题', group: '核心业务能力提问', primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认', market: 'cn', brandProbe: false }],
      prompt: '', sitemapUrlLimit: 10, samplingQuestionCount: 20,
      taxonomyVersion: 'v1', categoryWeights: [
        {primaryCategory: '品牌基础提问', secondaryCategory: '事实查询', weight: 20, example: '品牌产品是什么？'},
        {primaryCategory: '品牌基础提问', secondaryCategory: '品牌验证', weight: 8, example: '这个品牌可靠吗？'},
        {primaryCategory: '核心业务能力提问', secondaryCategory: '场景', weight: 15, example: '适合什么场景？'},
        {primaryCategory: '核心业务能力提问', secondaryCategory: '风险', weight: 12, example: '有哪些风险？'},
        {primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认', weight: 15, example: '是否满足需求？'},
        {primaryCategory: '竞品对比提问', secondaryCategory: '比较', weight: 12, example: '与竞品有什么区别？'},
        {primaryCategory: '竞品对比提问', secondaryCategory: '替代', weight: 10, example: '有什么替代方案？'},
        {primaryCategory: '竞品对比提问', secondaryCategory: '推荐', weight: 8, example: '值得推荐吗？'},
      ],
    };
    await route.fulfill({ json: configuration });
  });

  await page.goto('/zh/configuration/basic');
  await expect(page.getByRole('heading', { name: '基础配置' })).toBeVisible();
  await expect(page.getByText('固定分类权重')).toBeVisible();
  await expect(page.getByLabel('品牌基础提问比例')).toHaveCount(0);
  const taxonomyGroups = page.locator('[data-testid="fixed-category-weight-groups"]');
  await expect(taxonomyGroups.getByRole('heading')).toHaveText(['品牌基础提问', '核心业务能力提问', '竞品对比提问']);
  await expect(taxonomyGroups.getByText('事实查询', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('20%')).toBeVisible();
  await expect(taxonomyGroups.getByText('品牌产品是什么？')).toBeVisible();
  await expect(taxonomyGroups.getByText('品牌验证', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('8%', {exact: true})).toHaveCount(2);
  await expect(taxonomyGroups.getByText('核心业务能力提问 · 场景')).toHaveCount(0);
  await expect(taxonomyGroups.getByText('场景', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('风险', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('能力确认', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('竞品对比提问 · 比较')).toHaveCount(0);
  await expect(taxonomyGroups.getByText('比较', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('替代', {exact: true})).toBeVisible();
  await expect(taxonomyGroups.getByText('推荐', {exact: true})).toBeVisible();
});

test('defaults Playwright 网页复核 to enabled and saves its disabled value', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('geocite.locale', 'zh');
    window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 }));
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: '测试品牌', code: 'test-brand', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5', async (route) => {
    await route.fulfill({ json: { id: 5, name: '测试品牌', code: 'test-brand', website: null, industry: null, description: null } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/diagnosis-questions', async (route) => {
    const configuration = {
      questions: [], prompt: '', sitemapUrlLimit: 10, samplingQuestionCount: 20,
      categoryWeights: [{primaryCategory: '品牌基础提问', secondaryCategory: '事实查询', weight: 20, example: '品牌产品是什么？'}],
    };
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toMatchObject({ playwrightWebReviewEnabled: false });
    }
    await route.fulfill({ json: configuration });
  });

  await page.goto('/zh/configuration/basic');
  const webReviewSwitch = page.getByRole('switch', { name: '使用 Playwright 网页复核' });
  await expect(webReviewSwitch).toBeChecked();
  await expect(page.getByText('推荐开启：以网页端真实用户环境抽样校正 API 粗扫结果。关闭后本次仅保留 API 参考结果。')).toBeVisible();
  await webReviewSwitch.click();
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
      await route.fulfill({json: {questions: [{text: '适合哪些团队使用？', primaryCategory: '核心业务能力提问', secondaryCategory: '场景'}]}});
      return;
    }
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as {questions: Array<Record<string, unknown>>};
      expect(payload.questions[0]).not.toHaveProperty('id');
      await route.fulfill({json: {questions: [{id: 101, text: '适合哪些团队使用？', group: '核心业务能力提问', primaryCategory: '核心业务能力提问', secondaryCategory: '场景', market: 'cn', brandProbe: false}], prompt: '', categoryWeights: [{primaryCategory: '核心业务能力提问', secondaryCategory: '场景', weight: 15, example: '适合什么场景？'}]}});
      return;
    }
    await route.fulfill({ json: {questions: [], prompt: '', categoryWeights: [
      {primaryCategory: '品牌基础提问', secondaryCategory: '事实查询', weight: 20, example: '品牌产品是什么？'},
      {primaryCategory: '核心业务能力提问', secondaryCategory: '场景', weight: 15, example: '适合什么场景？'},
      {primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认', weight: 15, example: '是否满足需求？'},
    ]} });
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
  await expect(page.getByText('场景')).toBeVisible();
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
