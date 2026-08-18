import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EngineEntity, type EngineWebReviewConfig } from '../engines/engine.entity';
import { LocalChromeService } from './local-chrome.service';
import { ConfiguredEngineWebSearchAdapter } from './engine-search/configured-engine-web-search.adapter';
import { EngineWebSearchError, type EngineSearchCitation, type EngineWebSearchAdapter, type EngineSearchIdentity } from './engine-search/engine-web-search-adapter';

export type WebSamplingRequest = { question: string; prompt: string; brandName: string };
export type WebSamplingResult = { question: string; answer: string; citations: EngineSearchCitation[]; adapter: string | null; error: string | null };
type SamplingEngine = Pick<EngineEntity, 'id' | 'code' | 'name' | 'vendor' | 'homepage' | 'baseUrl'>;
type SamplingChrome = Pick<LocalChromeService, 'prepareForAutomatedSampling' | 'useReadyProfile'>;
export type WebSamplingDependencies = { random: () => number; delay: (milliseconds: number) => Promise<void> };
export const WEB_SAMPLING_DEPENDENCIES = Symbol('WEB_SAMPLING_DEPENDENCIES');

const defaultDependencies: WebSamplingDependencies = {
  random: Math.random,
  delay: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

@Injectable()
export class PlaywrightWebSamplingService {
  private readonly logger = new Logger(PlaywrightWebSamplingService.name);
  private readonly dependencies: WebSamplingDependencies;
  // 专用引擎适配器由“生成执行搜索代码”技能添加在兜底适配器之前。
  private readonly adapters: EngineWebSearchAdapter[] = [new ConfiguredEngineWebSearchAdapter()];

  constructor(
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @Inject(LocalChromeService) private readonly chrome: SamplingChrome,
    @Optional() @Inject(WEB_SAMPLING_DEPENDENCIES) dependencies?: Partial<WebSamplingDependencies>,
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  /** 同一引擎的一批查询共用一次受控浏览器会话，并在连续查询间低频执行。 */
  async searchBatch(engine: SamplingEngine, requests: WebSamplingRequest[]): Promise<WebSamplingResult[]> {
    const configuredEngine = await this.engines.findOne({ where: { id: engine.id, deleted: false } });
    const config = configuredEngine && this.configFor(configuredEngine);
    if (!configuredEngine || !config) return requests.map((request) => this.failed(request, 'web-search-engine-config-excluded'));
    const availability = await this.chrome.prepareForAutomatedSampling(configuredEngine);
    if (availability !== 'ready') return requests.map((request) => this.failed(request, availability === 'pending_login' ? 'engine-pending-login' : 'engine-unavailable'));
    const adapter = this.adapters.find((item) => item.supports(configuredEngine as EngineSearchIdentity));
    if (!adapter) return requests.map((request) => this.failed(request, 'web-search-adapter-unavailable'));
    const results: WebSamplingResult[] = [];
    for (const [index, request] of requests.entries()) {
      if (index > 0) await this.waitRandomInterval(configuredEngine.code);
      try {
        const result = await this.chrome.useReadyProfile(configuredEngine, (page) => adapter.search(page as never, { prompt: request.prompt, config }));
        results.push({ question: request.question, answer: result.answer, citations: result.citations, adapter: this.adapterName(configuredEngine, result.adapter), error: null });
      } catch (error) {
        const code = error instanceof EngineWebSearchError ? error.code : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'web-search-page-error';
        results.push(this.failed(request, code));
      }
    }
    return results;
  }

  private configFor(engine: Pick<EngineEntity, 'code' | 'vendor' | 'webReviewConfig'>) {
    return engine.webReviewConfig && this.validConfig(engine.webReviewConfig) ? engine.webReviewConfig : null;
  }

  private validConfig(config: EngineWebReviewConfig) { return [config.chatUrl, config.inputSelector, config.answerSelector].every((item) => typeof item === 'string' && item.trim() !== ''); }
  private adapterName(engine: SamplingEngine, name: string) { return name === 'configured-web' ? `${engine.code}-web` : name; }
  private failed(request: WebSamplingRequest, error: string): WebSamplingResult { return { question: request.question, answer: '', citations: [], adapter: null, error }; }
  private async waitRandomInterval(engineCode: string) {
    const milliseconds = 2_000 + Math.floor(this.dependencies.random() * 3_001);
    this.logger.log(`${engineCode} 网页采样等待 ${milliseconds}ms 后继续，避免连续请求触发风控`);
    await this.dependencies.delay(milliseconds);
  }
}
