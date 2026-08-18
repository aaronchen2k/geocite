import type { EngineWebReviewConfig } from '../../engines/engine.entity';

export type EngineSearchCitation = { title: string | null; url: string; excerpt: string | null };
export type EngineSearchIdentity = { code: string; vendor: string };
export type EngineSearchPage = {
  goto(url: string, options?: object): Promise<unknown>;
  url(): string;
  waitForSelector(selector: string, options?: object): Promise<unknown>;
  locator(selector: string): {
    fill(value: string): Promise<void>;
    press(key: string): Promise<void>;
    click(): Promise<void>;
    last(): { innerText(options?: object): Promise<string> };
    evaluateAll<T>(pageFunction: (nodes: Array<{ href: string; textContent: string | null; getAttribute(name: string): string | null }>) => T): Promise<T>;
  };
};

export type EngineWebSearchRequest = { prompt: string; config: EngineWebReviewConfig };
export type EngineWebSearchResult = { answer: string; citations: EngineSearchCitation[]; adapter: string };

export class EngineWebSearchError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** 单一引擎的网页搜索适配器；新引擎在独立文件实现并注册到主服务。 */
export interface EngineWebSearchAdapter {
  supports(engine: EngineSearchIdentity): boolean;
  search(page: EngineSearchPage, request: EngineWebSearchRequest): Promise<EngineWebSearchResult>;
}
