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
      const citations = await this.collectCitations(page, config);
      return { answer, citations, adapter: 'configured-web' };
    } catch (error) {
      if (error instanceof EngineWebSearchError) throw error;
      throw new EngineWebSearchError('web-search-answer-timeout');
    }
  }

  private async collectCitations(page: EngineSearchPage, config: EngineWebSearchRequest['config']) {
    const citationSelector = config.citationSelector ?? `${config.answerSelector} a[href]`;
    const sourceTriggerText = config.sourceTriggerText?.trim();
    if (sourceTriggerText) {
      const existingUrls = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((anchor) => (anchor as HTMLAnchorElement).href));
      const clicked = await page.evaluate((text) => {
        const trigger = Array.from(document.querySelectorAll('button, a, [role="button"]')).find((element) => element.textContent?.includes(text));
        if (!(trigger instanceof HTMLElement)) return false;
        trigger.click();
        return true;
      }, sourceTriggerText);
      if (clicked) {
        try {
          await page.waitForFunction((before) => Array.from(document.querySelectorAll('a[href]')).some((anchor) => !before.includes((anchor as HTMLAnchorElement).href)), existingUrls, { timeout: 5_000 });
        } catch {
          // 面板可能只包含按钮或已渲染链接；继续读取页面上的公开链接。
        }
        const expanded = await page.evaluate((before) => Array.from(document.querySelectorAll('a[href]'))
          .map((anchor) => ({
            title: anchor.textContent?.trim() || null,
            url: (anchor as HTMLAnchorElement).href,
            excerpt: anchor.getAttribute('title')?.trim() || null,
          }))
          .filter((citation) => /^https?:\/\//i.test(citation.url) && !before.includes(citation.url)), existingUrls);
        if (expanded.length) return this.normalizeCitations(expanded);
      }
    }
    const citations = await page.locator(citationSelector).evaluateAll((anchors) => anchors
      .map((anchor) => ({
        title: anchor.textContent?.trim() || null,
        url: anchor.href,
        excerpt: anchor.getAttribute('title')?.trim() || null,
      })));
    return this.normalizeCitations(citations);
  }

  private normalizeCitations(citations: Array<{ title: string | null; url: string; excerpt: string | null }>) {
    return citations
      .filter((citation) => /^https?:\/\//i.test(citation.url))
      .filter((citation, index, all) => all.findIndex((item) => item.url === citation.url) === index)
      .slice(0, 20);
  }
}
