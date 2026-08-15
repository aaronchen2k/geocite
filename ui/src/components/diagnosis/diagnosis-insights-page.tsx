'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {useWorkspaceStore} from '@/stores/workspace-store';
import {requestJson} from '@/lib/api';
import {Link} from '@/i18n/navigation';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';

type Question = {question: string; sampleCount: number; mentionRate: number; diagnosis: string; leadingCompetitor: string | null; leadingCompetitorRate: number};
type Sample = {id: number; engineName: string; question: string | null; answer: string; error: string | null; sampledAt: string; brandMention: boolean; reviewedBrandMention: boolean | null; reviewNote: string | null; sources: string[]};
type MatrixRow = {name: string; overallRate: number; byEngine: Array<{engineName: string; sampleCount: number; rate: number}>; lostQuestions: Array<{question: string; rate: number; brandMentionRate: number}>};
type Insight = {run: {id: number; createdAt: string; finishedAt: string | null}; metrics: {sampleCount: number; questionCount: number; brandMentionRate: number; citedEngines: number}; questions: Question[]; competitors: Array<{name: string; count: number; sampleCount: number; rate: number}>; competitorMatrix: MatrixRow[]; samples: Sample[]};
type Variant = 'report' | 'summary' | 'competitors' | 'samples' | 'map';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const diagnosisLabel: Record<string, string> = {'competitor-dominated': '竞品主导', absent: '完全缺席', normal: '表现正常', unmeasured: '未测'};

export function DiagnosisInsightsPage({variant}: {variant: Variant}): React.JSX.Element {
  const brandId = useWorkspaceStore((state) => state.currentBrandId);
  const [insight, setInsight] = useState<Insight | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!brandId) { setInsight(null); return; }
    setError('');
    try { setInsight(await requestJson<Insight | null>(`brands/${brandId}/diagnosis-insights/latest`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '加载诊断结果失败'); setInsight(null); }
  }, [brandId]);
  useEffect(() => { setInsight(undefined); void load(); }, [load]);

  const title = {report: '诊断报告', summary: '问题总结', competitors: '竞品对比', samples: '样本库', map: '阵地地图'}[variant];
  const description = {report: '汇总当前品牌最近一次诊断的真实采样结果。', summary: '按品牌问题定位缺席和竞品主导的优先处理项。', competitors: '从问题与模型两个维度找出竞品占优的具体场景。', samples: '浏览原始 AI 回答，必要时人工复核品牌提及。', map: '基于问题表现和竞品出现率识别值得争取的主题阵地。'}[variant];
  const priorityQuestions = useMemo(() => insight?.questions.filter((item) => item.diagnosis !== 'normal') ?? [], [insight]);

  return <section className="pb-8">
    <header className="mb-6 border-b border-[var(--border)] pb-4"><h1 className="mb-2 text-[22px] font-semibold">{title}</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">{description}</p></header>
    {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
    {insight === undefined ? <p className="text-sm text-[var(--muted-foreground)]">正在加载诊断结果…</p>
      : !brandId ? <p className="text-sm text-[var(--muted-foreground)]">请先在顶部选择 Brand。</p>
        : !insight ? <EmptyState />
          : <><p className="mb-4 text-xs text-[var(--muted-foreground)]">诊断批次 #{insight.run.id} · {new Date(insight.run.createdAt).toLocaleString()}</p>
            {variant === 'report' && <Report insight={insight} />}
            {variant === 'summary' && <QuestionTable items={priorityQuestions} priority />}
            {variant === 'competitors' && <CompetitorComparison insight={insight} />}
            {variant === 'samples' && <SampleList samples={insight.samples} brandId={brandId} onReviewed={load} />}
            {variant === 'map' && <PositioningMap questions={insight.questions} />}
          </>}
  </section>;
}

function EmptyState() { return <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center"><h2 className="font-semibold">尚无已完成的诊断结果</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">完成一次诊断后，这里将只展示可追溯的真实结果。</p><Button asChild className="mt-5"><Link href="/diagnosis/diagnosis-execution">发起诊断</Link></Button></div>; }

