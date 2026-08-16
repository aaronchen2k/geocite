'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { compareDiagnosisRuns, getQuestionTracking, getVisibilityTrend, type QuestionTracking, type RunComparison, type VisibilityTrend } from '@/lib/optimization-verification-api';
import { useWorkspaceStore } from '@/stores/workspace-store';

type Variant = 'trend' | 'questions' | 'comparison';
const percent = (value: number) => `${Math.round(value * 100)}%`;
const reasonLabels: Record<string, string> = { brand: '品牌', market: '市场', question_set: '问题集', engine_set: '引擎集合', sampling_method: '采样方式', rules_version: '规则版本', not_completed: '运行未完成', missing_snapshot: '缺少冻结快照' };

export function VerificationPages({ variant }: { variant: Variant }): React.JSX.Element {
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const [trend, setTrend] = useState<VisibilityTrend | null>();
  const [questions, setQuestions] = useState<QuestionTracking | null>();
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!brandId) { setTrend(null); setQuestions(null); return; }
    setError('');
    try {
      if (variant === 'questions') setQuestions(await getQuestionTracking(brandId));
      else setTrend(await getVisibilityTrend(brandId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '加载验证数据失败'); variant === 'questions' ? setQuestions(null) : setTrend(null); }
  }, [brandId, variant]);
  useEffect(() => { void load(); }, [load]);

  const title = variant === 'trend' ? '可见性趋势' : variant === 'questions' ? '问题追踪' : '运行比较';
  const description = variant === 'trend' ? '按完成批次观察品牌在真实模型采样中的可见性变化。' : variant === 'questions' ? '按冻结的问题集追踪每次完成运行中的品牌可见性。' : '仅在冻结配置可比或部分可比时汇总共同的问题和引擎。';
  return <section className="pb-8"><header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{title}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></header>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
    {!brandId ? <Empty message="请先在顶部选择 Brand。" />
      : variant === 'trend' ? (trend === undefined ? <Loading /> : <Trend trend={trend ?? { runs: [] }} />)
        : variant === 'questions' ? (questions === undefined ? <Loading /> : <Questions tracking={questions ?? { runs: [], questions: [] }} />)
          : (trend === undefined ? <Loading /> : <Comparison runs={(trend ?? { runs: [] }).runs} brandId={brandId} />)}
  </section>;
}

function Loading() { return <p className="text-sm text-[var(--muted-foreground)]">正在加载验证数据…</p>; }
function Empty({ message }: { message: string }) { return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center text-sm text-[var(--muted-foreground)]">{message}</div>; }

function Trend({ trend }: { trend: VisibilityTrend }) {
  if (trend.runs.length < 2) return <Empty message="至少需要两次完成运行" />;
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[var(--muted)]"><tr><th className="px-3 py-3">运行</th><th className="px-3 py-3">完成时间</th><th className="px-3 py-3">可见性</th><th className="px-3 py-3">有效样本</th><th className="px-3 py-3">快照</th></tr></thead><tbody>{trend.runs.map((run) => <tr key={run.runId} className="border-t border-[var(--border)]"><td className="px-3 py-3 font-medium">#{run.runId}</td><td className="px-3 py-3">{run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}</td><td className="px-3 py-3">{percent(run.metrics.visibilityRate)}</td><td className="px-3 py-3">{percent(run.metrics.successfulSampleRate)} · {run.metrics.sampleCount} 条</td><td className="px-3 py-3 text-xs text-[var(--muted-foreground)]">{run.configuration ? `${run.configuration.market ?? '未设市场'} · ${run.configuration.questionCount} 题 · ${run.configuration.engineCount} 引擎 · ${run.configuration.rulesVersion}` : '缺少冻结快照'}</td></tr>)}</tbody></table></div>;
}

function Questions({ tracking }: { tracking: QuestionTracking }) {
  if (!tracking.runs.length) return <Empty message="尚无完成运行可供问题追踪" />;
  return <div className="space-y-3">{tracking.questions.map((question) => <article key={question.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2 className="font-medium">{question.question}</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">{question.group}</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{question.points.map((point) => <div key={point.runId} className="rounded-md bg-[var(--muted)] p-3 text-sm"><strong>#{point.runId}</strong><p className="mt-1">可见性 {percent(point.visibilityRate)}</p><p className="text-xs text-[var(--muted-foreground)]">{point.sampleCount} 条样本 · 有效 {percent(point.successfulSampleRate)}</p></div>)}</div></article>)}{!tracking.questions.length && <Empty message="完成运行没有可追踪的冻结问题。" />}</div>;
}

function Comparison({ runs, brandId }: { runs: VisibilityTrend['runs']; brandId: number }) {
  const [baselineRunId, setBaselineRunId] = useState<number | null>(runs[0]?.runId ?? null);
  const [retestRunId, setRetestRunId] = useState<number | null>(runs[1]?.runId ?? null);
  const [result, setResult] = useState<RunComparison | null>(null);
  const [error, setError] = useState('');
  const compare = async () => { if (!baselineRunId || !retestRunId || baselineRunId === retestRunId) { setError('请选择两个不同的完成运行。'); return; } setError(''); try { setResult(await compareDiagnosisRuns(brandId, baselineRunId, retestRunId)); } catch (reason) { setError(reason instanceof Error ? reason.message : '创建比较失败'); } };
  if (runs.length < 2) return <Empty message="至少需要两次完成运行才能比较" />;
  return <div className="space-y-5"><section className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><label className="grid gap-1 text-sm">基准运行<select aria-label="基准运行" className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2" value={baselineRunId ?? ''} onChange={(event) => setBaselineRunId(Number(event.target.value))}>{runs.map((run) => <option key={run.runId} value={run.runId}>#{run.runId}</option>)}</select></label><label className="grid gap-1 text-sm">复测运行<select aria-label="复测运行" className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-2" value={retestRunId ?? ''} onChange={(event) => setRetestRunId(Number(event.target.value))}>{runs.map((run) => <option key={run.runId} value={run.runId}>#{run.runId}</option>)}</select></label><Button onClick={() => void compare()}>比较运行</Button></section>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{result && <ComparisonResult result={result} />}</div>;
}

function ComparisonResult({ result }: { result: RunComparison }) {
  if (result.comparability === 'incomparable') return <section className="rounded-lg border border-amber-500/50 bg-[var(--card)] p-4"><h2 className="font-semibold">运行不可比较</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">配置差异：{result.reasons.map((reason) => reasonLabels[reason] ?? reason).join('、') || '未知'}。未提供结论。</p></section>;
  const partial = result.comparability === 'partial';
  return <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><h2 className="font-semibold">{partial ? '部分可比较' : '运行可比较'}</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">{partial ? `差异：${result.reasons.map((reason) => reasonLabels[reason] ?? reason).join('、')}；仅汇总共享的问题和引擎。` : '冻结配置一致，已汇总全部问题和引擎。'}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-[var(--muted-foreground)]">可见性变化</dt><dd className="mt-1 font-medium">{percent(result.metrics?.delta.visibilityRate ?? 0)}</dd></div><div><dt className="text-[var(--muted-foreground)]">有效样本变化</dt><dd className="mt-1 font-medium">{percent(result.metrics?.delta.successfulSampleRate ?? 0)}</dd></div><div><dt className="text-[var(--muted-foreground)]">共享范围</dt><dd className="mt-1 font-medium">{result.metrics?.sharedQuestionIds.length ?? 0} 题 · {result.metrics?.sharedEngineIds.length ?? 0} 引擎</dd></div></dl></section>;
}
