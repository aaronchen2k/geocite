import { ConfiguredEngineWebSearchAdapter } from './configured-engine-web-search.adapter';
import type { EngineSearchIdentity, EngineSearchPage, EngineWebSearchAdapter, EngineWebSearchRequest, EngineWebSearchResult } from './engine-web-search-adapter';

/** 千问页面的来源面板由数据库配置驱动，避免将 URL 或 DOM selector 固化在代码中。 */
export class QwenEngineWebSearchAdapter implements EngineWebSearchAdapter {
  private readonly configured = new ConfiguredEngineWebSearchAdapter();

  supports(engine: EngineSearchIdentity) { return /qwen|alibaba|阿里/iu.test(`${engine.code} ${engine.vendor}`); }

  async search(page: EngineSearchPage, request: EngineWebSearchRequest): Promise<EngineWebSearchResult> {
    const result = await this.configured.search(page, request);
    return { ...result, adapter: 'qwen-web' };
  }
}
