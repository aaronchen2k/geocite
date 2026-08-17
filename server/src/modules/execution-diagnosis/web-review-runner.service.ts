import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocalChromeService } from './local-chrome.service';
import { ExecutionDiagnosisWebReviewEntity } from './execution-diagnosis.entity';
import type { WebReviewSelection } from './web-review-selector';
import { toWebReviewEvidence } from './evidence-records';

export type WebReviewRunnableSample = { id: number; runId: number; engineId: number; engineName: string; engineCode: string; question: string | null; prompt: string };
export type BrowserReviewResult = { answer: string; screenshotPath: string | null; brandMentioned: boolean };
export type BrowserReviewer = { review(sample: WebReviewRunnableSample): Promise<BrowserReviewResult> };
export type WebReviewRunResult = { status: 'succeeded' | 'excluded'; answer: string | null; brandMentioned: boolean | null; exclusionReason: string | null; terminalForEngine: boolean };

@Injectable()
export class WebReviewRunnerService {
  constructor(
    private readonly chrome: Pick<LocalChromeService, 'getStatus'>,
    @InjectRepository(ExecutionDiagnosisWebReviewEntity) private readonly reviews: Repository<ExecutionDiagnosisWebReviewEntity>,
    @Optional() private readonly browser?: BrowserReviewer,
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
    } catch {
      return this.exclude(sample, selected, 'web-review-page-error', startedAt);
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
