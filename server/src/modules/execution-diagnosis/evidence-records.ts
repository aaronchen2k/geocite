import type { EngineEntity } from '../engines/engine.entity';
import type { FetchedPage } from './site-diagnostic';
import type { WebReviewSelection } from './web-review-selector';

export function toPageEvidence(runId: number, page: FetchedPage) {
  return { runId, url: page.url, statusCode: page.status, contentType: page.contentType, body: page.html };
}

export function toProbeEvidence(runId: number, userAgent: string, url: string, statusCode: number | null) {
  return { runId, userAgent, url, statusCode };
}

export function toSampleEvidence(runId: number, engine: Pick<EngineEntity, 'id' | 'name' | 'code' | 'modelName' | 'baseUrl' | 'apiKey' | 'disabled'>, question: string, prompt: string, statusCode: number | null, answer: string, error: string | null = null, metadata: { adapter?: string; nativeWebSearch?: boolean } = {}) {
  return { runId, engineId: engine.id, engineName: engine.name, engineCode: engine.code, modelName: engine.modelName, baseUrl: engine.baseUrl, question, prompt, answer, statusCode, error, adapter: metadata.adapter ?? null, nativeWebSearch: metadata.nativeWebSearch ?? false };
}

export function toWebReviewEvidence(sample: { id: number; runId: number; engineId: number; question: string | null }, selected: WebReviewSelection, record: { status: 'succeeded' | 'excluded'; answer?: string | null; brandMentioned?: boolean | null; screenshotPath?: string | null; exclusionReason?: string | null; startedAt: Date; finishedAt: Date }) {
  return {
    runId: sample.runId, apiSampleId: sample.id, engineId: sample.engineId, question: sample.question ?? '', selectionReasons: [...selected.reasons],
    answer: record.answer ?? null, brandMentioned: record.brandMentioned ?? null, screenshotPath: record.screenshotPath ?? null,
    status: record.status, exclusionReason: record.exclusionReason ?? null, startedAt: record.startedAt, finishedAt: record.finishedAt,
  };
}