function Report({insight}: {insight: Insight}) { return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['样本数', insight.metrics.sampleCount], ['问题数', insight.metrics.questionCount], ['品牌提及率', percent(insight.metrics.brandMentionRate)], ['采样引擎', insight.metrics.citedEngines]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-sm text-[var(--muted-foreground)]">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</div><QuestionTable items={insight.questions} className="mt-5" /></>; }

function CompetitorComparison({insight}: {insight: Insight}) {
  const engines = [...new Set(insight.competitorMatrix.flatMap((row) => row.byEngine.map((item) => item.engineName)))];
  return <div className="space-y-5">
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[var(--muted)]"><tr><th className="px-3 py-3">竞品</th><th className="px-3 py-3">总体出现率</th>{engines.map((engine) => <th key={engine} className="px-3 py-3">{engine}</th>)}</tr></thead><tbody>{insight.competitorMatrix.map((row) => <tr key={row.name} className="border-t border-[var(--border)]"><td className="px-3 py-3 font-medium">{row.name}</td><td className="px-3 py-3">{percent(row.overallRate)}</td>{engines.map((engine) => { const item = row.byEngine.find((cell) => cell.engineName === engine); return <td key={engine} className="px-3 py-3">{item ? <>{percent(item.rate)} <span className="text-xs text-[var(--muted-foreground)]">({item.sampleCount})</span></> : '—'}</td>; })}</tr>)}{!insight.competitorMatrix.length && <tr><td colSpan={Math.max(2, engines.length + 2)} className="px-3 py-10 text-center text-[var(--muted-foreground)]">暂无启用的竞品配置。</td></tr>}</tbody></table></div>
    {insight.competitorMatrix.some((row) => row.lostQuestions.length) && <section><h2 className="mb-3 font-semibold">竞品占优的问题</h2><div className="grid gap-3 lg:grid-cols-2">{insight.competitorMatrix.flatMap((row) => row.lostQuestions.map((item) => <article key={`${row.name}-${item.question}`} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><p className="text-sm font-medium">{item.question}</p><p className="mt-3 text-sm"><span className="text-[var(--muted-foreground)]">{row.name} </span>{percent(item.rate)} <span className="ml-3 text-[var(--muted-foreground)]">当前品牌 </span>{percent(item.brandMentionRate)}</p></article>))}</div></section>}
  </div>;
}

function SampleList({samples, brandId, onReviewed}: {samples: Sample[]; brandId: number; onReviewed: () => Promise<void>}) { return <div className="space-y-3">{samples.map((sample) => <SampleCard key={sample.id} sample={sample} brandId={brandId} onReviewed={onReviewed} />)}{!samples.length && <p className="text-sm text-[var(--muted-foreground)]">该批次没有样本。</p>}</div>; }

function SampleCard({sample, brandId, onReviewed}: {sample: Sample; brandId: number; onReviewed: () => Promise<void>}) {
  const [mention, setMention] = useState(sample.brandMention);
  const [note, setNote] = useState(sample.reviewNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => { setSaving(true); setError(''); try { await requestJson(`brands/${brandId}/diagnosis-insights/samples/${sample.id}/review`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({brandMention: mention, note})}); await onReviewed(); } catch (reason) { setError(reason instanceof Error ? reason.message : '保存复核失败'); } finally { setSaving(false); } };
  return <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{sample.engineName}</strong><span className="text-[var(--muted-foreground)]">{new Date(sample.sampledAt).toLocaleString()}</span></div><p className="mt-3 text-sm font-medium">{sample.question ?? '未关联问题'}</p><div className="mt-2 max-h-72 overflow-y-auto rounded-md bg-[var(--muted)] p-3 text-sm leading-6 text-[var(--muted-foreground)]"><p className="whitespace-pre-wrap">{sample.error ? `采样失败：${sample.error}` : sample.answer || '无回答内容'}</p></div>{sample.sources.length > 0 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">引用来源：{sample.sources.join(' · ')}</p>}<div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3"><label className="flex items-center gap-2 text-sm"><Switch aria-label="品牌被提及" checked={mention} onCheckedChange={setMention} /><span>品牌被提及</span></label><input aria-label="复核备注" className="h-8 min-w-48 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm" placeholder="复核备注（可选）" value={note} onChange={(event) => setNote(event.target.value)} /><Button size="sm" variant="outline" onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : sample.reviewedBrandMention === null ? '确认复核' : '更新复核'}</Button></div>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</article>;
}

function PositioningMap({questions}: {questions: Question[]}) { return <div className="grid gap-4 md:grid-cols-2">{questions.map((item) => <article key={item.question} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"><p className="font-medium">{item.question}</p><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--muted-foreground)]">品牌提及</dt><dd className="mt-1">{percent(item.mentionRate)}</dd></div><div><dt className="text-[var(--muted-foreground)]">领先竞品</dt><dd className="mt-1">{item.leadingCompetitor ?? '—'} {item.leadingCompetitor ? percent(item.leadingCompetitorRate) : ''}</dd></div></dl></article>)}</div>; }

function QuestionTable({items, className = '', priority = false}: {items: Question[]; className?: string; priority?: boolean}) { return <div className={`${className} overflow-x-auto rounded-lg border border-[var(--border)]`}><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[var(--muted)]"><tr><th className="px-3 py-3">品牌问题</th><th className="px-3 py-3">品牌提及</th><th className="px-3 py-3">诊断</th><th className="px-3 py-3">关联竞品</th></tr></thead><tbody>{items.map((item) => <tr key={item.question} className="border-t border-[var(--border)]"><td className="px-3 py-3">{item.question}</td><td className="px-3 py-3">{percent(item.mentionRate)} <span className="text-xs text-[var(--muted-foreground)]">({item.sampleCount})</span></td><td className="px-3 py-3">{diagnosisLabel[item.diagnosis]}</td><td className="px-3 py-3">{item.leadingCompetitor ? `${item.leadingCompetitor} ${percent(item.leadingCompetitorRate)}` : '—'}</td></tr>)}{!items.length && <tr><td colSpan={4} className="px-3 py-10 text-center text-[var(--muted-foreground)]">{priority ? '没有需要优先处理的问题。' : '暂无问题结果。'}</td></tr>}</tbody></table></div>; }
