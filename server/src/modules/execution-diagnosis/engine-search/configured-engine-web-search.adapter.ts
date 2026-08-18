import type { EngineWebSearchAdapter, EngineSearchPage, EngineWebSearchRequest, EngineWebSearchResult } from './engine-web-search-adapter';
import { EngineWebSearchError } from './engine-web-search-adapter';

/** 兜底适配器：使用已配置的输入、回答和引用选择器，专用引擎适配器应排在它之前。 */
export class ConfiguredEngineWebSearchAdapter implements EngineWebSearchAdapter {
  supports() { return true; }

  async search(page: EngineSearchPage, request: EngineWebSearchRequest): Promise<EngineWebSearchResult> {
    const { config, prompt } = request;
    await page.goto(config.chatUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (/(captcha|verify|challenge|risk)/i.test(page.url())) throw new EngineWebSearchError('engine-challenge-or-risk-control');
    if (/(login|signin|sign-in|auth)/i.test(page.url())) throw new EngineWebSearchError('engine-pending-login');
    try {
      await page.waitForSelector(config.inputSelector, { state: 'visible', timeout: 15_000 });
    } catch {
      throw new EngineWebSearchError('web-search-input-unavailable');
    }
    const input = page.locator(config.inputSelector);
    await input.fill(prompt);
    if (config.submitSelector) await page.locator(config.submitSelector).click();
    else await input.press('Enter');
    try {
      await page.waitForSelector(config.answerSelector, { state: 'visible', timeout: 60_000 });
      const answer = (await page.locator(config.answerSelector).last().innerText({ timeout: 15_000 })).trim();
      if (!answer) throw new EngineWebSearchError('web-search-empty-answer');
      const citations = await page.locator(config.citationSelector ?? `${config.answerSelector} a[href]`).evaluateAll((anchors) => anchors
        .map((anchor) => ({
          title: anchor.textContent?.trim() || null,
          url: anchor.href,
          excerpt: anchor.getAttribute('title')?.trim() || null,
        }))
        .filter((citation) => /^https?:\/\//i.test(citation.url))
        .filter((citation, index, all) => all.findIndex((item) => item.url === citation.url) === index)
        .slice(0, 20));
      return { answer, citations, adapter: 'configured-web' };
    } catch (error) {
      if (error instanceof EngineWebSearchError) throw error;
      throw new EngineWebSearchError('web-search-answer-timeout');
    }
  }
}
