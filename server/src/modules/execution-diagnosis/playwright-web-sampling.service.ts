import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { EngineSearchCitation } from './engine-search/engine-web-search-adapter';

const SUPPORTED_CRAWLER_ENGINES = new Set(['deepseek', 'doubao', 'qwen']);

export type WebSamplingRequest = { question: string; prompt: string; brandName: string };
export type WebSamplingResult = { question: string; answer: string; citations: EngineSearchCitation[]; adapter: string | null; error: string | null };
type SamplingEngine = { id: number; code: string; name: string };
type CrawlerRunResult = { question: string; response: string; citations?: Array<{ title?: string; href?: string }> };

/** 仅用于单元测试替换子进程；生产环境始终直接执行 .mts crawler。 */
export type CrawlerSamplingDependencies = {
  dshCommand?: (engineCode: string, prompts: string[]) => Promise<CrawlerRunResult[]>;
};

@Injectable()
export class PlaywrightWebSamplingService {
  private readonly logger = new Logger(PlaywrightWebSamplingService.name);

  constructor(private readonly dependencies: CrawlerSamplingDependencies = {}) {}

  /** 同一引擎的一批查询交给对应 crawler，在 crawler 内复用同一个受控浏览器会话。 */
  async searchBatch(engine: SamplingEngine, requests: WebSamplingRequest[]): Promise<WebSamplingResult[]> {
    if (!SUPPORTED_CRAWLER_ENGINES.has(engine.code)) {
      return requests.map((request) => this.failed(request, 'crawler-engine-not-supported'));
    }

    try {
      const prompts = requests.map((request) => request.prompt);
      const results = await (this.dependencies.dshCommand?.(engine.code, prompts) ?? this.runDshCommand(engine.code, prompts));
      return requests.map((request, index) => this.toSamplingResult(engine.code, request, results[index]));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'crawler-execution-failed';
      this.logger.error(`${engine.code} crawler 采样失败：${message}`);
      return requests.map((request) => this.failed(request, 'crawler-execution-failed'));
    }
  }

  /**
   * 让 dsh 在对应引擎目录执行 crawler；任务明确要求失败后自行诊断、修复并重试。
   * 无论 dsh 的过程日志如何，诊断系统只以结果目录内 q-XX/result.json 为准。
   */
  private async runDshCommand(engineCode: string, prompts: string[]): Promise<CrawlerRunResult[]> {
    const crawlerDirectory = path.resolve(process.cwd(), 'src', 'scripts', 'crawl', engineCode);
    const runDirectory = this.runDirectoryName();
    const command = `node crawl.mts ${this.shellArgument(JSON.stringify(prompts))} ${this.shellArgument(runDirectory)}`

    const task = [
      `在当前目录执行以下采样命令：${command}`,
      '若命令报错，请诊断并修复 crawler 或运行环境后重试。',
      prompts.length > 1
          ? `采样成功后确认结果写入 results/${runDirectory}/q-01/result.json 等（每个问题一个 q-NN 子目录），并最后报告执行结果。`
          : `采样成功后确认结果写入 results/${runDirectory}/result.json，并最后报告执行结果。`,
    ].join('\n');

    this.logger.log(`${engineCode} dsh 采样开始，结果目录=${runDirectory}`);
    const output = await this.runDsh(task, crawlerDirectory);
    if (output.stdout.trim()) this.logger.log(`${engineCode} dsh 输出：${output.stdout.trim().slice(-2_000)}`);
    if (output.stderr.trim()) this.logger.warn(`${engineCode} dsh 错误输出：${output.stderr.trim().slice(-2_000)}`);
    return this.readCommandResults(path.join(crawlerDirectory, 'results', runDirectory), prompts.length);
  }

  private runDsh(task: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('dsh', ['--profile', 'headless', task], {
        cwd,
        env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? path.join(process.env.HOME ?? '', '.dsh') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`dsh 采样任务退出码=${code ?? 'unknown'}：${(stderr || stdout).slice(-2_000)}`));
      });
    });
  }

  private runDirectoryName() {
    const now = new Date();
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    return `run-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`;
  }

  private shellArgument(value: string) {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private async readCommandResults(runDirectory: string, expectedCount: number): Promise<CrawlerRunResult[]> {
    const items = await Promise.all(Array.from({ length: expectedCount }, async (_, index) => {
      const resultFile = path.join(runDirectory, `q-${String(index + 1).padStart(2, '0')}`, 'result.json');
      const content = await fs.readFile(resultFile, 'utf8');
      return JSON.parse(content) as CrawlerRunResult;
    }));
    return items;
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
