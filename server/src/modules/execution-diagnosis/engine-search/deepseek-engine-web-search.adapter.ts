import { ConfiguredEngineWebSearchAdapter } from './configured-engine-web-search.adapter';
import type { EngineSearchIdentity, EngineSearchPage, EngineWebSearchAdapter, EngineWebSearchRequest, EngineWebSearchResult } from './engine-web-search-adapter';

/** DeepSeek 的输入、回答和引用 selector 由数据库配置提供。 */
export class DeepSeekEngineWebSearchAdapter implements EngineWebSearchAdapter {
  private readonly configured = new ConfiguredEngineWebSearchAdapter();
  supports(engine: EngineSearchIdentity) { return /deepseek/iu.test(`${engine.code} ${engine.vendor}`); }
  async search(page: EngineSearchPage, request: EngineWebSearchRequest): Promise<EngineWebSearchResult> {
    return { ...(await this.configured.search(page, request)), adapter: 'deepseek-web' };
  }
}
