import fs from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { EngineSearchCitation } from './engine-search/engine-web-search-adapter';
import { CodexCrawlerRunner } from './codex-crawler-runner';

const SUPPORTED_CRAWLER_ENGINES = new Set(['deepseek', 'doubao', 'qwen']);

export type WebSamplingRequest = { question: string; prompt: string; brandName: string };
export type WebSamplingResult = { question: string; answer: string; citations: EngineSearchCitation[]; adapter: string | null; error: string | null };
export type WebSamplingBatchResult = { isSuccess: boolean; errors: string[]; itemArray: WebSamplingResult[] };
type SamplingEngine = { id: number; code: string; name: string };
type CrawlerRunResult = { question: string; response: string; citations?: Array<{ title?: string; href?: string }> };
type CrawlerCommandResults = { isSuccess: boolean; errors: string[]; itemArray: Array<CrawlerRunResult | undefined> };

export type WebSamplingOptions = { runName?: string; signal?: AbortSignal; onLog?: (message: string) => void; onDebugLog?: (message: string) => void };

/** 仅用于单元测试替换 Codex runner 和结果目录定位。 */
export type CrawlerSamplingDependencies = {
  runner?: Pick<CodexCrawlerRunner, 'run'>;
};
export const CRAWLER_SAMPLING_DEPENDENCIES = Symbol('CRAWLER_SAMPLING_DEPENDENCIES');

@Injectable()
export class PlaywrightWebSamplingService {
  private readonly logger = new Logger(PlaywrightWebSamplingService.name);
  private readonly dependencies: CrawlerSamplingDependencies;

  constructor(@Optional() @Inject(CRAWLER_SAMPLING_DEPENDENCIES) dependencies?: CrawlerSamplingDependencies) {
    this.dependencies = dependencies ?? {};
  }

  /** 同一引擎的一批查询交给对应 crawler，在 crawler 内复用同一个受控浏览器会话。 */
  async searchBatch(engine: SamplingEngine, requests: WebSamplingRequest[], options: WebSamplingOptions = {}): Promise<WebSamplingBatchResult> {
    if (!SUPPORTED_CRAWLER_ENGINES.has(engine.code)) {
      const error = 'crawler-engine-not-supported';
      return { isSuccess: false, errors: [error], itemArray: requests.map((request) => this.failed(request, error)) };
    }

    try {
      const crawlerDirectory = path.resolve(process.cwd(), 'src', 'scripts', 'crawl', engine.code);
      const runner = this.dependencies.runner ?? new CodexCrawlerRunner();
      const runName = options.runName ?? 'sampling-debug';
      options.onLog?.(`${engine.code} Codex crawler 采样开始`);
      await runner.run({ crawlerDirectory, questions: requests.map((request) => request.prompt), runName, signal: options.signal, onLog: options.onLog ?? (() => undefined), onDebugLog: options.onDebugLog ?? (() => undefined) });

      const resultDirectory = path.resolve(crawlerDirectory, '../../../..', 'data', 'playwright-exec', runName, engine.code);

      const commandResults = await this.readCommandResults(resultDirectory, requests.length);
      return {
        isSuccess: commandResults.isSuccess,
        errors: commandResults.errors,
        itemArray: requests.map((request, index) => this.toSamplingResult(engine.code, request, commandResults.itemArray[index])),
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'crawler-execution-failed';
      this.logger.error(`${engine.code} crawler 采样失败：${message}`);
      const reason = `crawler-execution-failed: ${message}`;
      return { isSuccess: false, errors: [reason], itemArray: requests.map((request) => this.failed(request, reason)) };
    }
  }

  /**
   * 读取 crawler 采样结果。单问题读根 result.json，多问题读 q-01…q-NN/result.json。
   * 缺失/解析失败的位置保留 undefined（不压缩数组），保证结果与 requests 按下标一一对应，
   * 由 toSamplingResult 精确报 crawler-result-missing。
   */
  private async readCommandResults(runDirectory: string, expectedCount: number): Promise<CrawlerCommandResults> {
    const readResult = async (file: string): Promise<CrawlerRunResult | undefined> => {
      try {
        const content = await fs.readFile(file, 'utf8');
        return JSON.parse(content) as CrawlerRunResult;
      } catch {
        return undefined;
      }
    };

    const itemArray = expectedCount <= 1
      ? [await readResult(path.join(runDirectory, 'result.json'))]
      : await Promise.all(Array.from({ length: expectedCount }, async (_, index) => {
        const resultFile = path.join(runDirectory, `q-${String(index + 1).padStart(2, '0')}`, 'result.json');
        return readResult(resultFile);
      }));
    const errors = await this.readCommandErrors(runDirectory);
    if (itemArray.some((item) => !item) && !errors.includes('crawler-result-missing')) errors.push('crawler-result-missing');
    return { isSuccess: errors.length === 0 && itemArray.every(Boolean), errors, itemArray };
  }

  private async readCommandErrors(runDirectory: string): Promise<string[]> {
    try {
      const content = await fs.readFile(path.join(path.dirname(runDirectory), 'errors.json'), 'utf8');
      const parsed = JSON.parse(content) as { errors?: Array<{ engine?: unknown; message?: unknown }> };
      const engine = path.basename(runDirectory);
      return (parsed.errors ?? [])
        .filter((item) => item.engine === engine && typeof item.message === 'string')
        .map((item) => item.message as string);
    } catch {
      return [];
    }
  }

  private toSamplingResult(engineCode: string, request: WebSamplingRequest, result: CrawlerRunResult | undefined): WebSamplingResult {
    if (!result) return this.failed(request, 'crawler-result-missing');
    return {
      question: request.question,
      answer: result.response ?? '',
      citations: (result.citations ?? [])
        .filter((citation) => Boolean(citation.href))
        .map((citation) => ({ title: citation.title?.trim() || null, url: citation.href!, excerpt: null })),
      adapter: `${engineCode}-crawler`,
      error: null,
    };
  }

  private failed(request: WebSamplingRequest, error: string): WebSamplingResult {
    return { question: request.question, answer: '', citations: [], adapter: null, error };
  }
}
