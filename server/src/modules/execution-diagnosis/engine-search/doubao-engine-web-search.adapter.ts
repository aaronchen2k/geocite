import { EngineWebSearchError, type EngineSearchCitation, type EngineSearchIdentity, type EngineSearchPage, type EngineWebSearchAdapter, type EngineWebSearchRequest, type EngineWebSearchResult } from './engine-web-search-adapter';

/** 豆包的最新回答由消息操作栏锚定；URL 与 selector 均由引擎配置提供。 */
export class DoubaoEngineWebSearchAdapter implements EngineWebSearchAdapter {
  supports(engine: EngineSearchIdentity) { return /doubao|bytedance|字节/iu.test(`${engine.code} ${engine.vendor}`); }

  async search(page: EngineSearchPage, request: EngineWebSearchRequest): Promise<EngineWebSearchResult> {
    const { config, prompt } = request;
    if (!config?.chatUrl || !config.inputSelector || !config.answerSelector) throw new EngineWebSearchError('web-search-config-missing');
    try {
      if (!page.url().startsWith(config.chatUrl)) await page.goto(config.chatUrl, { waitUntil: 'domcontentloaded' });
      const input = page.locator(config.inputSelector).last();
      await input.fill(prompt);
      if (config.submitSelector) await page.locator(config.submitSelector).last().click();
      else await input.press('Enter');
      await page.waitForSelector(config.answerSelector, { state: 'visible', timeout: 60_000 });
      const answer = (await page.locator(config.answerSelector).last().evaluate((actionBar) => actionBar.parentElement?.innerText?.trim() ?? '')).trim();
      if (!answer) throw new EngineWebSearchError('web-search-empty-answer');
      const citations = await this.collectCitations(page, config.citationSelector, config.sourceTriggerText);
      return { answer, citations, adapter: 'doubao-web' };
    } catch (error) {
      if (error instanceof EngineWebSearchError) throw error;
      throw new EngineWebSearchError('web-search-answer-timeout');
    }
  }

  private async collectCitations(page: EngineSearchPage, citationSelector?: string | null, sourceTriggerText?: string | null): Promise<EngineSearchCitation[]> {
    if (sourceTriggerText) await page.evaluate((text) => {
      const trigger = Array.from(document.querySelectorAll('button, a, [role="button"]')).find((element) => element.textContent?.includes(text));
      if (trigger instanceof HTMLElement) trigger.click();
    }, sourceTriggerText);
    if (!citationSelector) return [];
    const citations = await page.locator(citationSelector).evaluateAll((anchors) => anchors.map((anchor) => ({ title: anchor.textContent?.trim() || null, url: anchor.href, excerpt: anchor.getAttribute('title')?.trim() || null })));
    return citations.filter((citation) => /^https?:\/\//i.test(citation.url)).filter((citation, index, all) => all.findIndex((item) => item.url === citation.url) === index).slice(0, 20);
  }
}
