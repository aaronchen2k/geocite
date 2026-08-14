import type { EngineEntity } from '../engines/engine.entity';
import { completionTokenLimit, temperatureSetting } from './model-request';

type SamplingEngine = Pick<EngineEntity, 'id' | 'name' | 'code' | 'vendor' | 'modelName' | 'baseUrl' | 'apiKey' | 'webSearchEnabled' | 'disabled'>;
type SamplingOptions = { nativeWebSearch: boolean; signal?: AbortSignal };
type OpenAiResponse = { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };

export type EngineSamplingResult = {
  adapter: string;
  nativeWebSearch: boolean;
  statusCode: number;
  answer: string;
  error: string | null;
};

/** 将供应商特有协议封装在这里，执行器只依赖统一的 sample 接口。 */
export class EngineSamplingClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async sample(engine: SamplingEngine, prompt: string, options: SamplingOptions): Promise<EngineSamplingResult> {
    if (/qwen/i.test(engine.code) || /alibaba|阿里/i.test(engine.vendor)) return this.requestQwen(engine, prompt, options);
    if (engine.code === 'kimi') return this.requestKimi(engine, prompt, options);
    if (engine.code === 'doubao') return this.requestDoubao(engine, prompt, options);
    if (engine.code === 'deepseek') return this.requestDeepSeek(engine, prompt, options);
    if (engine.code === 'chatgpt') return this.requestChatGpt(engine, prompt, options);
    if (engine.code === 'yuanbao') return this.requestYuanbao(engine, prompt, options);
    if (engine.code === 'wenxin-yiyan' || engine.code === 'wenxiaoyan') return this.requestWenxin(engine, prompt, options);
    return this.requestOpenAiCompatible(engine, prompt, options, 'openai-compatible');
  }

  private requestQwen(engine: SamplingEngine, prompt: string, options: SamplingOptions) {
    return this.requestOpenAiCompatible(engine, prompt, options, 'qwen', options.nativeWebSearch ? { enable_search: true } : {});
  }

  // 以下供应商均保留独立入口；在确认其正式 API 的联网参数前，不把普通模型调用标为“已联网”。
  private requestKimi(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'kimi'); }
  private requestDoubao(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'doubao'); }
  private requestDeepSeek(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'deepseek'); }
  private requestChatGpt(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'chatgpt'); }
  private requestYuanbao(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'yuanbao'); }
  private requestWenxin(engine: SamplingEngine, prompt: string, options: SamplingOptions) { return this.requestOpenAiCompatible(engine, prompt, options, 'wenxin'); }

  private async requestOpenAiCompatible(engine: SamplingEngine, prompt: string, options: SamplingOptions, adapter: string, extraBody: Record<string, unknown> = {}): Promise<EngineSamplingResult> {
    if (!engine.baseUrl || !engine.modelName || !engine.apiKey) throw new Error('engine-config-incomplete');
    const usesNativeWebSearch = adapter === 'qwen' && options.nativeWebSearch;
    const timeout = AbortSignal.timeout(45_000);
    const response = await this.fetcher(`${engine.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${engine.apiKey}` },
      body: JSON.stringify({
        model: engine.modelName,
        messages: [{ role: 'user', content: prompt }],
        ...temperatureSetting({ provider: engine.vendor, modelName: engine.modelName }, 0.2),
        ...completionTokenLimit({ provider: engine.vendor, modelName: engine.modelName }, 400),
        ...extraBody,
      }),
    });
    const body = await response.json().catch(() => ({})) as OpenAiResponse;
    const answer = body.choices?.[0]?.message?.content ?? '';
    return {
      adapter,
      nativeWebSearch: usesNativeWebSearch,
      statusCode: response.status,
      answer,
      error: response.ok ? null : body.error?.message ?? 'engine-request-failed',
    };
  }
}
