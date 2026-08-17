import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalChromeService } from './local-chrome.service';
import { ExecutionDiagnosisWebReviewEntity } from './execution-diagnosis.entity';
import type { WebReviewSelection } from './web-review-selector';
import { toWebReviewEvidence } from './evidence-records';
import { EngineEntity, type EngineWebReviewConfig } from '../engines/engine.entity';

export type WebReviewRunnableSample = { id: number; runId: number; engineId: number; engineName: string; engineCode: string; question: string | null; prompt: string; brandName: string };
export type BrowserReviewResult = { answer: string; screenshotPath: string | null; brandMentioned: boolean };
export type BrowserReviewer = { review(sample: WebReviewRunnableSample): Promise<BrowserReviewResult> };
export type WebReviewRunResult = { status: 'succeeded' | 'excluded'; answer: string | null; brandMentioned: boolean | null; exclusionReason: string | null; terminalForEngine: boolean };

type BrowserLocator = { fill(value: string): Promise<void>; press(key: string): Promise<void>; click(): Promise<void>; innerText(options?: object): Promise<string>; last(): BrowserLocator; count(): Promise<number> };
type BrowserPage = { goto(url: string, options?: object): Promise<unknown>; url(): string; locator(selector: string): BrowserLocator; waitForSelector(selector: string, options?: object): Promise<unknown> };

export class BrowserReviewExcludedError extends Error {
  constructor(readonly code: string) { super(code); }
}
export const BROWSER_REVIEWER = Symbol('BROWSER_REVIEWER');

const defaultWebReviewConfigs: Record<string, EngineWebReviewConfig> = {
  chatgpt: { chatUrl: 'https://chatgpt.com/', inputSelector: 'textarea#prompt-textarea', answerSelector: '[data-message-author-role="assistant"]' },
  claude: { chatUrl: 'https://claude.ai/new', inputSelector: '[contenteditable="true"]', answerSelector: '[data-is-streaming="false"]' },
  gemini: { chatUrl: 'https://gemini.google.com/', inputSelector: 'rich-textarea [contenteditable="true"]', answerSelector: 'message-content' },
  deepseek: { chatUrl: 'https://chat.deepseek.com/', inputSelector: 'textarea', answerSelector: '.ds-markdown' },
  qwen: { chatUrl: 'https://tongyi.aliyun.com/qianwen/', inputSelector: 'textarea', answerSelector: '.markdown' },
};

/** Real browser adapter. It uses the engine's editable selectors and never invents an answer. */
@Injectable()
export class PlaywrightBrowserReviewer implements BrowserReviewer {
  constructor(
    @InjectRepository(EngineEntity) private readonly engines: Repository<EngineEntity>,
    @Inject(LocalChromeService) private readonly chrome: Pick<LocalChromeService, 'useReadyProfile'>,
  ) {}

  async review(sample: WebReviewRunnableSample): Promise<BrowserReviewResult> {
    const engine = await this.engines.findOne({ where: { id: sample.engineId, deleted: false } });
    const config = engine && this.configFor(engine);
    if (!config) throw new BrowserReviewExcludedError('web-review-engine-config-excluded');
    return this.chrome.useReadyProfile(engine, async (rawPage) => {
      const page = rawPage as BrowserPage;
      await page.goto(config.chatUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      this.assertSafePage(page);
      try {
        await page.waitForSelector(config.inputSelector, { state: 'visible', timeout: 15_000 });
      } catch {
        throw new BrowserReviewExcludedError('web-review-input-unavailable');
      }
      const input = page.locator(config.inputSelector);
      await input.fill(sample.prompt);
      if (config.submitSelector) await page.locator(config.submitSelector).last().click();
      else await input.press('Enter');
      try {
        await page.waitForSelector(config.answerSelector, { state: 'visible', timeout: 60_000 });
        const answer = (await page.locator(config.answerSelector).last().innerText({ timeout: 15_000 })).trim();
        if (!answer) throw new BrowserReviewExcludedError('web-review-empty-answer');
        return { answer, screenshotPath: null, brandMentioned: this.mentions(answer, sample.brandName) };
      } catch (error) {
        if (error instanceof BrowserReviewExcludedError) throw error;
        throw new BrowserReviewExcludedError('web-review-answer-timeout');
      }
    });
  }

  private configFor(engine: Pick<EngineEntity, 'code' | 'vendor' | 'webReviewConfig'>) {
    if (engine.webReviewConfig) return this.validConfig(engine.webReviewConfig) ? engine.webReviewConfig : null;
    const identity = `${engine.code} ${engine.vendor}`.toLowerCase();
    return Object.entries(defaultWebReviewConfigs).find(([key]) => identity.includes(key))?.[1] ?? null;
  }

  private assertSafePage(page: BrowserPage) {
    const url = page.url();
    if (/(captcha|verify|challenge|risk)/i.test(url)) throw new BrowserReviewExcludedError('engine-challenge-or-risk-control');
    if (/(login|signin|sign-in|auth)/i.test(url)) throw new BrowserReviewExcludedError('engine-pending-login');
  }

  private validConfig(config: EngineWebReviewConfig) { return [config.chatUrl, config.inputSelector, config.answerSelector].every((value) => typeof value === 'string' && value.trim() !== ''); }
  private mentions(answer: string, name: string) { return name.trim() !== '' && answer.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()); }
}

@Injectable()
export class WebReviewRunnerService {
  constructor(
    @Inject(LocalChromeService) private readonly chrome: Pick<LocalChromeService, 'getStatus'>,
    @InjectRepository(ExecutionDiagnosisWebReviewEntity) private readonly reviews: Repository<ExecutionDiagnosisWebReviewEntity>,
    @Optional() @Inject(BROWSER_REVIEWER) private readonly browser?: BrowserReviewer,
  ) {}

  async run(sample: WebReviewRunnableSample, selected: WebReviewSelection): Promise<WebReviewRunResult> {
    const startedAt = new Date();
    const status = await this.chrome.getStatus(sample.engineId);
    if (status.availability !== 'ready') return this.exclude(sample, selected, status.availability === 'pending_login' ? 'engine-pending-login' : this.unavailableReason(status.failureCode));
    try {
      if (!this.browser) return this.exclude(sample, selected, 'web-review-browser-not-configured');
      const result = await this.browser.review(sample);
      const finishedAt = new Date();
      await this.reviews.save(this.reviews.create(toWebReviewEvidence(sample, selected, { status: 'succeeded', answer: result.answer, brandMentioned: result.brandMentioned, screenshotPath: result.screenshotPath, startedAt, finishedAt })));
      return { status: 'succeeded', answer: result.answer, brandMentioned: result.brandMentioned, exclusionReason: null, terminalForEngine: false };
    } catch (error) {
      const exclusionReason = error instanceof BrowserReviewExcludedError
        ? error.code
        : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'web-review-page-error';
      return this.exclude(sample, selected, exclusionReason, startedAt);
    }
  }

  async exclude(sample: WebReviewRunnableSample, selected: WebReviewSelection, exclusionReason: string, startedAt = new Date(), terminalForEngine = true): Promise<WebReviewRunResult> {
    const finishedAt = new Date();
    await this.reviews.save(this.reviews.create(toWebReviewEvidence(sample, selected, { status: 'excluded', exclusionReason, startedAt, finishedAt })));
    return { status: 'excluded', answer: null, brandMentioned: null, exclusionReason, terminalForEngine };
  }

  private unavailableReason(failureCode?: string | null) {
    if (failureCode === 'challenge_detected') return 'engine-challenge-or-risk-control';
    return 'engine-unavailable';
  }
}
