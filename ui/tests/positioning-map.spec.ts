import { expect, test } from '@playwright/test';

const insight = {
  run: { id: 7, createdAt: '2026-08-17T08:00:00.000Z', finishedAt: '2026-08-17T08:10:00.000Z' },
  metrics: { sampleCount: 3, questionCount: 3, brandMentionRate: 0.3, citedEngines: 1, successfulSampleRate: 1, reviewedSampleCount: 0, sourceCount: 0 },
  questions: [
    { question: '什么场景适合当前品牌？', group: '旧分组', primaryCategory: '核心业务能力提问', secondaryCategory: '场景', sampleCount: 1, mentionRate: 0, diagnosis: 'competitor-dominated', leadingCompetitor: '领先竞品', leadingCompetitorRate: 1 },
    { question: '当前品牌能满足核心需求吗？', group: '旧分组', primaryCategory: '核心业务能力提问', secondaryCategory: '能力确认', sampleCount: 1, mentionRate: 0.5, diagnosis: 'normal', leadingCompetitor: null, leadingCompetitorRate: 0 },
    { question: '当前品牌提供什么服务？', group: '旧分组', primaryCategory: '品牌基础提问', secondaryCategory: '事实查询', sampleCount: 1, mentionRate: 0.3, diagnosis: 'normal', leadingCompetitor: '竞品乙', leadingCompetitorRate: 0.4 },
  ],
  competitors: [], competitorMatrix: [], report: { engines: [], groups: [], priorityActions: [], competitorDominatedCount: 1, absentCount: 0, normalCount: 2 }, findings: [], samples: [],
};

test('expands the positioning map from primary taxonomy to question-level competitor results', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('geocite.locale', 'zh');
    window.localStorage.setItem('geocite.workspace', JSON.stringify({ state: { currentBrandId: 5 }, version: 0 }));
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands', async (route) => {
    await route.fulfill({ json: { items: [{ id: 5, name: '当前品牌', code: 'current-brand', isDefault: true }] } });
  });
  await page.route('http://127.0.0.1:8101/api/v1/brands/5/diagnosis-insights/latest', async (route) => {
    await route.fulfill({ json: insight });
  });

  await page.goto('/zh/diagnosis/positioning-map');

  const primary = page.getByRole('button', { name: '核心业务能力提问', exact: true });
  await expect(primary).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '品牌基础提问', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('什么场景适合当前品牌？', { exact: true })).toHaveCount(0);

  await primary.click();
  const secondary = page.getByRole('button', { name: '场景', exact: true });
  await expect(secondary).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: '能力确认', exact: true })).toHaveAttribute('aria-expanded', 'false');

  await secondary.click();
  await expect(page.getByText('什么场景适合当前品牌？', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '领先竞品', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '领先竞品提及率', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '当前品牌提及率', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '领先竞品', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '100%', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '0%', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '能力确认', exact: true }).click();
  const noCompetitorRow = page.getByRole('row', { name: /当前品牌能满足核心需求吗？/ });
  await expect(noCompetitorRow).toBeVisible();
  await expect(noCompetitorRow).toContainText('无领先竞品');
  await expect(noCompetitorRow).toContainText('—');
  await expect(noCompetitorRow.getByRole('cell', { name: '领先竞品', exact: true })).toHaveCount(0);
  await expect(noCompetitorRow.getByRole('cell', { name: '竞品乙', exact: true })).toHaveCount(0);
});
