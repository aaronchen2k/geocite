import { chromium } from 'playwright-core';

type Citation = { url: string; title: string | null; snippet: string | null };

async function searchDeepSeekOverCdp(cdpUrl: string, query: string): Promise<{ answer: string; citations: Citation[] }> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('未找到 CDP 浏览器上下文');
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto('https://chat.deepseek.com/', { waitUntil: 'domcontentloaded' });

    const input = page.locator('textarea').last();
    await input.fill(`请联网搜索，回答务必输出网页引用来源以及原文链接。\n${query}`);
    await input.press('Enter');
    await page.waitForTimeout(6_000);

    const sourceTrigger = page.getByText(/已阅读\s*\d+\s*个网页/).last();
    await sourceTrigger.waitFor({ state: 'visible', timeout: 60_000 });
    const answer = (await page.locator('.ds-markdown').last().innerText()).trim();
    await sourceTrigger.click();
    const citations = await page.locator('a:has(.search-view-card__title)').evaluateAll((anchors) => anchors
      .map((anchor) => ({
        url: (anchor as HTMLAnchorElement).href,
        title: anchor.querySelector('.search-view-card__title')?.textContent?.trim() || null,
        snippet: anchor.querySelector('.search-view-card__snippet')?.textContent?.trim() || null,
      }))
      .filter((citation) => /^https?:\/\//i.test(citation.url))
      .filter((citation, index, all) => all.findIndex((item) => item.url === citation.url) === index));
    return { answer, citations };
  } finally {
    await browser.close();
  }
}

describe('DeepSeek CDP 搜索', () => {
  const cdpUrl = process.env.GEOCITE_CDP_URL ?? 'http://127.0.0.1:9222';

  if (!cdpUrl) {
    it.skip('需要设置 GEOCITE_CDP_URL 后连接手动启动的 Chrome', () => undefined);
    return;
  }

  it('发送联网问题并获取最新答案及公开引用', async () => {
    const { answer, citations } = await searchDeepSeekOverCdp(cdpUrl!, '哪里有好的毕业论文生成工具，请简要说明并提供来源。');

    console.log('====== 回答内容开始');
    console.log(answer);
    console.log('====== 回答内容结束');

    expect(answer).not.toBe('');
    expect(citations.length).toBeGreaterThan(0);

    console.log('====== 引用文章开始');
    console.log(citations);
    console.log('====== 引用文章结束');

  }, 90_000);
});
