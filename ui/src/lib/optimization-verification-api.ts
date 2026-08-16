import { requestJson } from '@/lib/api';

export type RunMetrics = { sampleCount: number; successfulSampleRate: number; visibilityRate: number };
export type TrendRun = { runId: number; status: 'succeeded' | 'partial'; createdAt: string; finishedAt: string | null; configuration: { market: string | null; questionCount: number; engineCount: number; samplingMethod: string; rulesVersion: string } | null; metrics: RunMetrics };
export type VisibilityTrend = { runs: TrendRun[] };
export type QuestionTracking = { runs: Array<{ runId: number; status: string; finishedAt: string | null }>; questions: Array<{ id: number; question: string; group: string; points: Array<{ runId: number; finishedAt: string | null } & RunMetrics> }> };
export type RunComparison = { id: number; baselineRunId: number; retestRunId: number; comparability: 'comparable' | 'partial' | 'incomparable'; reasons: string[]; metrics: { sharedQuestionIds: number[]; sharedEngineIds: number[]; baseline: RunMetrics; retest: RunMetrics; delta: Pick<RunMetrics, 'visibilityRate' | 'successfulSampleRate'> } | null };

export function getVisibilityTrend(brandId: number) { return requestJson<VisibilityTrend>(`brands/${brandId}/verification/trend`); }
export function getQuestionTracking(brandId: number) { return requestJson<QuestionTracking>(`brands/${brandId}/verification/questions`); }
export function compareDiagnosisRuns(brandId: number, baselineRunId: number, retestRunId: number) {
  return requestJson<RunComparison>(`brands/${brandId}/verification/comparisons`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baselineRunId, retestRunId }) });
}
