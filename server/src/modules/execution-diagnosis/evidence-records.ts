import type { EngineEntity } from '../engines/engine.entity';
import type { FetchedPage } from './site-diagnostic';

export function toPageEvidence(runId: number, page: FetchedPage) {
  return { runId, url: page.url, statusCode: page.status, contentType: page.contentType, body: page.html };
}

export function toProbeEvidence(runId: number, userAgent: string, url: string, statusCode: number | null) {
  return { runId, userAgent, url, statusCode };
}

export function toSampleEvidence(runId: number, engine: Pick<EngineEntity, 'id' | 'name' | 'code' | 'modelName' | 'baseUrl' | 'apiKey' | 'disabled'>, prompt: string, statusCode: number | null, answer: string, error: string | null = null) {
  return { runId, engineId: engine.id, engineName: engine.name, engineCode: engine.code, modelName: engine.modelName, baseUrl: engine.baseUrl, prompt, answer, statusCode, error };
}
